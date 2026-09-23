import { ACTIONS_CORS_HEADERS } from "@/lib/actions/spec";

/** Maps website URLs to Action API endpoints so Blink clients can unfurl /tip/<wallet> links. */
export async function GET() {
  return Response.json(
    {
      rules: [
        { pathPattern: "/tip/*", apiPath: "/api/actions/tip/*" },
        { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
      ],
    },
    { headers: ACTIONS_CORS_HEADERS },
  );
}

export async function OPTIONS() {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}
