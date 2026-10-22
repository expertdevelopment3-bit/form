import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { upsertForm } from "../models/form.server";
import type { FormFieldConfig } from "../types/form";
import { DEFAULT_FORM_FIELDS } from "../types/form";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const name = String(formData.get("name") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const submitLabel = String(formData.get("submit_label") || "Submit").trim();
  const successMessage = String(
    formData.get("success_message") || "Thank you for reaching out! We will get back to you shortly."
  ).trim();
  const status = (formData.get("status") as "active" | "inactive") || "active";

  const rawFields = formData.get("fields_config") as string;
  let fieldsConfig: FormFieldConfig[] = DEFAULT_FORM_FIELDS;
  try {
    if (rawFields) {
      fieldsConfig = JSON.parse(rawFields);
    }
  } catch {
    fieldsConfig = DEFAULT_FORM_FIELDS;
  }

  if (!name || !title) {
    return {
      success: false,
      errors: ["Please enter both an internal form name and a storefront title."],
    };
  }

  const result = await upsertForm(admin, {
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
      errors: result.errors.length ? result.errors : ["Failed to save form."],
    };
  }

  return { success: true, form: result.form };
};

export default function NewForm() {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const navigate = useNavigate();

  const [name, setName] = useState("Contact Form");
  const [title, setTitle] = useState("Get in Touch");
  const [description, setDescription] = useState("Fill out the form below and we will get back to you shortly.");
  const [submitLabel, setSubmitLabel] = useState("Send Message");
  const [successMessage, setSuccessMessage] = useState("Thank you for reaching out! We will get back to you shortly.");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [fields, setFields] = useState<FormFieldConfig[]>(DEFAULT_FORM_FIELDS);

  const isSubmitting = fetcher.state === "submitting" || fetcher.state === "loading";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Form created successfully!");
      navigate("/app");
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

  return (
    <s-page heading="Create New Form">
      <s-button slot="primary-action" variant="primary" onClick={handleSave} {...(isSubmitting ? { loading: true } : {})}>
        Save Form
      </s-button>
      <s-button slot="secondary-actions" href="/app">
        Cancel
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
          Configure which fields to display on the storefront and whether they are required.
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

      <s-section slot="aside" heading="Form Tips">
        <s-paragraph>
          Keep forms short to increase customer response rates. Name and Email are typically recommended as required fields.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
