import { ApiError, asString, errorResponse, readJson } from "@/lib/api";
import { createAuthenticatedClient } from "@/lib/supabase/server";

const phrases = {
  transactions: "RESET TRANSACTIONS",
  everything: "RESET EVERYTHING",
} as const;

function issuedAt(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    return Number(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).iat || 0);
  } catch {
    return 0;
  }
}

export async function POST(request: Request) {
  try {
    if (process.env.ENABLE_DATA_RESET !== "true") throw new ApiError("Data reset is disabled on this server", 403);
    const body = await readJson(request);
    const mode = asString(body.mode, "mode") as keyof typeof phrases;
    if (!(mode in phrases)) throw new ApiError("Invalid reset mode", 400);
    if (asString(body.confirmation, "confirmation") !== phrases[mode]) throw new ApiError(`Type ${phrases[mode]} exactly`, 400);

    const { supabase, token } = await createAuthenticatedClient(request);
    const tokenAgeSeconds = Math.floor(Date.now() / 1000) - issuedAt(token);
    if (tokenAgeSeconds < -30 || tokenAgeSeconds > 120) throw new ApiError("Please verify your password again before resetting data", 401);

    const { data, error } = await supabase.rpc("reset_bakery_data", { p_mode: mode });
    if (error) throw new ApiError(error.message, 400);
    return Response.json({ reset: data });
  } catch (error) {
    return errorResponse(error);
  }
}
