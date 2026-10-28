import { ApiError, asPositiveNumber, asString, errorResponse, readJson } from "@/lib/api";
import { createAuthenticatedClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const itemType = asString(body.itemType, "itemType");
    if (!new Set(["raw", "finished"]).has(itemType)) throw new ApiError("Invalid item type", 400);
    const unitCost = body.unitCostMmk === "" || body.unitCostMmk == null ? null : asPositiveNumber(body.unitCostMmk, "unitCostMmk", true);
    const { supabase } = await createAuthenticatedClient(request);
    const { data, error } = await supabase.rpc("set_stock_count", {
      p_item_type: itemType,
      p_item_id: asString(body.itemId, "itemId"),
      p_target_quantity: asPositiveNumber(body.targetQuantity, "targetQuantity", true),
      p_unit_cost_mmk: unitCost,
      p_note: asString(body.note, "note"),
    });
    if (error) throw new ApiError(error.message, 400);
    return Response.json({ id: data }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
