import crypto from "node:crypto";
import type { AdminApiContext } from "./metaobjects.server";
import { getForm } from "./form.server";
import type { FormDefinition } from "../types/form";

export const FORM_ID_PREFIX = "fc_";
const AAD_CONTEXT = Buffer.from("formcraft-v1", "utf8");

/**
 * Returns the secret key for Form ID encryption/decryption.
 * Never exposed to client-side code.
 */
function getMasterSecret(): string {
  const secret =
    process.env.FORM_ENCRYPTION_SECRET ||
    process.env.SHOPIFY_API_SECRET ||
    "formcraft-secure-default-key-32bytes!!";
  return secret;
}

/**
 * Derives a 32-byte AES key and a 32-byte HMAC key using HKDF.
 */
function deriveKeys(secret: string): { aesKey: Buffer; hmacKey: Buffer } {
  const derived = crypto.hkdfSync(
    "sha256",
    secret,
    "formcraft-id-salt-v1",
    "formcraft-form-id-encryption",
    64
  );
  const buf = Buffer.from(derived);
  const aesKey = buf.subarray(0, 32);
  const hmacKey = buf.subarray(32, 64);
  return { aesKey, hmacKey };
}

/**
 * Checks whether an ID string is formatted as an encrypted FormCraft ID.
 */
export function isEncryptedFormId(id: string): boolean {
  return typeof id === "string" && id.startsWith(FORM_ID_PREFIX) && id.length > FORM_ID_PREFIX.length + 20;
}

/**
 * Encrypts a raw Shopify metaobject ID (e.g. gid://shopify/Metaobject/12345)
 * into an opaque, customer-friendly Form ID (e.g. fc_...).
 *
 * Guaranteed to be deterministic for the same form and shop, so the identifier
 * remains consistent across requests and can be safely copied and reused.
 */
export function encryptFormId(rawId: string, shopDomain?: string): string {
  if (!rawId || typeof rawId !== "string") {
    return "";
  }

  // Prevent double encryption
  if (isEncryptedFormId(rawId)) {
    return rawId;
  }

  try {
    const { aesKey, hmacKey } = deriveKeys(getMasterSecret());
    const normalizedShop = shopDomain ? shopDomain.toLowerCase().trim() : "";

    // Payload containing raw ID and optional shop binding
    const payload = JSON.stringify({
      id: rawId.trim(),
      ...(normalizedShop ? { shop: normalizedShop } : {}),
    });

    const plaintext = Buffer.from(payload, "utf8");

    // Deterministic 12-byte IV derived from HMAC of rawId + shop
    // This ensures consistent encrypted strings for the same form
    const iv = crypto
      .createHmac("sha256", hmacKey)
      .update(`${rawId}::${normalizedShop}`)
      .digest()
      .subarray(0, 12);

    const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
    cipher.setAAD(AAD_CONTEXT);

    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag(); // 16 bytes

    // Pack into [12 bytes IV][16 bytes AuthTag][ciphertext]
    const packed = Buffer.concat([iv, authTag, ciphertext]);
    return `${FORM_ID_PREFIX}${packed.toString("base64url")}`;
  } catch (err) {
    console.error("Failed to encrypt form ID:", err);
    // Never leak raw ID on failure; return a safe fallback or empty
    return "";
  }
}

/**
 * Decrypts an encrypted customer-facing Form ID back to its internal raw metaobject ID.
 * Performs authenticated decryption and validates shop authorization if expectedShop is provided.
 *
 * Returns null if the ID is invalid, modified, tampered with, or belongs to another shop.
 */
export function decryptFormId(
  encryptedId: string,
  options?: { expectedShop?: string }
): { rawId: string; shop?: string } | null {
  if (!isEncryptedFormId(encryptedId)) {
    return null;
  }

  try {
    const { aesKey, hmacKey } = deriveKeys(getMasterSecret());
    const base64Part = encryptedId.slice(FORM_ID_PREFIX.length);
    const packed = Buffer.from(base64Part, "base64url");

    // Must be at least 12 (IV) + 16 (Tag) + 1 (Payload) = 29 bytes
    if (packed.length < 29) {
      return null;
    }

    const iv = packed.subarray(0, 12);
    const authTag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);

    const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
    decipher.setAAD(AAD_CONTEXT);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed = JSON.parse(decrypted.toString("utf8")) as {
      id: string;
      shop?: string;
    };

    if (!parsed || !parsed.id || typeof parsed.id !== "string") {
      return null;
    }

    // Verify deterministic IV integrity
    const expectedIv = crypto
      .createHmac("sha256", hmacKey)
      .update(`${parsed.id}::${parsed.shop || ""}`)
      .digest()
      .subarray(0, 12);

    if (!crypto.timingSafeEqual(iv, expectedIv)) {
      return null;
    }

    // Shop-level authorization verification
    if (options?.expectedShop && parsed.shop) {
      const normalizedExpected = options.expectedShop.toLowerCase().trim();
      const normalizedParsed = parsed.shop.toLowerCase().trim();
      if (normalizedParsed !== normalizedExpected) {
        console.warn(
          `Form ID authorization mismatch: expected shop "${normalizedExpected}", but token belongs to "${normalizedParsed}"`
        );
        return null;
      }
    }

    return {
      rawId: parsed.id,
      shop: parsed.shop,
    };
  } catch {
    // Return null gracefully for invalid, modified, or tampered IDs
    return null;
  }
}

/**
 * Resolves a customer-facing or internal form identifier into a validated FormDefinition.
 *
 * 1. Validates and decrypts the encrypted Form ID.
 * 2. Queries Shopify GraphQL using the authenticated shop admin client.
 * 3. Verifies that the form exists in this merchant's store.
 * 4. Never leaks raw internal metaobject IDs.
 */


export async function resolveFormId(
  admin: AdminApiContext,
  identifier: string,
  options?: { expectedShop?: string }
): Promise<{ form: FormDefinition | null; rawId: string | null; error?: string }> {
  if (!identifier || typeof identifier !== "string") {
    return { form: null, rawId: null, error: "Missing form identifier" };
  }

  let internalId = identifier.trim();

  if (isEncryptedFormId(internalId)) {
    const decrypted = decryptFormId(internalId, options);
    if (!decrypted) {
      return {
        form: null,
        rawId: null,
        error: "Invalid or unauthorized Form ID.",
      };
    }
    internalId = decrypted.rawId;
  }

  try {
    const form = await getForm(admin, internalId);
    if (!form) {
      return { form: null, rawId: internalId, error: "Form not found." };
    }

    // Attach customer-facing display ID
    form.display_form_id = encryptFormId(form.id || internalId, options?.expectedShop);

    return { form, rawId: internalId };
  } catch (err) {
    console.warn("Could not resolve form ID:", err);
    return { form: null, rawId: internalId, error: "Failed to resolve form." };
  }
}
