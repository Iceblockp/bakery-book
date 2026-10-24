import { errorResponse } from "@/lib/api";
import { createAuthenticatedClient } from "@/lib/supabase/server";
import { connection } from "next/server";

export async function GET(request: Request) {
  await connection();
  try {
    const { supabase } = await createAuthenticatedClient(request);
    const [rawResult, finishedResult] = await Promise.all([
      supabase.from("raw_stock_levels").select("*").order("name"),
      supabase.from("finished_stock_levels").select("*").order("name"),
    ]);

    if (rawResult.error) throw new Error(rawResult.error.message);
    if (finishedResult.error) throw new Error(finishedResult.error.message);
    return Response.json({ raw: rawResult.data, finished: finishedResult.data });
  } catch (error) {
    return errorResponse(error);
  }
}
