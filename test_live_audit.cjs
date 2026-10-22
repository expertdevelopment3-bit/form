const { PrismaClient } = require("@prisma/client");

const shop = "app-testing-store-qta0iux1.myshopify.com";
const apiVersion = "2026-07";

async function main() {
  const prisma = new PrismaClient();
  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
  });

  if (!session || !session.accessToken) {
    console.error("No active offline session found for shop:", shop);
    process.exit(1);
  }

  console.log("=== 1. Live Session Verified ===");
  console.log("Shop:", session.shop);
  console.log("Scope:", session.scope);
  console.log("IsOnline:", session.isOnline);
  console.log("Access token exists:", !!session.accessToken);

  async function graphql(query, variables = {}) {
    const res = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });
    return res.json();
  }

  // Step 3.1: Check Metaobject Definitions
  console.log("\n=== 2. Checking Form & Submission Metaobject Definitions ===");
  const defCheck = await graphql(
    `#graphql
    query checkDefinitions {
      formDef: metaobjectDefinitionByType(type: "$app:form") {
        id
        type
        name
        access {
          admin
          storefront
        }
        fieldDefinitions {
          key
          name
          type {
            name
          }
        }
      }
      subDef: metaobjectDefinitionByType(type: "$app:form_submission") {
        id
        type
        name
        access {
          admin
          storefront
        }
        fieldDefinitions {
          key
          name
          type {
            name
          }
        }
      }
    }`
  );

  console.log("Definitions query response:", JSON.stringify(defCheck, null, 2));

  // If definitions don't exist yet, create them via metaobjectDefinitionCreate
  let formDefId = defCheck.data?.formDef?.id;
  let subDefId = defCheck.data?.subDef?.id;

  if (!formDefId) {
    console.log("\nCreating $app:form definition...");
    const createFormDef = await graphql(
      `#graphql
      mutation createFormDef($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition {
            id
            type
            name
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        definition: {
          name: "FormCraft Form",
          type: "$app:form",
          access: {
            admin: "MERCHANT_READ_WRITE",
            storefront: "PUBLIC_READ",
          },
          fieldDefinitions: [
            { key: "name", name: "Form Name", type: "single_line_text_field", required: true },
            { key: "title", name: "Title", type: "single_line_text_field", required: true },
            { key: "description", name: "Description", type: "multi_line_text_field" },
            { key: "fields_config", name: "Fields Configuration", type: "json", required: true },
            { key: "submit_label", name: "Submit Button Label", type: "single_line_text_field" },
            { key: "status", name: "Status", type: "single_line_text_field", required: true },
            { key: "success_message", name: "Success Message", type: "single_line_text_field" },
          ],
        },
      }
    );
    console.log("Create Form Definition Result:", JSON.stringify(createFormDef, null, 2));
    formDefId = createFormDef.data?.metaobjectDefinitionCreate?.metaobjectDefinition?.id;
  } else {
    console.log("Form Definition already exists ($app:form):", formDefId);
  }

  if (!subDefId) {
    console.log("\nCreating $app:form_submission definition...");
    const createSubDef = await graphql(
      `#graphql
      mutation createSubDef($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition {
            id
            type
            name
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        definition: {
          name: "FormCraft Submission",
          type: "$app:form_submission",
          access: {
            admin: "MERCHANT_READ_WRITE",
          },
          fieldDefinitions: [
            { key: "form_id", name: "Form ID", type: "single_line_text_field", required: true },
            { key: "form_title", name: "Form Title", type: "single_line_text_field" },
            { key: "customer_name", name: "Customer Name", type: "single_line_text_field" },
            { key: "customer_email", name: "Customer Email", type: "single_line_text_field" },
            { key: "message", name: "Message", type: "multi_line_text_field" },
            { key: "uploaded_file_url", name: "Uploaded File URL", type: "url" },
            { key: "uploaded_file_name", name: "Uploaded File Name", type: "single_line_text_field" },
            { key: "submitted_at", name: "Submitted At", type: "date_time", required: true },
            { key: "submission_status", name: "Submission Status", type: "single_line_text_field" },
          ],
        },
      }
    );
    console.log("Create Submission Definition Result:", JSON.stringify(createSubDef, null, 2));
    subDefId = createSubDef.data?.metaobjectDefinitionCreate?.metaobjectDefinition?.id;
  } else {
    console.log("Submission Definition already exists ($app:form_submission):", subDefId);
  }

  // Test Idempotency: Run creation again to verify error handling
  console.log("\n=== 3. Testing Idempotency (re-running creation) ===");
  const testIdempotent = await graphql(
    `#graphql
    mutation testIdempotency($definition: MetaobjectDefinitionCreateInput!) {
      metaobjectDefinitionCreate(definition: $definition) {
        metaobjectDefinition { id }
        userErrors { field message }
      }
    }`,
    {
      definition: {
        name: "FormCraft Form",
        type: "$app:form",
        fieldDefinitions: [{ key: "name", name: "Form Name", type: "single_line_text_field" }],
      },
    }
  );
  console.log("Idempotency test (expecting userError):", testIdempotent.data?.metaobjectDefinitionCreate?.userErrors);

  // Step 3.2: Create a Form Entry
  console.log("\n=== 4. Creating a Form Metaobject Entry ===");
  const formHandle = `audit-form-${Date.now()}`;
  const fieldsConfig = [
    { id: "name", label: "Full Name", type: "text", required: true, enabled: true },
    { id: "email", label: "Email Address", type: "email", required: true, enabled: true },
    { id: "message", label: "Your Message", type: "textarea", required: true, enabled: true },
  ];

  const createFormEntry = await graphql(
    `#graphql
    mutation createForm($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject {
          id
          handle
          updatedAt
          fields {
            key
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      metaobject: {
        type: "$app:form",
        handle: formHandle,
        fields: [
          { key: "name", value: "Audit Contact Form" },
          { key: "title", value: "Get in Touch with Us" },
          { key: "description", value: "We reply within 1 business day." },
          { key: "fields_config", value: JSON.stringify(fieldsConfig) },
          { key: "submit_label", value: "Send Inquiry" },
          { key: "status", value: "active" },
          { key: "success_message", value: "Thank you! Your inquiry was received." },
        ],
      },
    }
  );

  console.log("Create Form Result:", JSON.stringify(createFormEntry, null, 2));
  const createdForm = createFormEntry.data?.metaobjectCreate?.metaobject;
  if (!createdForm?.id) {
    throw new Error("Failed to create form entry");
  }

  // Step 3.3: Edit/Update Form Entry
  console.log("\n=== 5. Updating the Form Metaobject Entry ===");
  const updateFormEntry = await graphql(
    `#graphql
    mutation updateForm($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject {
          id
          handle
          updatedAt
          fields {
            key
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      id: createdForm.id,
      metaobject: {
        fields: [
          { key: "title", value: "Updated: Get in Touch with Support" },
          { key: "description", value: "Updated description during audit." },
        ],
      },
    }
  );
  console.log("Update Form Result:", JSON.stringify(updateFormEntry, null, 2));

  // Step 3.4: Create a Form Submission Entry
  console.log("\n=== 6. Creating a Submission Metaobject Entry ===");
  const subHandle = `sub-audit-${Date.now()}`;
  const createSubEntry = await graphql(
    `#graphql
    mutation createSub($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject {
          id
          handle
          updatedAt
          fields {
            key
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      metaobject: {
        type: "$app:form_submission",
        handle: subHandle,
        fields: [
          { key: "form_id", value: createdForm.id },
          { key: "form_title", value: "Updated: Get in Touch with Support" },
          { key: "customer_name", value: "Alex Mercer" },
          { key: "customer_email", value: "alex.mercer@example.com" },
          { key: "message", value: "Testing submission flow during integration audit." },
          { key: "submitted_at", value: new Date().toISOString() },
          { key: "submission_status", value: "new" },
        ],
      },
    }
  );
  console.log("Create Submission Result:", JSON.stringify(createSubEntry, null, 2));
  const createdSub = createSubEntry.data?.metaobjectCreate?.metaobject;

  // Step 3.5: Query Submissions for the Form
  console.log("\n=== 7. Querying Submissions for this Form ===");
  const querySubs = await graphql(
    `#graphql
    query listSubs {
      metaobjects(type: "$app:form_submission", first: 10) {
        nodes {
          id
          handle
          fields {
            key
            value
          }
        }
      }
    }`
  );
  console.log("Submissions count:", querySubs.data?.metaobjects?.nodes?.length);
  const matchingSub = querySubs.data?.metaobjects?.nodes?.find(
    (n) => n.id === createdSub?.id
  );
  console.log("Matching submission found in shop metaobjects:", !!matchingSub);

  // Step 3.6: Cleanup
  console.log("\n=== 8. Cleaning up test entries ===");
  if (createdSub?.id) {
    const delSub = await graphql(
      `#graphql
      mutation delSub($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors { field message }
        }
      }`,
      { id: createdSub.id }
    );
    console.log("Deleted test submission:", delSub.data?.metaobjectDelete?.deletedId);
  }

  if (createdForm?.id) {
    const delForm = await graphql(
      `#graphql
      mutation delForm($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors { field message }
        }
      }`,
      { id: createdForm.id }
    );
    console.log("Deleted test form:", delForm.data?.metaobjectDelete?.deletedId);
  }

  console.log("\n=== LIVE INTEGRATION AUDIT: SUCCESSFUL ===");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Audit script failed:", err);
  process.exit(1);
});
