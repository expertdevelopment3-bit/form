import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Shop redact webhook.
 * Triggered 48 hours after a store owner uninstalls the app.
 * App must delete all stored data related to the store.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Clean up any remaining sessions in Prisma session storage for this shop
  try {
    await db.session.deleteMany({ where: { shop } });
  } catch (error) {
    console.error(`Failed to delete sessions for shop ${shop}:`, error);
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
