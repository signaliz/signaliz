import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": [
    "authorization",
    "x-client-info",
    "apikey",
    "content-type",
    "x-signaliz-plan-hash",
    "x-workspace-id",
    "x-supabase-client-platform",
    "x-supabase-client-platform-version",
    "x-supabase-client-runtime",
    "x-supabase-client-runtime-version",
  ].join(", "),
};

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let serviceClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (!serviceClient) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    serviceClient = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  return serviceClient;
}

function getAnonClient(accessToken: string): SupabaseClient {
  if (!anonClient) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !key) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    }

    anonClient = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return null;
}

export interface AuthResult {
  user: { id: string; email?: string };
  authHeader: string;
}

export async function requireAuth(req: Request): Promise<AuthResult> {
  const rawAuth = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  const match = rawAuth.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new HttpError(401, "Missing or invalid Authorization header. Use: Authorization: Bearer <jwt_token>");
  }

  const token = match[1].trim();
  if (!token) {
    throw new HttpError(401, "No token provided in Authorization header");
  }

  const supabase = getAnonClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError(401, `Authentication failed: ${error?.message ?? "No user found"}`);
  }

  return {
    user: { id: data.user.id, email: data.user.email ?? undefined },
    authHeader: `Bearer ${token}`,
  };
}

export async function requireWorkspaceAdmin(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const { data: hasAccess, error } = await supabase.rpc("user_can_access_workspace", {
    user_id: userId,
    workspace_id: workspaceId,
    required_role: "admin",
  });

  if (error) {
    throw error;
  }

  if (!hasAccess) {
    throw new HttpError(403, "Insufficient permissions");
  }
}

export function errorResponse(err: unknown): Response {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : "Internal error";
  return json({ success: false, error: message }, status);
}
