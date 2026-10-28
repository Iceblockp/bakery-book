import { ApiError, asString, errorResponse, readJson } from "@/lib/api";
import { createAuthenticatedClient } from "@/lib/supabase/server";
import { connection } from "next/server";

export async function GET(request: Request) {
  await connection();
  try {
    const { supabase } = await createAuthenticatedClient(request);
    const [sales, purchases, batches, expenses, adjustments] = await Promise.all([
      supabase.from("sales").select("id,total_amount_mmk,payment_method,sold_at,reversed_at,reversal_note,sale_items(quantity,unit_price_mmk,products(name))").order("sold_at", { ascending: false }).limit(50),
      supabase.from("purchases").select("id,total_amount_mmk,purchase_date,supplier_name,note,reversed_at,reversal_note,purchase_items(quantity,ingredients(name,base_unit))").order("purchase_date", { ascending: false }).limit(50),
      supabase.from("production_batches").select("id,good_quantity,waste_quantity,ingredient_cost_mmk,baked_at,reversed_at,reversal_note,products(name)").order("baked_at", { ascending: false }).limit(50),
      supabase.from("expenses").select("id,amount_mmk,expense_date,category,description,reversed_at,reversal_note").order("expense_date", { ascending: false }).limit(50),
      supabase.from("stock_movements").select("id,item_type,quantity_delta,unit_cost_mmk,note,occurred_at,ingredients(name,base_unit),products(name)").eq("movement_type", "adjustment").order("occurred_at", { ascending: false }).limit(50),
    ]);
    const failure = [sales,purchases,batches,expenses,adjustments].find((result) => result.error);
    if (failure?.error) throw new ApiError(failure.error.message, 400);
    return Response.json({ sales: sales.data ?? [], purchases: purchases.data ?? [], batches: batches.data ?? [], expenses: expenses.data ?? [], adjustments: adjustments.data ?? [] });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const type = asString(body.type, "type");
    if (!new Set(["sale", "purchase", "batch", "expense"]).has(type)) throw new ApiError("Invalid transaction type", 400);
    const { supabase } = await createAuthenticatedClient(request);
    const { error } = await supabase.rpc("reverse_bakery_transaction", { p_type: type, p_id: asString(body.id, "id"), p_note: asString(body.note, "note") });
    if (error) throw new ApiError(error.message, 400);
    return Response.json({ reversed: true });
  } catch (error) { return errorResponse(error); }
}
