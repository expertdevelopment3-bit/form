export type FieldType =
  | "text"
  | "email"
  | "textarea"
  | "file"
  | "select"
  | "checkbox"
  | "url"
  | "phone";

export interface FormFieldConfig {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  enabled: boolean;
  placeholder?: string;
  width?: "half" | "full";
  options?: string[];
  helpText?: string;
}

export interface FormDefinition {
  id?: string;
  display_form_id?: string;
  handle?: string;
  name: string;
  title: string;
  description?: string;
  fields_config: FormFieldConfig[];
  submit_label: string;
  status: "active" | "inactive" | "draft";
  success_message?: string;
  layout?: "single_column" | "split_image";
  image_url?: string;
  appearance_config?: Record<string, unknown>;
  updated_at?: string;
  submission_count?: number;
}

export interface DynamicFieldItem {
  id?: string;
  label: string;
  value: unknown;
  type?: string;
}

export interface FormSubmission {
  id?: string;
  handle?: string;
  form_id: string;
  display_form_id?: string;
  form_title?: string;
  customer_name?: string;
  customer_email?: string;
  message?: string;
  uploaded_file_url?: string;
  uploaded_file_name?: string;
  submitted_at: string;
  submission_status: "new" | "read" | "archived";
  submission_data?: Record<string, unknown> | DynamicFieldItem[];
}

export const DEFAULT_FORM_FIELDS: FormFieldConfig[] = [
  {
    id: "name",
    label: "Your Name",
    type: "text",
    required: true,
    enabled: true,
    placeholder: "Jane Doe",
  },
  {
    id: "email",
    label: "Email Address",
    type: "email",
    required: true,
    enabled: true,
    placeholder: "jane@example.com",
  },
  {
    id: "message",
    label: "Message",
    type: "textarea",
    required: true,
    enabled: true,
    placeholder: "How can we help you?",
  },
  {
    id: "file",
    label: "Attachment",
    type: "file",
    required: false,
    enabled: false,
    placeholder: "Upload an image or document (Max 10MB)",
  },
];
