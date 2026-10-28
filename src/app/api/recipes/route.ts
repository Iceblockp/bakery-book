import { ApiError, asArray, asPositiveNumber, asString, errorResponse, readJson } from "@/lib/api";
import { createAuthenticatedClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const items = asArray(body.items, "items").map((value, index) => {
      const item = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
      return { ingredient_id: asString(item.ingredientId, `items[${index}].ingredientId`), quantity: asPositiveNumber(item.quantity, `items[${index}].quantity`) };
    });
    const { supabase } = await createAuthenticatedClient(request);
    const { data, error } = await supabase.rpc("save_recipe_blueprint", {
      p_product_id: asString(body.productId, "productId"),
      p_name: asString(body.name, "name"),
      p_expected_yield: asPositiveNumber(body.expectedYield, "expectedYield"),
      p_items: items,
    });
    if (error) throw new ApiError(error.message, 400);
    return Response.json({ id: data }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
