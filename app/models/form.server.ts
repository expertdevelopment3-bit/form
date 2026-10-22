import type { AdminApiContext } from "./metaobjects.server";
import { FORM_METAOBJECT_TYPE, SUBMISSION_METAOBJECT_TYPE } from "./metaobjects.server";
import type { FormDefinition, FormFieldConfig } from "../types/form";
import { DEFAULT_FORM_FIELDS } from "../types/form";

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

function parseFormMetaobject(node: MetaobjectNode, submissionCount = 0): FormDefinition {
  const fieldMap = new Map<string, string | null>();
  const jsonMap = new Map<string, unknown>();

  for (const f of node.fields) {
    fieldMap.set(f.key, f.value);
    if (f.jsonValue !== undefined) {
      jsonMap.set(f.key, f.jsonValue);
    }
  }

  let fieldsConfig: FormFieldConfig[] = DEFAULT_FORM_FIELDS;
  const rawConfig = jsonMap.get("fields_config") || fieldMap.get("fields_config");
  if (rawConfig) {
    try {
      if (typeof rawConfig === "string") {
        fieldsConfig = JSON.parse(rawConfig);
      } else if (Array.isArray(rawConfig)) {
        fieldsConfig = rawConfig as FormFieldConfig[];
      }
    } catch {
      fieldsConfig = DEFAULT_FORM_FIELDS;
    }
  }

  return {
    id: node.id,
    handle: node.handle,
    name: fieldMap.get("name") || "Untitled Form",
    title: fieldMap.get("title") || "Contact Us",
    description: fieldMap.get("description") || "",
    fields_config: fieldsConfig,
    submit_label: fieldMap.get("submit_label") || "Submit",
    status: (fieldMap.get("status") as "active" | "inactive") || "active",
    success_message:
      fieldMap.get("success_message") ||
      "Thank you for contacting us! We will get back to you shortly.",
    updated_at: node.updatedAt,
    submission_count: submissionCount,
  };
}

/**
 * Lists all FormCraft forms for the current shop, along with submission counts.
 */
export async function listForms(admin: AdminApiContext): Promise<FormDefinition[]> {
  const query = `#graphql
    query listForms($type: String!) {
      metaobjects(type: $type, first: 50) {
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
      submissions: metaobjects(type: "${SUBMISSION_METAOBJECT_TYPE}", first: 250) {
        nodes {
          fields {
            key
            value
          }
        }
      }
    }
  `;

  const res = await admin.graphql(query, {
    variables: { type: FORM_METAOBJECT_TYPE },
  });
  const json = await res.json();

  const formNodes: MetaobjectNode[] = json.data?.metaobjects?.nodes || [];
  const submissionNodes = json.data?.submissions?.nodes || [];

  // Count submissions per form ID
  const countsByFormId = new Map<string, number>();
  for (const sub of submissionNodes) {
    const formIdField = sub.fields.find(
      (f: { key: string; value: string | null }) => f.key === "form_id"
    );
    if (formIdField?.value) {
      const current = countsByFormId.get(formIdField.value) || 0;
      countsByFormId.set(formIdField.value, current + 1);
    }
  }

  return formNodes.map((node) => {
    const count = countsByFormId.get(node.id) || countsByFormId.get(node.handle) || 0;
    return parseFormMetaobject(node, count);
  });
}

/**
 * Retrieves a single form by ID or handle.
 */
export async function getForm(
  admin: AdminApiContext,
  idOrHandle: string
): Promise<FormDefinition | null> {
  if (idOrHandle.startsWith("gid://shopify/Metaobject/")) {
    const query = `#graphql
      query getFormById($id: ID!) {
        metaobject(id: $id) {
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
    `;
    const res = await admin.graphql(query, { variables: { id: idOrHandle } });
    const json = await res.json();
    if (!json.data?.metaobject) return null;
    return parseFormMetaobject(json.data.metaobject);
  } else {
    const query = `#graphql
      query getFormByHandle($handle: MetaobjectHandleInput!) {
        metaobjectByHandle(handle: $handle) {
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
    `;
    const res = await admin.graphql(query, {
      variables: {
        handle: {
          type: FORM_METAOBJECT_TYPE,
          handle: idOrHandle,
        },
      },
    });
    const json = await res.json();
    if (!json.data?.metaobjectByHandle) return null;
    return parseFormMetaobject(json.data.metaobjectByHandle);
  }
}

/**
 * Creates or updates a FormCraft form definition metaobject.
 */
export async function upsertForm(
  admin: AdminApiContext,
  form: FormDefinition
): Promise<{ form: FormDefinition | null; errors: string[] }> {
  const fields = [
    { key: "name", value: form.name.trim() },
    { key: "title", value: form.title.trim() },
    { key: "description", value: form.description?.trim() || "" },
    { key: "fields_config", value: JSON.stringify(form.fields_config) },
    { key: "submit_label", value: form.submit_label.trim() || "Submit" },
    { key: "status", value: form.status },
    {
      key: "success_message",
      value:
        form.success_message?.trim() ||
        "Thank you for reaching out! We will get back to you shortly.",
    },
  ];

  if (form.id) {
    // Update existing form
    const mutation = `#graphql
      mutation updateForm($id: ID!, $metaobject: MetaobjectUpdateInput!) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) {
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

    const res = await admin.graphql(mutation, {
      variables: {
        id: form.id,
        metaobject: {
          fields,
        },
      },
    });
    const json = await res.json();
    const userErrors = json.data?.metaobjectUpdate?.userErrors || [];
    if (userErrors.length > 0) {
      return {
        form: null,
        errors: userErrors.map((e: { message: string }) => e.message),
      };
    }
    return {
      form: parseFormMetaobject(json.data.metaobjectUpdate.metaobject),
      errors: [],
    };
  } else {
    // Create new form
    const mutation = `#graphql
      mutation createForm($metaobject: MetaobjectCreateInput!) {
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

    // Generate handle from name
    const handle = form.handle ||
      form.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "") + `-${Date.now().toString().slice(-4)}`;

    const res = await admin.graphql(mutation, {
      variables: {
        metaobject: {
          type: FORM_METAOBJECT_TYPE,
          handle,
          fields,
        },
      },
    });
    const json = await res.json();
    const userErrors = json.data?.metaobjectCreate?.userErrors || [];
    if (userErrors.length > 0) {
      return {
        form: null,
        errors: userErrors.map((e: { message: string }) => e.message),
      };
    }
    return {
      form: parseFormMetaobject(json.data.metaobjectCreate.metaobject),
      errors: [],
    };
  }
}

/**
 * Deletes a form metaobject by ID.
 */
export async function deleteForm(
  admin: AdminApiContext,
  id: string
): Promise<{ success: boolean; errors: string[] }> {
  const mutation = `#graphql
    mutation deleteForm($id: ID!) {
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
