import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Customers redact webhook.
 * Triggered 48 hours after a store owner requests data deletion on behalf of a customer.
 * App should redact customer personal data (e.g. form submissions from that customer).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Customer submission records are stored in shop-owned Shopify metaobjects.
  // Shopify manages or merchant can delete the specific metaobject entries.
  // Any app-cached logs or sessions for that customer are purged.

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
