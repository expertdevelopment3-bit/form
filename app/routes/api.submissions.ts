import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { getForm } from "../models/form.server";
import { createSubmission } from "../models/submission.server";

// Simple in-memory rate limiter: IP -> timestamps array
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }

  recent.push(now);
  rateLimitMap.set(ip, recent);

  // Clean up old entries periodically
  if (rateLimitMap.size > 10000) {
    for (const [key, times] of rateLimitMap.entries()) {
      if (times.every((t) => now - t > RATE_LIMIT_WINDOW_MS)) {
        rateLimitMap.delete(key);
      }
    }
  }

  return false;
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Domain",
    "Access-Control-Max-Age": "86400",
  };
}

// Handle OPTIONS preflight requests
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request),
    });
  }

  return new Response(JSON.stringify({ status: "FormCraft Submission API active" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(request),
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const corsHeaders = getCorsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 1. Rate limiting by IP
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";

  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Too many submissions. Please wait a minute and try again.",
      }),
      { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // 2. Parse request body
  let body: Record<string, unknown>;
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    }
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid request payload." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // 3. Spam Honeypot check
  // Hidden fields: _hp or _gotcha - if filled by automated bots, reject
  if (body._hp || body._gotcha) {
    // Return mock success to mislead spam bots without storing junk data
    return new Response(
      JSON.stringify({
        success: true,
        message: "Thank you for reaching out!",
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // 4. Resolve Shop and authenticate
  let adminClient: import("../models/metaobjects.server").AdminApiContext | null = null;
  let shopDomain = (body.shop as string) || request.headers.get("x-shopify-shop-domain") || "";

  // Attempt App Proxy authentication first if called through /apps/formcraft
  try {
    const proxyAuth = await authenticate.public.appProxy(request);
    if (proxyAuth?.admin) {
      adminClient = proxyAuth.admin;
      shopDomain = proxyAuth.session?.shop || shopDomain;
    }
  } catch {
    // Not an App Proxy request, fallback to unauthenticated store admin
  }

  if (!adminClient) {
    if (!shopDomain) {
      // Try URL search params
      const url = new URL(request.url);
      shopDomain = url.searchParams.get("shop") || "";
    }

    if (!shopDomain) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required shop domain parameter." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    try {
      const auth = await unauthenticated.admin(shopDomain);
      adminClient = auth.admin;
    } catch (err: unknown) {
      console.error(`Failed to authenticate admin for shop ${shopDomain}:`, err);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Store authorization error. Please verify the app is installed.",
        }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  }

  // 5. Validate form ID & retrieve form definition
  const formId = (body.form_id as string) || (body.formId as string);
  if (!formId) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing form ID." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const form = await getForm(adminClient, formId);
  if (!form) {
    return new Response(
      JSON.stringify({ success: false, error: "Form not found." }),
      { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  if (form.status === "inactive") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "This form is currently inactive and not accepting responses.",
      }),
      { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // 6. Validate submitted fields against form configuration
  const validationErrors: string[] = [];
  const customerName = String(body.name || body.customer_name || "").trim();
  const customerEmail = String(body.email || body.customer_email || "").trim();
  const customerMessage = String(body.message || "").trim();

  for (const field of form.fields_config) {
    if (!field.enabled) continue;

    if (field.id === "name") {
      if (field.required && !customerName) {
        validationErrors.push(`${field.label} is required.`);
      }
    } else if (field.id === "email") {
      if (field.required && !customerEmail) {
        validationErrors.push(`${field.label} is required.`);
      } else if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
        validationErrors.push("Please provide a valid email address.");
      }
    } else if (field.id === "message") {
      if (field.required && !customerMessage) {
        validationErrors.push(`${field.label} is required.`);
      }
    }
  }

  if (validationErrors.length > 0) {
    return new Response(
      JSON.stringify({
        success: false,
        error: validationErrors.join(" "),
        validationErrors,
      }),
      { status: 422, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // 7. Handle optional uploaded file data
  const uploadedFileUrl = body.uploaded_file_url ? String(body.uploaded_file_url) : undefined;
  const uploadedFileName = body.uploaded_file_name ? String(body.uploaded_file_name) : undefined;

  // 8. Persist submission metaobject
  const result = await createSubmission(adminClient, {
    form_id: form.id || formId,
    form_title: form.title,
    customer_name: customerName,
    customer_email: customerEmail,
    message: customerMessage,
    uploaded_file_url: uploadedFileUrl,
    uploaded_file_name: uploadedFileName,
    submitted_at: new Date().toISOString(),
    submission_status: "new",
  });

  if (!result.submission || result.errors.length > 0) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to save submission. " + result.errors.join(", "),
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      message:
        form.success_message ||
        "Thank you for contacting us! We will get back to you shortly.",
      submissionId: result.submission.id,
    }),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
};
