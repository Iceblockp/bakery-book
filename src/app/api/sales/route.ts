import { ApiError, asArray, asPositiveNumber, asString, errorResponse, readJson } from "@/lib/api";
import { createAuthenticatedClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const items = asArray(body.items, "items").map((value, index) => {
      const item = value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
      return {
        product_id: asString(item.productId, `items[${index}].productId`),
        quantity: asPositiveNumber(item.quantity, `items[${index}].quantity`),
        unit_price_mmk: asPositiveNumber(item.unitPriceMmk, `items[${index}].unitPriceMmk`, true),
      };
    });
    const { supabase } = await createAuthenticatedClient(request);
    const { data, error } = await supabase.rpc("record_sale", {
      p_items: items,
      p_payment_method: body.paymentMethod || "cash",
      p_note: body.note || null,
    });

    if (error) throw new ApiError(error.message, 400);
    return Response.json({ id: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
