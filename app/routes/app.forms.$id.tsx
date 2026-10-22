import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getForm, upsertForm, deleteForm } from "../models/form.server";
import type { FormDefinition, FormFieldConfig } from "../types/form";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const id = decodeURIComponent(params.id || "");

  const form = await getForm(admin, id);
  if (!form) {
    throw new Response("Form not found", { status: 404 });
  }

  return { form };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const id = decodeURIComponent(params.id || "");

  if (intent === "delete") {
    const result = await deleteForm(admin, id);
    return { success: result.success, isDelete: true, errors: result.errors };
  }

  const name = String(formData.get("name") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const submitLabel = String(formData.get("submit_label") || "Submit").trim();
  const successMessage = String(
    formData.get("success_message") || "Thank you for reaching out!"
  ).trim();
  const status = (formData.get("status") as "active" | "inactive") || "active";

  const rawFields = formData.get("fields_config") as string;
  let fieldsConfig: FormFieldConfig[] = [];
  try {
    fieldsConfig = JSON.parse(rawFields);
  } catch {
    fieldsConfig = [];
  }

  if (!name || !title) {
    return {
      success: false,
      errors: ["Please enter both an internal form name and a storefront title."],
    };
  }

  const result = await upsertForm(admin, {
    id,
    name,
    title,
    description,
    fields_config: fieldsConfig,
    submit_label: submitLabel,
    status,
    success_message: successMessage,
  });

  if (result.errors.length > 0 || !result.form) {
    return {
      success: false,
      errors: result.errors.length ? result.errors : ["Failed to update form."],
    };
  }

  return { success: true, form: result.form };
};

export default function EditForm() {
  const { form } = useLoaderData<{ form: FormDefinition }>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const navigate = useNavigate();

  const [name, setName] = useState(form.name);
  const [title, setTitle] = useState(form.title);
  const [description, setDescription] = useState(form.description || "");
  const [submitLabel, setSubmitLabel] = useState(form.submit_label || "Submit");
  const [successMessage, setSuccessMessage] = useState(
    form.success_message || "Thank you for reaching out!"
  );
  const [status, setStatus] = useState<"active" | "inactive">(form.status);
  const [fields, setFields] = useState<FormFieldConfig[]>(form.fields_config);

  const isSubmitting = fetcher.state === "submitting" || fetcher.state === "loading";

  useEffect(() => {
    if (fetcher.data?.success) {
      if (fetcher.data.isDelete) {
        shopify.toast.show("Form deleted");
        navigate("/app");
      } else {
        shopify.toast.show("Form updated successfully!");
      }
    } else if (fetcher.data?.errors?.length) {
      shopify.toast.show(fetcher.data.errors.join(", "), { isError: true });
    }
  }, [fetcher.data, shopify, navigate]);

  const updateField = (id: string, updates: Partial<FormFieldConfig>) => {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  const handleSave = () => {
    fetcher.submit(
      {
        name,
        title,
        description,
        submit_label: submitLabel,
        success_message: successMessage,
        status,
        fields_config: JSON.stringify(fields),
      },
      { method: "POST" }
    );
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete "${form.name}"?`)) {
      fetcher.submit({ intent: "delete" }, { method: "POST" });
    }
  };

  return (
    <s-page heading={`Edit: ${form.name}`}>
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleSave}
        {...(isSubmitting ? { loading: true } : {})}
      >
        Save Changes
      </s-button>
      <s-button slot="secondary-actions" href="/app">
        Back to Forms
      </s-button>
      <s-button slot="secondary-actions" tone="critical" onClick={handleDelete}>
        Delete Form
      </s-button>

      <s-section heading="General Information">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Internal Form Name"
            details="Used in Admin to identify this form"
            value={name}
            onInput={(e: Event) =>
              setName((e.target as HTMLInputElement).value)
            }
            required
          />
          <s-text-field
            label="Storefront Heading"
            details="The title displayed at the top of the form on your store"
            value={title}
            onInput={(e: Event) =>
              setTitle((e.target as HTMLInputElement).value)
            }
            required
          />
          <s-text-area
            label="Storefront Description (Optional)"
            details="Introductory text displayed beneath the title"
            value={description}
            onInput={(e: Event) =>
              setDescription((e.target as HTMLTextAreaElement).value)
            }
          />
          <s-select
            label="Form Status"
            value={status}
            onChange={(e: Event) =>
              setStatus((e.target as HTMLSelectElement).value as "active" | "inactive")
            }
          >
            <s-option value="active">Active (Accepting Submissions)</s-option>
            <s-option value="inactive">Inactive (Disabled)</s-option>
          </s-select>
        </s-stack>
      </s-section>

      <s-section heading="Form Fields Configuration">
        <s-paragraph>
          Configure fields to display on the storefront and requirement rules.
        </s-paragraph>

        <s-table>
          <s-table-header-row>
            <s-table-header>Field</s-table-header>
            <s-table-header>Display Label</s-table-header>
            <s-table-header>Enabled</s-table-header>
            <s-table-header>Required</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {fields.map((field) => (
              <s-table-row key={field.id}>
                <s-table-cell>
                  <s-text font-weight="bold">
                    {field.id === "name" && "Customer Name"}
                    {field.id === "email" && "Email Address"}
                    {field.id === "message" && "Message / Inquiries"}
                    {field.id === "file" && "Attachment / File Upload"}
                  </s-text>
                </s-table-cell>
                <s-table-cell>
                  <s-text-field
                    label="Label"
                    label-hidden
                    value={field.label}
                    onInput={(e: Event) =>
                      updateField(field.id, { label: (e.target as HTMLInputElement).value })
                    }
                  />
                </s-table-cell>
                <s-table-cell>
                  <s-checkbox
                    checked={field.enabled}
                    onChange={(e: Event) =>
                      updateField(field.id, { enabled: (e.target as HTMLInputElement).checked })
                    }
                  />
                </s-table-cell>
                <s-table-cell>
                  <s-checkbox
                    checked={field.required}
                    disabled={!field.enabled}
                    onChange={(e: Event) =>
                      updateField(field.id, { required: (e.target as HTMLInputElement).checked })
                    }
                  />
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading="Submission Settings">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Submit Button Label"
            value={submitLabel}
            onInput={(e: Event) =>
              setSubmitLabel((e.target as HTMLInputElement).value)
            }
          />
          <s-text-field
            label="Confirmation Message"
            details="Shown to the customer upon successful submission"
            value={successMessage}
            onInput={(e: Event) =>
              setSuccessMessage((e.target as HTMLInputElement).value)
            }
          />
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Form ID & Theme Block">
        <s-paragraph>
          <s-text font-weight="bold">Form Handle / ID:</s-text>
        </s-paragraph>
        <s-box padding="small" background="subdued" borderRadius="base">
          <code>{form.id || form.handle}</code>
        </s-box>
        <s-paragraph>
          Copy this ID to paste into the Theme Editor block settings if manually selecting by ID.
        </s-paragraph>
        <s-button
          variant="secondary"
          href={`/app/submissions?formId=${encodeURIComponent(form.id || "")}`}
        >
          View Submissions for this Form
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
