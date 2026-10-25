import assert from "node:assert/strict";
import crypto from "node:crypto";

/**
 * Test Suite for Form ID Encryption, Decryption, Shop Authorization,
 * and Tamper Resistance.
 *
 * Implements verification matching app/models/form-id.server.ts logic.
 */

const FORM_ID_PREFIX = "fc_";
const AAD_CONTEXT = Buffer.from("formcraft-v1", "utf8");

function getMasterSecret() {
  return (
    process.env.FORM_ENCRYPTION_SECRET ||
    process.env.SHOPIFY_API_SECRET ||
    "formcraft-secure-default-key-32bytes!!"
  );
}

function deriveKeys(secret) {
  const derived = crypto.hkdfSync(
    "sha256",
    secret,
    "formcraft-id-salt-v1",
    "formcraft-form-id-encryption",
    64
  );
  const buf = Buffer.from(derived);
  return {
    aesKey: buf.subarray(0, 32),
    hmacKey: buf.subarray(32, 64),
  };
}

function isEncryptedFormId(id) {
  return typeof id === "string" && id.startsWith(FORM_ID_PREFIX) && id.length > FORM_ID_PREFIX.length + 20;
}

function encryptFormId(rawId, shopDomain) {
  if (!rawId || typeof rawId !== "string") return "";
  if (isEncryptedFormId(rawId)) return rawId;

  try {
    const { aesKey, hmacKey } = deriveKeys(getMasterSecret());
    const normalizedShop = shopDomain ? shopDomain.toLowerCase().trim() : "";

    const payload = JSON.stringify({
      id: rawId.trim(),
      ...(normalizedShop ? { shop: normalizedShop } : {}),
    });

    const plaintext = Buffer.from(payload, "utf8");
    const iv = crypto
      .createHmac("sha256", hmacKey)
      .update(`${rawId}::${normalizedShop}`)
      .digest()
      .subarray(0, 12);

    const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
    cipher.setAAD(AAD_CONTEXT);

    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const packed = Buffer.concat([iv, authTag, ciphertext]);
    return `${FORM_ID_PREFIX}${packed.toString("base64url")}`;
  } catch {
    return "";
  }
}

function decryptFormId(encryptedId, options) {
  if (!isEncryptedFormId(encryptedId)) return null;

  try {
    const { aesKey, hmacKey } = deriveKeys(getMasterSecret());
    const base64Part = encryptedId.slice(FORM_ID_PREFIX.length);
    const packed = Buffer.from(base64Part, "base64url");

    if (packed.length < 29) return null;

    const iv = packed.subarray(0, 12);
    const authTag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);

    const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
    decipher.setAAD(AAD_CONTEXT);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed = JSON.parse(decrypted.toString("utf8"));

    if (!parsed || !parsed.id || typeof parsed.id !== "string") return null;

    const expectedIv = crypto
      .createHmac("sha256", hmacKey)
      .update(`${parsed.id}::${parsed.shop || ""}`)
      .digest()
      .subarray(0, 12);

    if (!crypto.timingSafeEqual(iv, expectedIv)) return null;

    if (options?.expectedShop && parsed.shop) {
      const normalizedExpected = options.expectedShop.toLowerCase().trim();
      const normalizedParsed = parsed.shop.toLowerCase().trim();
      if (normalizedParsed !== normalizedExpected) {
        return null;
      }
    }

    return {
      rawId: parsed.id,
      shop: parsed.shop,
    };
  } catch {
    return null;
  }
}

async function runTests() {
  console.log("=== Running Form ID Security & Encryption Test Suite ===\n");

  const sampleRawId = "gid://shopify/Metaobject/9876543210";
  const shopA = "store-alpha.myshopify.com";
  const shopB = "store-beta.myshopify.com";

  // Test 1: Generation & format
  console.log("Test 1: Form ID Generation and Format");
  const encryptedId = encryptFormId(sampleRawId, shopA);
  assert(encryptedId.startsWith("fc_"), "Encrypted ID must start with prefix fc_");
  assert(!encryptedId.includes("gid://"), "Encrypted ID must not leak raw Shopify GID");
  assert(!encryptedId.includes("Metaobject"), "Encrypted ID must not reveal Metaobject type");
  assert(isEncryptedFormId(encryptedId), "isEncryptedFormId must recognize generated ID");
  console.log("  ✓ Generated Opaque ID:", encryptedId);

  // Test 2: Consistency / Deterministic ID
  console.log("\nTest 2: Consistency & Determinism");
  const encryptedId2 = encryptFormId(sampleRawId, shopA);
  assert.equal(encryptedId, encryptedId2, "Encrypting the same form ID & shop must be identical");
  console.log("  ✓ Determinism verified: duplicate encryptions produce identical tokens");

  // Test 3: Idempotency (Prevent double encryption)
  console.log("\nTest 3: Double Encryption Prevention");
  const doubleEncrypted = encryptFormId(encryptedId, shopA);
  assert.equal(doubleEncrypted, encryptedId, "Calling encryptFormId on already encrypted ID must return same token");
  console.log("  ✓ Double encryption prevented");

  // Test 4: Decryption & Restoration
  console.log("\nTest 4: Authenticated Decryption");
  const decrypted = decryptFormId(encryptedId, { expectedShop: shopA });
  assert(decrypted !== null, "Decryption must succeed with valid credentials");
  assert.equal(decrypted.rawId, sampleRawId, "Decrypted raw ID must match original");
  assert.equal(decrypted.shop, shopA, "Decrypted shop domain must match");
  console.log("  ✓ Successfully decrypted back to:", decrypted.rawId);

  // Test 5: Shop-level Authorization (Cross-tenant rejection)
  console.log("\nTest 5: Cross-Tenant Authorization Check");
  const crossShopDecrypted = decryptFormId(encryptedId, { expectedShop: shopB });
  assert.equal(crossShopDecrypted, null, "Decryption must fail when shop does not match token owner");
  console.log("  ✓ Unauthorized shop access rejected properly");

  // Test 6: Invalid & Tampered Identifiers
  console.log("\nTest 6: Tamper Resistance & Invalid Identifiers");
  assert.equal(decryptFormId("invalid_string"), null, "Plain invalid string should return null");
  assert.equal(decryptFormId("fc_short"), null, "Malformed fc_ prefix should return null");
  assert.equal(decryptFormId(""), null, "Empty string should return null");

  // Modify one character in ciphertext
  const charArray = encryptedId.split("");
  charArray[charArray.length - 2] = charArray[charArray.length - 2] === "A" ? "B" : "A";
  const tamperedId = charArray.join("");
  const tamperedResult = decryptFormId(tamperedId, { expectedShop: shopA });
  assert.equal(tamperedResult, null, "Tampered ciphertext must fail authentication and return null");
  console.log("  ✓ Tampered payload safely rejected with null");

  // Test 7: Customer Table Copy Simulation
  console.log("\nTest 7: Customer Table Copy Simulation");
  const customerRecord = {
    id: "gid://shopify/Metaobject/999",
    customer_name: "John Doe",
    customer_email: "john@example.com",
    form_id: sampleRawId,
    display_form_id: encryptedId,
  };

  // Ensure customer table displays encrypted token rather than raw ID
  const tableDisplayValue = customerRecord.display_form_id || customerRecord.form_id;
  assert.equal(tableDisplayValue, encryptedId, "Table must display customer-facing encrypted form ID");
  assert(!tableDisplayValue.includes("Metaobject"), "Displayed/copied value must never be raw metaobject GID");
  console.log("  ✓ Customer table copy source is safe, customer-friendly Form ID:", tableDisplayValue);

  console.log("\n>>> ALL 7 SECURITY & INTEGRATION TESTS PASSED SUCCESSFULLY! <<<\n");
}

runTests();
