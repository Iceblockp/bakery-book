import { ApiError, asPositiveNumber, asString, errorResponse, readJson } from "@/lib/api";
import { createAuthenticatedClient } from "@/lib/supabase/server";

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
