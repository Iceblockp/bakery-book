import { errorResponse } from "@/lib/api";
import { createAuthenticatedClient } from "@/lib/supabase/server";
import { connection } from "next/server";

export async function GET(request: Request) {
  await connection();
  try {
    const { supabase } = await createAuthenticatedClient(request);
    const [rawResult, finishedResult, movementsResult] = await Promise.all([
      supabase.from("raw_stock_levels").select("*").order("name"),
      supabase.from("finished_stock_levels").select("*").order("name"),
      supabase
        .from("stock_movements")
        .select("id, item_type, ingredient_id, product_id, quantity_delta, unit_cost_mmk, movement_type, reference_type, reference_id, note, occurred_at, ingredients(id, name, base_unit), products(id, name)")
        .order("occurred_at", { ascending: false })
        .limit(100),
    ]);

    if (rawResult.error) throw new Error(rawResult.error.message);
    if (finishedResult.error) throw new Error(finishedResult.error.message);
    if (movementsResult.error) throw new Error(movementsResult.error.message);
    return Response.json({
      raw: rawResult.data ?? [],
      finished: finishedResult.data ?? [],
      movements: movementsResult.data ?? [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
