export interface AdminApiContext {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> }
  ) => Promise<Response>;
}

export const FORM_METAOBJECT_TYPE = "$app:form";
export const SUBMISSION_METAOBJECT_TYPE = "$app:form_submission";

/**
 * Ensures that both Form and Form Submission metaobject definitions
 * exist on the current merchant store. Idempotent.
 */
export async function ensureMetaobjectDefinitions(admin: AdminApiContext): Promise<{
  formDefinitionReady: boolean;
  submissionDefinitionReady: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  let formDefinitionReady = false;
  let submissionDefinitionReady = false;

  // 1. Check or create Form definition
  try {
    const formCheckRes = await admin.graphql(
      `#graphql
      query checkFormDefinition($type: String!) {
        metaobjectDefinitionByType(type: $type) {
          id
          type
          name
        }
      }`,
      { variables: { type: FORM_METAOBJECT_TYPE } }
    );
    const formCheckJson = await formCheckRes.json();

    if (formCheckJson.data?.metaobjectDefinitionByType?.id) {
      formDefinitionReady = true;
    } else {
      // Create Form Definition
      const createRes = await admin.graphql(
        `#graphql
        mutation createFormDefinition($definition: MetaobjectDefinitionCreateInput!) {
          metaobjectDefinitionCreate(definition: $definition) {
            metaobjectDefinition {
              id
              type
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            definition: {
              name: "FormCraft Form",
              type: FORM_METAOBJECT_TYPE,
              access: {
                admin: "MERCHANT_READ_WRITE",
                storefront: "PUBLIC_READ",
              },
              fieldDefinitions: [
                {
                  key: "name",
                  name: "Form Name",
                  type: "single_line_text_field",
                  required: true,
                },
                {
                  key: "title",
                  name: "Title",
                  type: "single_line_text_field",
                  required: true,
                },
                {
                  key: "description",
                  name: "Description",
                  type: "multi_line_text_field",
                },
                {
                  key: "fields_config",
                  name: "Fields Configuration",
                  type: "json",
                  required: true,
                },
                {
                  key: "submit_label",
                  name: "Submit Button Label",
                  type: "single_line_text_field",
                },
                {
                  key: "status",
                  name: "Status",
                  type: "single_line_text_field",
                  required: true,
                },
                {
                  key: "success_message",
                  name: "Success Message",
                  type: "single_line_text_field",
                },
              ],
            },
          },
        }
      );
      const createJson = await createRes.json();
      if (createJson.data?.metaobjectDefinitionCreate?.metaobjectDefinition?.id) {
        formDefinitionReady = true;
      } else {
        const userErrors = createJson.data?.metaobjectDefinitionCreate?.userErrors || [];
        const isAlreadyExists = userErrors.some((e: { message: string }) =>
          e.message.toLowerCase().includes("taken") || e.message.toLowerCase().includes("exists")
        );
        if (isAlreadyExists) {
          formDefinitionReady = true;
        } else {
          errors.push(
            `Form definition error: ${userErrors.map((e: { message: string }) => e.message).join(", ")}`
          );
        }
      }
    }
  } catch (err: unknown) {
    errors.push(`Form definition check error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Check or create Submission definition
  try {
    const subCheckRes = await admin.graphql(
      `#graphql
      query checkSubmissionDefinition($type: String!) {
        metaobjectDefinitionByType(type: $type) {
          id
          type
          name
          fieldDefinitions {
            key
          }
        }
      }`,
      { variables: { type: SUBMISSION_METAOBJECT_TYPE } }
    );
    const subCheckJson = await subCheckRes.json();

    if (subCheckJson.data?.metaobjectDefinitionByType?.id) {
      submissionDefinitionReady = true;

      // Ensure submission_data field exists on existing definition
      const existingFields: Array<{ key: string }> =
        subCheckJson.data.metaobjectDefinitionByType.fieldDefinitions || [];
      const hasSubmissionData = existingFields.some((f) => f.key === "submission_data");

      if (!hasSubmissionData) {
        const subDefId = subCheckJson.data.metaobjectDefinitionByType.id;
        try {
          await admin.graphql(
            `#graphql
            mutation updateSubmissionDefinition($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
              metaobjectDefinitionUpdate(id: $id, definition: $definition) {
                metaobjectDefinition {
                  id
                }
                userErrors {
                  field
                  message
                }
              }
            }`,
            {
              variables: {
                id: subDefId,
                definition: {
                  fieldDefinitions: [
                    {
                      create: {
                        key: "submission_data",
                        name: "Submission Data",
                        type: "json",
                      },
                    },
                  ],
                },
              },
            }
          );
        } catch (updateErr: unknown) {
          console.warn("Could not append submission_data field definition:", updateErr);
        }
      }
    } else {
      const createSubRes = await admin.graphql(
        `#graphql
        mutation createSubmissionDefinition($definition: MetaobjectDefinitionCreateInput!) {
          metaobjectDefinitionCreate(definition: $definition) {
            metaobjectDefinition {
              id
              type
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            definition: {
              name: "FormCraft Submission",
              type: SUBMISSION_METAOBJECT_TYPE,
              access: {
                admin: "MERCHANT_READ_WRITE",
              },
              fieldDefinitions: [
                {
                  key: "form_id",
                  name: "Form ID",
                  type: "single_line_text_field",
                  required: true,
                },
                {
                  key: "form_title",
                  name: "Form Title",
                  type: "single_line_text_field",
                },
                {
                  key: "customer_name",
                  name: "Customer Name",
                  type: "single_line_text_field",
                },
                {
                  key: "customer_email",
                  name: "Customer Email",
                  type: "single_line_text_field",
                },
                {
                  key: "message",
                  name: "Message",
                  type: "multi_line_text_field",
                },
                {
                  key: "uploaded_file_url",
                  name: "Uploaded File URL",
                  type: "url",
                },
                {
                  key: "uploaded_file_name",
                  name: "Uploaded File Name",
                  type: "single_line_text_field",
                },
                {
                  key: "submitted_at",
                  name: "Submitted At",
                  type: "date_time",
                  required: true,
                },
                {
                  key: "submission_status",
                  name: "Submission Status",
                  type: "single_line_text_field",
                },
                {
                  key: "submission_data",
                  name: "Submission Data",
                  type: "json",
                },
              ],
            },
          },
        }
      );
      const createSubJson = await createSubRes.json();
      if (createSubJson.data?.metaobjectDefinitionCreate?.metaobjectDefinition?.id) {
        submissionDefinitionReady = true;
      } else {
        const userErrors = createSubJson.data?.metaobjectDefinitionCreate?.userErrors || [];
        const isAlreadyExists = userErrors.some((e: { message: string }) =>
          e.message.toLowerCase().includes("taken") || e.message.toLowerCase().includes("exists")
        );
        if (isAlreadyExists) {
          submissionDefinitionReady = true;
        } else {
          errors.push(
            `Submission definition error: ${userErrors.map((e: { message: string }) => e.message).join(", ")}`
          );
        }
      }
    }
  } catch (err: unknown) {
    errors.push(`Submission definition check error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    formDefinitionReady,
    submissionDefinitionReady,
    errors,
  };
}
