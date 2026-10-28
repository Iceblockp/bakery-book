import { ApiError, asPositiveNumber, asString, errorResponse, readJson } from "@/lib/api";
import { createAuthenticatedClient } from "@/lib/supabase/server";
import { connection } from "next/server";

const categories = new Set(["packaging", "utilities", "transport", "rent", "wages", "equipment", "repairs", "other"]);

export async function GET(request: Request) {
  await connection();
  try {
    const { supabase } = await createAuthenticatedClient(request);
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new ApiError(error.message, 400);
    return Response.json({ expenses: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const category = asString(body.category, "category");
    if (!categories.has(category)) throw new ApiError("Invalid expense category", 400);
    const { supabase, user } = await createAuthenticatedClient(request);
    const { data, error } = await supabase.from("expenses").insert({
      owner_id: user.id,
      expense_date: body.expenseDate || new Date().toISOString().slice(0, 10),
      category,
      amount_mmk: Math.round(asPositiveNumber(body.amountMmk, "amountMmk")),
      description: typeof body.description === "string" ? body.description.trim() || null : null,
    }).select("id").single();
    if (error) throw new ApiError(error.message, 400);
    return Response.json({ id: data.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
