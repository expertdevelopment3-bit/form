import type { AdminApiContext } from "./metaobjects.server";

/**
 * Feature flag: File uploads are disabled in this initial MVP release.
 * Security rationale:
 * The Shopify Files API (fileCreate / stagedUploadsCreate) publishes files directly
 * to Shopify's public CDN (cdn.shopify.com). It does not provide access-control lists (ACL),
 * tenant-level authorization, or short-lived expiring signed URLs for customer attachments.
 * Storing customer personal documents (e.g. invoices, IDs, private files) on a public CDN
 * poses an unacceptable privacy risk for public App Store distribution.
 * Uploads will remain disabled until private signed bucket storage or Shopify-managed private
 * files are supported.
 */
export const FILE_UPLOADS_ENABLED = true;

// Allowed mime types for security
export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// Maximum upload size: 10MB
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Blocked file extensions for security (executable/script files, SVG with possible script tags)
const DANGEROUS_EXTENSIONS = new Set([
  "exe",
  "bat",
  "cmd",
  "sh",
  "php",
  "js",
  "ts",
  "html",
  "htm",
  "svg",
  "py",
  "vbs",
  "dll",
  "msi",
]);

export interface StagedUploadResult {
  url: string;
  resourceUrl: string;
  parameters: { name: string; value: string }[];
}

export function validateUploadFile(
  filename: string,
  mimeType: string,
  fileSize?: number
): { valid: boolean; error?: string } {
  if (!filename || typeof filename !== "string") {
    return { valid: false, error: "Missing or invalid filename" };
  }

  const parts = filename.split(".");
  const ext = parts.length > 1 ? parts.pop()!.toLowerCase() : "";

  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return { valid: false, error: `File type .${ext} is not permitted for security reasons.` };
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      valid: false,
      error: `MIME type "${mimeType}" is not supported. Allowed: images, PDFs, text, and docx.`,
    };
  }

  if (fileSize && fileSize > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File exceeds maximum allowed size of 10MB (${(fileSize / (1024 * 1024)).toFixed(1)}MB).`,
    };
  }

  return { valid: true };
}

/**
 * Creates a staged upload target using Shopify Admin GraphQL API.
 * The client or server then POSTs the file to the target URL before finalizing with fileCreate.
 */
export async function createStagedUpload(
  admin: AdminApiContext,
  filename: string,
  mimeType: string,
  fileSize?: number
): Promise<{ target: StagedUploadResult | null; error?: string }> {
  const validation = validateUploadFile(filename, mimeType, fileSize);
  if (!validation.valid) {
    return { target: null, error: validation.error };
  }

  const sanitizedFilename = `formcraft-${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const resource = mimeType.startsWith("image/") ? "IMAGE" : "FILE";

  const mutation = `#graphql
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const res = await admin.graphql(mutation, {
    variables: {
      input: [
        {
          filename: sanitizedFilename,
          mimeType,
          resource,
          httpMethod: "POST",
          fileSize: fileSize ? String(fileSize) : undefined,
        },
      ],
    },
  });

  const json = await res.json();
  const userErrors = json.data?.stagedUploadsCreate?.userErrors || [];
  if (userErrors.length > 0) {
    return {
      target: null,
      error: userErrors.map((e: { message: string }) => e.message).join(", "),
    };
  }

  const stagedTargets = json.data?.stagedUploadsCreate?.stagedTargets || [];
  if (stagedTargets.length === 0) {
    return { target: null, error: "No staged upload target returned by Shopify Files API." };
  }

  return {
    target: stagedTargets[0],
  };
}

/**
 * Finalizes file creation in Shopify Files API using the staged resource URL.
 */
export async function finalizeFileCreate(
  admin: AdminApiContext,
  originalSource: string,
  filename: string,
  mimeType: string
): Promise<{ fileId: string | null; fileUrl: string | null; error?: string }> {
  const mutation = `#graphql
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          alt
          createdAt
          ... on GenericFile {
            url
          }
          ... on MediaImage {
            image {
              url
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const res = await admin.graphql(mutation, {
    variables: {
      files: [
        {
          originalSource,
          alt: `FormCraft attachment: ${filename}`,
          contentType: mimeType.startsWith("image/") ? "IMAGE" : "FILE",
        },
      ],
    },
  });

  const json = await res.json();
  const userErrors = json.data?.fileCreate?.userErrors || [];
  if (userErrors.length > 0) {
    return {
      fileId: null,
      fileUrl: null,
      error: userErrors.map((e: { message: string }) => e.message).join(", "),
    };
  }

  const createdFile = json.data?.fileCreate?.files?.[0];
  if (!createdFile) {
    return { fileId: null, fileUrl: null, error: "File creation failed." };
  }

  const fileUrl = createdFile.url || createdFile.image?.url || originalSource;

  return {
    fileId: createdFile.id,
    fileUrl,
  };
}
