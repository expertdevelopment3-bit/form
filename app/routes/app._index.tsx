import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ensureMetaobjectDefinitions } from "../models/metaobjects.server";
import { listForms, deleteForm, duplicateForm } from "../models/form.server";
import type { FormDefinition } from "../types/form";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Idempotently ensure metaobject schemas are active
  await ensureMetaobjectDefinitions(admin);

  const forms = await listForms(admin, { shop });

  return { forms, shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const id = formData.get("id") as string;

  if (intent === "delete" && id) {
    const result = await deleteForm(admin, id);
    return { success: result.success, action: "delete", errors: result.errors };
  }

  if (intent === "duplicate" && id) {
    const result = await duplicateForm(admin, id);
    return { success: !!result.form, action: "duplicate", errors: result.errors };
  }

  return { success: false, errors: ["Invalid action"] };
};

export default function Index() {
  const { forms } = useLoaderData<{ forms: FormDefinition[]; shop: string }>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [showPublishGuide, setShowPublishGuide] = useState(false);

  useEffect(() => {
    if (fetcher.data?.success) {
      if (fetcher.data?.action === "duplicate") {
        shopify.toast.show("Form duplicated successfully");
      } else {
        shopify.toast.show("Form deleted successfully");
      }
    } else if (fetcher.data?.errors?.length) {
      shopify.toast.show(fetcher.data.errors.join(", "), { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleCopy = (text: string, label = "Form ID") => {
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          shopify.toast.show(`${label} copied to clipboard`);
        })
        .catch(() => {
          fallbackCopy(text, label);
        });
    } else {
      fallbackCopy(text, label);
    }
  };

  const fallbackCopy = (text: string, label = "Form ID") => {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand("copy");
      shopify.toast.show(`${label} copied to clipboard`);
    } catch {
      shopify.toast.show(`Could not copy ${label}`, { isError: true });
    }
    document.body.removeChild(el);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      fetcher.submit({ intent: "delete", id }, { method: "POST" });
    }
  };

  const handleDuplicate = (id: string) => {
    fetcher.submit({ intent: "duplicate", id }, { method: "POST" });
  };

  return (
    <s-page heading="Forms">
      <s-button slot="primary-action" variant="primary" href="/app/forms/new">
        Create new form
      </s-button>

      {/* Publish Guide Modal / Banner */}
      {showPublishGuide && (
        <s-section heading="How to Publish Forms on Your Storefront">
          <s-stack direction="block" gap="base">
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-ordered-list>
                <s-list-item>
                  <s-text font-weight="bold">Open Theme Editor:</s-text> Go to Online Store &gt; Themes &gt; Customize, or use the Settings page.
                </s-list-item>
                <s-list-item>
                  <s-text font-weight="bold">Add FormCraft Block:</s-text> Click &quot;Add Section&quot; or &quot;Add Block&quot; on any template (Contact page, Home page, Product page, etc.) and select &quot;FormCraft Form&quot;.
                </s-list-item>
                <s-list-item>
                  <s-text font-weight="bold">Select Form:</s-text> In the block settings panel, choose your desired form from the dropdown.
                </s-list-item>
                <s-list-item>
                  <s-text font-weight="bold">Save &amp; Publish:</s-text> Click &quot;Save&quot; in the theme editor. Your form is now live and accepting submissions!
                </s-list-item>
              </s-ordered-list>
            </s-box>
            <s-stack direction="inline" gap="small">
              <s-button variant="primary" href="/app/settings">
                Open Theme Settings
              </s-button>
              <s-button variant="tertiary" onClick={() => setShowPublishGuide(false)}>
                Got it
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      {forms.length === 0 ? (
        <s-section>
          <s-box padding="large" borderRadius="base" borderWidth="base" borderColor="subdued">
            <s-stack direction="block" gap="base">
              {/* Centered Modern SVG Illustration */}
              <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
                <svg
                  width="180"
                  height="130"
                  viewBox="0 0 180 130"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ display: "inline-block", maxWidth: "100%" }}
                  aria-hidden="true"
                >
                  <rect x="35" y="10" width="110" height="110" rx="8" fill="#F6F6F7" stroke="#D2D5D8" strokeWidth="2" />
                  <rect x="47" y="24" width="45" height="7" rx="3.5" fill="#5C5F62" />
                  <rect x="47" y="40" width="86" height="14" rx="4" fill="#FFFFFF" stroke="#C9CCCF" strokeWidth="1.5" />
                  <rect x="47" y="62" width="86" height="14" rx="4" fill="#FFFFFF" stroke="#C9CCCF" strokeWidth="1.5" />
                  <rect x="47" y="84" width="48" height="18" rx="4" fill="#008060" />
                  <circle cx="132" cy="93" r="14" fill="#E3F1DF" stroke="#008060" strokeWidth="2" />
                  <path d="M126 93L130 97L138 89" stroke="#008060" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              <div style={{ textAlign: "center", maxWidth: "520px", margin: "0 auto" }}>
                <s-heading>Let&apos;s create your first form</s-heading>
                <div style={{ marginTop: "8px", marginBottom: "20px" }}>
                  <s-paragraph>
                    Create online forms and publish them on your storefront in minutes.
                  </s-paragraph>
                </div>

                <s-stack direction="inline" gap="small">
                  <s-button variant="primary" href="/app/forms/new">
                    Create form
                  </s-button>
                  <s-button variant="secondary" onClick={() => setShowPublishGuide(true)}>
                    How to publish
                  </s-button>
                </s-stack>
              </div>
            </s-stack>
          </s-box>
        </s-section>
      ) : (
        <s-section heading={`All Forms (${forms.length})`}>
          <s-table>
            <s-table-header-row>
              <s-table-header>Form Name</s-table-header>
              <s-table-header>Storefront Title</s-table-header>
              <s-table-header>Form ID</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Layout</s-table-header>
              <s-table-header>Submissions</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {forms.map((form) => {
                const encodedId = encodeURIComponent(form.display_form_id || form.id || "");
                const layoutLabel =
                  form.layout === "split_image" ? "Split Image" : "Single Column";

                return (
                  <s-table-row key={form.id || form.handle}>
                    <s-table-cell>
                      <s-text font-weight="bold">{form.name}</s-text>
                    </s-table-cell>
                    <s-table-cell>
                      <s-text>{form.title}</s-text>
                    </s-table-cell>
                    <s-table-cell>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <code
                          title={form.display_form_id}
                          style={{
                            fontFamily: "monospace",
                            fontSize: "11px",
                            background: "#F1F2F3",
                            padding: "3px 6px",
                            borderRadius: "4px",
                            color: "#202223",
                            display: "inline-block",
                            maxWidth: "140px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {form.display_form_id || "-"}
                        </code>
                        <s-button
                          variant="tertiary"
                          onClick={() => handleCopy(form.display_form_id || "", "Form ID")}
                        >
                          Copy
                        </s-button>
                      </div>
                    </s-table-cell>
                    <s-table-cell>
                      {form.status === "active" ? (
                        <s-badge tone="success">Active</s-badge>
                      ) : form.status === "draft" ? (
                        <s-badge tone="caution">Draft</s-badge>
                      ) : (
                        <s-badge tone="neutral">Inactive</s-badge>
                      )}
                    </s-table-cell>
                    <s-table-cell>
                      <s-badge tone="neutral">{layoutLabel}</s-badge>
                    </s-table-cell>
                    <s-table-cell>
                      <s-link href={`/app/submissions?formId=${encodedId}`}>
                        <s-badge tone={form.submission_count ? "info" : "neutral"}>
                          {form.submission_count || 0} submissions
                        </s-badge>
                      </s-link>
                    </s-table-cell>
                    <s-table-cell>
                      <s-stack direction="inline" gap="small">
                        <s-button
                          variant="tertiary"
                          href={`/app/forms/${encodedId}`}
                        >
                          Edit
                        </s-button>
                        <s-button
                          variant="tertiary"
                          onClick={() => handleDuplicate(form.id || "")}
                        >
                          Duplicate
                        </s-button>
                        <s-button
                          variant="tertiary"
                          tone="critical"
                          onClick={() => handleDelete(form.id || "", form.name)}
                        >
                          Delete
                        </s-button>
                      </s-stack>
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        </s-section>
      )}

      <s-section slot="aside" heading="Theme Integration">
        <s-paragraph>
          To display a form on your storefront:
        </s-paragraph>
        <s-ordered-list>
          <s-list-item>Go to Online Store &gt; Themes &gt; Customize.</s-list-item>
          <s-list-item>Add section or block &gt; Select &quot;FormCraft Form&quot;.</s-list-item>
          <s-list-item>Choose your form and save the theme.</s-list-item>
        </s-ordered-list>
        <s-button variant="secondary" href="/app/settings">
          Theme Setup Guidance
        </s-button>
      </s-section>

      <s-section slot="aside" heading="Native Architecture">
        <s-paragraph>
          FormCraft stores your form configurations and customer submissions directly in Shopify-managed Metaobjects.
          Zero external database dependencies.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
