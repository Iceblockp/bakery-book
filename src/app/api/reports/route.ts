import { ApiError, errorResponse } from "@/lib/api";
import { createAuthenticatedClient } from "@/lib/supabase/server";
import { connection } from "next/server";

const dayMs = 86_400_000;

function yangonDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Yangon" }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function rangeFor(period: string) {
  const localDate = yangonDate(new Date());
  const end = new Date(`${localDate}T00:00:00+06:30`);
  end.setTime(end.getTime() + dayMs);
  const days = period === "today" ? 1 : period === "week" ? 7 : 30;
  const start = new Date(end.getTime() - days * dayMs);
  return { start, end, startDate: yangonDate(start), endDate: localDate };
}

export async function GET(request: Request) {
  await connection();
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get("period") || "week";
    if (!new Set(["today", "week", "month"]).has(period)) throw new ApiError("Invalid report period", 400);
    const { start, end, startDate, endDate } = rangeFor(period);
    const { supabase } = await createAuthenticatedClient(request);
    const [sales, costs, purchases, expenses] = await Promise.all([
      supabase.from("sales").select("id,total_amount_mmk,payment_method,sold_at").is("reversed_at", null).gte("sold_at", start.toISOString()).lt("sold_at", end.toISOString()).order("sold_at", { ascending: false }),
      supabase.from("stock_movements").select("reference_id,quantity_delta,unit_cost_mmk").eq("movement_type", "sale").gte("occurred_at", start.toISOString()).lt("occurred_at", end.toISOString()),
      supabase.from("purchases").select("id,total_amount_mmk,purchase_date,supplier_name,note").is("reversed_at", null).gte("purchase_date", startDate).lte("purchase_date", endDate).order("purchase_date", { ascending: false }),
      supabase.from("expenses").select("id,amount_mmk,expense_date,category,description").is("reversed_at", null).gte("expense_date", startDate).lte("expense_date", endDate).order("expense_date", { ascending: false }),
    ]);
    const failure = [sales, costs, purchases, expenses].find((result) => result.error);
    if (failure?.error) throw new ApiError(failure.error.message, 400);
    const revenue = (sales.data ?? []).reduce((sum, row) => sum + Number(row.total_amount_mmk), 0);
    const activeSaleIds = new Set((sales.data ?? []).map((row) => row.id));
    const ingredientCost = (costs.data ?? []).filter((row) => row.reference_id && activeSaleIds.has(row.reference_id)).reduce((sum, row) => sum + Math.round(Math.abs(Number(row.quantity_delta)) * Number(row.unit_cost_mmk)), 0);
    const purchaseSpend = (purchases.data ?? []).reduce((sum, row) => sum + Number(row.total_amount_mmk), 0);
    const otherExpenses = (expenses.data ?? []).reduce((sum, row) => sum + Number(row.amount_mmk), 0);
    return Response.json({
      period,
      summary: { revenue, ingredientCost, grossProfit: revenue - ingredientCost, purchaseSpend, otherExpenses, netCashFlow: revenue - purchaseSpend - otherExpenses },
      activity: { sales: sales.data ?? [], purchases: purchases.data ?? [], expenses: expenses.data ?? [] },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
