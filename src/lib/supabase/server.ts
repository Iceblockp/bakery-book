import "server-only";

import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api";

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export async function createAuthenticatedClient(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new ApiError("Supabase is not configured", 503);
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) {
    throw new ApiError("Authentication is required", 401);
  }

  const supabase = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new ApiError("The session is invalid or expired", 401);
  }

  return { supabase, user: data.user, token };
}
