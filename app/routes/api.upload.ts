import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { createStagedUpload, finalizeFileCreate, FILE_UPLOADS_ENABLED } from "../models/upload.server";

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Domain",
    "Access-Control-Max-Age": "86400",
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }
  return new Response(
    JSON.stringify({
      status: "FormCraft Upload API active",
      uploadsEnabled: FILE_UPLOADS_ENABLED,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(request) },
    }
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const corsHeaders = getCorsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Security gate: customer uploads are disabled until private access controls are available
  if (!FILE_UPLOADS_ENABLED) {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          "File uploads are currently disabled for privacy and compliance reasons. Shopify Files API does not provide private access controls for end-customer documents.",
      }),
      { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid JSON payload." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // Resolve shop and admin client
  let adminClient: import("../models/metaobjects.server").AdminApiContext | null = null;
  let shopDomain = (body.shop as string) || request.headers.get("x-shopify-shop-domain") || "";

  try {
    const proxyAuth = await authenticate.public.appProxy(request);
    if (proxyAuth?.admin) {
      adminClient = proxyAuth.admin;
      shopDomain = proxyAuth.session?.shop || shopDomain;
    }
  } catch {
    // Not app proxy
  }

  if (!adminClient) {
    if (!shopDomain) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required shop parameter." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    try {
      const auth = await unauthenticated.admin(shopDomain);
      adminClient = auth.admin;
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Store authentication failed." }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  }

  const actionType = body.action as string;

  if (actionType === "finalize") {
    // Finalize file creation after staged upload
    const originalSource = String(body.originalSource || "");
    const filename = String(body.filename || "upload");
    const mimeType = String(body.mimeType || "application/octet-stream");

    if (!originalSource) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing originalSource." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const finalizeResult = await finalizeFileCreate(
      adminClient,
      originalSource,
      filename,
      mimeType
    );

    if (finalizeResult.error) {
      return new Response(
        JSON.stringify({ success: false, error: finalizeResult.error }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        fileId: finalizeResult.fileId,
        fileUrl: finalizeResult.fileUrl,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // Default: stage upload target
  const filename = String(body.filename || "");
  const mimeType = String(body.mimeType || "");
  const fileSize = typeof body.fileSize === "number" ? body.fileSize : undefined;

  const stageResult = await createStagedUpload(adminClient, filename, mimeType, fileSize);
  if (stageResult.error || !stageResult.target) {
    return new Response(
      JSON.stringify({ success: false, error: stageResult.error || "Failed to create upload target." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      target: stageResult.target,
    }),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
};
