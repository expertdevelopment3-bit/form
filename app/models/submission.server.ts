import type { AdminApiContext } from "./metaobjects.server";
import { SUBMISSION_METAOBJECT_TYPE } from "./metaobjects.server";
import type { FormSubmission } from "../types/form";
import { encryptFormId, decryptFormId, isEncryptedFormId } from "./form-id.server";

interface MetaobjectFieldNode {
  key: string;
  value: string | null;
  jsonValue?: unknown;
}

interface MetaobjectNode {
  id: string;
  handle: string;
  updatedAt: string;
  fields: MetaobjectFieldNode[];
}

export function parseSubmissionMetaobject(
  node: MetaobjectNode,
  shopDomain?: string
): FormSubmission {
  const fieldMap = new Map<string, string | null>();
  const jsonMap = new Map<string, unknown>();

  for (const f of node.fields) {
    fieldMap.set(f.key, f.value);
    if (f.jsonValue !== undefined && f.jsonValue !== null) {
      jsonMap.set(f.key, f.jsonValue);
    }
  }

  let submissionData: Record<string, unknown> | import("../types/form").DynamicFieldItem[] | undefined;
  if (jsonMap.has("submission_data")) {
    submissionData = jsonMap.get("submission_data") as
      | Record<string, unknown>
      | import("../types/form").DynamicFieldItem[];
  } else if (fieldMap.get("submission_data")) {
    try {
      submissionData = JSON.parse(fieldMap.get("submission_data")!);
    } catch {
      submissionData = undefined;
    }
  }

  const rawFormId = fieldMap.get("form_id") || "";

  return {
    id: node.id,
    handle: node.handle,
    form_id: rawFormId,
    display_form_id: encryptFormId(rawFormId, shopDomain),
    form_title: fieldMap.get("form_title") || "General Form",
    customer_name: fieldMap.get("customer_name") || "",
    customer_email: fieldMap.get("customer_email") || "",
    message: fieldMap.get("message") || "",
    uploaded_file_url: fieldMap.get("uploaded_file_url") || undefined,
    uploaded_file_name: fieldMap.get("uploaded_file_name") || undefined,
    submitted_at: fieldMap.get("submitted_at") || node.updatedAt,
    submission_status:
      (fieldMap.get("submission_status") as "new" | "read" | "archived") || "new",
    submission_data: submissionData,
  };
}

/**
 * Lists submissions, optionally filtered by formId.
 */
export async function listSubmissions(
  admin: AdminApiContext,
  options?: { formId?: string; shop?: string; first?: number }
): Promise<FormSubmission[]> {
  const query = `#graphql
    query listSubmissions($type: String!, $first: Int!) {
      metaobjects(type: $type, first: $first) {
        nodes {
          id
          handle
          updatedAt
          fields {
            key
            value
            jsonValue
          }
        }
      }
    }
  `;

  const res = await admin.graphql(query, {
    variables: {
      type: SUBMISSION_METAOBJECT_TYPE,
      first: options?.first || 100,
    },
  });
  const json = await res.json();
  const nodes: MetaobjectNode[] = json.data?.metaobjects?.nodes || [];

  let submissions = nodes.map((node) => parseSubmissionMetaobject(node, options?.shop));

  // Sort descending by submitted_at
  submissions.sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  );

  if (options?.formId) {
    let targetRawId = options.formId;
    if (isEncryptedFormId(options.formId)) {
      const dec = decryptFormId(options.formId, { expectedShop: options.shop });
      if (dec) {
        targetRawId = dec.rawId;
      }
    }

    submissions = submissions.filter(
      (s) =>
        s.form_id === targetRawId ||
        s.form_id === options.formId ||
        s.display_form_id === options.formId ||
        (targetRawId && s.form_id.includes(targetRawId))
    );
  }

  return submissions;
}

/**
 * Creates a form submission metaobject.
 */
export async function createSubmission(
  admin: AdminApiContext,
  submission: FormSubmission,
  options?: { shop?: string }
): Promise<{ submission: FormSubmission | null; errors: string[] }> {
  let internalFormId = submission.form_id;
  if (isEncryptedFormId(internalFormId)) {
    const dec = decryptFormId(internalFormId, { expectedShop: options?.shop });
    if (dec) {
      internalFormId = dec.rawId;
    }
  }

  const fields: Array<{ key: string; value: string }> = [
    { key: "form_id", value: internalFormId },
    { key: "form_title", value: submission.form_title || "Contact Form" },
    { key: "customer_name", value: submission.customer_name || "" },
    { key: "customer_email", value: submission.customer_email || "" },
    { key: "message", value: submission.message || "" },
    { key: "submitted_at", value: submission.submitted_at || new Date().toISOString() },
    { key: "submission_status", value: submission.submission_status || "new" },
  ];

  if (submission.uploaded_file_url) {
    fields.push({ key: "uploaded_file_url", value: submission.uploaded_file_url });
  }
  if (submission.uploaded_file_name) {
    fields.push({ key: "uploaded_file_name", value: submission.uploaded_file_name });
  }
  if (submission.submission_data !== undefined && submission.submission_data !== null) {
    const rawData =
      typeof submission.submission_data === "string"
        ? submission.submission_data
        : JSON.stringify(submission.submission_data);
    fields.push({ key: "submission_data", value: rawData });
  }

  const mutation = `#graphql
    mutation createSubmission($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject {
          id
          handle
          updatedAt
          fields {
            key
            value
            jsonValue
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const handle = `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const res = await admin.graphql(mutation, {
    variables: {
      metaobject: {
        type: SUBMISSION_METAOBJECT_TYPE,
        handle,
        fields,
      },
    },
  });

  const json = await res.json();
  const userErrors = json.data?.metaobjectCreate?.userErrors || [];
  if (userErrors.length > 0) {
    return {
      submission: null,
      errors: userErrors.map((e: { message: string }) => e.message),
    };
  }

  return {
    submission: parseSubmissionMetaobject(
      json.data.metaobjectCreate.metaobject,
      options?.shop
    ),
    errors: [],
  };
}

/**
 * Updates submission status (e.g. "read" or "archived").
 */
export async function updateSubmissionStatus(
  admin: AdminApiContext,
  id: string,
  status: "new" | "read" | "archived"
): Promise<{ success: boolean; errors: string[] }> {
  const mutation = `#graphql
    mutation updateSubmissionStatus($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject {
          id
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
      id,
      metaobject: {
        fields: [{ key: "submission_status", value: status }],
      },
    },
  });

  const json = await res.json();
  const userErrors = json.data?.metaobjectUpdate?.userErrors || [];
  if (userErrors.length > 0) {
    return {
      success: false,
      errors: userErrors.map((e: { message: string }) => e.message),
    };
  }

  return { success: true, errors: [] };
}

/**
 * Deletes a submission metaobject.
 */
export async function deleteSubmission(
  admin: AdminApiContext,
  id: string
): Promise<{ success: boolean; errors: string[] }> {
  const mutation = `#graphql
    mutation deleteSubmission($id: ID!) {
      metaobjectDelete(id: $id) {
        deletedId
        userErrors {
          field
          message
        }
      }
    }
  `;

  const res = await admin.graphql(mutation, { variables: { id } });
  const json = await res.json();
  const userErrors = json.data?.metaobjectDelete?.userErrors || [];

  if (userErrors.length > 0) {
    return {
      success: false,
      errors: userErrors.map((e: { message: string }) => e.message),
    };
  }

  return { success: true, errors: [] };
}
