import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { listForms } from "../models/form.server";
import {
  listSubmissions,
  updateSubmissionStatus,
  deleteSubmission,
} from "../models/submission.server";
import type { FormDefinition, FormSubmission } from "../types/form";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const selectedFormId = url.searchParams.get("formId") || "";

  const [forms, submissions] = await Promise.all([
    listForms(admin, { shop }),
    listSubmissions(admin, { formId: selectedFormId || undefined, shop }),
  ]);

  return { forms, submissions, selectedFormId, shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const id = formData.get("id") as string;

  if (intent === "status") {
    const status = formData.get("status") as "new" | "read" | "archived";
    const res = await updateSubmissionStatus(admin, id, status);
    return { success: res.success, errors: res.errors };
  }

  if (intent === "delete") {
    const res = await deleteSubmission(admin, id);
    return { success: res.success, errors: res.errors };
  }

  return { success: false, errors: ["Invalid action"] };
};

export default function Submissions() {
  const { forms, submissions, selectedFormId } = useLoaderData<{
    forms: FormDefinition[];
    submissions: FormSubmission[];
    selectedFormId: string;
    shop: string;
  }>();

  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const navigate = useNavigate();

  const [activeSubmission, setActiveSubmission] = useState<FormSubmission | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Submission updated");
      if (activeSubmission && fetcher.formData?.get("intent") === "delete") {
        setActiveSubmission(null);
      }
    } else if (fetcher.data?.errors?.length) {
      shopify.toast.show(fetcher.data.errors.join(", "), { isError: true });
    }
  }, [fetcher.data, fetcher.formData, shopify, activeSubmission]);

  const handleCopy = (text: string, label = "Form ID") => {
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          shopify.toast.show(`${label} copied to clipboard!`);
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
      shopify.toast.show(`${label} copied to clipboard!`);
    } catch {
      shopify.toast.show(`Could not copy ${label}`, { isError: true });
    }
    document.body.removeChild(el);
  };

  const handleFilterChange = (formId: string) => {
    if (formId) {
      navigate(`/app/submissions?formId=${encodeURIComponent(formId)}`);
    } else {
      navigate("/app/submissions");
    }
  };

  const handleMarkStatus = (sub: FormSubmission, status: "new" | "read" | "archived") => {
    if (!sub.id) return;
    fetcher.submit({ intent: "status", id: sub.id, status }, { method: "POST" });
    if (activeSubmission?.id === sub.id) {
      setActiveSubmission({ ...activeSubmission, submission_status: status });
    }
  };

  const handleDelete = (sub: FormSubmission) => {
    if (!sub.id) return;
    if (confirm("Are you sure you want to delete this submission?")) {
      fetcher.submit({ intent: "delete", id: sub.id }, { method: "POST" });
    }
  };

  interface ParsedField {
    id?: string;
    label: string;
    value: string | string[];
    type?: string;
  }

  const parseSubmissionData = (sub: FormSubmission): ParsedField[] => {
    const data = sub.submission_data;
    if (Array.isArray(data) && data.length > 0) {
      return data
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const obj = item as unknown as Record<string, unknown>;
          let val = obj.value;
          if (val === undefined || val === null) val = "";
          let finalVal: string | string[] = "";
          if (Array.isArray(val)) {
            finalVal = val.map(String);
          } else if (typeof val === "object") {
            finalVal = JSON.stringify(val);
          } else {
            finalVal = String(val);
          }
          return {
            id: String(obj.id || ""),
            label: String(obj.label || obj.id || "Field"),
            value: finalVal,
            type: typeof obj.type === "string" ? obj.type : undefined,
          };
        });
    }

    if (data && typeof data === "object" && Object.keys(data).length > 0) {
      return Object.entries(data as Record<string, unknown>).map(([key, val]) => {
        let finalVal: string | string[] = "";
        if (Array.isArray(val)) {
          finalVal = val.map(String);
        } else if (typeof val === "object") {
          finalVal = JSON.stringify(val);
        } else {
          finalVal = String(val ?? "");
        }
        return {
          id: key,
          label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          value: finalVal,
        };
      });
    }

    // Fallback if submission_data is empty (legacy submissions)
    const fallback: ParsedField[] = [];
    if (sub.customer_name) {
      fallback.push({ label: "Customer Name", value: sub.customer_name, id: "name", type: "name" });
    }
    if (sub.customer_email) {
      fallback.push({ label: "Email Address", value: sub.customer_email, id: "email", type: "email" });
    }
    if (sub.message) {
      fallback.push({ label: "Message", value: sub.message, id: "message", type: "textarea" });
    }
    if (sub.uploaded_file_url) {
      fallback.push({
        label: "Attachment",
        value: sub.uploaded_file_url,
        id: "attachment",
        type: "file",
      });
    }
    return fallback;
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <s-page heading="Submissions">
      <s-button slot="primary-action" variant="secondary" href="/app">
        View Forms
      </s-button>

      {/* Filter by Form */}
      <s-section>
        <s-stack direction="inline" gap="base">
          <s-select
            label="Filter by form"
            value={selectedFormId}
            onChange={(e: Event) =>
              handleFilterChange((e.target as HTMLSelectElement).value)
            }
          >
            <s-option value="">All Forms</s-option>
            {forms.map((f) => (
              <s-option key={f.id || f.handle} value={f.id || f.handle || ""}>
                {f.name}
              </s-option>
            ))}
          </s-select>
        </s-stack>
      </s-section>

      {submissions.length === 0 ? (
        <s-section>
          <s-empty-state heading="No submissions found">
            <s-paragraph>
              {selectedFormId
                ? "There are no submissions for the selected form yet."
                : "No customer submissions have been received yet. Once customers submit forms on your storefront, their entries will be stored here."}
            </s-paragraph>
          </s-empty-state>
        </s-section>
      ) : (
        <s-section heading={`Submissions (${submissions.length})`}>
          <s-table>
            <s-table-header-row>
              <s-table-header>Date</s-table-header>
              <s-table-header>Form</s-table-header>
              <s-table-header>Form ID</s-table-header>
              <s-table-header>Customer Name</s-table-header>
              <s-table-header>Email</s-table-header>
              <s-table-header>Message Preview</s-table-header>
              <s-table-header>Attachment</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {submissions.map((sub) => {
                const formIdValue = sub.display_form_id || sub.form_id || "";
                return (
                  <s-table-row key={sub.id || sub.handle}>
                    <s-table-cell>
                      <s-text>{formatDate(sub.submitted_at)}</s-text>
                    </s-table-cell>
                    <s-table-cell>
                      <s-text font-weight="bold">{sub.form_title}</s-text>
                    </s-table-cell>
                    <s-table-cell>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <code
                          title={formIdValue}
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
                          {formIdValue || "-"}
                        </code>
                        {formIdValue && (
                          <s-button
                            variant="tertiary"
                            onClick={() => handleCopy(formIdValue, "Form ID")}
                          >
                            Copy
                          </s-button>
                        )}
                      </div>
                    </s-table-cell>
                    <s-table-cell>
                      <s-text>{sub.customer_name || "-"}</s-text>
                    </s-table-cell>
                    <s-table-cell>
                      {sub.customer_email ? (
                        <s-link href={`mailto:${sub.customer_email}`}>{sub.customer_email}</s-link>
                      ) : (
                        "-"
                      )}
                    </s-table-cell>
                  <s-table-cell>
                    <s-text>
                      {sub.message
                        ? sub.message.length > 40
                          ? sub.message.substring(0, 40) + "..."
                          : sub.message
                        : "-"}
                    </s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {sub.uploaded_file_url ? (
                      <s-link href={sub.uploaded_file_url} target="_blank">
                        {sub.uploaded_file_name || "View File"}
                      </s-link>
                    ) : (
                      "-"
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    {sub.submission_status === "new" ? (
                      <s-badge tone="caution">New</s-badge>
                    ) : sub.submission_status === "read" ? (
                      <s-badge tone="success">Read</s-badge>
                    ) : (
                      <s-badge tone="neutral">Archived</s-badge>
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small">
                      <s-button
                        variant="tertiary"
                        onClick={() => {
                          setActiveSubmission(sub);
                          if (sub.submission_status === "new") {
                            handleMarkStatus(sub, "read");
                          }
                        }}
                      >
                        View
                      </s-button>
                      <s-button
                        variant="tertiary"
                        tone="critical"
                        onClick={() => handleDelete(sub)}
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

      {/* Submission Detail Section */}
      {activeSubmission && (() => {
        const dynamicFields = parseSubmissionData(activeSubmission);
        return (
          <s-section heading={`Submission: ${activeSubmission.customer_name || activeSubmission.form_title}`}>
            <s-stack direction="block" gap="base">
              {/* Form & Timestamp Overview */}
              <s-box padding="base" background="subdued" borderRadius="base">
                <s-stack direction="inline" gap="large">
                  <s-paragraph>
                    <s-text font-weight="bold">Form: </s-text>
                    {activeSubmission.form_title}
                  </s-paragraph>
                  <s-paragraph>
                    <s-text font-weight="bold">Form ID: </s-text>
                    <code style={{ fontSize: "12px", background: "#E4E5E7", padding: "2px 6px", borderRadius: "4px" }}>
                      {activeSubmission.display_form_id || activeSubmission.form_id || "-"}
                    </code>
                    {(activeSubmission.display_form_id || activeSubmission.form_id) && (
                      <>
                        {" "}
                        <s-button
                          variant="tertiary"
                          onClick={() =>
                            handleCopy(
                              activeSubmission.display_form_id || activeSubmission.form_id,
                              "Form ID"
                            )
                          }
                        >
                          Copy
                        </s-button>
                      </>
                    )}
                  </s-paragraph>
                  <s-paragraph>
                    <s-text font-weight="bold">Submitted: </s-text>
                    {formatDate(activeSubmission.submitted_at)}
                  </s-paragraph>
                  <s-paragraph>
                    <s-text font-weight="bold">Status: </s-text>
                    {activeSubmission.submission_status === "new" ? (
                      <s-badge tone="caution">New</s-badge>
                    ) : activeSubmission.submission_status === "read" ? (
                      <s-badge tone="success">Read</s-badge>
                    ) : (
                      <s-badge tone="neutral">Archived</s-badge>
                    )}
                  </s-paragraph>
                </s-stack>
              </s-box>

              {/* Dynamic Field Values Table */}
              <s-box padding="base" borderRadius="base">
                <s-stack direction="block" gap="small">
                  <s-stack direction="inline">
                    <s-paragraph>
                      <s-text font-weight="bold">All Submitted Fields ({dynamicFields.length}):</s-text>
                    </s-paragraph>
                  </s-stack>

                  {dynamicFields.length === 0 ? (
                    <s-paragraph>No dynamic field values found for this submission.</s-paragraph>
                  ) : (
                    <s-table>
                      <s-table-header-row>
                        <s-table-header>Field Label</s-table-header>
                        <s-table-header>Submitted Value</s-table-header>
                      </s-table-header-row>
                      <s-table-body>
                        {dynamicFields.map((f, idx) => {
                          const isArray = Array.isArray(f.value);
                          const valStr = isArray ? "" : String(f.value || "");
                          const isEmail =
                            !isArray &&
                            (f.type === "email" ||
                              f.id === "email" ||
                              f.label.toLowerCase().includes("email") ||
                              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valStr));
                          const isFile =
                            !isArray &&
                            (f.type === "file" || f.id === "attachment" || f.id?.includes("file"));
                          const isUrl =
                            !isArray &&
                            (valStr.startsWith("http://") || valStr.startsWith("https://"));
                          const isDate =
                            !isArray &&
                            (f.type === "datetime" || f.type === "date") &&
                            valStr.length > 8;

                          return (
                            <s-table-row key={idx}>
                              <s-table-cell>
                                <s-stack direction="inline" gap="small">
                                  <s-text font-weight="bold">{f.label}</s-text>
                                  {f.id && f.id !== f.label.toLowerCase() && (
                                    <s-badge tone="neutral">{f.id}</s-badge>
                                  )}
                                </s-stack>
                              </s-table-cell>
                              <s-table-cell>
                                {isArray ? (
                                  <s-stack direction="inline" gap="small">
                                    {(f.value as string[]).length === 0 ? (
                                      <s-text>-</s-text>
                                    ) : (
                                      (f.value as string[]).map((v, i) => (
                                        <s-badge key={i} tone="info">{v}</s-badge>
                                      ))
                                    )}
                                  </s-stack>
                                ) : isEmail ? (
                                  <s-link href={`mailto:${valStr}`}>{valStr}</s-link>
                                ) : isFile || isUrl ? (
                                  <s-link href={valStr} target="_blank">
                                    {isFile ? `📎 ${valStr.split("/").pop() || "View Uploaded File"}` : valStr}
                                  </s-link>
                                ) : isDate ? (
                                  <s-text>{formatDate(valStr)}</s-text>
                                ) : (
                                  <span style={{ whiteSpace: "pre-wrap" }}>
                                    <s-text>{valStr || "-"}</s-text>
                                  </span>
                                )}
                              </s-table-cell>
                            </s-table-row>
                          );
                        })}
                      </s-table-body>
                    </s-table>
                  )}
                </s-stack>
              </s-box>

              {/* Uploaded File Link if Present */}
              {activeSubmission.uploaded_file_url && (
                <s-box padding="base" background="subdued" borderRadius="base">
                  <s-stack direction="inline" gap="small">
                    <s-text font-weight="bold">Attachment: </s-text>
                    <s-link href={activeSubmission.uploaded_file_url} target="_blank">
                      {activeSubmission.uploaded_file_name || activeSubmission.uploaded_file_url}
                    </s-link>
                  </s-stack>
                </s-box>
              )}

              {/* Raw JSON Debug Viewer */}
              {showRawJson && (
                <s-box padding="base" background="subdued" borderRadius="base">
                  <s-stack direction="block" gap="small">
                    <s-text font-weight="bold">Raw submission_data JSON payload:</s-text>
                    <pre style={{ margin: 0, padding: "10px", background: "#f6f6f7", borderRadius: "6px", overflowX: "auto", fontSize: "12px" }}>
                      {JSON.stringify(activeSubmission.submission_data || dynamicFields, null, 2)}
                    </pre>
                  </s-stack>
                </s-box>
              )}

              {/* Action Buttons */}
              <s-stack direction="inline" gap="small">
                {activeSubmission.submission_status !== "read" && (
                  <s-button
                    variant="secondary"
                    onClick={() => handleMarkStatus(activeSubmission, "read")}
                  >
                    Mark as Read
                  </s-button>
                )}
                {activeSubmission.submission_status !== "archived" && (
                  <s-button
                    variant="secondary"
                    onClick={() => handleMarkStatus(activeSubmission, "archived")}
                  >
                    Archive
                  </s-button>
                )}
                <s-button
                  variant="tertiary"
                  onClick={() => setShowRawJson(!showRawJson)}
                >
                  {showRawJson ? "Hide JSON" : "View Raw JSON"}
                </s-button>
                <s-button
                  variant="tertiary"
                  tone="critical"
                  onClick={() => handleDelete(activeSubmission)}
                >
                  Delete
                </s-button>
                <s-button
                  variant="tertiary"
                  onClick={() => {
                    setActiveSubmission(null);
                    setShowRawJson(false);
                  }}
                >
                  Close Details
                </s-button>
              </s-stack>
            </s-stack>
          </s-section>
        );
      })()}

      <s-section slot="aside" heading="Submissions Storage">
        <s-paragraph>
          All submissions are persisted securely in your store&apos;s Shopify Metaobjects.
          No third-party database or external storage is used.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
