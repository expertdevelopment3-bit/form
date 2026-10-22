import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Customers data request webhook.
 * Triggered when a customer requests their data from the store owner.
 * As a form builder app, form submission data associated with the customer email/ID
 * should be compiled and provided if requested.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // In this MVP, customer data is stored directly in merchant-owned Shopify metaobjects.
  // The merchant and Shopify retain primary custody of those metaobject records.
  // If needed, any cached submission data can be returned or processed here.

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
