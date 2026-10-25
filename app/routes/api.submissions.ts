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

// Handle GET requests (health check or form definition retrieval)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const corsHeaders = getCorsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const url = new URL(request.url);
  const formId = url.searchParams.get("formId") || url.searchParams.get("form_id");
  let shopDomain = url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain") || "";

  if (formId) {
    try {
      let adminClient: import("../models/metaobjects.server").AdminApiContext | null = null;
      try {
        const proxyAuth = await authenticate.public.appProxy(request);
        if (proxyAuth?.admin) {
          adminClient = proxyAuth.admin;
          shopDomain = proxyAuth.session?.shop || shopDomain;
        }
      } catch {
        // Fallback
      }

      if (!adminClient && shopDomain) {
        try {
          const auth = await unauthenticated.admin(shopDomain);
          adminClient = auth.admin;
        } catch {}
      }

      if (adminClient) {
        const form = await getForm(adminClient, formId, { shop: shopDomain });
        if (form && form.status !== "inactive") {
          const sanitizedForm = {
            ...form,
            id: form.display_form_id || form.handle,
          };
          return new Response(JSON.stringify({ success: true, form: sanitizedForm }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }
    } catch (err) {
      console.warn("Could not retrieve form in loader:", err);
    }
  }

  return new Response(JSON.stringify({ status: "FormCraft Submission API active" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
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

  const form = await getForm(adminClient, formId, { shop: shopDomain });
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

  // 6. Validate submitted fields & compile dynamic submission_data
  const validationErrors: string[] = [];

  // Dynamic fields array: stores all fields with user-friendly labels and values
  const dynamicEntries: Array<{
    id?: string;
    label: string;
    value: unknown;
    type?: string;
  }> = [];

  const processedFieldIds = new Set<string>();

  // If storefront explicitly passed structured submission_data
  if (Array.isArray(body.submission_data)) {
    for (const item of body.submission_data) {
      if (item && typeof item === "object") {
        const itemObj = item as Record<string, unknown>;
        const id = String(itemObj.id || itemObj.key || itemObj.name || "");
        const label = String(itemObj.label || id || "Field");
        dynamicEntries.push({
          id,
          label,
          value: itemObj.value ?? "",
          type: typeof itemObj.type === "string" ? itemObj.type : undefined,
        });
        if (id) processedFieldIds.add(id);
      }
    }
  } else if (body.submission_data && typeof body.submission_data === "object") {
    for (const [k, v] of Object.entries(body.submission_data as Record<string, unknown>)) {
      dynamicEntries.push({
        id: k,
        label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        value: v ?? "",
      });
      processedFieldIds.add(k);
    }
  }

  // Build a lookup map of all submitted values (from direct body fields and dynamic entries)
  const submittedValueMap = new Map<string, unknown>();

  // 1. Direct body entries
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null && v !== "") {
      submittedValueMap.set(k, v);
      submittedValueMap.set(k.toLowerCase(), v);
    }
  }

  // 2. Structured entries from submission_data
  for (const entry of dynamicEntries) {
    if (entry.id && entry.value !== undefined && entry.value !== null && entry.value !== "") {
      submittedValueMap.set(entry.id, entry.value);
      submittedValueMap.set(entry.id.toLowerCase(), entry.value);
    }
    if (entry.label && entry.value !== undefined && entry.value !== null && entry.value !== "") {
      submittedValueMap.set(entry.label, entry.value);
      submittedValueMap.set(entry.label.toLowerCase(), entry.value);
    }
  }

  // Resolve customer name (support direct name, customer_name, or combining first_name & last_name)
  let customerName = String(body.name || body.customer_name || "").trim();
  if (!customerName) {
    const fn = submittedValueMap.get("first_name") ?? submittedValueMap.get("firstname") ?? "";
    const ln = submittedValueMap.get("last_name") ?? submittedValueMap.get("lastname") ?? "";
    const combinedName = [fn, ln].filter(Boolean).map(String).join(" ").trim();
    if (combinedName) {
      customerName = combinedName;
    } else if (submittedValueMap.has("name")) {
      customerName = String(submittedValueMap.get("name") || "").trim();
    }
  }

  let customerEmail = String(
    body.email || body.customer_email || submittedValueMap.get("email") || ""
  ).trim();

  let customerMessage = String(
    body.message || submittedValueMap.get("message") || ""
  ).trim();

  // Helper to get value for a field definition
  function getFieldValue(field: { id: string; label: string }): unknown {
    return (
      submittedValueMap.get(field.id) ??
      submittedValueMap.get(field.id.toLowerCase()) ??
      submittedValueMap.get(field.label) ??
      submittedValueMap.get(field.label.toLowerCase()) ??
      ""
    );
  }

  // Validate and capture fields defined in form configuration
  for (const field of form.fields_config) {
    if (!field.enabled) continue;

    let fieldVal: unknown = getFieldValue(field);

    if (field.id === "name") {
      fieldVal = customerName || fieldVal;
      if (field.required && !fieldVal) {
        validationErrors.push(`${field.label} is required.`);
      }
    } else if (field.id === "email") {
      fieldVal = customerEmail || fieldVal;
      const strVal = String(fieldVal).trim();
      if (field.required && !strVal) {
        validationErrors.push(`${field.label} is required.`);
      } else if (strVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strVal)) {
        validationErrors.push("Please provide a valid email address.");
      }
    } else if (field.id === "message") {
      fieldVal = customerMessage || fieldVal;
      if (field.required && (!fieldVal || String(fieldVal).trim() === "")) {
        validationErrors.push(`${field.label} is required.`);
      }
    } else if (field.id === "file") {
      fieldVal = body.uploaded_file_name || body.uploaded_file_url || fieldVal || "";
      if (field.required && (!fieldVal || String(fieldVal).trim() === "")) {
        validationErrors.push(`${field.label} is required.`);
      }
    } else {
      if (field.required) {
        if (fieldVal === undefined || fieldVal === null) {
          validationErrors.push(`${field.label} is required.`);
        } else if (Array.isArray(fieldVal) && fieldVal.length === 0) {
          validationErrors.push(`${field.label} is required.`);
        } else if (typeof fieldVal === "string" && fieldVal.trim() === "") {
          validationErrors.push(`${field.label} is required.`);
        }
      }
    }

    if (!processedFieldIds.has(field.id)) {
      dynamicEntries.push({
        id: field.id,
        label: field.label,
        value: fieldVal,
        type: field.type,
      });
      processedFieldIds.add(field.id);
    }
  }

  // Also capture any extra custom fields passed in body (e.g. custom theme customizer fields)
  const reservedKeys = new Set([
    "shop",
    "form_id",
    "formId",
    "_hp",
    "_gotcha",
    "name",
    "customer_name",
    "email",
    "customer_email",
    "message",
    "uploaded_file_url",
    "uploaded_file_name",
    "submission_data",
    "action",
    "intent",
  ]);

  for (const [key, val] of Object.entries(body)) {
    if (!reservedKeys.has(key) && !processedFieldIds.has(key) && val !== undefined && val !== "") {
      dynamicEntries.push({
        id: key,
        label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        value: val,
      });
      processedFieldIds.add(key);
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

  // 8. Persist submission metaobject with submission_data
  const result = await createSubmission(
    adminClient,
    {
      form_id: form.id || formId,
      form_title: form.title,
      customer_name: customerName,
      customer_email: customerEmail,
      message: customerMessage,
      uploaded_file_url: uploadedFileUrl,
      uploaded_file_name: uploadedFileName,
      submitted_at: new Date().toISOString(),
      submission_status: "new",
      submission_data: dynamicEntries,
    },
    { shop: shopDomain }
  );

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
