import { ApiError, asArray, asPositiveNumber, asString, errorResponse, readJson } from "@/lib/api";
import { createAuthenticatedClient } from "@/lib/supabase/server";
import { connection } from "next/server";

export async function GET(request: Request) {
  await connection();
  try {
    const { supabase } = await createAuthenticatedClient(request);
    const { data, error } = await supabase
      .from("production_batches")
      .select("id, product_id, good_quantity, waste_quantity, ingredient_cost_mmk, baked_at, reversed_at, reversal_note, note, batch_count, products(id, name), recipes(id, name, version), batch_inputs(id, planned_quantity, actual_quantity, unit_cost_mmk, ingredients(id, name, base_unit))")
      .order("baked_at", { ascending: false })
      .limit(50);

    if (error) throw new ApiError(error.message, 400);
    return Response.json({ batches: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

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
