import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { upsertForm } from "../models/form.server";
import type { FormFieldConfig, FormDefinition } from "../types/form";
import { DEFAULT_FORM_FIELDS } from "../types/form";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const name = String(formData.get("name") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const submitLabel = String(formData.get("submit_label") || "Submit").trim();
  const successMessage = String(
    formData.get("success_message") || "Thank you for reaching out! We will get back to you shortly."
  ).trim();
  const status = (formData.get("status") as "active" | "inactive" | "draft") || "active";
  const layout = (formData.get("layout") as "single_column" | "split_image") || "single_column";
  const imageUrl = String(formData.get("image_url") || "").trim();

  const rawFields = formData.get("fields_config") as string;
  let fieldsConfig: FormFieldConfig[] = DEFAULT_FORM_FIELDS;
  try {
    if (rawFields) {
      fieldsConfig = JSON.parse(rawFields);
    }
  } catch {
    fieldsConfig = DEFAULT_FORM_FIELDS;
  }

  if (!name || !title) {
    return {
      success: false,
      errors: ["Please enter both an internal form name and a storefront title."],
    };
  }

  const result = await upsertForm(admin, {
    name,
    title,
    description,
    fields_config: fieldsConfig,
    submit_label: submitLabel,
    status,
    success_message: successMessage,
    layout,
    image_url: imageUrl || undefined,
  });

  if (result.errors.length > 0 || !result.form) {
    return {
      success: false,
      errors: result.errors.length ? result.errors : ["Failed to save form."],
    };
  }

  return { success: true, form: result.form };
};

export interface FormTemplate {
  id: string;
  name: string;
  category: "Contact" | "Registration" | "Feedback" | "All";
  description: string;
  layout: "single_column" | "split_image";
  image_url?: string;
  defaultTitle: string;
  defaultDescription: string;
  submitLabel: string;
  successMessage: string;
  fields: FormFieldConfig[];
}

export const STARTER_TEMPLATES: FormTemplate[] = [
  {
    id: "basic_contact",
    name: "Basic Contact Form",
    category: "Contact",
    description: "Standard clean single-column layout for general inquiries and customer support.",
    layout: "single_column",
    defaultTitle: "Contact Us",
    defaultDescription: "Fill out the form below and we will get back to you shortly.",
    submitLabel: "Send Message",
    successMessage: "Thank you for contacting us! We will get back to you shortly.",
    fields: [
      { id: "first_name", label: "First Name", type: "text", width: "half", required: true, enabled: true, placeholder: "Jane" },
      { id: "last_name", label: "Last Name", type: "text", width: "half", required: true, enabled: true, placeholder: "Doe" },
      { id: "email", label: "Email Address", type: "email", width: "full", required: true, enabled: true, placeholder: "jane@example.com" },
      { id: "phone", label: "Phone Number", type: "phone", width: "full", required: false, enabled: true, placeholder: "+1 (555) 000-0000" },
      { id: "message", label: "Message", type: "textarea", width: "full", required: true, enabled: true, placeholder: "How can we help you today?" },
    ],
  },
  {
    id: "contact_with_image",
    name: "Contact Form with Image",
    category: "Contact",
    description: "Modern split layout with a branded lifestyle image on the left and form on the right.",
    layout: "split_image",
    image_url: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80",
    defaultTitle: "Get in Touch",
    defaultDescription: "Have questions about our products or orders? We'd love to hear from you.",
    submitLabel: "Send Message",
    successMessage: "Thank you for reaching out! A representative will respond soon.",
    fields: [
      { id: "first_name", label: "First Name", type: "text", width: "half", required: true, enabled: true, placeholder: "Jane" },
      { id: "last_name", label: "Last Name", type: "text", width: "half", required: true, enabled: true, placeholder: "Doe" },
      { id: "email", label: "Email Address", type: "email", width: "full", required: true, enabled: true, placeholder: "jane@example.com" },
      { id: "phone", label: "Phone Number", type: "phone", width: "full", required: false, enabled: true, placeholder: "+1 (555) 000-0000" },
      { id: "message", label: "Message", type: "textarea", width: "full", required: true, enabled: true, placeholder: "Write your message here..." },
    ],
  },
  {
    id: "customer_feedback",
    name: "Customer Feedback / Survey",
    category: "Feedback",
    description: "Gather customer opinions, experience ratings, and suggestions to optimize your store.",
    layout: "single_column",
    defaultTitle: "Customer Feedback",
    defaultDescription: "Help us improve your shopping experience with a quick 30-second review.",
    submitLabel: "Submit Feedback",
    successMessage: "Thank you for your valuable feedback! We appreciate your support.",
    fields: [
      { id: "name", label: "Your Name", type: "text", width: "half", required: false, enabled: true, placeholder: "Alex" },
      { id: "email", label: "Email Address", type: "email", width: "half", required: true, enabled: true, placeholder: "alex@example.com" },
      {
        id: "experience_rating",
        label: "How was your experience?",
        type: "select",
        width: "full",
        required: true,
        enabled: true,
        options: ["Excellent", "Good", "Average", "Poor"],
      },
      {
        id: "features_liked",
        label: "What did you like?",
        type: "checkbox",
        width: "full",
        required: false,
        enabled: true,
        options: ["Product Quality", "Fast Shipping", "Customer Support"],
      },
      { id: "additional_comments", label: "Additional Comments", type: "textarea", width: "full", required: false, enabled: true, placeholder: "Tell us what we can do better..." },
    ],
  },
  {
    id: "wholesale_inquiry",
    name: "Wholesale / Account Inquiry",
    category: "Registration",
    description: "B2B and dealer application form with company verification, tax ID, and document uploads.",
    layout: "single_column",
    defaultTitle: "Wholesale Application",
    defaultDescription: "Apply for a wholesale retail account with verified business credentials.",
    submitLabel: "Submit Application",
    successMessage: "Thank you for applying! Our wholesale team will review your account credentials.",
    fields: [
      { id: "full_name", label: "Full Name", type: "text", width: "half", required: true, enabled: true, placeholder: "Jane Doe" },
      { id: "company_name", label: "Company Name", type: "text", width: "half", required: true, enabled: true, placeholder: "Acme Retailers Ltd" },
      { id: "email", label: "Business Email", type: "email", width: "half", required: true, enabled: true, placeholder: "buyer@acmeretail.com" },
      { id: "phone", label: "Business Phone", type: "phone", width: "half", required: true, enabled: true, placeholder: "+1 (555) 123-4567" },
      { id: "website", label: "Website URL", type: "url", width: "full", required: false, enabled: true, placeholder: "https://www.yourstore.com" },
      { id: "business_license", label: "Business License / Document", type: "file", width: "full", required: false, enabled: true, placeholder: "Upload tax certificate or license (PDF / PNG)" },
      { id: "message", label: "Inquiry Details & Order Estimates", type: "textarea", width: "full", required: false, enabled: true, placeholder: "Provide estimated order quantities and retailer details..." },
    ],
  },
  {
    id: "start_from_blank",
    name: "Start from Blank",
    category: "All",
    description: "Minimal starting point with core fields so you can build your own customized form.",
    layout: "single_column",
    defaultTitle: "Custom Form",
    defaultDescription: "Please complete the form below.",
    submitLabel: "Submit",
    successMessage: "Thank you! Your submission has been received.",
    fields: [
      { id: "email", label: "Email Address", type: "email", width: "full", required: true, enabled: true, placeholder: "name@example.com" },
      { id: "message", label: "Your Message", type: "textarea", width: "full", required: true, enabled: true, placeholder: "How can we assist you?" },
    ],
  },
];

export default function NewForm() {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const navigate = useNavigate();

  // Mode: "gallery" (choosing template) vs "builder" (customizing chosen template)
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<FormTemplate | null>(null);
  const [activeCategory, setActiveCategory] = useState<"All" | "Contact" | "Registration" | "Feedback">("All");

  // Form builder state
  const [name, setName] = useState("Contact Form");
  const [title, setTitle] = useState("Get in Touch");
  const [description, setDescription] = useState("Fill out the form below and we will get back to you shortly.");
  const [submitLabel, setSubmitLabel] = useState("Send Message");
  const [successMessage, setSuccessMessage] = useState("Thank you for reaching out! We will get back to you shortly.");
  const [status, setStatus] = useState<"active" | "inactive" | "draft">("active");
  const [layout, setLayout] = useState<"single_column" | "split_image">("single_column");
  const [imageUrl, setImageUrl] = useState("");
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [fields, setFields] = useState<FormFieldConfig[]>(DEFAULT_FORM_FIELDS);

  const isSubmitting = fetcher.state === "submitting" || fetcher.state === "loading";

  const handleOpenMediaPicker = async () => {
    setIsLoadingImage(true);
    try {
      const bridge = (shopify as any) || (typeof window !== "undefined" && (window as any).shopify);
      if (!bridge?.intents?.invoke) {
        shopify.toast.show("Shopify Media Picker is not supported in this environment.", { isError: true });
        setIsLoadingImage(false);
        return;
      }

      const activity = await bridge.intents.invoke("pick:shopify/File", {
        data: {
          mediaTypes: ["MediaImage"],
          multiSelect: false,
        },
      });

      const response = await activity.complete;

      if (response?.code === "ok") {
        // Direct URL check if provided
        const directUrl =
          response.data?.files?.[0]?.url ||
          response.data?.files?.[0]?.image?.url ||
          response.data?.url ||
          response.data?.image?.url;

        if (directUrl) {
          setImageUrl(directUrl);
          shopify.toast.show("Image selected successfully!");
          setIsLoadingImage(false);
          return;
        }

        // Query file GID from backend
        const fileId = response.data?.ids?.[0] || response.data?.[0];
        if (fileId) {
          const res = await fetch(`/app/file-url?id=${encodeURIComponent(fileId)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.url) {
              setImageUrl(data.url);
              shopify.toast.show("Image selected successfully!");
            } else {
              shopify.toast.show("Could not retrieve image URL for selected file.", { isError: true });
            }
          } else {
            shopify.toast.show("Failed to fetch file details from Shopify.", { isError: true });
          }
        }
      }
    } catch (err: unknown) {
      console.error("Error opening Shopify Media Picker:", err);
      const msg = err instanceof Error ? err.message : "Failed to open Shopify Media Picker";
      shopify.toast.show(msg, { isError: true });
    } finally {
      setIsLoadingImage(false);
    }
  };

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Form created successfully!");
      navigate("/app");
    } else if (fetcher.data?.errors?.length) {
      shopify.toast.show(fetcher.data.errors.join(", "), { isError: true });
    }
  }, [fetcher.data, shopify, navigate]);

  const handleSelectTemplate = (tmpl: FormTemplate) => {
    setSelectedTemplate(tmpl);
    setName(tmpl.name);
    setTitle(tmpl.defaultTitle);
    setDescription(tmpl.defaultDescription);
    setSubmitLabel(tmpl.submitLabel);
    setSuccessMessage(tmpl.successMessage);
    setLayout(tmpl.layout);
    setImageUrl(tmpl.image_url || "");
    setFields(tmpl.fields);
    setPreviewTemplate(null);
  };

  const updateField = (id: string, updates: Partial<FormFieldConfig>) => {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  const handleSave = () => {
    fetcher.submit(
      {
        name,
        title,
        description,
        submit_label: submitLabel,
        success_message: successMessage,
        status,
        layout,
        image_url: imageUrl,
        fields_config: JSON.stringify(fields),
      },
      { method: "POST" }
    );
  };

  const filteredTemplates = STARTER_TEMPLATES.filter((t) => {
    if (activeCategory === "All") return true;
    return t.category === activeCategory;
  });

  // STEP 1: TEMPLATE PICKER GALLERY
  if (!selectedTemplate) {
    return (
      <s-page heading="Form templates">
        <s-button slot="primary-action" variant="secondary" href="/app">
          Back to forms
        </s-button>

        {/* Category Tabs */}
        <s-section>
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="small">
              {(["All", "Contact", "Registration", "Feedback"] as const).map((cat) => (
                <s-button
                  key={cat}
                  variant={activeCategory === cat ? "primary" : "secondary"}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </s-button>
              ))}
            </s-stack>
            <s-paragraph>
              Choose a starter template tailored for your storefront needs or start from blank. You can fully customize all fields, labels, and appearance in the next step.
            </s-paragraph>
          </s-stack>
        </s-section>

        {/* Template Preview Modal / Card */}
        {previewTemplate && (
          <s-section heading={`Preview: ${previewTemplate.name}`}>
            <s-stack direction="block" gap="base">
              <s-box padding="base" background="subdued" borderRadius="base">
                <s-stack direction="block" gap="small">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <s-heading>{previewTemplate.defaultTitle}</s-heading>
                      <s-paragraph>{previewTemplate.defaultDescription}</s-paragraph>
                    </div>
                    <s-badge tone="info">{previewTemplate.category}</s-badge>
                  </div>

                  {/* Wireframe Preview Box */}
                  <div
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid #D2D5D8",
                      borderRadius: "8px",
                      padding: "20px",
                      marginTop: "10px",
                    }}
                  >
                    {previewTemplate.layout === "split_image" ? (
                      <div style={{ display: "flex", gap: "20px", alignItems: "stretch" }}>
                        <div
                          style={{
                            flex: 1,
                            minHeight: "220px",
                            borderRadius: "6px",
                            backgroundImage: `url('${previewTemplate.image_url}')`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }}
                        />
                        <div style={{ flex: 1.2, display: "flex", flexDirection: "column", gap: "10px" }}>
                          {previewTemplate.fields.map((f) => (
                            <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <span style={{ fontSize: "12px", fontWeight: 600, color: "#303030" }}>
                                {f.label} {f.required && <span style={{ color: "#D82C0D" }}>*</span>}
                              </span>
                              <div
                                style={{
                                  height: f.type === "textarea" ? "60px" : "32px",
                                  border: "1px solid #C9CCCF",
                                  borderRadius: "4px",
                                  background: "#FAFAFA",
                                  padding: "6px 8px",
                                  fontSize: "12px",
                                  color: "#8C9196",
                                }}
                              >
                                {f.placeholder || f.label}
                              </div>
                            </div>
                          ))}
                          <div
                            style={{
                              marginTop: "8px",
                              padding: "8px 16px",
                              background: "#008060",
                              color: "#FFFFFF",
                              borderRadius: "4px",
                              textAlign: "center",
                              fontWeight: 600,
                              fontSize: "13px",
                            }}
                          >
                            {previewTemplate.submitLabel}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "480px", margin: "0 auto" }}>
                        {previewTemplate.fields.map((f) => (
                          <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <span style={{ fontSize: "12px", fontWeight: 600, color: "#303030" }}>
                              {f.label} {f.required && <span style={{ color: "#D82C0D" }}>*</span>}
                            </span>
                            {f.type === "select" ? (
                              <div
                                style={{
                                  height: "34px",
                                  border: "1px solid #C9CCCF",
                                  borderRadius: "4px",
                                  background: "#FAFAFA",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "0 10px",
                                  fontSize: "12px",
                                  color: "#303030",
                                }}
                              >
                                <span>{f.options?.[0] || "Select an option..."}</span>
                                <span>▼</span>
                              </div>
                            ) : f.type === "checkbox" ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                                {(f.options || ["Option 1", "Option 2"]).map((opt, i) => (
                                  <label key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#303030" }}>
                                    <input type="checkbox" disabled style={{ margin: 0 }} />
                                    <span>{opt}</span>
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <div
                                style={{
                                  height: f.type === "textarea" ? "60px" : "32px",
                                  border: "1px solid #C9CCCF",
                                  borderRadius: "4px",
                                  background: "#FAFAFA",
                                  padding: "6px 8px",
                                  fontSize: "12px",
                                  color: "#8C9196",
                                }}
                              >
                                {f.placeholder || f.label}
                              </div>
                            )}
                          </div>
                        ))}
                        <div
                          style={{
                            marginTop: "8px",
                            padding: "8px 16px",
                            background: "#008060",
                            color: "#FFFFFF",
                            borderRadius: "4px",
                            textAlign: "center",
                            fontWeight: 600,
                            fontSize: "13px",
                          }}
                        >
                          {previewTemplate.submitLabel}
                        </div>
                      </div>
                    )}
                  </div>
                </s-stack>
              </s-box>

              <s-stack direction="inline" gap="small">
                <s-button
                  variant="primary"
                  onClick={() => handleSelectTemplate(previewTemplate)}
                >
                  Use this template
                </s-button>
                <s-button
                  variant="tertiary"
                  onClick={() => setPreviewTemplate(null)}
                >
                  Close preview
                </s-button>
              </s-stack>
            </s-stack>
          </s-section>
        )}

        {/* Templates Visual Grid */}
        <s-section heading={`Available Templates (${filteredTemplates.length})`}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "16px",
            }}
          >
            {filteredTemplates.map((tmpl) => (
              <s-box
                key={tmpl.id}
                padding="base"
                borderRadius="base"
                borderWidth="base"
                borderColor="subdued"
                background="subdued"
              >
                <s-stack direction="block" gap="small">
                  {/* Miniature CSS Visual Wireframe Preview */}
                  <div
                    style={{
                      height: "110px",
                      background: "#FFFFFF",
                      borderRadius: "6px",
                      border: "1px solid #E1E3E5",
                      padding: "8px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    {tmpl.id === "contact_with_image" ? (
                      <div style={{ display: "flex", height: "100%", gap: "8px" }}>
                        <div
                          style={{
                            flex: 1,
                            background: "#D8EBE5",
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#008060",
                            fontSize: "11px",
                            fontWeight: 600,
                          }}
                        >
                          Image
                        </div>
                        <div style={{ flex: 1.2, display: "flex", flexDirection: "column", gap: "5px", justifyContent: "center" }}>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <div style={{ flex: 1, height: "8px", background: "#E4E5E7", borderRadius: "2px" }} />
                            <div style={{ flex: 1, height: "8px", background: "#E4E5E7", borderRadius: "2px" }} />
                          </div>
                          <div style={{ height: "8px", background: "#E4E5E7", borderRadius: "2px" }} />
                          <div style={{ height: "16px", background: "#F1F2F4", borderRadius: "2px", border: "1px solid #E4E5E7" }} />
                          <div style={{ width: "40px", height: "10px", background: "#008060", borderRadius: "2px" }} />
                        </div>
                      </div>
                    ) : tmpl.id === "customer_feedback" ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", height: "100%", justifyContent: "center" }}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <div style={{ flex: 1, height: "8px", background: "#E4E5E7", borderRadius: "2px" }} />
                          <div style={{ flex: 1, height: "8px", background: "#E4E5E7", borderRadius: "2px" }} />
                        </div>
                        <div style={{ height: "12px", background: "#F6F6F7", border: "1px solid #C9CCCF", borderRadius: "2px", display: "flex", alignItems: "center", padding: "0 4px", fontSize: "8px", color: "#6D7175" }}>
                          Dropdown rating ▼
                        </div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <div style={{ width: "8px", height: "8px", border: "1px solid #008060", background: "#E3F1DF", borderRadius: "1px" }} />
                          <div style={{ width: "8px", height: "8px", border: "1px solid #C9CCCF", borderRadius: "1px" }} />
                          <div style={{ width: "8px", height: "8px", border: "1px solid #C9CCCF", borderRadius: "1px" }} />
                        </div>
                        <div style={{ width: "45px", height: "10px", background: "#008060", borderRadius: "2px" }} />
                      </div>
                    ) : tmpl.id === "wholesale_inquiry" ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "5px", height: "100%", justifyContent: "center" }}>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <div style={{ flex: 1, height: "8px", background: "#E4E5E7", borderRadius: "2px" }} />
                          <div style={{ flex: 1, height: "8px", background: "#E4E5E7", borderRadius: "2px" }} />
                        </div>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <div style={{ flex: 1, height: "8px", background: "#E4E5E7", borderRadius: "2px" }} />
                          <div style={{ flex: 1, height: "8px", background: "#E4E5E7", borderRadius: "2px" }} />
                        </div>
                        <div style={{ height: "12px", border: "1px dashed #A6ACBE", borderRadius: "2px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", color: "#6D7175" }}>
                          📎 Upload license
                        </div>
                        <div style={{ width: "48px", height: "10px", background: "#008060", borderRadius: "2px" }} />
                      </div>
                    ) : tmpl.id === "start_from_blank" ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "4px" }}>
                        <div style={{ fontSize: "22px", color: "#5C5F62", lineHeight: 1 }}>+</div>
                        <span style={{ fontSize: "10px", color: "#6D7175", fontWeight: 600 }}>Blank Canvas</span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", height: "100%", justifyContent: "center" }}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <div style={{ flex: 1, height: "8px", background: "#E4E5E7", borderRadius: "2px" }} />
                          <div style={{ flex: 1, height: "8px", background: "#E4E5E7", borderRadius: "2px" }} />
                        </div>
                        <div style={{ height: "8px", background: "#E4E5E7", borderRadius: "2px" }} />
                        <div style={{ height: "20px", background: "#F1F2F4", borderRadius: "2px", border: "1px solid #E4E5E7" }} />
                        <div style={{ width: "45px", height: "10px", background: "#008060", borderRadius: "2px" }} />
                      </div>
                    )}
                  </div>

                  {/* Card Info */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "4px" }}>
                    <s-text font-weight="bold">{tmpl.name}</s-text>
                    <s-badge tone="neutral">{tmpl.category}</s-badge>
                  </div>
                  <div style={{ minHeight: "36px" }}>
                    <s-paragraph>{tmpl.description}</s-paragraph>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                    <s-button
                      variant="primary"
                      onClick={() => handleSelectTemplate(tmpl)}
                    >
                      Select
                    </s-button>
                    <s-button
                      variant="tertiary"
                      onClick={() => setPreviewTemplate(tmpl)}
                    >
                      👁 Preview
                    </s-button>
                  </div>
                </s-stack>
              </s-box>
            ))}
          </div>
        </s-section>
      </s-page>
    );
  }

  // STEP 2: FORM BUILDER VIEW (Pre-populated from selected template)
  return (
    <s-page heading={`Create Form — ${selectedTemplate.name}`}>
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleSave}
        {...(isSubmitting ? { loading: true } : {})}
      >
        Save Form
      </s-button>
      <s-button slot="secondary-actions" onClick={() => setSelectedTemplate(null)}>
        Change template
      </s-button>
      <s-button slot="secondary-actions" href="/app">
        Cancel
      </s-button>

      {/* General Settings */}
      <s-section heading="General Information">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Internal Form Name"
            details="Used inside Shopify Admin to organize your forms"
            value={name}
            onInput={(e: Event) =>
              setName((e.target as HTMLInputElement).value)
            }
            required
          />
          <s-text-field
            label="Storefront Heading"
            details="Title displayed at the top of the form on your online store"
            value={title}
            onInput={(e: Event) =>
              setTitle((e.target as HTMLInputElement).value)
            }
            required
          />
          <s-text-area
            label="Storefront Description (Optional)"
            details="Introductory subtext displayed directly beneath the title"
            value={description}
            onInput={(e: Event) =>
              setDescription((e.target as HTMLTextAreaElement).value)
            }
          />
          <s-select
            label="Form Layout"
            value={layout}
            onChange={(e: Event) =>
              setLayout((e.target as HTMLSelectElement).value as "single_column" | "split_image")
            }
          >
            <s-option value="single_column">Single Column Layout</s-option>
            <s-option value="split_image">Split Layout (Image on Left, Form on Right)</s-option>
          </s-select>

          {layout === "split_image" && (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack direction="block" gap="small">
                <s-text font-weight="bold">Lifestyle / Banner Image</s-text>
                <s-paragraph>
                  Select an image from your Shopify store files to display alongside the form block.
                </s-paragraph>

                {imageUrl ? (
                  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <img
                      src={imageUrl}
                      alt="Banner Preview"
                      style={{
                        width: "100px",
                        height: "100px",
                        objectFit: "cover",
                        borderRadius: "8px",
                        border: "1px solid #D2D5D8",
                      }}
                    />
                    <s-stack direction="block" gap="small">
                      <s-stack direction="inline" gap="small">
                        <s-button
                          variant="secondary"
                          onClick={handleOpenMediaPicker}
                          {...(isLoadingImage ? { loading: true } : {})}
                        >
                          Change image
                        </s-button>
                        <s-button
                          variant="tertiary"
                          tone="critical"
                          onClick={() => setImageUrl("")}
                        >
                          Remove
                        </s-button>
                      </s-stack>
                      <span style={{ fontSize: "11px", wordBreak: "break-all", color: "#6D7175" }}>
                        {imageUrl}
                      </span>
                    </s-stack>
                  </div>
                ) : (
                  <div>
                    <s-button
                      variant="secondary"
                      onClick={handleOpenMediaPicker}
                      {...(isLoadingImage ? { loading: true } : {})}
                    >
                      Select file from Shopify
                    </s-button>
                  </div>
                )}
              </s-stack>
            </s-box>
          )}

          <s-select
            label="Form Status"
            value={status}
            onChange={(e: Event) =>
              setStatus((e.target as HTMLSelectElement).value as "active" | "inactive" | "draft")
            }
          >
            <s-option value="active">Active (Published &amp; Accepting Submissions)</s-option>
            <s-option value="draft">Draft (Editing in progress)</s-option>
            <s-option value="inactive">Inactive (Disabled on Storefront)</s-option>
          </s-select>
        </s-stack>
      </s-section>

      {/* Fields Configuration */}
      <s-section heading={`Form Fields (${fields.length})`}>
        <s-paragraph>
          Review and customize the fields from the template. Toggle whether each field is enabled or mandatory on your storefront.
        </s-paragraph>

        <s-table>
          <s-table-header-row>
            <s-table-header>Field Name</s-table-header>
            <s-table-header>Type</s-table-header>
            <s-table-header>Display Label</s-table-header>
            <s-table-header>Width</s-table-header>
            <s-table-header>Enabled</s-table-header>
            <s-table-header>Required</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {fields.map((field) => (
              <s-table-row key={field.id}>
                <s-table-cell>
                  <s-text font-weight="bold">{field.id}</s-text>
                </s-table-cell>
                <s-table-cell>
                  <s-badge tone="neutral">{field.type}</s-badge>
                </s-table-cell>
                <s-table-cell>
                  <s-text-field
                    label="Label"
                    label-hidden
                    value={field.label}
                    onInput={(e: Event) =>
                      updateField(field.id, { label: (e.target as HTMLInputElement).value })
                    }
                  />
                </s-table-cell>
                <s-table-cell>
                  <s-badge tone={field.width === "half" ? "info" : "neutral"}>
                    {field.width === "half" ? "Half" : "Full"}
                  </s-badge>
                </s-table-cell>
                <s-table-cell>
                  <s-checkbox
                    checked={field.enabled}
                    onChange={(e: Event) =>
                      updateField(field.id, { enabled: (e.target as HTMLInputElement).checked })
                    }
                  />
                </s-table-cell>
                <s-table-cell>
                  <s-checkbox
                    checked={field.required}
                    disabled={!field.enabled}
                    onChange={(e: Event) =>
                      updateField(field.id, { required: (e.target as HTMLInputElement).checked })
                    }
                  />
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      {/* Submission Settings */}
      <s-section heading="Submission &amp; Confirmation Settings">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Submit Button Label"
            value={submitLabel}
            onInput={(e: Event) =>
              setSubmitLabel((e.target as HTMLInputElement).value)
            }
          />
          <s-text-field
            label="Success Message"
            details="Displayed immediately to the customer once the form submits successfully"
            value={successMessage}
            onInput={(e: Event) =>
              setSuccessMessage((e.target as HTMLInputElement).value)
            }
          />
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Template Summary">
        <s-paragraph>
          <s-text font-weight="bold">Base Template: </s-text>
          {selectedTemplate.name}
        </s-paragraph>
        <s-paragraph>
          <s-text font-weight="bold">Category: </s-text>
          {selectedTemplate.category}
        </s-paragraph>
        <s-paragraph>
          <s-text font-weight="bold">Layout: </s-text>
          {layout === "split_image" ? "Split Image" : "Single Column"}
        </s-paragraph>
        <s-button variant="secondary" onClick={() => setSelectedTemplate(null)}>
          Switch Template
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
