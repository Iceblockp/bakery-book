import { ApiError, asPositiveNumber, asString, errorResponse, readJson } from "@/lib/api";
import { createAuthenticatedClient } from "@/lib/supabase/server";
import { connection } from "next/server";

const allowedUnits = new Set(["g", "kg", "ml", "l", "pcs"]);

export async function GET(request: Request) {
  await connection();
  try {
    const { supabase } = await createAuthenticatedClient(request);
    const [ingredients, products, suppliers, recipes] = await Promise.all([
      supabase.from("ingredients").select("*").eq("active", true).order("name"),
      supabase.from("products").select("*").eq("active", true).order("name"),
      supabase.from("suppliers").select("*").order("name"),
      supabase.from("recipes").select("*, recipe_items(*)").eq("active", true).order("name"),
    ]);

    const failure = [ingredients, products, suppliers, recipes].find((result) => result.error);
    if (failure?.error) throw new Error(failure.error.message);

    return Response.json({
      ingredients: ingredients.data,
      products: products.data,
      suppliers: suppliers.data,
      recipes: recipes.data,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const kind = asString(body.kind, "kind");
    const { supabase, user } = await createAuthenticatedClient(request);

    if (kind === "ingredient") {
      const baseUnit = asString(body.baseUnit, "baseUnit");
      if (!allowedUnits.has(baseUnit)) throw new ApiError("baseUnit is not supported", 400);
      const { data, error } = await supabase.from("ingredients").insert({
        owner_id: user.id,
        name: asString(body.name, "name"),
        base_unit: baseUnit,
        low_stock_threshold: asPositiveNumber(body.lowStockThreshold ?? 0, "lowStockThreshold", true),
      }).select().single();
      if (error) throw new Error(error.message);
      return Response.json(data, { status: 201 });
    }

    if (kind === "product") {
      const { data, error } = await supabase.from("products").insert({
        owner_id: user.id,
        name: asString(body.name, "name"),
        selling_price_mmk: asPositiveNumber(body.sellingPriceMmk ?? 0, "sellingPriceMmk", true),
        low_stock_threshold: asPositiveNumber(body.lowStockThreshold ?? 0, "lowStockThreshold", true),
      }).select().single();
      if (error) throw new Error(error.message);
      return Response.json(data, { status: 201 });
    }

    if (kind === "supplier") {
      const { data, error } = await supabase.from("suppliers").insert({
        owner_id: user.id,
        name: asString(body.name, "name"),
        phone: body.phone || null,
        note: body.note || null,
      }).select().single();
      if (error) throw new Error(error.message);
      return Response.json(data, { status: 201 });
    }

    throw new ApiError("kind must be ingredient, product, or supplier", 400);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await readJson(request);
    const kind = asString(body.kind, "kind");
    const id = asString(body.id, "id");
    const { supabase } = await createAuthenticatedClient(request);
    if (kind === "ingredient") {
      const updates: Record<string, unknown> = { name: asString(body.name, "name"), low_stock_threshold: asPositiveNumber(body.lowStockThreshold ?? 0, "lowStockThreshold", true), active: body.active !== false };
      const { error } = await supabase.from("ingredients").update(updates).eq("id", id);
      if (error) throw new ApiError(error.message, 400);
      return Response.json({ updated: true });
    }
    if (kind === "product") {
      const updates: Record<string, unknown> = { name: asString(body.name, "name"), selling_price_mmk: asPositiveNumber(body.sellingPriceMmk ?? 0, "sellingPriceMmk", true), low_stock_threshold: asPositiveNumber(body.lowStockThreshold ?? 0, "lowStockThreshold", true), active: body.active !== false };
      const { error } = await supabase.from("products").update(updates).eq("id", id);
      if (error) throw new ApiError(error.message, 400);
      return Response.json({ updated: true });
    }
    throw new ApiError("kind must be ingredient or product", 400);
  } catch (error) { return errorResponse(error); }
}
