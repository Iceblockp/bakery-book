import { ApiError, asPositiveNumber, asString, errorResponse, readJson } from "@/lib/api";
import { createAuthenticatedClient } from "@/lib/supabase/server";
import { connection } from "next/server";

export async function GET(request: Request) {
  await connection();
  try {
    const { supabase } = await createAuthenticatedClient(request);
    const { data, error } = await supabase
      .from("purchases")
      .select("id, total_amount_mmk, purchase_date, supplier_name, note, reversed_at, reversal_note, created_at, purchase_items(id, quantity, unit_cost_mmk, ingredients(id, name, base_unit))")
      .order("purchase_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new ApiError(error.message, 400);
    return Response.json({ purchases: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const ingredientId = asString(body.ingredientId, "ingredientId");
    const quantity = asPositiveNumber(body.quantity, "quantity");
    const totalAmountMmk = Math.round(asPositiveNumber(body.totalAmountMmk, "totalAmountMmk"));
    const { supabase } = await createAuthenticatedClient(request);
    const { data, error } = await supabase.rpc("record_simple_purchase", {
      p_ingredient_id: ingredientId,
      p_quantity: quantity,
      p_total_amount_mmk: totalAmountMmk,
      p_purchase_date: body.purchaseDate || null,
      p_supplier_name: typeof body.supplierName === "string" ? body.supplierName.trim() || null : null,
      p_note: body.note || null,
    });

    if (error) throw new ApiError(error.message, 400);
    return Response.json({ id: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
