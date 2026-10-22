import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ensureMetaobjectDefinitions } from "../models/metaobjects.server";
import { listForms, deleteForm } from "../models/form.server";
import type { FormDefinition } from "../types/form";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Idempotently ensure metaobject schemas are active
  await ensureMetaobjectDefinitions(admin);

  const forms = await listForms(admin);

  return { forms };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    const id = formData.get("id") as string;
    if (id) {
      const result = await deleteForm(admin, id);
      return { success: result.success, errors: result.errors };
    }
  }

  return { success: false, errors: ["Invalid action"] };
};

export default function Index() {
  const { forms } = useLoaderData<{ forms: FormDefinition[] }>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Form deleted successfully");
    } else if (fetcher.data?.errors?.length) {
      shopify.toast.show(fetcher.data.errors.join(", "), { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      fetcher.submit({ intent: "delete", id }, { method: "POST" });
    }
  };

  return (
    <s-page heading="Forms">
      <s-button slot="primary-action" variant="primary" href="/app/forms/new">
        Create form
      </s-button>

      {forms.length === 0 ? (
        <s-section>
          <s-empty-state heading="Create your first storefront form">
            <s-paragraph>
              FormCraft allows you to quickly create contact, inquiry, and feedback forms for your Online Store 2.0 theme.
              All submissions are stored securely in native Shopify metaobjects.
            </s-paragraph>
            <s-button variant="primary" href="/app/forms/new">
              Create form
            </s-button>
          </s-empty-state>
        </s-section>
      ) : (
        <s-section heading={`All Forms (${forms.length})`}>
          <s-table>
            <s-table-header-row>
              <s-table-header>Form Name</s-table-header>
              <s-table-header>Storefront Heading</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Fields</s-table-header>
              <s-table-header>Submissions</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {forms.map((form) => {
                const activeFieldsCount = form.fields_config.filter((f) => f.enabled).length;
                const encodedId = encodeURIComponent(form.id || "");

                return (
                  <s-table-row key={form.id || form.handle}>
                    <s-table-cell>
                      <s-text font-weight="bold">{form.name}</s-text>
                    </s-table-cell>
                    <s-table-cell>
                      <s-text>{form.title}</s-text>
                    </s-table-cell>
                    <s-table-cell>
                      {form.status === "active" ? (
                        <s-badge tone="success">Active</s-badge>
                      ) : (
                        <s-badge tone="neutral">Inactive</s-badge>
                      )}
                    </s-table-cell>
                    <s-table-cell>
                      <s-text>{activeFieldsCount} fields enabled</s-text>
                    </s-table-cell>
                    <s-table-cell>
                      <s-badge tone={form.submission_count ? "info" : "neutral"}>
                        {form.submission_count || 0}
                      </s-badge>
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
                          href={`/app/submissions?formId=${encodedId}`}
                        >
                          Submissions
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

      <s-section slot="aside" heading="Data Architecture">
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
