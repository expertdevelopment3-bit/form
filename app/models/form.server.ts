import type { AdminApiContext } from "./metaobjects.server";
import { FORM_METAOBJECT_TYPE, SUBMISSION_METAOBJECT_TYPE } from "./metaobjects.server";
import type { FormDefinition, FormFieldConfig } from "../types/form";
import { DEFAULT_FORM_FIELDS } from "../types/form";
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

export function parseFormMetaobject(
  node: MetaobjectNode,
  submissionCount = 0,
  shopDomain?: string
): FormDefinition {
  const fieldMap = new Map<string, string | null>();
  const jsonMap = new Map<string, unknown>();

  for (const f of node.fields) {
    fieldMap.set(f.key, f.value);
    if (f.jsonValue !== undefined) {
      jsonMap.set(f.key, f.jsonValue);
    }
  }

  let fieldsConfig: FormFieldConfig[] = DEFAULT_FORM_FIELDS;
  let layout: "single_column" | "split_image" = "single_column";
  let imageUrl: string | undefined = undefined;
  let appearanceConfig: Record<string, unknown> | undefined = undefined;

  const rawConfig = jsonMap.get("fields_config") || fieldMap.get("fields_config");
  if (rawConfig) {
    try {
      let parsed = rawConfig;
      if (typeof parsed === "string") {
        parsed = JSON.parse(parsed);
      }
      if (Array.isArray(parsed)) {
        fieldsConfig = parsed as FormFieldConfig[];
      } else if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj.fields)) {
          fieldsConfig = obj.fields as FormFieldConfig[];
        }
        if (obj.layout === "split_image" || obj.layout === "single_column") {
          layout = obj.layout;
        }
        if (typeof obj.image_url === "string") {
          imageUrl = obj.image_url;
        }
        if (obj.appearance_config && typeof obj.appearance_config === "object") {
          appearanceConfig = obj.appearance_config as Record<string, unknown>;
        }
      }
    } catch {
      fieldsConfig = DEFAULT_FORM_FIELDS;
    }
  }

  return {
    id: node.id,
    display_form_id: encryptFormId(node.id, shopDomain),
    handle: node.handle,
    name: fieldMap.get("name") || "Untitled Form",
    title: fieldMap.get("title") || "Contact Us",
    description: fieldMap.get("description") || "",
    fields_config: fieldsConfig,
    submit_label: fieldMap.get("submit_label") || "Submit",
    status: (fieldMap.get("status") as "active" | "inactive" | "draft") || "active",
    success_message:
      fieldMap.get("success_message") ||
      "Thank you for contacting us! We will get back to you shortly.",
    layout,
    image_url: imageUrl,
    appearance_config: appearanceConfig,
    updated_at: node.updatedAt,
    submission_count: submissionCount,
  };
}

/**
 * Lists all FormCraft forms for the current shop, along with submission counts.
 */
export async function listForms(
  admin: AdminApiContext,
  options?: { shop?: string }
): Promise<FormDefinition[]> {
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
    return parseFormMetaobject(node, count, options?.shop);
  });
}

/**
 * Retrieves a single form by ID or handle.
 * Accepts raw metaobject ID, handle, or customer-facing encrypted Form ID.
 */
export async function getForm(
  admin: AdminApiContext,
  idOrHandle: string,
  options?: { shop?: string }
): Promise<FormDefinition | null> {
  let targetId = idOrHandle.trim();

  // If customer-facing encrypted ID is provided, decrypt it securely
  if (isEncryptedFormId(targetId)) {
    const decrypted = decryptFormId(targetId, { expectedShop: options?.shop });
    if (!decrypted) {
      return null;
    }
    targetId = decrypted.rawId;
  }

  if (targetId.startsWith("gid://shopify/Metaobject/")) {
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
    const res = await admin.graphql(query, { variables: { id: targetId } });
    const json = await res.json();
    if (!json.data?.metaobject) return null;
    return parseFormMetaobject(json.data.metaobject, 0, options?.shop);
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
          handle: targetId,
        },
      },
    });
    const json = await res.json();
    if (!json.data?.metaobjectByHandle) return null;
    return parseFormMetaobject(json.data.metaobjectByHandle, 0, options?.shop);
  }
}

/**
 * Creates or updates a FormCraft form definition metaobject.
 */
export async function upsertForm(
  admin: AdminApiContext,
  form: FormDefinition
): Promise<{ form: FormDefinition | null; errors: string[] }> {
  const configPayload = {
    fields: form.fields_config,
    layout: form.layout || "single_column",
    image_url: form.image_url || undefined,
    appearance_config: form.appearance_config || undefined,
  };

  const fields = [
    { key: "name", value: form.name.trim() },
    { key: "title", value: form.title.trim() },
    { key: "description", value: form.description?.trim() || "" },
    { key: "fields_config", value: JSON.stringify(configPayload) },
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
  const targetId = isEncryptedFormId(id) ? (decryptFormId(id)?.rawId || id) : id;
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

  const res = await admin.graphql(mutation, { variables: { id: targetId } });
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

/**
 * Duplicates an existing form metaobject as a new inactive draft copy.
 */
export async function duplicateForm(
  admin: AdminApiContext,
  id: string
): Promise<{ form: FormDefinition | null; errors: string[] }> {
  const targetId = isEncryptedFormId(id) ? (decryptFormId(id)?.rawId || id) : id;
  const original = await getForm(admin, targetId);
  if (!original) {
    return { form: null, errors: ["Original form not found."] };
  }

  return upsertForm(admin, {
    ...original,
    id: undefined,
    handle: undefined,
    name: `${original.name} (Copy)`,
    title: original.title,
    status: "inactive",
  });
}

