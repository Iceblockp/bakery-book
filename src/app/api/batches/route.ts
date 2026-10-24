import { ApiError, asArray, asPositiveNumber, asString, errorResponse, readJson } from "@/lib/api";
import { createAuthenticatedClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const inputs = asArray(body.inputs, "inputs").map((value, index) => {
      const item = value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
      return {
        ingredient_id: asString(item.ingredientId, `inputs[${index}].ingredientId`),
        planned_quantity: asPositiveNumber(item.plannedQuantity, `inputs[${index}].plannedQuantity`, true),
        actual_quantity: asPositiveNumber(item.actualQuantity, `inputs[${index}].actualQuantity`),
      };
    });
    const { supabase } = await createAuthenticatedClient(request);
    const { data, error } = await supabase.rpc("record_baking_batch", {
      p_product_id: asString(body.productId, "productId"),
      p_recipe_id: body.recipeId || null,
      p_batch_count: asPositiveNumber(body.batchCount ?? 1, "batchCount"),
      p_inputs: inputs,
      p_good_quantity: asPositiveNumber(body.goodQuantity, "goodQuantity"),
      p_waste_quantity: asPositiveNumber(body.wasteQuantity ?? 0, "wasteQuantity", true),
      p_note: body.note || null,
    });

    if (error) throw new ApiError(error.message, 400);
    return Response.json({ id: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
