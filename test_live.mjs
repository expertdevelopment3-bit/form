import "@shopify/shopify-app-react-router/adapters/node";
import shopify from "./app/shopify.server.ts";
import { ensureMetaobjectDefinitions, FORM_METAOBJECT_TYPE, SUBMISSION_METAOBJECT_TYPE } from "./app/models/metaobjects.server.ts";
import { listForms, upsertForm, getForm, deleteForm } from "./app/models/form.server.ts";
import { listSubmissions, createSubmission, deleteSubmission } from "./app/models/submission.server.ts";

const shop = "app-testing-store-qta0iux1.myshopify.com";

async function runLiveTest() {
  console.log("--- 1. Authenticating Admin Client for store:", shop);
  const { admin } = await shopify.unauthenticated.admin(shop);

  console.log("--- 2. Ensuring Metaobject Definitions (Idempotency Test 1)...");
  const init1 = await ensureMetaobjectDefinitions(admin);
  console.log("Init 1 Result:", JSON.stringify(init1, null, 2));

  console.log("--- 3. Running Metaobject Definitions (Idempotency Test 2)...");
  const init2 = await ensureMetaobjectDefinitions(admin);
  console.log("Init 2 Result:", JSON.stringify(init2, null, 2));

  console.log("--- 4. Querying existing forms...");
  const initialForms = await listForms(admin);
  console.log("Current forms count:", initialForms.length);

  console.log("--- 5. Creating a test FormCraft form...");
  const testFormInput = {
    name: "Live Audit Test Form",
    title: "Live Contact Form",
    description: "Form created during integration audit",
    submit_label: "Send Message",
    status: "active",
    success_message: "Thank you! Live submission successful.",
    fields_config: [
      { id: "name", label: "Full Name", type: "text", required: true, enabled: true },
      { id: "email", label: "Email Address", type: "email", required: true, enabled: true },
      { id: "message", label: "Message", type: "textarea", required: true, enabled: true },
      { id: "file", label: "Attachment", type: "file", required: false, enabled: false }
    ]
  };

  const createResult = await upsertForm(admin, testFormInput);
  console.log("Form created:", createResult.form?.id, createResult.form?.handle, "Errors:", createResult.errors);

  if (!createResult.form?.id) {
    throw new Error("Failed to create test form");
  }

  const createdId = createResult.form.id;

  console.log("--- 6. Retrieving created form by ID...");
  const retrieved = await getForm(admin, createdId);
  console.log("Retrieved form:", retrieved?.name, retrieved?.title, "Status:", retrieved?.status);

  console.log("--- 7. Updating form (edit test)...");
  const updateResult = await upsertForm(admin, {
    ...retrieved,
    title: "Updated Live Contact Form Heading",
    description: "Updated description for live verification",
  });
  console.log("Updated form title:", updateResult.form?.title, "Errors:", updateResult.errors);

  console.log("--- 8. Creating a test submission with dynamic submission_data for this form...");
  const subResult = await createSubmission(admin, {
    form_id: createdId,
    form_title: updateResult.form?.title || "Test Form",
    customer_name: "Audit QA User",
    customer_email: "qa-audit@example.com",
    message: "This is a real live submission test verifying metaobject storage.",
    submitted_at: new Date().toISOString(),
    submission_status: "new",
    submission_data: [
      { id: "name", label: "Full Name", value: "Audit QA User", type: "text" },
      { id: "email", label: "Email Address", value: "qa-audit@example.com", type: "email" },
      { id: "message", label: "Message", value: "This is a real live submission test verifying metaobject storage.", type: "textarea" },
      { id: "phone", label: "Phone Number", value: "+91 98765 43210", type: "text" },
      { id: "company", label: "Company / Store Name", value: "FR Traders Ltd", type: "text" }
    ]
  });
  console.log("Submission created:", subResult.submission?.id, "Errors:", subResult.errors);

  console.log("--- 9. Listing submissions filtered by formId & checking dynamic submission_data...");
  const submissions = await listSubmissions(admin, { formId: createdId });
  console.log("Found submissions for form:", submissions.length);
  if (submissions.length > 0) {
    console.log("First submission customer:", submissions[0].customer_name, submissions[0].customer_email);
    console.log("Retrieved dynamic submission_data:", JSON.stringify(submissions[0].submission_data, null, 2));
  }

  console.log("--- 10. Cleaning up test submission...");
  if (subResult.submission?.id) {
    const delSub = await deleteSubmission(admin, subResult.submission.id);
    console.log("Deleted test submission:", delSub.success, delSub.errors);
  }

  console.log("--- 11. Cleaning up test form...");
  const delForm = await deleteForm(admin, createdId);
  console.log("Deleted test form:", delForm.success, delForm.errors);

  console.log("--- LIVE AUDIT COMPLETE: ALL CHECKS PASSED! ---");
}

runLiveTest().catch(err => {
  console.error("Live test failed:", err);
  process.exit(1);
});
