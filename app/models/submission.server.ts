import type { AdminApiContext } from "./metaobjects.server";
import { SUBMISSION_METAOBJECT_TYPE } from "./metaobjects.server";
import type { FormSubmission } from "../types/form";

interface MetaobjectFieldNode {
  key: string;
  value: string | null;
}

interface MetaobjectNode {
  id: string;
  handle: string;
  updatedAt: string;
  fields: MetaobjectFieldNode[];
}

function parseSubmissionMetaobject(node: MetaobjectNode): FormSubmission {
  const fieldMap = new Map<string, string | null>();
  for (const f of node.fields) {
    fieldMap.set(f.key, f.value);
  }

  return {
    id: node.id,
    handle: node.handle,
    form_id: fieldMap.get("form_id") || "",
    form_title: fieldMap.get("form_title") || "General Form",
    customer_name: fieldMap.get("customer_name") || "",
    customer_email: fieldMap.get("customer_email") || "",
    message: fieldMap.get("message") || "",
    uploaded_file_url: fieldMap.get("uploaded_file_url") || undefined,
    uploaded_file_name: fieldMap.get("uploaded_file_name") || undefined,
    submitted_at: fieldMap.get("submitted_at") || node.updatedAt,
    submission_status:
      (fieldMap.get("submission_status") as "new" | "read" | "archived") || "new",
  };
}

/**
 * Lists submissions, optionally filtered by formId.
 */
export async function listSubmissions(
  admin: AdminApiContext,
  options?: { formId?: string; first?: number }
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

  let submissions = nodes.map(parseSubmissionMetaobject);

  // Sort descending by submitted_at
  submissions.sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  );

  if (options?.formId) {
    submissions = submissions.filter(
      (s) => s.form_id === options.formId || s.form_id.includes(options.formId!)
    );
  }

  return submissions;
}

/**
 * Creates a form submission metaobject.
 */
export async function createSubmission(
  admin: AdminApiContext,
  submission: FormSubmission
): Promise<{ submission: FormSubmission | null; errors: string[] }> {
  const fields = [
    { key: "form_id", value: submission.form_id },
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
    submission: parseSubmissionMetaobject(json.data.metaobjectCreate.metaobject),
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
