import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ensureMetaobjectDefinitions } from "../models/metaobjects.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Check metaobject definitions status
  const metaStatus = await ensureMetaobjectDefinitions(admin);

  return {
    shop: session.shop,
    metaStatus,
    themeEditorUrl: `https://${session.shop}/admin/themes/current/editor?context=apps`,
  };
};

export default function Settings() {
  const { shop, metaStatus, themeEditorUrl } = useLoaderData<{
    shop: string;
    metaStatus: {
      formDefinitionReady: boolean;
      submissionDefinitionReady: boolean;
      errors: string[];
    };
    themeEditorUrl: string;
  }>();

  return (
    <s-page heading="Settings & Setup Status">
      <s-button
        slot="primary-action"
        variant="primary"
        href={themeEditorUrl}
        target="_blank"
      >
        Open Theme Editor
      </s-button>

      {/* System & Architecture Status */}
      <s-section heading="Shopify Platform & Data Status">
        <s-stack direction="block" gap="base">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-paragraph>
                <s-text font-weight="bold">Store Connected: </s-text>
                <s-badge tone="success">{shop}</s-badge>
              </s-paragraph>
              <s-paragraph>
                <s-text font-weight="bold">Form Metaobject Schema: </s-text>
                {metaStatus.formDefinitionReady ? (
                  <s-badge tone="success">Active ($app:form)</s-badge>
                ) : (
                  <s-badge tone="critical">Pending Initialization</s-badge>
                )}
              </s-paragraph>
              <s-paragraph>
                <s-text font-weight="bold">Submission Metaobject Schema: </s-text>
                {metaStatus.submissionDefinitionReady ? (
                  <s-badge tone="success">Active ($app:form_submission)</s-badge>
                ) : (
                  <s-badge tone="critical">Pending Initialization</s-badge>
                )}
              </s-paragraph>
              <s-paragraph>
                <s-text font-weight="bold">File Uploads: </s-text>
                <s-badge tone="info">Shopify Files API (Staged Uploads, 10MB limit)</s-badge>
              </s-paragraph>
            </s-stack>
          </s-box>

          {metaStatus.errors.length > 0 && (
            <s-banner tone="warning" heading="Configuration Notes">
              <s-paragraph>{metaStatus.errors.join(", ")}</s-paragraph>
            </s-banner>
          )}
        </s-stack>
      </s-section>

      {/* Theme App Block Guidance */}
      <s-section heading="Theme App Block Setup (Online Store 2.0)">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            FormCraft integrates natively with Online Store 2.0 themes via Theme App Extensions without altering your theme code:
          </s-paragraph>

          <s-ordered-list>
            <s-list-item>
              Click <s-link href={themeEditorUrl} target="_blank">Open Theme Editor</s-link> to launch Shopify&apos;s Theme Customizer.
            </s-list-item>
            <s-list-item>
              Navigate to the template where you want the form (e.g. <b>Pages &gt; Contact</b> or <b>Home Page</b>).
            </s-list-item>
            <s-list-item>
              In the sidebar, click <b>Add section</b> (or <b>Add block</b>) and select <b>FormCraft Form</b>.
            </s-list-item>
            <s-list-item>
              In the block settings, select your form, adjust colors, and click <b>Save</b>.
            </s-list-item>
          </s-ordered-list>
        </s-stack>
      </s-section>

      {/* Customer Privacy & Security */}
      <s-section heading="Security, Anti-Spam & GDPR Privacy">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <b>Spam Protection:</b> Transparent honeypot filtering and rate-limiting safeguard all storefront endpoints from bot abuse.
          </s-paragraph>
          <s-paragraph>
            <b>Data Sovereignty:</b> All form configurations and submissions reside directly in your Shopify store as Metaobjects.
            No customer personal identifiable information (PII) is sold, cached on third-party databases, or transferred outside of Shopify.
          </s-paragraph>
          <s-paragraph>
            <b>Mandatory Webhooks:</b> Fully configured for <code>customers/data_request</code>, <code>customers/redact</code>, and <code>shop/redact</code>.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Quick Links">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app">Manage Forms</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/forms/new">Create a New Form</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/submissions">View Submissions</s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
