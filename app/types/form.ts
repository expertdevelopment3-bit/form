export type FieldType = "text" | "email" | "textarea" | "file";

export interface FormFieldConfig {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  enabled: boolean;
  placeholder?: string;
}

export interface FormDefinition {
  id?: string;
  handle?: string;
  name: string;
  title: string;
  description?: string;
  fields_config: FormFieldConfig[];
  submit_label: string;
  status: "active" | "inactive";
  success_message?: string;
  updated_at?: string;
  submission_count?: number;
}

export interface FormSubmission {
  id?: string;
  handle?: string;
  form_id: string;
  form_title?: string;
  customer_name?: string;
  customer_email?: string;
  message?: string;
  uploaded_file_url?: string;
  uploaded_file_name?: string;
  submitted_at: string;
  submission_status: "new" | "read" | "archived";
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
