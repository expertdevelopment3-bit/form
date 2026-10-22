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
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const selectedFormId = url.searchParams.get("formId") || "";

  const [forms, submissions] = await Promise.all([
    listForms(admin),
    listSubmissions(admin, { formId: selectedFormId || undefined }),
  ]);

  return { forms, submissions, selectedFormId };
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
  }>();

  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const navigate = useNavigate();

  const [activeSubmission, setActiveSubmission] = useState<FormSubmission | null>(null);

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
              <s-table-header>Customer Name</s-table-header>
              <s-table-header>Email</s-table-header>
              <s-table-header>Message Preview</s-table-header>
              <s-table-header>Attachment</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {submissions.map((sub) => (
                <s-table-row key={sub.id || sub.handle}>
                  <s-table-cell>
                    <s-text>{formatDate(sub.submitted_at)}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text font-weight="bold">{sub.form_title}</s-text>
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
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}

      {/* Submission Detail Card */}
      {activeSubmission && (
        <s-section heading={`Submission from ${activeSubmission.customer_name || "Customer"}`}>
          <s-stack direction="block" gap="base">
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack direction="block" gap="small">
                <s-paragraph>
                  <s-text font-weight="bold">Form: </s-text>
                  {activeSubmission.form_title}
                </s-paragraph>
                <s-paragraph>
                  <s-text font-weight="bold">Submitted: </s-text>
                  {formatDate(activeSubmission.submitted_at)}
                </s-paragraph>
                <s-paragraph>
                  <s-text font-weight="bold">Email: </s-text>
                  {activeSubmission.customer_email || "N/A"}
                </s-paragraph>
                {activeSubmission.uploaded_file_url && (
                  <s-paragraph>
                    <s-text font-weight="bold">Attachment: </s-text>
                    <s-link href={activeSubmission.uploaded_file_url} target="_blank">
                      {activeSubmission.uploaded_file_name || activeSubmission.uploaded_file_url}
                    </s-link>
                  </s-paragraph>
                )}
                <s-paragraph>
                  <s-text font-weight="bold">Message:</s-text>
                </s-paragraph>
                <s-box padding="base" background="subdued" borderRadius="base">
                  <s-paragraph>{activeSubmission.message || "(No message entered)"}</s-paragraph>
                </s-box>
              </s-stack>
            </s-box>

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
                onClick={() => setActiveSubmission(null)}
              >
                Close Details
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

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
