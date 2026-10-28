import { errorResponse } from "@/lib/api";
import { createAuthenticatedClient } from "@/lib/supabase/server";
import { connection } from "next/server";

export async function GET(request: Request) {
  await connection();
  try {
    const { supabase } = await createAuthenticatedClient(request);
    const localDate = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Yangon",
    }).format(new Date());
    const start = new Date(`${localDate}T00:00:00+06:30`);
    const end = new Date(start.getTime() + 86_400_000);

    const [sales, batches, rawStock, finishedStock] = await Promise.all([
      supabase.from("sales").select("total_amount_mmk, sale_items(quantity)").is("reversed_at", null).gte("sold_at", start.toISOString()).lt("sold_at", end.toISOString()),
      supabase.from("production_batches").select("good_quantity, waste_quantity").is("reversed_at", null).gte("baked_at", start.toISOString()).lt("baked_at", end.toISOString()),
      supabase.from("raw_stock_levels").select("quantity, is_low"),
      supabase.from("finished_stock_levels").select("quantity, is_low"),
    ]);
    const failure = [sales, batches, rawStock, finishedStock].find((result) => result.error);
    if (failure?.error) throw new Error(failure.error.message);

    const saleRows = sales.data ?? [];
    const batchRows = batches.data ?? [];
    return Response.json({
      currency: "MMK",
      timezone: "Asia/Yangon",
      today: {
        sales: saleRows.reduce((sum, row) => sum + Number(row.total_amount_mmk), 0),
        itemsSold: saleRows.reduce((sum, row) => sum + (row.sale_items ?? []).reduce((itemSum, item) => itemSum + Number(item.quantity), 0), 0),
        itemsBaked: batchRows.reduce((sum, row) => sum + Number(row.good_quantity), 0),
        batches: batchRows.length,
        finishedStock: (finishedStock.data ?? []).reduce((sum, row) => sum + Number(row.quantity), 0),
        lowStockItems: [...(rawStock.data ?? []), ...(finishedStock.data ?? [])].filter((row) => row.is_low).length,
        wasteItems: batchRows.reduce((sum, row) => sum + Number(row.waste_quantity), 0),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
