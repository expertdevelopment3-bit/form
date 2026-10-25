import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response(JSON.stringify({ error: "Missing file id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const query = `#graphql
    query getFileUrl($id: ID!) {
      node(id: $id) {
        ... on MediaImage {
          image {
            url
          }
        }
        ... on GenericFile {
          url
        }
      }
    }
  `;

  try {
    const res = await admin.graphql(query, { variables: { id } });
    const json = await res.json();
    const node = json.data?.node;
    const fileUrl = node?.image?.url || node?.url || "";

    return new Response(JSON.stringify({ url: fileUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to query file";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
