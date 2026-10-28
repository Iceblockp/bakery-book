"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type View = "home" | "sell" | "bake" | "stock" | "purchase" | "catalog" | "recipes" | "adjust" | "history" | "expense" | "reports" | "reset" | "more";
type StockTab = "raw" | "finished";
type IconName = "home" | "sell" | "bake" | "stock" | "more" | "plus" | "arrow" | "arrow-left" | "trend" | "bag" | "chevron" | "alert" | "check" | "trash" | "x" | "cash" | "phone" | "credit";
type Product = { id: string; name: string; price: number; stock: number; emoji: string };
type Ingredient = { id: string; name: string; unit: string; quantity: number; lowThreshold: number; isLow: boolean };
type FinishedStock = { id: string; name: string; quantity: number; price: number; lowThreshold: number; isLow: boolean };
type Recipe = { id: string; name: string; productId: string; expectedYield: number; version: number; items: Array<{ ingredientId: string; quantity: number }> };
type BatchInput = {
  id: string;
  planned_quantity: number;
  actual_quantity: number;
  unit_cost_mmk: number;
  ingredients?: { id?: string; name?: string; base_unit?: string } | null;
};
type BatchRecord = {
  id: string;
  product_id?: string;
  good_quantity: number;
  waste_quantity: number;
  ingredient_cost_mmk?: number;
  baked_at: string;
  reversed_at?: string | null;
  reversal_note?: string | null;
  note?: string | null;
  batch_count?: number;
  products?: { id?: string; name?: string } | { name?: string } | null;
  recipes?: { id?: string; name?: string; version?: number } | null;
  batch_inputs?: BatchInput[];
};
type StockMovement = {
  id: string;
  item_type: "raw" | "finished";
  ingredient_id: string | null;
  product_id: string | null;
  quantity_delta: number;
  unit_cost_mmk: number;
  movement_type: "purchase" | "production_use" | "production_output" | "sale" | "waste" | "adjustment" | "reversal";
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
  occurred_at: string;
  ingredients?: { id?: string; name?: string; base_unit?: string } | null;
  products?: { id?: string; name?: string } | null;
};
type HistoryData = { sales: Array<Record<string, unknown>>; purchases: Array<Record<string, unknown>>; batches: Array<Record<string, unknown>>; expenses: Array<Record<string, unknown>>; adjustments: Array<Record<string, unknown>> };
type PurchaseRecord = {
  id: string;
  total_amount_mmk: number;
  purchase_date: string;
  supplier_name: string | null;
  note: string | null;
  reversed_at: string | null;
  reversal_note: string | null;
  created_at: string;
  purchase_items?: Array<{
    id: string;
    quantity: number;
    unit_cost_mmk: number;
    ingredients?: { id?: string; name?: string; base_unit?: string } | null;
  }>;
};
type SaleItemRecord = {
  id: string;
  product_id: string;
  quantity: number;
  unit_price_mmk: number;
  products?: { id?: string; name?: string } | null;
};
type SaleRecord = {
  id: string;
  total_amount_mmk: number;
  payment_method: string;
  note: string | null;
  sold_at: string;
  reversed_at: string | null;
  reversal_note: string | null;
  created_at: string;
  sale_items?: SaleItemRecord[];
};
type ExpenseRecord = {
  id: string;
  expense_date: string;
  category: string;
  amount_mmk: number;
  description: string | null;
  reversed_at: string | null;
  reversal_note: string | null;
  created_at: string;
};
type DashboardData = { sales: number; itemsSold: number; itemsBaked: number; batches: number; finishedStock: number; lowStockItems: number; wasteItems: number };
type ReportData = {
  summary: { revenue: number; ingredientCost: number; grossProfit: number; purchaseSpend: number; otherExpenses: number; netCashFlow: number };
  activity: {
    sales: Array<{ id: string; total_amount_mmk: number; sold_at: string }>;
    purchases: Array<{ id: string; total_amount_mmk: number; purchase_date: string; supplier_name: string | null; note: string | null }>;
    expenses: Array<{ id: string; amount_mmk: number; expense_date: string; category: string; description: string | null }>;
  };
};

const emptyDashboard: DashboardData = { sales: 0, itemsSold: 0, itemsBaked: 0, batches: 0, finishedStock: 0, lowStockItems: 0, wasteItems: 0 };
const productEmoji = ["🍞", "🥐", "🍰", "🧁", "🥖", "🥯"];
const money = (value: number) => `${value.toLocaleString()} K`;
const subscribeToDate = () => () => undefined;
const getTodayLabel = () => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Yangon" }).format(new Date());
const getLocalDate = () => {
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Yangon" }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
};
const formatBatchTime = (isoDate: string) => {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Yangon",
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
};
const formatBatchFullDate = (isoDate: string) => {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Yangon",
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
};
const isToday = (isoDate: string) => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Yangon" }).formatToParts(new Date(isoDate));
    const val = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${val("year")}-${val("month")}-${val("day")}` === getLocalDate();
  } catch {
    return false;
  }
};
const formatRecordDate = (dateStr: string) => {
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split("-").map(Number);
      return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(y, m - 1, d));
    }
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Yangon",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};
const isThisMonth = (dateStr: string) => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", timeZone: "Asia/Yangon" }).formatToParts(new Date());
    const val = (type: string) => parts.find((p) => p.type === type)?.value;
    const currentYearMonth = `${val("year")}-${val("month")}`;
    return dateStr.startsWith(currentYearMonth);
  } catch {
    return false;
  }
};
const EXPENSE_CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: "packaging", label: "Packaging", emoji: "📦" },
  { id: "utilities", label: "Electricity / gas", emoji: "⚡" },
  { id: "transport", label: "Transport", emoji: "🛵" },
  { id: "rent", label: "Rent", emoji: "🏠" },
  { id: "wages", label: "Wages", emoji: "👥" },
  { id: "equipment", label: "Equipment", emoji: "🍳" },
  { id: "repairs", label: "Repairs", emoji: "🔧" },
  { id: "other", label: "Other", emoji: "📝" },
];
const resetEnabled = process.env.NEXT_PUBLIC_ENABLE_DATA_RESET === "true";
const validViews: View[] = [
  "home", "sell", "bake", "stock", "purchase", "catalog",
  "recipes", "adjust", "history", "expense", "reports", "reset", "more"
];

function getInitialView(): View {
  if (typeof window !== "undefined") {
    const hash = window.location.hash.replace("#", "") as View;
    if (validViews.includes(hash)) return hash;
  }
  return "home";
}

async function apiRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The request could not be completed");
  return body as T;
}

function Icon({ name, size = 21 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>,
    sell: <><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.5 11h10l2-7H6"/></>,
    bake: <><path d="M6 11c-2 0-3-1.5-3-3s1.2-3 3-3c.7-2 2.2-3 4-3 1.5 0 2.8.7 3.5 2 2.6-.5 4.5 1 4.5 3 1.8.2 3 1.5 3 3 0 1.7-1.3 3-3 3H6Z"/><path d="M6 13v7h12v-7M10 14v4M14 14v4"/></>,
    stock: <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/><path d="M12 11v10"/></>,
    more: <><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    "arrow-left": <><path d="M19 12H5M12 19l-7-7 7-7"/></>,
    trend: <><path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/></>, bag: <><path d="M6 8h12l1 13H5L6 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>, alert: <><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17h.01"/></>, check: <path d="m5 12 4 4L19 6"/>,
    trash: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>,
    x: <path d="M18 6 6 18M6 6l12 12"/>,
    cash: <><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></>,
    phone: <><rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/></>,
    credit: <><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // Data remains fresh for 1 minute (instant 0ms view navigation)
            gcTime: 10 * 60 * 1000, // Unused cached data stays in memory for 10 minutes
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  useEffect(() => {
    const { data } = getBrowserSupabase().auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        queryClient.clear();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  if (session === undefined) return <LoadingScreen />;
  if (!session) return <LoginScreen />;
  return (
    <QueryClientProvider client={queryClient}>
      <BakeryApp session={session} />
    </QueryClientProvider>
  );
}

function LoadingScreen() {
  return <main className="auth-shell"><div className="auth-card loading-card"><Brand/><span className="loading-dot"/><p>Opening your bakery…</p></div></main>;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const { error: authError } = await getBrowserSupabase().auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
    setBusy(false);
  }

  return <main className="auth-shell"><section className="auth-card"><Brand/><div className="auth-copy"><p>Welcome back</p><h1>Open the bakery book</h1><span>Sign in with the owner account created in Supabase.</span></div><form onSubmit={signIn}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required/></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-action" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<Icon name="arrow" size={18}/></button></form><small className="auth-note">Private access for the bakery owner</small></section></main>;
}

function BakeryApp({ session }: { session: Session }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>(getInitialView);
  const [navSource, setNavSource] = useState<Record<string, View>>({});
  const [cart, setCart] = useState<Record<string, number>>({});
  const [stockTab, setStockTab] = useState<StockTab>("raw");
  const [toast, setToast] = useState("");
  const token = session.access_token;

  useEffect(() => {
    function handlePopState(e: PopStateEvent) {
      const stateView = e.state?.view as View | undefined;
      const currentHash = window.location.hash.replace("#", "") as View;
      const target = stateView || (validViews.includes(currentHash) ? currentHash : "home");
      setView(target);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((nextView: View, sourceView?: View) => {
    const from = sourceView ?? view;
    setNavSource((prev) => ({ ...prev, [nextView]: from }));
    setView(nextView);
    if (typeof window !== "undefined") {
      const hash = nextView === "home" ? "" : `#${nextView}`;
      if (window.location.hash !== hash) {
        window.history.pushState({ view: nextView, from }, "", hash || window.location.pathname);
      }
    }
  }, [view]);

  const goBack = useCallback((fallbackView: View = "home") => {
    const previous = navSource[view] || fallbackView;
    navigate(previous);
  }, [navSource, view, navigate]);

  const {
    data: bakeryData,
    isLoading: loading,
    error: loadError,
  } = useQuery({
    queryKey: ["bakery-data"],
    queryFn: async () => {
      const [catalog, stock, dashboardResult] = await Promise.all([
        apiRequest<{ products: Array<Record<string, unknown>>; recipes: Array<Record<string, unknown>> }>("/api/catalog", token),
        apiRequest<{ raw: Array<Record<string, unknown>>; finished: Array<Record<string, unknown>>; movements: StockMovement[] }>("/api/stock", token),
        apiRequest<{ today: DashboardData }>("/api/dashboard", token),
      ]);
      const finished = stock.finished.map((item) => ({ id: String(item.product_id), name: String(item.name), quantity: Number(item.quantity), price: Number(item.selling_price_mmk), lowThreshold: Number(item.low_stock_threshold), isLow: Boolean(item.is_low) }));
      const prods = catalog.products.map((item, index) => ({ id: String(item.id), name: String(item.name), price: Number(item.selling_price_mmk), stock: finished.find((row) => row.id === item.id)?.quantity ?? 0, emoji: productEmoji[index % productEmoji.length] }));
      const recs = catalog.recipes.map((item) => ({ id: String(item.id), name: String(item.name), productId: String(item.product_id), expectedYield: Number(item.expected_yield), version: Number(item.version), items: ((item.recipe_items as Array<Record<string, unknown>>) || []).map((recipeItem) => ({ ingredientId: String(recipeItem.ingredient_id), quantity: Number(recipeItem.quantity) })) }));
      const ings = stock.raw.map((item) => ({ id: String(item.ingredient_id), name: String(item.name), unit: String(item.base_unit), quantity: Number(item.quantity), lowThreshold: Number(item.low_stock_threshold), isLow: Boolean(item.is_low) }));
      return {
        products: prods,
        ingredients: ings,
        finishedStock: finished,
        recipes: recs,
        movements: stock.movements || [],
        dashboard: dashboardResult.today,
      };
    },
  });

  const products = useMemo(() => bakeryData?.products || [], [bakeryData?.products]);
  const ingredients = useMemo(() => bakeryData?.ingredients || [], [bakeryData?.ingredients]);
  const finishedStock = useMemo(() => bakeryData?.finishedStock || [], [bakeryData?.finishedStock]);
  const recipes = useMemo(() => bakeryData?.recipes || [], [bakeryData?.recipes]);
  const movements = useMemo(() => bakeryData?.movements || [], [bakeryData?.movements]);
  const dashboard = bakeryData?.dashboard || emptyDashboard;
  const error = loadError instanceof Error ? loadError.message : "";

  const refreshData = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["bakery-data"] });
  }, [queryClient]);
  const cartCount = Object.values(cart).reduce((sum, count) => sum + count, 0);
  const cartTotal = useMemo(() => products.reduce((sum, product) => sum + product.price * (cart[product.id] || 0), 0), [cart, products]);
  const activeView: View = ["catalog", "recipes", "history", "expense", "reports", "reset"].includes(view) ? "more" : ["purchase", "adjust"].includes(view) ? "stock" : view;
  const initials = session.user.email?.slice(0, 2).toUpperCase() || "BB";

  function changeQuantity(id: string, change: number) {
    const product = products.find((item) => item.id === id);
    setCart((current) => {
      const nextQty = Math.min(product?.stock ?? 0, Math.max(0, (current[id] || 0) + change));
      const next = { ...current };
      if (nextQty <= 0) delete next[id];
      else next[id] = nextQty;
      return next;
    });
  }
  function setQuantity(id: string, quantity: number) {
    const product = products.find((item) => item.id === id);
    const validQty = Math.min(product?.stock ?? 0, Math.max(0, quantity));
    setCart((current) => {
      const next = { ...current };
      if (validQty <= 0) delete next[id];
      else next[id] = validQty;
      return next;
    });
  }
  function clearCart() {
    setCart({});
  }
  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2400); }
  async function completeSale(options: { paymentMethod: string; note?: string }) {
    if (!cartCount) return false;
    try {
      await apiRequest("/api/sales", token, {
        method: "POST",
        body: JSON.stringify({
          items: products
            .filter((product) => cart[product.id])
            .map((product) => ({ productId: product.id, quantity: cart[product.id], unitPriceMmk: product.price })),
          paymentMethod: options.paymentMethod || "cash",
          note: options.note || undefined,
        }),
      });
      setCart({});
      showToast("Sale saved successfully");
      await refreshData();
      await queryClient.invalidateQueries({ queryKey: ["sales"] });
      return true;
    } catch (saleError) {
      showToast(saleError instanceof Error ? saleError.message : "Sale failed");
      throw saleError;
    }
  }

  return <main className="app-shell">
    <aside className="desktop-rail"><Brand/><nav aria-label="Main navigation"><NavItems view={activeView} onSelect={(v) => navigate(v)}/></nav><div className="rail-foot"><span className="avatar">{initials}</span><div><strong>Bakery owner</strong><small>{session.user.email}</small></div></div></aside>
    <section className="app-content"><header className="topbar"><Brand/><button className="avatar-button" aria-label="Open account" onClick={() => navigate("more")}>{initials}</button></header>
      {error && <div className="global-error" role="alert">{error}<button onClick={() => void refreshData()}>Retry</button></div>}
      {view === "home" && <Dashboard data={dashboard} ingredients={ingredients} onNavigate={(v) => navigate(v, "home")}/>} 
      {view === "sell" && (
        <Sell
          products={products}
          cart={cart}
          total={cartTotal}
          count={cartCount}
          token={token}
          onChange={changeQuantity}
          onSetQuantity={setQuantity}
          onClearCart={clearCart}
          onComplete={completeSale}
          onCatalog={() => navigate("catalog", "sell")}
        />
      )} 
      {view === "bake" && <Bake products={products} ingredients={ingredients} recipes={recipes} token={token} onCatalog={() => navigate("catalog", "bake")} onRecipes={() => navigate("recipes", "bake")} onSaved={async () => { showToast("Baking batch recorded"); await refreshData(); setStockTab("finished"); }}/>}
      {view === "stock" && <Stock tab={stockTab} onTab={setStockTab} ingredients={ingredients} finished={finishedStock} movements={movements} onPurchase={() => navigate("purchase", "stock")} onBake={() => navigate("bake", "stock")} onAdjust={() => navigate("adjust", "stock")} onCatalog={() => navigate("catalog", "stock")}/>}
      {view === "purchase" && <Purchase ingredients={ingredients} token={token} backLabel={navSource["purchase"] === "home" ? "Back to Home" : navSource["purchase"] === "more" ? "Back to More" : "Back to Stock"} onBack={() => goBack("stock")} onCancel={() => goBack("stock")} onSaved={async () => { showToast("Purchase recorded"); await refreshData(); }}/>} 
      {view === "adjust" && <StockAdjustment initialTab={stockTab} ingredients={ingredients} finished={finishedStock} token={token} onCancel={() => goBack("stock")} onSaved={async () => { showToast("Stock count saved"); await refreshData(); goBack("stock"); }}/>}
      {view === "catalog" && <Catalog token={token} ingredients={ingredients} products={products} backLabel={navSource["catalog"] === "sell" ? "Back to Sell" : navSource["catalog"] === "bake" ? "Back to Bake" : navSource["catalog"] === "stock" ? "Back to Stock" : "Back to More"} onBack={() => goBack(navSource["catalog"] || "more")} onSaved={async (message = "Catalog saved") => { showToast(message); await refreshData(); }}/>}
      {view === "recipes" && (
        <RecipeBuilder
          products={products}
          ingredients={ingredients}
          recipes={recipes}
          movements={movements}
          token={token}
          backLabel={navSource["recipes"] === "bake" ? "Back to Bake" : "Back to More"}
          onBack={() => goBack(navSource["recipes"] || "more")}
          onCatalog={() => navigate("catalog", "recipes")}
          onBake={() => navigate("bake", "recipes")}
          onSaved={async () => {
            showToast(navSource["recipes"] === "bake" ? "Recipe saved! Returning to bake..." : "Recipe blueprint saved");
            await refreshData();
            if (navSource["recipes"] === "bake") {
              navigate("bake");
            }
          }}
        />
      )}
      {view === "history" && <History token={token} onBack={() => goBack("more")} onChanged={async () => { showToast("Transaction reversed"); await refreshData(); }}/>}
      {view === "expense" && <Expense token={token} backLabel={navSource["expense"] === "home" ? "Back to Home" : navSource["expense"] === "more" ? "Back to More" : "Back to More"} onBack={() => goBack("more")} onCancel={() => goBack("more")} onSaved={async () => { showToast("Expense recorded"); await refreshData(); }}/>} 
      {view === "reports" && <Reports token={token} onBack={() => goBack("more")}/>} 
      {view === "reset" && <ResetData email={session.user.email || ""} onCancel={() => goBack("more")} onReset={async () => { setCart({}); showToast("Test data reset complete"); await refreshData(); navigate("home"); }}/>} 
      {view === "more" && <More email={session.user.email || "Owner"} onNavigate={(v) => navigate(v, "more")} onSignOut={() => getBrowserSupabase().auth.signOut()}/>} 
      {loading && <div className="data-loading">Loading bakery data…</div>}
    </section>
    <nav className="bottom-nav" aria-label="Mobile navigation"><NavItems view={activeView} onSelect={(v) => navigate(v)}/></nav>
    {toast && <div className="toast" role="status"><Icon name="check" size={18}/>{toast}</div>}
  </main>;
}

function Brand() { return <div className="brand"><span className="brand-mark">B</span><div><strong>Bakery Book</strong><small>Simple daily records</small></div></div>; }

function NavItems({ view, onSelect }: { view: View; onSelect: (view: View) => void }) {
  const items: { id: View; label: string; icon: IconName }[] = [{ id: "home", label: "Home", icon: "home" }, { id: "sell", label: "Sell", icon: "sell" }, { id: "bake", label: "Bake", icon: "bake" }, { id: "stock", label: "Stock", icon: "stock" }, { id: "more", label: "More", icon: "more" }];
  return <>{items.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => onSelect(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>)}</>;
}

function PageHeading({
  eyebrow,
  title,
  onBack,
  backLabel,
  action,
}: {
  eyebrow: string;
  title: string;
  onBack?: () => void;
  backLabel?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div className="heading-main">
        {onBack ? (
          <button
            type="button"
            className="heading-back-btn"
            onClick={onBack}
            aria-label={backLabel || `Back from ${title}`}
          >
            <Icon name="arrow-left" size={15} />
            <span>{backLabel || eyebrow}</span>
          </button>
        ) : (
          <p>{eyebrow}</p>
        )}
        <h1>{title}</h1>
      </div>
      {action && <div className="heading-actions">{action}</div>}
    </div>
  );
}

function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action: string; onAction: () => void }) { return <div className="empty-state"><span>🍞</span><h2>{title}</h2><p>{detail}</p><button className="outline-button" onClick={onAction}><Icon name="plus" size={18}/>{action}</button></div>; }

function Dashboard({ data, ingredients, onNavigate }: { data: DashboardData; ingredients: Ingredient[]; onNavigate: (view: View) => void }) {
  const todayLabel = useSyncExternalStore(subscribeToDate, getTodayLabel, () => "Today");
  const low = ingredients.filter((item) => item.isLow).slice(0, 3);
  return <div className="page page-home"><PageHeading eyebrow={todayLabel} title="Good morning" action={<button className="round-button" aria-label="New sale" onClick={() => onNavigate("sell")}><Icon name="plus"/></button>}/>
    <section className="hero-card"><div className="hero-top"><span>Today&apos;s sales</span><span className="soft-badge"><Icon name="trend" size={15}/> Live</span></div><strong>{data.sales.toLocaleString()} <small>MMK</small></strong><div className="hero-bottom"><span>{data.itemsSold} items sold</span><button onClick={() => onNavigate("sell")}>New sale <Icon name="arrow" size={17}/></button></div></section>
    <section><div className="section-title"><h2>Today at a glance</h2><span>Live overview</span></div><div className="stat-grid"><article className="stat-card"><span className="stat-icon peach"><Icon name="bake"/></span><div><small>Baked today</small><strong>{data.itemsBaked}</strong><span>{data.batches} batches</span></div></article><article className="stat-card"><span className="stat-icon sage"><Icon name="stock"/></span><div><small>Items in stock</small><strong>{data.finishedStock}</strong><span>finished goods</span></div></article><article className="stat-card"><span className="stat-icon yellow"><Icon name="alert"/></span><div><small>Low stock</small><strong>{data.lowStockItems}</strong><span>Need attention</span></div></article><article className="stat-card"><span className="stat-icon lavender"><Icon name="bag"/></span><div><small>Today&apos;s waste</small><strong>{data.wasteItems}</strong><span>finished items</span></div></article></div></section>
    <section><div className="section-title"><h2>Quick actions</h2></div><div className="quick-actions"><button onClick={() => onNavigate("sell")}><span className="quick-icon coral"><Icon name="sell"/></span><strong>New sale</strong><small>Record items sold</small></button><button onClick={() => onNavigate("bake")}><span className="quick-icon cocoa"><Icon name="bake"/></span><strong>Record bake</strong><small>Start a batch</small></button><button onClick={() => onNavigate("purchase")}><span className="quick-icon green"><Icon name="stock"/></span><strong>Add purchase</strong><small>Restock ingredients</small></button></div></section>
    {low.length > 0 && <section><div className="section-title"><h2>Needs attention</h2><button onClick={() => onNavigate("stock")}>View stock</button></div><div className="attention-list">{low.map((item) => <article key={item.id}><span className="ingredient-icon">🌾</span><div><strong>{item.name} is running low</strong><small>{item.quantity} {item.unit} remaining</small></div><span className="level-pill">Low</span></article>)}</div></section>}
  </div>;
}

function getCashSuggestions(total: number): number[] {
  if (total <= 0) return [1000, 5000, 10000, 20000];
  const set = new Set<number>();
  set.add(total);
  const denominations = [1000, 2000, 5000, 10000, 20000, 50000];
  for (const d of denominations) {
    if (d >= total) {
      set.add(d);
    } else {
      const nextMultiple = Math.ceil(total / d) * d;
      if (nextMultiple > total && nextMultiple <= total + 30000) {
        set.add(nextMultiple);
      }
    }
  }
  return Array.from(set).sort((a, b) => a - b).slice(0, 5);
}

const getPaymentBadge = (method: string) => {
  switch (method) {
    case "cash":
      return { label: "Cash", emoji: "💵" };
    case "mobile":
      return { label: "Mobile / KPay", emoji: "📱" };
    case "credit":
      return { label: "Credit", emoji: "💳" };
    default:
      return { label: method.toUpperCase(), emoji: "🧾" };
  }
};

function Sell({
  products,
  cart,
  total,
  count,
  token,
  onChange,
  onSetQuantity,
  onClearCart,
  onComplete,
  onCatalog,
}: {
  products: Product[];
  cart: Record<string, number>;
  total: number;
  count: number;
  token?: string;
  onChange: (id: string, change: number) => void;
  onSetQuantity: (id: string, quantity: number) => void;
  onClearCart: () => void;
  onComplete: (options: { paymentMethod: string; note?: string; tendered?: number; change?: number }) => Promise<boolean | undefined>;
  onCatalog: () => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"register" | "log">("register");
  const [search, setSearch] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);

  // Reversal states
  const [reversing, setReversing] = useState(false);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalBusy, setReversalBusy] = useState(false);
  const [reversalError, setReversalError] = useState("");

  const [saleSuccess, setSaleSuccess] = useState<{
    total: number;
    paymentMethod: string;
    tendered?: number;
    change?: number;
    count: number;
  } | null>(null);

  // Query sales
  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      if (!token) return [];
      const res = await apiRequest<{ sales: SaleRecord[] }>("/api/sales", token);
      return res.sales || [];
    },
    enabled: Boolean(token),
  });

  async function handleReverseSale() {
    if (!selectedSale || !reversalReason.trim() || !token) return;
    setReversalBusy(true);
    setReversalError("");
    try {
      await apiRequest("/api/history", token, {
        method: "POST",
        body: JSON.stringify({
          type: "sale",
          id: selectedSale.id,
          note: reversalReason.trim(),
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["sales"] });
      await queryClient.invalidateQueries({ queryKey: ["bakery-data"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      await queryClient.invalidateQueries({ queryKey: ["history"] });
      setSelectedSale(null);
      setReversing(false);
      setReversalReason("");
    } catch (err) {
      setReversalError(err instanceof Error ? err.message : "Could not reverse sale");
    } finally {
      setReversalBusy(false);
    }
  }

  // Today's metrics
  const todaySales = useMemo(() => sales.filter((s) => isToday(s.sold_at)), [sales]);
  const todayActiveSales = useMemo(() => todaySales.filter((s) => !s.reversed_at), [todaySales]);
  const todayRevenue = useMemo(
    () => todayActiveSales.reduce((sum, s) => sum + (Number(s.total_amount_mmk) || 0), 0),
    [todayActiveSales]
  );
  const todayItemsSold = useMemo(
    () =>
      todayActiveSales.reduce(
        (sum, s) =>
          sum +
          (s.sale_items?.reduce((iSum, item) => iSum + (Number(item.quantity) || 0), 0) || 0),
        0
      ),
    [todayActiveSales]
  );

  // Filtered sales log
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (filterMethod === "reversed") {
        if (!s.reversed_at) return false;
      } else if (filterMethod !== "all") {
        if (s.payment_method !== filterMethod) return false;
      }

      if (logSearch.trim()) {
        const q = logSearch.toLowerCase();
        const noteMatch = (s.note || "").toLowerCase().includes(q);
        const idMatch = s.id.toLowerCase().includes(q);
        const itemMatch = s.sale_items?.some((i) =>
          (i.products?.name || "").toLowerCase().includes(q)
        );
        return noteMatch || idMatch || itemMatch;
      }
      return true;
    });
  }, [sales, filterMethod, logSearch]);

  const visibleProducts = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page sell-page">
      <PageHeading
        eyebrow="Point of sale"
        title={tab === "register" ? "New sale" : "Sales log"}
        action={
          tab === "register" ? (
            count > 0 ? (
              <button
                type="button"
                className="outline-button header-cart-pill"
                onClick={() => setDrawerOpen(true)}
                aria-label="View shopping cart"
              >
                <Icon name="bag" size={17} />
                <span>Cart ({count})</span>
              </button>
            ) : undefined
          ) : (
            <button
              type="button"
              className="primary-action header-cta-btn"
              onClick={() => setTab("register")}
            >
              <Icon name="plus" size={16} />
              <span>New Sale</span>
            </button>
          )
        }
      />

      <div className="stock-subtabs">
        <button
          type="button"
          className={tab === "register" ? "active" : ""}
          onClick={() => setTab("register")}
        >
          POS Register
        </button>
        <button
          type="button"
          className={tab === "log" ? "active" : ""}
          onClick={() => setTab("log")}
        >
          Sales Log {todayActiveSales.length > 0 && <small>({todayActiveSales.length})</small>}
        </button>
      </div>

      {tab === "register" ? (
        products.length === 0 ? (
          <EmptyState
            title="No products yet"
            detail="Add the breads and cakes your sister sells before recording a sale."
            action="Add product"
            onAction={onCatalog}
          />
        ) : (
          <>
            <div className="search-box">
              <span>⌕</span>
              <input
                aria-label="Search products"
                placeholder="Search products by name…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="clear-search-btn"
                  aria-label="Clear search query"
                  onClick={() => setSearch("")}
                >
                  ×
                </button>
              )}
            </div>

            <div className="product-grid">
              {visibleProducts.map((product) => {
                const qty = cart[product.id] || 0;
                const inCart = qty > 0;
                const isOutOfStock = product.stock <= 0;

                return (
                  <article
                    className={`product-card ${inCart ? "in-cart" : ""} ${isOutOfStock ? "out-of-stock" : ""}`}
                    key={product.id}
                  >
                    <div className="product-photo">
                      {product.emoji}
                      <span className={product.stock <= 3 && product.stock > 0 ? "stock-badge low" : "stock-badge"}>
                        {isOutOfStock ? "Sold out" : `${product.stock} left`}
                      </span>
                      {inCart && <span className="cart-badge-chip">{qty}</span>}
                    </div>
                    <div className="product-info">
                      <div>
                        <strong>{product.name}</strong>
                        <small>{money(product.price)}</small>
                      </div>
                      {qty === 0 ? (
                        <button
                          type="button"
                          className="add-product-btn"
                          disabled={isOutOfStock}
                          aria-label={`Add ${product.name}`}
                          onClick={() => onChange(product.id, 1)}
                        >
                          <Icon name="plus" size={17} />
                          <span>Add</span>
                        </button>
                      ) : (
                        <div className="pos-stepper">
                          <button
                            type="button"
                            aria-label={`Decrease ${product.name}`}
                            onClick={() => onChange(product.id, -1)}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min="0"
                            max={product.stock}
                            inputMode="numeric"
                            aria-label={`${product.name} quantity`}
                            value={qty}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              onSetQuantity(product.id, isNaN(val) ? 0 : val);
                            }}
                            onFocus={(e) => e.target.select()}
                          />
                          <button
                            type="button"
                            aria-label={`Increase ${product.name}`}
                            disabled={qty >= product.stock}
                            onClick={() => onChange(product.id, 1)}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {count > 0 && (
              <div
                className="checkout-bar"
                role="button"
                tabIndex={0}
                onClick={() => setDrawerOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDrawerOpen(true);
                  }
                }}
              >
                <div className="checkout-bar-info">
                  <span className="checkout-pill">
                    {count} {count === 1 ? "item" : "items"} in cart
                  </span>
                  <strong>{money(total)}</strong>
                </div>
                <button
                  className="checkout-trigger-btn"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDrawerOpen(true);
                  }}
                >
                  <span>Review Order & Pay</span>
                  <Icon name="arrow" size={18} />
                </button>
              </div>
            )}
          </>
        )
      ) : (
        /* --- SALES LOG VIEW --- */
        <div style={{ display: "grid", gap: "16px" }}>
          <section className="batch-stats-grid">
            <div className="batch-stat-card">
              <small>Today&apos;s Revenue</small>
              <strong style={{ color: "var(--coral)" }}>{money(todayRevenue)}</strong>
              <span>{todayActiveSales.length} sales</span>
            </div>
            <div className="batch-stat-card">
              <small>Items Sold</small>
              <strong className="positive">{todayItemsSold.toLocaleString()}</strong>
              <span>Pieces today</span>
            </div>
            <div className="batch-stat-card">
              <small>Orders</small>
              <strong>{todaySales.length}</strong>
              <span>
                {todaySales.some((s) => s.reversed_at)
                  ? `${todaySales.filter((s) => s.reversed_at).length} voided`
                  : "All completed"}
              </span>
            </div>
          </section>

          <div className="search-box">
            <span>⌕</span>
            <input
              aria-label="Search sales log"
              placeholder="Search by product, note, or receipt ID…"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
            />
            {logSearch && (
              <button
                type="button"
                className="clear-search-btn"
                aria-label="Clear search query"
                onClick={() => setLogSearch("")}
              >
                ×
              </button>
            )}
          </div>

          <div className="filter-scroll">
            {[
              ["all", "All"],
              ["cash", "💵 Cash"],
              ["mobile", "📱 Mobile / KPay"],
              ["credit", "💳 Credit"],
              ["reversed", "Voided / Reversed"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={filterMethod === id ? "active" : ""}
                onClick={() => setFilterMethod(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {loadingSales ? (
            <div className="report-loading">Loading sales log…</div>
          ) : filteredSales.length === 0 ? (
            <EmptyState
              title={logSearch ? "No matching orders" : "No sales recorded"}
              detail={
                logSearch
                  ? "Try a different search query."
                  : "Switch to the POS Register to record your first sale."
              }
              action="Open Register"
              onAction={() => {
                setLogSearch("");
                setTab("register");
              }}
            />
          ) : (
            <section className="batch-list">
              {filteredSales.map((sale) => {
                const badge = getPaymentBadge(sale.payment_method);
                const itemsCount =
                  sale.sale_items?.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) || 0;
                const itemsPreview =
                  sale.sale_items
                    ?.map((item) => `${item.quantity}x ${item.products?.name || "Product"}`)
                    .join(", ") || "Sale order";

                return (
                  <article
                    key={sale.id}
                    className={`batch-item ${sale.reversed_at ? "reversed" : ""}`}
                    onClick={() => {
                      setSelectedSale(sale);
                      setReversing(false);
                      setReversalReason("");
                      setReversalError("");
                    }}
                  >
                    <div className="batch-item-left">
                      <span className="batch-emoji" aria-hidden="true">
                        {badge.emoji}
                      </span>
                      <div className="batch-item-info">
                        <strong>{itemsPreview}</strong>
                        <small>
                          {formatBatchTime(sale.sold_at)} · {badge.label} · {itemsCount} pcs
                          {sale.note ? ` · ${sale.note}` : ""}
                        </small>
                      </div>
                    </div>

                    <div className="batch-item-right">
                      <strong style={{ fontFamily: "Georgia, serif", fontSize: "14px" }}>
                        {money(Number(sale.total_amount_mmk))}
                      </strong>
                      {sale.reversed_at ? (
                        <span className="reversed-badge">Reversed</span>
                      ) : (
                        <span className="batch-arrow-icon">›</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </div>
      )}

      {/* Cart Drawer */}
      {drawerOpen && (
        <CartDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          products={products}
          cart={cart}
          total={total}
          count={count}
          onChange={onChange}
          onSetQuantity={onSetQuantity}
          onClearCart={onClearCart}
          onComplete={async (options) => {
            const success = await onComplete(options);
            if (success) {
              setDrawerOpen(false);
              setSaleSuccess({
                total,
                paymentMethod: options.paymentMethod,
                tendered: options.tendered,
                change: options.change,
                count,
              });
            }
          }}
        />
      )}

      {/* Sale Success Overlay */}
      {saleSuccess && (
        <div className="sale-success-overlay" onClick={() => setSaleSuccess(null)}>
          <div className="sale-success-card" onClick={(e) => e.stopPropagation()}>
            <div className="success-icon-badge">
              <Icon name="check" size={32} />
            </div>
            <h2>Sale Recorded!</h2>
            <p className="success-sub">Order completed and stock updated.</p>

            <div className="success-receipt-box">
              <div className="receipt-row">
                <span>Items Sold</span>
                <strong>{saleSuccess.count} pcs</strong>
              </div>
              <div className="receipt-row">
                <span>Total Amount</span>
                <strong className="receipt-total">{money(saleSuccess.total)}</strong>
              </div>
              <div className="receipt-row">
                <span>Payment Method</span>
                <span className="payment-pill">{saleSuccess.paymentMethod.toUpperCase()}</span>
              </div>
              {saleSuccess.tendered !== undefined && (
                <>
                  <div className="receipt-row">
                    <span>Cash Received</span>
                    <strong>{money(saleSuccess.tendered)}</strong>
                  </div>
                  <div className="receipt-row highlight">
                    <span>Change Returned</span>
                    <strong className="change-amount">{money(saleSuccess.change ?? 0)}</strong>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              className="primary-action start-next-sale-btn"
              autoFocus
              onClick={() => setSaleSuccess(null)}
            >
              <span>Start Next Sale</span>
              <Icon name="plus" size={18} />
            </button>
            <button
              type="button"
              className="outline-button continue-shopping-btn"
              onClick={() => {
                setSaleSuccess(null);
                setTab("log");
              }}
            >
              View in Sales Log
            </button>
          </div>
        </div>
      )}

      {/* Receipt Detail & Reversal Drawer */}
      {selectedSale && (() => {
        const badge = getPaymentBadge(selectedSale.payment_method);
        const itemCount =
          selectedSale.sale_items?.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) || 0;

        return (
          <div
            className="cart-overlay"
            onClick={() => {
              if (!reversalBusy) setSelectedSale(null);
            }}
          >
            <div
              className="cart-drawer"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Receipt details"
            >
              <header className="drawer-header">
                <div>
                  <h2>Receipt #{selectedSale.id.slice(0, 8).toUpperCase()}</h2>
                  <span>{formatBatchFullDate(selectedSale.sold_at)}</span>
                </div>
                <button
                  type="button"
                  className="drawer-close-btn"
                  aria-label="Close receipt"
                  onClick={() => setSelectedSale(null)}
                >
                  ✕
                </button>
              </header>

              <div className="drawer-body batch-detail-body">
                <div className="batch-detail-header-left">
                  <span className="batch-detail-emoji" aria-hidden="true">
                    {badge.emoji}
                  </span>
                  <div>
                    <strong style={{ fontSize: "16px", color: "var(--ink)" }}>
                      {badge.label} Payment
                    </strong>
                    <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>
                      {itemCount} {itemCount === 1 ? "piece" : "pieces"} sold
                    </div>
                  </div>
                </div>

                <div className="batch-detail-metrics-grid">
                  <div className="batch-metric-box">
                    <small>Total Paid</small>
                    <strong style={{ color: "var(--coral)" }}>
                      {money(Number(selectedSale.total_amount_mmk))}
                    </strong>
                    <span>MMK</span>
                  </div>
                  <div className="batch-metric-box">
                    <small>Items Sold</small>
                    <strong className="positive">{itemCount}</strong>
                    <span>Pieces</span>
                  </div>
                  <div className="batch-metric-box">
                    <small>Method</small>
                    <strong style={{ fontSize: "16px" }}>{badge.label}</strong>
                    <span>Account</span>
                  </div>
                </div>

                {/* Itemized Sold Products */}
                <section className="batch-detail-section">
                  <span className="section-subhead">Itemized Order Receipt</span>
                  <div className="batch-ingredients-table">
                    {selectedSale.sale_items?.map((item) => {
                      const prod = products.find((p) => p.id === item.product_id);
                      const prodName = prod?.name || item.products?.name || "Product";
                      const prodEmoji = prod?.emoji || "🍞";
                      const qty = Number(item.quantity) || 0;
                      const unitPrice = Number(item.unit_price_mmk) || 0;
                      const lineTotal = qty * unitPrice;

                      return (
                        <div className="batch-ingredient-row" key={item.id}>
                          <div className="batch-ing-info">
                            <strong>
                              {prodEmoji} {prodName}
                            </strong>
                            <small>
                              {qty} pcs × {money(unitPrice)}
                            </small>
                          </div>
                          <div className="batch-ing-cost">
                            <strong>{money(lineTotal)}</strong>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {selectedSale.note && (
                  <div className="batch-note-box">
                    <strong>Order Note</strong>
                    <p style={{ margin: "4px 0 0" }}>{selectedSale.note}</p>
                  </div>
                )}

                {selectedSale.reversed_at && (
                  <div className="batch-note-box" style={{ background: "#fae1d8", color: "#963d29" }}>
                    <strong>Sale Voided / Reversed</strong>
                    <p style={{ margin: "4px 0 0", fontSize: "11px" }}>
                      {selectedSale.reversal_note
                        ? `Reason: “${selectedSale.reversal_note}”`
                        : "Reversed via accounting correction."}
                    </p>
                  </div>
                )}

                {!selectedSale.reversed_at && (
                  <div style={{ marginTop: "8px" }}>
                    {!reversing ? (
                      <button
                        type="button"
                        className="text-button batch-reverse-trigger"
                        onClick={() => setReversing(true)}
                      >
                        Need to void or reverse this sale?
                      </button>
                    ) : (
                      <div className="confirm-panel" style={{ margin: 0 }}>
                        <strong>Void and reverse this sale?</strong>
                        <p>
                          This restores product inventory to stock and reverses the sales revenue entry.
                        </p>
                        <label>
                          Reason for voiding
                          <input
                            value={reversalReason}
                            onChange={(e) => setReversalReason(e.target.value)}
                            placeholder="e.g. Customer returned items, cashier error"
                            autoFocus
                          />
                        </label>
                        {reversalError && <p className="form-error">{reversalError}</p>}
                        <div>
                          <button
                            type="button"
                            className="text-button"
                            disabled={reversalBusy}
                            onClick={() => {
                              setReversing(false);
                              setReversalReason("");
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="danger-action compact"
                            disabled={reversalBusy || !reversalReason.trim()}
                            onClick={() => void handleReverseSale()}
                          >
                            {reversalBusy ? "Voiding…" : "Confirm Void"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <footer className="drawer-footer">
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => setSelectedSale(null)}
                >
                  Close Receipt
                </button>
              </footer>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function CartDrawer({
  isOpen,
  onClose,
  products,
  cart,
  total,
  count,
  onChange,
  onSetQuantity,
  onClearCart,
  onComplete,
}: {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  cart: Record<string, number>;
  total: number;
  count: number;
  onChange: (id: string, change: number) => void;
  onSetQuantity: (id: string, qty: number) => void;
  onClearCart: () => void;
  onComplete: (options: { paymentMethod: string; note?: string; tendered?: number; change?: number }) => Promise<void>;
}) {
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mobile" | "credit">("cash");
  const [cashTendered, setCashTendered] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cartItems = useMemo(
    () => products.filter((p) => (cart[p.id] || 0) > 0),
    [products, cart]
  );

  const tenderedNum = Number(cashTendered.replace(/,/g, "")) || 0;
  const change = Math.max(0, tenderedNum - total);
  const shortage = Math.max(0, total - tenderedNum);
  const hasTendered = cashTendered.trim() !== "";
  const cashSuggestions = useMemo(() => getCashSuggestions(total), [total]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  async function handleConfirmSale() {
    if (count === 0) return;
    setBusy(true);
    setError("");
    try {
      await onComplete({
        paymentMethod,
        note: note.trim() || undefined,
        tendered: paymentMethod === "cash" && tenderedNum ? tenderedNum : undefined,
        change: paymentMethod === "cash" && tenderedNum ? change : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete sale");
      setBusy(false);
    }
  }

  return (
    <div className="cart-overlay" onClick={onClose}>
      <div
        className="cart-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-header">
          <div>
            <h2 id="cart-drawer-title">Review Order</h2>
            <span>
              {count} {count === 1 ? "item" : "items"} · {money(total)}
            </span>
          </div>
          <div className="drawer-header-actions">
            <button
              type="button"
              className="clear-cart-btn"
              disabled={busy || count === 0}
              onClick={() => {
                if (window.confirm("Remove all items from this order?")) {
                  onClearCart();
                  onClose();
                }
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="drawer-close-btn"
              aria-label="Close cart"
              onClick={onClose}
            >
              <Icon name="x" size={20} />
            </button>
          </div>
        </header>

        <div className="drawer-body">
          {cartItems.length === 0 ? (
            <div className="empty-cart-state">
              <span>🛒</span>
              <p>Your cart is empty.</p>
              <button type="button" className="outline-button" onClick={onClose}>
                Choose products
              </button>
            </div>
          ) : (
            <>
              <section className="cart-items-section">
                <span className="section-subhead">Items in Order</span>
                <div className="cart-items-list">
                  {cartItems.map((product) => {
                    const qty = cart[product.id] || 0;
                    const lineTotal = product.price * qty;
                    return (
                      <article className="cart-line-item" key={product.id}>
                        <div className="cart-line-left">
                          <span className="cart-line-emoji">{product.emoji}</span>
                          <div>
                            <strong>{product.name}</strong>
                            <small>{money(product.price)} each</small>
                          </div>
                        </div>
                        <div className="cart-line-right">
                          <div className="pos-stepper compact">
                            <button
                              type="button"
                              aria-label={`Decrease ${product.name}`}
                              onClick={() => onChange(product.id, -1)}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="0"
                              max={product.stock}
                              inputMode="numeric"
                              value={qty}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                onSetQuantity(product.id, isNaN(val) ? 0 : val);
                              }}
                              onFocus={(e) => e.target.select()}
                            />
                            <button
                              type="button"
                              aria-label={`Increase ${product.name}`}
                              disabled={qty >= product.stock}
                              onClick={() => onChange(product.id, 1)}
                            >
                              +
                            </button>
                          </div>
                          <strong className="cart-line-total">{money(lineTotal)}</strong>
                          <button
                            type="button"
                            className="cart-remove-item-btn"
                            aria-label={`Remove ${product.name}`}
                            onClick={() => onSetQuantity(product.id, 0)}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="payment-method-section">
                <span className="section-subhead">Payment Method</span>
                <div className="payment-pills">
                  <button
                    type="button"
                    className={paymentMethod === "cash" ? "active" : ""}
                    onClick={() => setPaymentMethod("cash")}
                  >
                    <Icon name="cash" size={18} />
                    <span>Cash</span>
                  </button>
                  <button
                    type="button"
                    className={paymentMethod === "mobile" ? "active" : ""}
                    onClick={() => setPaymentMethod("mobile")}
                  >
                    <Icon name="phone" size={18} />
                    <span>Mobile (KPay)</span>
                  </button>
                  <button
                    type="button"
                    className={paymentMethod === "credit" ? "active" : ""}
                    onClick={() => setPaymentMethod("credit")}
                  >
                    <Icon name="credit" size={18} />
                    <span>Credit / Due</span>
                  </button>
                </div>
              </section>

              {paymentMethod === "cash" && (
                <section className="cash-calculator-section">
                  <div className="calc-header">
                    <span className="section-subhead">Cash Calculator</span>
                    <strong className="calc-due-badge">Total: {money(total)}</strong>
                  </div>

                  <div className="tendered-input-box">
                    <label>
                      <span>Cash Received from Customer (MMK)</span>
                      <div className="input-with-clear">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="e.g. 10000"
                          value={cashTendered}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, "");
                            setCashTendered(val);
                          }}
                        />
                        {cashTendered && (
                          <button
                            type="button"
                            className="clear-input-btn"
                            onClick={() => setCashTendered("")}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </label>
                  </div>

                  <div className="quick-chips">
                    {cashSuggestions.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        className={tenderedNum === amount ? "chip active" : "chip"}
                        onClick={() => setCashTendered(String(amount))}
                      >
                        {amount === total
                          ? `Exact (${amount.toLocaleString()} K)`
                          : `${amount.toLocaleString()} K`}
                      </button>
                    ))}
                  </div>

                  {hasTendered && (
                    <div className={tenderedNum >= total ? "change-box success" : "change-box warning"}>
                      {tenderedNum >= total ? (
                        <>
                          <div>
                            <small>Change to return to customer</small>
                            <strong>{money(change)}</strong>
                          </div>
                          <span className="badge-pill-success">Return Cash</span>
                        </>
                      ) : (
                        <>
                          <div>
                            <small>Shortage / Still owed</small>
                            <strong>{money(shortage)}</strong>
                          </div>
                          <span className="badge-pill-warning">Due</span>
                        </>
                      )}
                    </div>
                  )}
                </section>
              )}

              <section className="sale-note-section">
                <label>
                  <span>Order Note <small>(Optional)</small></span>
                  <input
                    type="text"
                    placeholder="Customer name, custom packaging, mobile transaction ID…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              </section>
            </>
          )}
        </div>

        <footer className="drawer-footer">
          {error && <p className="form-error">{error}</p>}
          <button
            type="button"
            className="primary-action checkout-submit-btn"
            disabled={busy || count === 0}
            onClick={handleConfirmSale}
          >
            {busy ? (
              "Recording sale…"
            ) : (
              <>
                <span>Complete Sale · {money(total)}</span>
                <Icon name="arrow" size={18} />
              </>
            )}
          </button>
          <button
            type="button"
            className="text-button continue-shopping-btn"
            disabled={busy}
            onClick={onClose}
          >
            Keep adding products
          </button>
        </footer>
      </div>
    </div>
  );
}

function Bake({
  products,
  ingredients,
  recipes,
  token,
  onCatalog,
  onRecipes,
  onSaved,
}: {
  products: Product[];
  ingredients: Ingredient[];
  recipes: Recipe[];
  token: string;
  onCatalog: () => void;
  onRecipes: () => void;
  onSaved: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"list" | "create">("list");
  const { data: batches = [], isLoading: loadingBatches } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      const res = await apiRequest<{ batches: BatchRecord[] }>("/api/batches", token);
      return res.batches || [];
    },
  });
  const [selectedBatch, setSelectedBatch] = useState<BatchRecord | null>(null);
  const [reversingBatch, setReversingBatch] = useState<BatchRecord | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalBusy, setReversalBusy] = useState(false);
  const [reversalError, setReversalError] = useState("");

  // Form states
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [batchCount, setBatchCount] = useState("1");
  const [good, setGood] = useState("");
  const [waste, setWaste] = useState("0");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedProductId = productId || products[0]?.id || "";
  const recipe = recipes.find((item) => item.productId === selectedProductId);
  const multiplier = Math.max(0, Number(batchCount) || 0);
  const recipeRows =
    recipe?.items
      .map((recipeItem) => ({
        ...recipeItem,
        ingredient: ingredients.find((item) => item.id === recipeItem.ingredientId),
        planned: recipeItem.quantity * multiplier,
      }))
      .filter((item) => item.ingredient) || [];

  function selectProduct(id: string) {
    setProductId(id);
    setAmounts({});
    setGood("");
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!recipe) return;
    setBusy(true);
    setError("");
    try {
      const inputs = recipeRows.map((item) => ({
        ingredientId: item.ingredientId,
        plannedQuantity: item.planned,
        actualQuantity: Number(amounts[item.ingredientId] ?? item.planned),
      }));
      await apiRequest("/api/batches", token, {
        method: "POST",
        body: JSON.stringify({
          productId: selectedProductId,
          recipeId: recipe.id,
          batchCount: multiplier,
          inputs,
          goodQuantity: Number(good),
          wasteQuantity: Number(waste),
          note,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["batches"] });
      await onSaved();
      setMode("list");
      setGood("");
      setWaste("0");
      setNote("");
      setAmounts({});
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save batch");
    } finally {
      setBusy(false);
    }
  }

  async function handleReverseBatch() {
    if (!selectedBatch || !reversalReason.trim()) return;
    setReversalBusy(true);
    setReversalError("");
    try {
      await apiRequest("/api/history", token, {
        method: "POST",
        body: JSON.stringify({
          type: "batch",
          id: selectedBatch.id,
          note: reversalReason.trim(),
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["batches"] });
      await onSaved();
      setSelectedBatch(null);
      setReversingBatch(null);
      setReversalReason("");
    } catch (err) {
      setReversalError(err instanceof Error ? err.message : "Could not reverse batch");
    } finally {
      setReversalBusy(false);
    }
  }

  const todayBatches = useMemo(
    () => batches.filter((b) => !b.reversed_at && isToday(b.baked_at)),
    [batches]
  );
  const todayGood = useMemo(
    () => todayBatches.reduce((acc, b) => acc + (Number(b.good_quantity) || 0), 0),
    [todayBatches]
  );
  const todayWaste = useMemo(
    () => todayBatches.reduce((acc, b) => acc + (Number(b.waste_quantity) || 0), 0),
    [todayBatches]
  );

  if (!products.length || !ingredients.length) {
    return (
      <div className="page">
        <PageHeading eyebrow="Kitchen Production" title="Bake" />
        <EmptyState
          title="Catalog setup needed"
          detail="Add at least one product and one raw material before recording a bake."
          action="Open catalog"
          onAction={onCatalog}
        />
      </div>
    );
  }

  if (mode === "create") {
    return (
      <form className="page bake-page" onSubmit={submit}>
        <PageHeading
          eyebrow="Kitchen Production"
          title="Record a bake"
          onBack={() => setMode("list")}
          backLabel="Back to Batches"
          action={
            <button
              type="button"
              className="text-button"
              onClick={() => setMode("list")}
            >
              Cancel
            </button>
          }
        />

        <section className="form-card">
          <label>
            Product
            <select
              value={selectedProductId}
              onChange={(event) => selectProduct(event.target.value)}
              required
            >
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.emoji} {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Number of batches
            <input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={batchCount}
              onChange={(event) => setBatchCount(event.target.value)}
              required
            />
          </label>
        </section>

        {!recipe ? (
          <EmptyState
            title="Recipe blueprint needed"
            detail="This product has no active recipe. Create its standard ingredient amounts and expected yield first."
            action="Create recipe"
            onAction={onRecipes}
          />
        ) : (
          <>
            <section className="recipe-card">
              <div className="section-title">
                <h2>Ingredients used</h2>
                <span>
                  {recipe.name} · v{recipe.version}
                </span>
              </div>
              <p className="helper-copy">
                Planned amounts are filled from the blueprint. Change only an amount that was actually different.
              </p>
              {recipeRows.map((item) => (
                <label className="ingredient-input" key={item.ingredientId}>
                  <span>
                    {item.ingredient?.name}
                    <small>
                      Plan {item.planned.toLocaleString()} {item.ingredient?.unit} · {item.ingredient?.quantity.toLocaleString()} available
                    </small>
                  </span>
                  <span>
                    <input
                      type="number"
                      min="0.0001"
                      step="any"
                      inputMode="decimal"
                      value={amounts[item.ingredientId] ?? String(item.planned)}
                      onChange={(event) =>
                        setAmounts((current) => ({
                          ...current,
                          [item.ingredientId]: event.target.value,
                        }))
                      }
                    />
                    <em>{item.ingredient?.unit}</em>
                  </span>
                </label>
              ))}
            </section>

            <section className="form-card output-fields">
              <div className="section-title">
                <h2>Actual output</h2>
                <span>Expected {recipe.expectedYield * multiplier} pcs</span>
              </div>
              <div>
                <label>
                  Good products
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    inputMode="decimal"
                    value={good}
                    onChange={(event) => setGood(event.target.value)}
                    placeholder="e.g. 24"
                    required
                  />
                </label>
                <label>
                  Damaged / waste
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={waste}
                    onChange={(event) => setWaste(event.target.value)}
                    required
                  />
                </label>
              </div>
              <label>
                Batch note <small>Optional</small>
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="For example: oven ran hot, special crust"
                />
              </label>
            </section>

            {error && <p className="form-error">{error}</p>}
            <button className="primary-action" disabled={busy || !good}>
              {busy ? "Saving batch…" : "Complete baking batch"}
              <Icon name="arrow" size={18} />
            </button>
          </>
        )}
      </form>
    );
  }

  return (
    <div className="page bake-page">
      <PageHeading
        eyebrow="Kitchen Production"
        title="Baking"
        action={
          <button
            type="button"
            className="primary-action header-cta-btn"
            onClick={() => {
              setProductId(products[0]?.id || "");
              setBatchCount("1");
              setGood("");
              setWaste("0");
              setAmounts({});
              setError("");
              setMode("create");
            }}
          >
            <Icon name="plus" size={16} />
            <span>Record Bake</span>
          </button>
        }
      />

      <section className="batch-stats-grid" aria-label="Today's production summary">
        <div className="batch-stat-card">
          <small>Baked today</small>
          <strong>{todayGood.toLocaleString()}</strong>
          <span>Good items</span>
        </div>
        <div className="batch-stat-card">
          <small>Batches</small>
          <strong>{todayBatches.length}</strong>
          <span>Done today</span>
        </div>
        <div className="batch-stat-card">
          <small>Waste</small>
          <strong>{todayWaste.toLocaleString()}</strong>
          <span>Damaged pcs</span>
        </div>
      </section>

      {loadingBatches && batches.length === 0 ? (
        <div className="report-loading">Loading baking records…</div>
      ) : batches.length === 0 ? (
        <EmptyState
          title="No bakes recorded yet"
          detail="Record your kitchen production here. Finished goods will automatically enter stock and raw materials will be deducted."
          action="Record first bake"
          onAction={() => setMode("create")}
        />
      ) : (
        <div className="batch-list">
          {batches.map((batch) => {
            const rawProduct = batch.products as { id?: string; name?: string } | null;
            const productName = rawProduct?.name || "Product";
            const productMatch = products.find(
              (p) => p.name.toLowerCase() === productName.toLowerCase() || p.id === batch.product_id
            );
            const emoji = productMatch?.emoji || "🍞";
            const isReversed = Boolean(batch.reversed_at);

            return (
              <article
                key={batch.id}
                className={`batch-item ${isReversed ? "reversed" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedBatch(batch)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedBatch(batch);
                  }
                }}
              >
                <div className="batch-item-left">
                  <div className="batch-emoji">{emoji}</div>
                  <div className="batch-item-info">
                    <strong>{productName}</strong>
                    <small>
                      {batch.batch_count ? `${batch.batch_count} ${Number(batch.batch_count) === 1 ? "batch" : "batches"} · ` : ""}
                      {formatBatchTime(batch.baked_at)}
                      {batch.note ? ` · “${batch.note}”` : ""}
                    </small>
                  </div>
                </div>
                <div className="batch-item-right">
                  {isReversed ? (
                    <span className="reversed-badge">Reversed</span>
                  ) : (
                    <>
                      <span className="batch-yield-pill good">
                        +{Number(batch.good_quantity).toLocaleString()} pcs
                      </span>
                      {Number(batch.waste_quantity) > 0 && (
                        <span className="batch-yield-pill waste">
                          {Number(batch.waste_quantity).toLocaleString()} waste
                        </span>
                      )}
                    </>
                  )}
                  <span className="batch-arrow-icon" aria-hidden="true">›</span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedBatch && (() => {
        const rawProduct = selectedBatch.products as { id?: string; name?: string } | null;
        const productName = rawProduct?.name || "Product";
        const productMatch = products.find(
          (p) => p.name.toLowerCase() === productName.toLowerCase() || p.id === selectedBatch.product_id
        );
        const emoji = productMatch?.emoji || "🍞";
        const totalCost = Number(selectedBatch.ingredient_cost_mmk || 0);
        const goodQty = Number(selectedBatch.good_quantity) || 1;
        const wasteQty = Number(selectedBatch.waste_quantity) || 0;
        const totalPcs = goodQty + wasteQty;
        const wastePct = totalPcs > 0 ? (wasteQty / totalPcs) * 100 : 0;
        const unitCost = Math.round(totalCost / goodQty);
        const inputs = selectedBatch.batch_inputs || [];
        const recipeName = selectedBatch.recipes?.name;
        const recipeVersion = selectedBatch.recipes?.version;

        return (
          <div
            className="cart-overlay batch-detail-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`${productName} batch details`}
            onClick={() => {
              if (!reversalBusy) {
                setSelectedBatch(null);
                setReversingBatch(null);
              }
            }}
          >
            <div
              className="cart-drawer batch-detail-drawer"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="drawer-header">
                <div className="batch-detail-header-left">
                  <span className="batch-detail-emoji">{emoji}</span>
                  <div>
                    <h2>{productName}</h2>
                    <span>{formatBatchFullDate(selectedBatch.baked_at)}</span>
                  </div>
                </div>
                <div className="drawer-header-actions">
                  {selectedBatch.reversed_at ? (
                    <span className="reversed-badge">Reversed</span>
                  ) : (
                    <span className="batch-yield-pill good">Completed</span>
                  )}
                  <button
                    type="button"
                    className="drawer-close-btn"
                    onClick={() => {
                      setSelectedBatch(null);
                      setReversingBatch(null);
                    }}
                    aria-label="Close details"
                  >
                    ×
                  </button>
                </div>
              </header>

              <div className="drawer-body batch-detail-body">
                {/* Output & Yield */}
                <section className="batch-detail-section">
                  <span className="section-subhead">Production Output</span>
                  <div className="batch-detail-metrics-grid">
                    <div className="batch-metric-box">
                      <small>Good pieces</small>
                      <strong className="positive">+{goodQty.toLocaleString()} pcs</strong>
                      <span>Ready for sale</span>
                    </div>
                    <div className="batch-metric-box">
                      <small>Waste / Damaged</small>
                      <strong className={wasteQty > 0 ? "negative" : ""}>
                        {wasteQty.toLocaleString()} pcs
                      </strong>
                      <span>
                        {wastePct > 0 ? `${wastePct.toFixed(1)}% waste` : "Zero waste"}
                      </span>
                    </div>
                    <div className="batch-metric-box">
                      <small>Batches</small>
                      <strong>{selectedBatch.batch_count || 1}</strong>
                      <span>
                        {recipeName ? `${recipeName} · v${recipeVersion}` : "Standard batch"}
                      </span>
                    </div>
                  </div>
                </section>

                {/* Financial Cost Breakdown */}
                <section className="batch-detail-section">
                  <span className="section-subhead">Cost & Profit Margins</span>
                  <div className="batch-cost-card">
                    <div className="batch-cost-row">
                      <span>Total ingredient cost</span>
                      <strong>{money(totalCost)}</strong>
                    </div>
                    <div className="batch-cost-row highlight">
                      <span>Cost per good piece</span>
                      <strong className="unit-cost-val">{money(unitCost)} / pc</strong>
                    </div>
                    {productMatch && productMatch.price > 0 && (
                      <div className="batch-cost-row sub">
                        <span>Selling price: <strong>{money(productMatch.price)}</strong></span>
                        <span className="margin-tag">
                          Gross margin: {money(Math.max(0, productMatch.price - unitCost))} / pc ({Math.round(((productMatch.price - unitCost) / productMatch.price) * 100)}%)
                        </span>
                      </div>
                    )}
                  </div>
                </section>

                {/* Ingredients Consumed */}
                <section className="batch-detail-section">
                  <span className="section-subhead">Ingredients Consumed</span>
                  {inputs.length === 0 ? (
                    <p className="quiet-state small">No individual ingredient breakdown recorded for this batch.</p>
                  ) : (
                    <div className="batch-ingredients-table">
                      {inputs.map((input) => {
                        const ingName = input.ingredients?.name || "Raw Material";
                        const unit = input.ingredients?.base_unit || "unit";
                        const itemCost = Math.round(Number(input.actual_quantity) * Number(input.unit_cost_mmk || 0));
                        return (
                          <div key={input.id} className="batch-ingredient-row">
                            <div className="batch-ing-info">
                              <strong>{ingName}</strong>
                              <small>
                                Actual: {Number(input.actual_quantity).toLocaleString()} {unit}
                                {Number(input.planned_quantity) > 0 && ` · Plan: ${Number(input.planned_quantity).toLocaleString()} ${unit}`}
                              </small>
                            </div>
                            <div className="batch-ing-cost">
                              <strong>{money(itemCost)}</strong>
                              {Number(input.unit_cost_mmk) > 0 && (
                                <small>{money(Math.round(Number(input.unit_cost_mmk)))} / {unit}</small>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Baker's Note */}
                {selectedBatch.note && (
                  <section className="batch-detail-section">
                    <span className="section-subhead">Baker&apos;s Note</span>
                    <div className="batch-note-box">
                      <span>“{selectedBatch.note}”</span>
                    </div>
                  </section>
                )}

                {/* Reversed Status Callout */}
                {selectedBatch.reversed_at && (
                  <div className="danger-banner neutral-banner">
                    <Icon name="alert" />
                    <div>
                      <strong>This batch has been reversed</strong>
                      <span>
                        {selectedBatch.reversal_note ? `Reason: “${selectedBatch.reversal_note}” · ` : ""}
                        Reversed on {formatBatchTime(selectedBatch.reversed_at)}
                      </span>
                    </div>
                  </div>
                )}

                {/* In-drawer Reversal Panel */}
                {reversingBatch && (
                  <div className="confirm-panel">
                    <strong>Reverse this baking batch?</strong>
                    <p>
                      This creates opposite accounting and stock movements: it restores raw materials used and removes {goodQty.toLocaleString()} finished goods from stock.
                    </p>
                    <label>
                      Reason for reversal
                      <input
                        value={reversalReason}
                        onChange={(e) => setReversalReason(e.target.value)}
                        placeholder="e.g. wrong batch count entered, burnt in oven"
                        autoFocus
                      />
                    </label>
                    {reversalError && <p className="form-error">{reversalError}</p>}
                    <div>
                      <button
                        type="button"
                        className="text-button"
                        disabled={reversalBusy}
                        onClick={() => {
                          setReversingBatch(null);
                          setReversalReason("");
                          setReversalError("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="danger-action compact"
                        disabled={reversalBusy || !reversalReason.trim()}
                        onClick={() => void handleReverseBatch()}
                      >
                        {reversalBusy ? "Reversing…" : "Confirm Reversal"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <footer className="drawer-footer">
                {!selectedBatch.reversed_at && !reversingBatch && (
                  <button
                    type="button"
                    className="text-button batch-reverse-trigger"
                    onClick={() => {
                      setReversingBatch(selectedBatch);
                      setReversalReason("");
                      setReversalError("");
                    }}
                  >
                    Reverse / Correct this batch
                  </button>
                )}
                <button
                  type="button"
                  className="outline-button continue-shopping-btn"
                  onClick={() => {
                    setSelectedBatch(null);
                    setReversingBatch(null);
                  }}
                >
                  Close
                </button>
              </footer>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Stock({
  tab,
  onTab,
  ingredients,
  finished,
  movements,
  onPurchase,
  onBake,
  onAdjust,
  onCatalog,
}: {
  tab: StockTab;
  onTab: (tab: StockTab) => void;
  ingredients: Ingredient[];
  finished: FinishedStock[];
  movements: StockMovement[];
  onPurchase: () => void;
  onBake: () => void;
  onAdjust: () => void;
  onCatalog: () => void;
}) {
  const [subTab, setSubTab] = useState<"levels" | "movements">("levels");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows =
    tab === "raw"
      ? ingredients.map((item) => ({
          id: item.id,
          name: item.name,
          amount: `${item.quantity.toLocaleString()} ${item.unit}`,
          isLow: item.isLow,
          level:
            item.lowThreshold > 0
              ? Math.min(100, (item.quantity / item.lowThreshold) * 40)
              : 70,
        }))
      : finished.map((item) => ({
          id: item.id,
          name: item.name,
          amount: `${item.quantity.toLocaleString()} pcs`,
          isLow: item.isLow,
          level:
            item.lowThreshold > 0
              ? Math.min(100, (item.quantity / item.lowThreshold) * 40)
              : 70,
        }));

  const tabMovements = useMemo(
    () => movements.filter((m) => m.item_type === tab),
    [movements, tab]
  );

  const selectedIngredient = tab === "raw" ? ingredients.find((i) => i.id === selectedId) : null;
  const selectedProduct = tab === "finished" ? finished.find((p) => p.id === selectedId) : null;
  const itemMovements = useMemo(() => {
    if (!selectedId) return [];
    return movements.filter((m) =>
      tab === "raw" ? m.ingredient_id === selectedId : m.product_id === selectedId
    );
  }, [movements, selectedId, tab]);

  function getMovementInfo(m: StockMovement) {
    const isRaw = m.item_type === "raw";
    const name = isRaw ? m.ingredients?.name || "Raw Material" : m.products?.name || "Product";
    const unit = isRaw ? m.ingredients?.base_unit || "unit" : "pcs";
    const delta = Number(m.quantity_delta);

    switch (m.movement_type) {
      case "purchase":
        return { name, unit, label: "Purchase", cls: "inbound", sign: "+", delta: Math.abs(delta) };
      case "production_output":
        return { name, unit, label: "Baked output", cls: "inbound", sign: "+", delta: Math.abs(delta) };
      case "production_use":
        return { name, unit, label: "Used in bake", cls: "outbound", sign: "−", delta: Math.abs(delta) };
      case "sale":
        return { name, unit, label: "Sale", cls: "outbound", sign: "−", delta: Math.abs(delta) };
      case "waste":
        return { name, unit, label: "Damage / waste", cls: "outbound", sign: "−", delta: Math.abs(delta) };
      case "adjustment":
        return {
          name,
          unit,
          label: "Count check",
          cls: delta >= 0 ? "inbound" : "outbound",
          sign: delta >= 0 ? "+" : "−",
          delta: Math.abs(delta),
        };
      case "reversal":
        return {
          name,
          unit,
          label: "Reversal",
          cls: "neutral",
          sign: delta >= 0 ? "+" : "−",
          delta: Math.abs(delta),
        };
      default:
        return {
          name,
          unit,
          label: "Movement",
          cls: "neutral",
          sign: delta >= 0 ? "+" : "−",
          delta: Math.abs(delta),
        };
    }
  }

  return (
    <div className="page stock-page">
      <PageHeading
        eyebrow="Inventory"
        title="Stock"
        action={
          <div className="heading-actions">
            <button type="button" className="text-button" onClick={onAdjust}>
              Count / adjust
            </button>
            <button
              type="button"
              className="outline-button"
              onClick={tab === "raw" ? onPurchase : onBake}
            >
              <Icon name="plus" size={18} />
              {tab === "raw" ? "Purchase" : "Record bake"}
            </button>
          </div>
        }
      />

      <div className="tabs">
        <button
          type="button"
          className={tab === "raw" ? "active" : ""}
          onClick={() => {
            onTab("raw");
            setSelectedId(null);
          }}
        >
          Raw materials
        </button>
        <button
          type="button"
          className={tab === "finished" ? "active" : ""}
          onClick={() => {
            onTab("finished");
            setSelectedId(null);
          }}
        >
          Finished goods
        </button>
      </div>

      <div className="stock-subtabs">
        <button
          type="button"
          className={subTab === "levels" ? "active" : ""}
          onClick={() => setSubTab("levels")}
        >
          <span>Current Levels</span>
          <small>({rows.length})</small>
        </button>
        <button
          type="button"
          className={subTab === "movements" ? "active" : ""}
          onClick={() => setSubTab("movements")}
        >
          <span>Movement Log</span>
          <small>({tabMovements.length})</small>
        </button>
      </div>

      {subTab === "levels" ? (
        rows.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            detail={`Add your first ${tab === "raw" ? "raw material" : "product"} to begin tracking stock.`}
            action="Open catalog"
            onAction={onCatalog}
          />
        ) : (
          <div className="stock-list">
            {rows.map((item) => (
              <article
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(item.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId(item.id);
                  }
                }}
              >
                <div className="stock-row">
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.amount} available</small>
                  </div>
                  <div className="stock-item-badge-wrap">
                    <span className={item.isLow ? "stock-status low" : "stock-status"}>
                      {item.isLow ? "Low" : "Good"}
                    </span>
                    <span className="batch-arrow-icon" aria-hidden="true">›</span>
                  </div>
                </div>
                <div className="stock-track">
                  <span
                    className={item.isLow ? "low" : ""}
                    style={{ width: `${item.level}%` }}
                  />
                </div>
              </article>
            ))}
          </div>
        )
      ) : tabMovements.length === 0 ? (
        <p className="quiet-state">
          No stock movements recorded yet for {tab === "raw" ? "raw materials" : "finished goods"}.
        </p>
      ) : (
        <div className="stock-movements-list">
          {tabMovements.map((m) => {
            const info = getMovementInfo(m);
            return (
              <article key={m.id} className="stock-movement-item">
                <div className="movement-left">
                  <strong>{info.name}</strong>
                  <small>
                    {info.label} · {formatBatchTime(m.occurred_at)}
                    {m.note ? ` · “${m.note}”` : ""}
                  </small>
                </div>
                <div className="movement-right">
                  <span className={`movement-delta-pill ${info.cls}`}>
                    {info.sign}{info.delta.toLocaleString()} {info.unit}
                  </span>
                  {Number(m.unit_cost_mmk) > 0 && (
                    <small className="movement-cost-sub">
                      {money(Math.round(Number(m.unit_cost_mmk) * info.delta))}
                    </small>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Item Stock Card Detail Drawer */}
      {(selectedIngredient || selectedProduct) && (() => {
        const isRaw = Boolean(selectedIngredient);
        const name = isRaw ? selectedIngredient!.name : selectedProduct!.name;
        const currentQty = isRaw ? selectedIngredient!.quantity : selectedProduct!.quantity;
        const unit = isRaw ? selectedIngredient!.unit : "pcs";
        const isLow = isRaw ? selectedIngredient!.isLow : selectedProduct!.isLow;
        const lowThreshold = isRaw ? selectedIngredient!.lowThreshold : selectedProduct!.lowThreshold;

        const inboundTotal = itemMovements
          .filter((m) => Number(m.quantity_delta) > 0)
          .reduce((sum, m) => sum + Number(m.quantity_delta), 0);

        return (
          <div
            className="cart-overlay batch-detail-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`${name} stock card`}
            onClick={() => setSelectedId(null)}
          >
            <div
              className="cart-drawer batch-detail-drawer"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="drawer-header">
                <div>
                  <h2>{name}</h2>
                  <span>{isRaw ? "Raw material ledger" : "Finished good ledger"}</span>
                </div>
                <div className="drawer-header-actions">
                  <span className={isLow ? "stock-status low" : "stock-status"}>
                    {isLow ? "Low Stock" : "Good"}
                  </span>
                  <button
                    type="button"
                    className="drawer-close-btn"
                    onClick={() => setSelectedId(null)}
                    aria-label="Close ledger"
                  >
                    ×
                  </button>
                </div>
              </header>

              <div className="drawer-body batch-detail-body">
                <section className="batch-detail-section">
                  <span className="section-subhead">Current Balance</span>
                  <div className="batch-detail-metrics-grid">
                    <div className="batch-metric-box">
                      <small>Available</small>
                      <strong className={isLow ? "negative" : "positive"}>
                        {currentQty.toLocaleString()} {unit}
                      </strong>
                      <span>On hand now</span>
                    </div>
                    <div className="batch-metric-box">
                      <small>Low Alert</small>
                      <strong>
                        {lowThreshold > 0 ? `${lowThreshold.toLocaleString()} ${unit}` : "None"}
                      </strong>
                      <span>Alert threshold</span>
                    </div>
                    <div className="batch-metric-box">
                      <small>{isRaw ? "Purchased" : "Baked"}</small>
                      <strong className="positive">+{inboundTotal.toLocaleString()}</strong>
                      <span>Total inbound</span>
                    </div>
                  </div>
                </section>

                <section className="batch-detail-section">
                  <span className="section-subhead">Movement Timeline</span>
                  {itemMovements.length === 0 ? (
                    <p className="quiet-state small">No movements recorded yet for this item.</p>
                  ) : (
                    <div className="stock-movements-list">
                      {itemMovements.map((m) => {
                        const info = getMovementInfo(m);
                        return (
                          <article key={m.id} className="stock-movement-item">
                            <div className="movement-left">
                              <strong>{info.label}</strong>
                              <small>
                                {formatBatchTime(m.occurred_at)}
                                {m.note ? ` · “${m.note}”` : ""}
                              </small>
                            </div>
                            <div className="movement-right">
                              <span className={`movement-delta-pill ${info.cls}`}>
                                {info.sign}{info.delta.toLocaleString()} {info.unit}
                              </span>
                              {Number(m.unit_cost_mmk) > 0 && (
                                <small className="movement-cost-sub">
                                  {money(Math.round(Number(m.unit_cost_mmk) * info.delta))}
                                </small>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              <footer className="drawer-footer">
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => {
                    setSelectedId(null);
                    if (isRaw) onPurchase();
                    else onBake();
                  }}
                >
                  <Icon name="plus" size={16} />
                  <span>{isRaw ? `Purchase ${name}` : `Record bake for ${name}`}</span>
                </button>
                <button
                  type="button"
                  className="outline-button continue-shopping-btn"
                  onClick={() => {
                    setSelectedId(null);
                    onAdjust();
                  }}
                >
                  Count / adjust balance
                </button>
              </footer>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function RecipeBuilder({
  products,
  ingredients,
  recipes,
  movements = [],
  token,
  backLabel,
  onBack,
  onCatalog,
  onBake,
  onSaved,
}: {
  products: Product[];
  ingredients: Ingredient[];
  recipes: Recipe[];
  movements?: StockMovement[];
  token: string;
  backLabel?: string;
  onBack?: () => void;
  onCatalog: () => void;
  onBake?: (productId?: string) => void;
  onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"list" | "edit">("list");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "configured" | "missing">("all");
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || "");
  const [selectedDrawerProduct, setSelectedDrawerProduct] = useState<Product | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [expectedYield, setExpectedYield] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Map latest ingredient unit costs from movements
  const ingredientUnitCosts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of movements) {
      if (m.ingredient_id && Number(m.unit_cost_mmk) > 0 && !map[m.ingredient_id]) {
        map[m.ingredient_id] = Number(m.unit_cost_mmk);
      }
    }
    return map;
  }, [movements]);

  // Financial helper for a recipe
  const getRecipeFinancials = useCallback(
    (recipe?: Recipe, productPrice = 0) => {
      if (!recipe) return { totalBatchCost: 0, costPerPiece: 0, marginPct: 0 };
      let total = 0;
      for (const item of recipe.items) {
        const uCost = ingredientUnitCosts[item.ingredientId] || 0;
        total += item.quantity * uCost;
      }
      const y = recipe.expectedYield > 0 ? recipe.expectedYield : 1;
      const costPerPiece = Math.round(total / y);
      const marginPct =
        productPrice > 0 ? Math.round(((productPrice - costPerPiece) / productPrice) * 100) : 0;
      return { totalBatchCost: Math.round(total), costPerPiece, marginPct };
    },
    [ingredientUnitCosts]
  );

  // Open editor for a specific product
  function openEditor(prodId: string) {
    const prod = products.find((p) => p.id === prodId) || products[0];
    const saved = recipes.find((r) => r.productId === prod?.id);
    setSelectedProductId(prod?.id || "");
    setName(saved?.name || `${prod?.name || "Product"} recipe`);
    setExpectedYield(saved ? String(saved.expectedYield) : "");
    setAmounts(
      Object.fromEntries((saved?.items || []).map((item) => [item.ingredientId, String(item.quantity)]))
    );
    setError("");
    setSelectedDrawerProduct(null);
    setMode("edit");
  }

  function chooseProduct(id: string) {
    const saved = recipes.find((item) => item.productId === id);
    const selected = products.find((item) => item.id === id);
    setSelectedProductId(id);
    setName(saved?.name || `${selected?.name || "Product"} recipe`);
    setExpectedYield(saved ? String(saved.expectedYield) : "");
    setAmounts(
      Object.fromEntries((saved?.items || []).map((item) => [item.ingredientId, String(item.quantity)]))
    );
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const items = ingredients
      .filter((item) => Number(amounts[item.id]) > 0)
      .map((item) => ({ ingredientId: item.id, quantity: Number(amounts[item.id]) }));

    if (!items.length) {
      setError("Add at least one ingredient amount.");
      return;
    }

    setBusy(true);
    setError("");
    const product = products.find((p) => p.id === selectedProductId);

    try {
      await apiRequest("/api/recipes", token, {
        method: "POST",
        body: JSON.stringify({
          productId: selectedProductId,
          name: name || `${product?.name} recipe`,
          expectedYield: Number(expectedYield),
          items,
        }),
      });
      await onSaved();
      setMode("list");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save recipe");
    } finally {
      setBusy(false);
    }
  }

  // Live calculation in editor
  const editProduct = products.find((p) => p.id === selectedProductId);
  const currentSavedRecipe = recipes.find((item) => item.productId === selectedProductId);
  const liveTotalBatchCost = useMemo(() => {
    let sum = 0;
    for (const [ingId, qtyStr] of Object.entries(amounts)) {
      const q = Number(qtyStr) || 0;
      const u = ingredientUnitCosts[ingId] || 0;
      sum += q * u;
    }
    return sum;
  }, [amounts, ingredientUnitCosts]);

  const liveExpectedYieldNum = Number(expectedYield) || 0;
  const liveCostPerPiece =
    liveExpectedYieldNum > 0 ? Math.round(liveTotalBatchCost / liveExpectedYieldNum) : 0;
  const liveMarginPct =
    editProduct && editProduct.price > 0 && liveCostPerPiece > 0
      ? Math.round(((editProduct.price - liveCostPerPiece) / editProduct.price) * 100)
      : 0;

  // KPIs
  const configuredCount = useMemo(
    () => products.filter((p) => recipes.some((r) => r.productId === p.id)).length,
    [products, recipes]
  );
  const missingCount = products.length - configuredCount;

  const averageMargin = useMemo(() => {
    let totalMargin = 0;
    let count = 0;
    for (const prod of products) {
      const rec = recipes.find((r) => r.productId === prod.id);
      if (rec) {
        const { marginPct } = getRecipeFinancials(rec, prod.price);
        if (marginPct > 0) {
          totalMargin += marginPct;
          count++;
        }
      }
    }
    return count > 0 ? Math.round(totalMargin / count) : 0;
  }, [products, recipes, getRecipeFinancials]);

  // Filtered list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const hasRecipe = recipes.some((r) => r.productId === p.id);
      if (filter === "configured" && !hasRecipe) return false;
      if (filter === "missing" && hasRecipe) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [products, recipes, filter, search]);

  if (!products.length || !ingredients.length) {
    return (
      <div className="page">
        <PageHeading
          eyebrow="Production setup"
          title="Recipe blueprints"
          onBack={onBack}
          backLabel={backLabel}
          action={
            onBack ? (
              <button type="button" className="text-button" onClick={onBack}>
                Back
              </button>
            ) : undefined
          }
        />
        <EmptyState
          title="Catalog setup needed"
          detail="Recipes connect finished products to their raw materials. Add both in the catalog first."
          action="Open catalog"
          onAction={onCatalog}
        />
      </div>
    );
  }

  // --- EDIT / CREATE VIEW ---
  if (mode === "edit") {
    return (
      <form className="page" onSubmit={submit}>
        <PageHeading
          eyebrow="Production setup"
          title={currentSavedRecipe ? "Edit blueprint" : "New blueprint"}
          onBack={() => setMode("list")}
          backLabel="Back to Blueprints"
          action={
            <button type="button" className="text-button" onClick={() => setMode("list")}>
              Cancel
            </button>
          }
        />

        <section className="form-card">
          <label>
            Finished product
            <select
              value={selectedProductId}
              onChange={(event) => chooseProduct(event.target.value)}
            >
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.emoji} {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Recipe name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={currentSavedRecipe?.name || `${editProduct?.name || "Product"} recipe`}
              required
            />
          </label>

          <label>
            Expected good products per batch
            <input
              type="number"
              min="0.01"
              step="any"
              inputMode="decimal"
              value={expectedYield}
              onChange={(event) => setExpectedYield(event.target.value)}
              placeholder="e.g. 20"
              required
            />
          </label>

          {currentSavedRecipe && (
            <div className="calculation-note">
              <span>Current version</span>
              <strong>Version {currentSavedRecipe.version} · saving creates a new version</strong>
            </div>
          )}

          {liveCostPerPiece > 0 && editProduct && (
            <div className="batch-cost-card" style={{ background: "var(--cream)" }}>
              <div className="batch-cost-row">
                <span>Estimated batch cost</span>
                <strong>{money(liveTotalBatchCost)}</strong>
              </div>
              <div className="batch-cost-row highlight">
                <span>Cost per piece ({expectedYield} pcs)</span>
                <strong className="unit-cost-val">{money(liveCostPerPiece)} / pc</strong>
              </div>
              {editProduct.price > 0 && (
                <div className="batch-cost-row sub">
                  <span>Selling price: {money(editProduct.price)}</span>
                  <span className="margin-tag">
                    {liveMarginPct}% expected gross margin
                  </span>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="recipe-card">
          <div className="section-title">
            <h2>Standard amounts per batch</h2>
            <span>Base units</span>
          </div>

          {ingredients.map((item) => {
            const unitCost = ingredientUnitCosts[item.id] || 0;

            return (
              <label className="ingredient-input" key={item.id}>
                <span>
                  {item.name}
                  <small>
                    Measured in {item.unit}
                    {unitCost > 0 && (
                      <> · ~{unitCost.toLocaleString(undefined, { maximumFractionDigits: 1 })} K/{item.unit}</>
                    )}
                  </small>
                </span>
                <span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder="0"
                    value={amounts[item.id] || ""}
                    onChange={(event) =>
                      setAmounts((val) => ({ ...val, [item.id]: event.target.value }))
                    }
                  />
                  <em>{item.unit}</em>
                </span>
              </label>
            );
          })}
        </section>

        {error && <p className="form-error">{error}</p>}

        <button className="primary-action" disabled={busy || !expectedYield}>
          {busy
            ? "Saving blueprint…"
            : currentSavedRecipe
            ? `Save new version (v${currentSavedRecipe.version + 1})`
            : "Save recipe blueprint"}
          <Icon name="arrow" size={18} />
        </button>
      </form>
    );
  }

  // --- LIST-FIRST VIEW ---
  return (
    <div className="page">
      <PageHeading
        eyebrow="Production setup"
        title="Recipe blueprints"
        onBack={onBack}
        backLabel={backLabel || "Back to More"}
        action={
          <button
            type="button"
            className="primary-action header-cta-btn"
            onClick={() => {
              const missing = products.find((p) => !recipes.some((r) => r.productId === p.id));
              openEditor(missing?.id || products[0]?.id || "");
            }}
          >
            <Icon name="plus" size={16} />
            <span>Create Blueprint</span>
          </button>
        }
      />

      <section className="batch-stats-grid">
        <div className="batch-stat-card">
          <small>Configured</small>
          <strong>
            {configuredCount} / {products.length}
          </strong>
          <span>Ready to bake</span>
        </div>
        <div className="batch-stat-card">
          <small>Needs Blueprint</small>
          <strong style={{ color: missingCount > 0 ? "#a5452f" : "var(--ink)" }}>
            {missingCount}
          </strong>
          <span>{missingCount > 0 ? "Baking blocked" : "All products ready"}</span>
        </div>
        <div className="batch-stat-card">
          <small>Avg Margin</small>
          <strong>{averageMargin > 0 ? `${averageMargin}%` : "—"}</strong>
          <span>Gross margin</span>
        </div>
      </section>

      <div className="search-box">
        <span>⌕</span>
        <input
          aria-label="Search recipes"
          placeholder="Search products by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            type="button"
            className="clear-search-btn"
            aria-label="Clear search"
            onClick={() => setSearch("")}
          >
            ×
          </button>
        )}
      </div>

      <div className="stock-subtabs">
        <button
          type="button"
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          All ({products.length})
        </button>
        <button
          type="button"
          className={filter === "configured" ? "active" : ""}
          onClick={() => setFilter("configured")}
        >
          Configured ({configuredCount})
        </button>
        <button
          type="button"
          className={filter === "missing" ? "active" : ""}
          onClick={() => setFilter("missing")}
        >
          Needs Blueprint ({missingCount})
        </button>
      </div>

      {filteredProducts.length === 0 ? (
        <EmptyState
          title={search ? "No matching recipes" : "No recipes in this view"}
          detail={search ? "Try searching for another product name." : "Select another filter to view products."}
          action="Show all products"
          onAction={() => {
            setSearch("");
            setFilter("all");
          }}
        />
      ) : (
        <section className="batch-list">
          {filteredProducts.map((product) => {
            const recipe = recipes.find((r) => r.productId === product.id);
            const financials = getRecipeFinancials(recipe, product.price);

            return (
              <article
                key={product.id}
                className="batch-item"
                onClick={() => {
                  if (recipe) {
                    setSelectedDrawerProduct(product);
                  } else {
                    openEditor(product.id);
                  }
                }}
              >
                <div className="batch-item-left">
                  <span className="batch-emoji" aria-hidden="true">
                    {product.emoji}
                  </span>
                  <div className="batch-item-info">
                    <strong>{product.name}</strong>
                    {recipe ? (
                      <small>
                        Expected {recipe.expectedYield} pcs · v{recipe.version} · {recipe.items.length} ingredients
                      </small>
                    ) : (
                      <small style={{ color: "#a5452f", fontWeight: 700 }}>
                        ⚠️ Missing recipe · Tap to setup
                      </small>
                    )}
                  </div>
                </div>

                <div className="batch-item-right">
                  {recipe ? (
                    <div style={{ textAlign: "right", display: "grid", gap: "2px" }}>
                      {financials.costPerPiece > 0 ? (
                        <>
                          <strong style={{ fontFamily: "Georgia, serif", fontSize: "14px" }}>
                            ~{money(financials.costPerPiece)} / pc
                          </strong>
                          {financials.marginPct > 0 && (
                            <span className="margin-tag">{financials.marginPct}% margin</span>
                          )}
                        </>
                      ) : (
                        <strong style={{ fontFamily: "Georgia, serif", fontSize: "14px" }}>
                          {money(product.price)}
                        </strong>
                      )}
                    </div>
                  ) : (
                    <span className="batch-yield-pill waste">+ Setup</span>
                  )}
                  <span className="batch-arrow-icon">›</span>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* Recipe Detail Drawer (Baker's View) */}
      {selectedDrawerProduct && (() => {
        const recipe = recipes.find((r) => r.productId === selectedDrawerProduct.id);
        if (!recipe) return null;
        const financials = getRecipeFinancials(recipe, selectedDrawerProduct.price);

        return (
          <div
            className="cart-overlay"
            onClick={() => setSelectedDrawerProduct(null)}
          >
            <div
              className="cart-drawer"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={`${selectedDrawerProduct.name} recipe formula`}
            >
              <header className="drawer-header">
                <div className="batch-detail-header-left">
                  <span className="batch-detail-emoji" aria-hidden="true">
                    {selectedDrawerProduct.emoji}
                  </span>
                  <div>
                    <h2>{selectedDrawerProduct.name}</h2>
                    <span>
                      {recipe.name} · Version {recipe.version}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="drawer-close-btn"
                  aria-label="Close formula"
                  onClick={() => setSelectedDrawerProduct(null)}
                >
                  ✕
                </button>
              </header>

              <div className="drawer-body batch-detail-body">
                {/* Yield & Cost Overview */}
                <section className="batch-detail-section">
                  <span className="section-subhead">Standard Output & Yield</span>
                  <div className="batch-detail-metrics-grid">
                    <div className="batch-metric-box">
                      <small>Expected Yield</small>
                      <strong className="positive">{recipe.expectedYield} pcs</strong>
                      <span>Per standard batch</span>
                    </div>
                    <div className="batch-metric-box">
                      <small>Est. Unit Cost</small>
                      <strong style={{ color: "var(--coral)" }}>
                        {financials.costPerPiece > 0 ? money(financials.costPerPiece) : "—"}
                      </strong>
                      <span>Per piece</span>
                    </div>
                    <div className="batch-metric-box">
                      <small>Est. Margin</small>
                      <strong className="positive">
                        {financials.marginPct > 0 ? `${financials.marginPct}%` : "—"}
                      </strong>
                      <span>Selling at {money(selectedDrawerProduct.price)}</span>
                    </div>
                  </div>
                </section>

                {/* Financial Cost Card */}
                {financials.totalBatchCost > 0 && (
                  <section className="batch-detail-section">
                    <span className="section-subhead">Cost Breakdown</span>
                    <div className="batch-cost-card">
                      <div className="batch-cost-row">
                        <span>Total ingredient cost per batch</span>
                        <strong>{money(financials.totalBatchCost)}</strong>
                      </div>
                      <div className="batch-cost-row highlight">
                        <span>Cost per good piece</span>
                        <strong className="unit-cost-val">{money(financials.costPerPiece)} / pc</strong>
                      </div>
                      {selectedDrawerProduct.price > 0 && (
                        <div className="batch-cost-row sub">
                          <span>Selling price: {money(selectedDrawerProduct.price)}</span>
                          <span className="margin-tag">
                            Profit: {money(selectedDrawerProduct.price - financials.costPerPiece)} ({financials.marginPct}%)
                          </span>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* Standard Ingredients Formula */}
                <section className="batch-detail-section">
                  <span className="section-subhead">Standard Ingredients Formula (1 Batch)</span>
                  <div className="batch-ingredients-table">
                    {recipe.items.map((item) => {
                      const ing = ingredients.find((i) => i.id === item.ingredientId);
                      const ingName = ing?.name || "Raw material";
                      const ingUnit = ing?.unit || "units";
                      const uCost = ingredientUnitCosts[item.ingredientId] || 0;
                      const lineCost = item.quantity * uCost;

                      return (
                        <div className="batch-ingredient-row" key={item.ingredientId}>
                          <div className="batch-ing-info">
                            <strong>{ingName}</strong>
                            <small>
                              {item.quantity.toLocaleString()} {ingUnit}
                              {uCost > 0 && ` · ~${uCost.toLocaleString(undefined, { maximumFractionDigits: 1 })} K/${ingUnit}`}
                            </small>
                          </div>
                          {lineCost > 0 && (
                            <div className="batch-ing-cost">
                              <strong>{money(Math.round(lineCost))}</strong>
                              <small>per batch</small>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>

              <footer className="drawer-footer">
                {onBake && (
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => {
                      setSelectedDrawerProduct(null);
                      onBake(selectedDrawerProduct.id);
                    }}
                  >
                    <span>Bake {selectedDrawerProduct.name} now</span>
                    <Icon name="arrow" size={18} />
                  </button>
                )}
                <button
                  type="button"
                  className="outline-button continue-shopping-btn"
                  onClick={() => openEditor(selectedDrawerProduct.id)}
                >
                  Edit recipe blueprint (v{recipe.version})
                </button>
              </footer>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function StockAdjustment({ initialTab, ingredients, finished, token, backLabel, onCancel, onSaved }: { initialTab: StockTab; ingredients: Ingredient[]; finished: FinishedStock[]; token: string; backLabel?: string; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [tab, setTab] = useState(initialTab); const [itemId, setItemId] = useState(""); const [target, setTarget] = useState(""); const [unitCost, setUnitCost] = useState(""); const [note, setNote] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const rows = tab === "raw" ? ingredients : finished; const selectedId = itemId || rows[0]?.id || ""; const selected = rows.find((item) => item.id === selectedId); const unit = tab === "raw" ? (selected as Ingredient | undefined)?.unit : "pcs"; const increase = Number(target) > (selected?.quantity || 0);
  function changeTab(next: StockTab) { setTab(next); setItemId(""); setTarget(""); setUnitCost(""); setError(""); }
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await apiRequest("/api/adjustments", token, { method: "POST", body: JSON.stringify({ itemType: tab, itemId: selectedId, targetQuantity: Number(target), unitCostMmk: increase ? unitCost : "", note }) }); await onSaved(); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Could not save stock count"); } finally { setBusy(false); } }
  return <form className="page" onSubmit={submit}><PageHeading eyebrow="Inventory correction" title="Count actual stock" onBack={onCancel} backLabel={backLabel || "Back to Stock"} action={<button type="button" className="text-button" onClick={onCancel}>Cancel</button>}/><div className="danger-banner neutral-banner"><Icon name="alert"/><div><strong>Use this only after physically counting stock</strong><span>Normal raw stock comes from purchases; normal finished stock comes from baking. This records the difference as an adjustment.</span></div></div><div className="tabs"><button type="button" className={tab === "raw" ? "active" : ""} onClick={() => changeTab("raw")}>Raw materials</button><button type="button" className={tab === "finished" ? "active" : ""} onClick={() => changeTab("finished")}>Finished goods</button></div>{rows.length ? <><section className="form-card"><label>Item<select value={selectedId} onChange={(event) => { setItemId(event.target.value); setTarget(""); }}>{rows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="calculation-note"><span>Recorded stock</span><strong>{selected?.quantity.toLocaleString()} {unit}</strong></div><label>Actual counted quantity ({unit})<input type="number" min="0" step="any" inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} required/></label>{increase && <label>Cost per {unit} <small>Optional; useful for opening stock</small><input type="number" min="0" step="any" inputMode="decimal" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} placeholder="0"/></label>}<label>Reason for adjustment<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Opening stock, physical count, spoilage…" required/></label></section>{error && <p className="form-error">{error}</p>}<button className="primary-action" disabled={busy || target === "" || !note.trim()}>{busy ? "Saving count…" : "Save stock count"}<Icon name="arrow" size={18}/></button></> : <EmptyState title="No items to count" detail="Add items to the catalog first." action="Go back" onAction={onCancel}/>}</form>;
}

function Purchase({
  ingredients,
  token,
  backLabel,
  onCancel,
  onBack,
  onSaved,
}: {
  ingredients: Ingredient[];
  token: string;
  backLabel?: string;
  onCancel?: () => void;
  onBack?: () => void;
  onSaved: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const handleBack = onBack || onCancel;
  const [mode, setMode] = useState<"list" | "create">("list");
  const { data: purchases = [], isLoading: loading } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const res = await apiRequest<{ purchases: PurchaseRecord[] }>("/api/purchases", token);
      return res.purchases || [];
    },
  });
  const [search, setSearch] = useState("");
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseRecord | null>(null);

  // Reversal state
  const [reversing, setReversing] = useState(false);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalBusy, setReversalBusy] = useState(false);
  const [reversalError, setReversalError] = useState("");

  // Create form state
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id || "");
  const [quantity, setQuantity] = useState("");
  const [totalPaid, setTotalPaid] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(getLocalDate());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedIngredientId = ingredientId || ingredients[0]?.id || "";
  const selectedIngredient = ingredients.find((item) => item.id === selectedIngredientId);
  const calculatedUnitCost =
    Number(quantity) > 0 && Number(totalPaid) > 0 ? Number(totalPaid) / Number(quantity) : 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/purchases", token, {
        method: "POST",
        body: JSON.stringify({
          ingredientId: selectedIngredientId,
          quantity: Number(quantity),
          totalAmountMmk: Number(totalPaid),
          supplierName: supplierName.trim() || undefined,
          purchaseDate,
          note: note.trim() || undefined,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["purchases"] });
      await onSaved();
      setQuantity("");
      setTotalPaid("");
      setSupplierName("");
      setNote("");
      setMode("list");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save purchase");
    } finally {
      setBusy(false);
    }
  }

  async function handleReversePurchase() {
    if (!selectedPurchase || !reversalReason.trim()) return;
    setReversalBusy(true);
    setReversalError("");
    try {
      await apiRequest("/api/history", token, {
        method: "POST",
        body: JSON.stringify({
          type: "purchase",
          id: selectedPurchase.id,
          note: reversalReason.trim(),
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["purchases"] });
      await onSaved();
      setSelectedPurchase(null);
      setReversing(false);
      setReversalReason("");
    } catch (err) {
      setReversalError(err instanceof Error ? err.message : "Could not reverse purchase");
    } finally {
      setReversalBusy(false);
    }
  }

  // KPIs
  const activePurchases = useMemo(() => purchases.filter((p) => !p.reversed_at), [purchases]);
  const totalSpend = useMemo(
    () => activePurchases.reduce((sum, p) => sum + (Number(p.total_amount_mmk) || 0), 0),
    [activePurchases]
  );
  const thisMonthPurchases = useMemo(
    () => activePurchases.filter((p) => isThisMonth(p.purchase_date)),
    [activePurchases]
  );
  const thisMonthSpend = useMemo(
    () => thisMonthPurchases.reduce((sum, p) => sum + (Number(p.total_amount_mmk) || 0), 0),
    [thisMonthPurchases]
  );
  const uniqueSuppliersCount = useMemo(() => {
    const set = new Set(
      activePurchases.map((p) => p.supplier_name?.trim()).filter((s): s is string => Boolean(s))
    );
    return set.size;
  }, [activePurchases]);

  // Filtered list
  const filteredPurchases = useMemo(() => {
    if (!search.trim()) return purchases;
    const q = search.toLowerCase();
    return purchases.filter((p) => {
      const ingName = p.purchase_items?.[0]?.ingredients?.name || "";
      const supName = p.supplier_name || "";
      const noteText = p.note || "";
      return (
        ingName.toLowerCase().includes(q) ||
        supName.toLowerCase().includes(q) ||
        noteText.toLowerCase().includes(q)
      );
    });
  }, [purchases, search]);

  if (mode === "create") {
    return (
      <form className="page" onSubmit={submit}>
        <PageHeading
          eyebrow="Raw materials"
          title="Record purchase"
          onBack={() => setMode("list")}
          backLabel="Back to Purchases"
          action={
            <button
              type="button"
              className="text-button"
              onClick={() => setMode("list")}
            >
              Cancel
            </button>
          }
        />
        {ingredients.length === 0 ? (
          <EmptyState
            title="No raw materials"
            detail="Add ingredients in the catalog before recording purchases."
            action="Go back"
            onAction={() => setMode("list")}
          />
        ) : (
          <>
            <section className="form-card">
              <label>
                Raw material
                <select
                  value={selectedIngredientId}
                  onChange={(event) => setIngredientId(event.target.value)}
                  required
                >
                  {ingredients.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name} ({item.unit})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity purchased ({selectedIngredient?.unit || "base unit"})
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  placeholder="25000"
                  required
                />
              </label>
              <label>
                Total amount paid (MMK)
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={totalPaid}
                  onChange={(event) => setTotalPaid(event.target.value)}
                  placeholder="62500"
                  required
                />
              </label>
              {calculatedUnitCost > 0 && (
                <div className="calculation-note">
                  <span>Calculated unit cost</span>
                  <strong>
                    {calculatedUnitCost.toLocaleString(undefined, { maximumFractionDigits: 2 })} MMK /{" "}
                    {selectedIngredient?.unit}
                  </strong>
                </div>
              )}
              <label>
                Supplier name <small>Optional</small>
                <input
                  value={supplierName}
                  onChange={(event) => setSupplierName(event.target.value)}
                  placeholder="Shop or person name"
                />
              </label>
              <label>
                Purchase date
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(event) => setPurchaseDate(event.target.value)}
                  required
                />
              </label>
              <label>
                Note <small>Optional</small>
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Anything useful to remember"
                />
              </label>
            </section>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-action" disabled={busy || !quantity || !totalPaid}>
              {busy ? "Saving purchase…" : "Save purchase"}
              <Icon name="arrow" size={18} />
            </button>
          </>
        )}
      </form>
    );
  }

  return (
    <div className="page">
      <PageHeading
        eyebrow="Raw materials"
        title="Purchases"
        onBack={handleBack}
        backLabel={backLabel || "Back to Stock"}
        action={
          <button
            type="button"
            className="primary-action header-cta-btn"
            onClick={() => {
              setIngredientId(ingredients[0]?.id || "");
              setQuantity("");
              setTotalPaid("");
              setSupplierName("");
              setPurchaseDate(getLocalDate());
              setNote("");
              setError("");
              setMode("create");
            }}
          >
            <Icon name="plus" size={16} />
            <span>Record Purchase</span>
          </button>
        }
      />

      <section className="batch-stats-grid">
        <div className="batch-stat-card">
          <small>Total Spend</small>
          <strong>{money(totalSpend)}</strong>
          <span>{activePurchases.length} purchases</span>
        </div>
        <div className="batch-stat-card">
          <small>This Month</small>
          <strong>{money(thisMonthSpend)}</strong>
          <span>{thisMonthPurchases.length} recorded</span>
        </div>
        <div className="batch-stat-card">
          <small>Suppliers</small>
          <strong>{uniqueSuppliersCount}</strong>
          <span>Active sources</span>
        </div>
      </section>

      <div className="search-box">
        <span>⌕</span>
        <input
          aria-label="Search purchases"
          placeholder="Search by material, supplier, or note…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {search && (
          <button
            type="button"
            className="clear-search-btn"
            aria-label="Clear search"
            onClick={() => setSearch("")}
          >
            ×
          </button>
        )}
      </div>

      {loading ? (
        <div className="report-loading">Loading purchases…</div>
      ) : filteredPurchases.length === 0 ? (
        <EmptyState
          title={search ? "No matching purchases" : "No purchases recorded"}
          detail={
            search
              ? "Try searching for a different keyword or supplier name."
              : "Record ingredient and raw material purchases to track costs and inventory."
          }
          action="Record first purchase"
          onAction={() => {
            setSearch("");
            setMode("create");
          }}
        />
      ) : (
        <section className="batch-list">
          {filteredPurchases.map((purchase) => {
            const firstItem = purchase.purchase_items?.[0];
            const ingName = firstItem?.ingredients?.name || "Raw material";
            const unit = firstItem?.ingredients?.base_unit || "";
            const qty = Number(firstItem?.quantity) || 0;
            const unitCost =
              firstItem?.unit_cost_mmk ||
              (qty > 0 ? Number(purchase.total_amount_mmk) / qty : 0);

            return (
              <article
                key={purchase.id}
                className={`batch-item ${purchase.reversed_at ? "reversed" : ""}`}
                onClick={() => {
                  setSelectedPurchase(purchase);
                  setReversing(false);
                  setReversalReason("");
                  setReversalError("");
                }}
              >
                <div className="batch-item-left">
                  <span className="batch-emoji" aria-hidden="true">
                    🌾
                  </span>
                  <div className="batch-item-info">
                    <strong>{ingName}</strong>
                    <small>
                      {qty.toLocaleString()} {unit} · {formatRecordDate(purchase.purchase_date)}
                      {purchase.supplier_name ? ` · ${purchase.supplier_name}` : ""}
                    </small>
                  </div>
                </div>

                <div className="batch-item-right">
                  <div style={{ textAlign: "right", display: "grid", gap: "2px" }}>
                    <strong style={{ fontFamily: "Georgia, serif", fontSize: "14px" }}>
                      {money(Number(purchase.total_amount_mmk))}
                    </strong>
                    {unitCost > 0 && (
                      <span style={{ fontSize: "10px", color: "var(--muted)" }}>
                        {unitCost.toLocaleString(undefined, { maximumFractionDigits: 1 })} K / {unit}
                      </span>
                    )}
                  </div>
                  {purchase.reversed_at ? (
                    <span className="reversed-badge">Reversed</span>
                  ) : (
                    <span className="batch-arrow-icon">›</span>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* Purchase Detail & Reversal Drawer */}
      {selectedPurchase && (
        <div
          className="cart-overlay"
          onClick={() => {
            if (!reversalBusy) setSelectedPurchase(null);
          }}
        >
          <div
            className="cart-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Purchase details"
          >
            <header className="drawer-header">
              <div>
                <h2>Purchase Details</h2>
                <span>
                  {formatRecordDate(selectedPurchase.purchase_date)}
                </span>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                aria-label="Close details"
                onClick={() => setSelectedPurchase(null)}
              >
                ✕
              </button>
            </header>

            <div className="drawer-body batch-detail-body">
              {(() => {
                const item = selectedPurchase.purchase_items?.[0];
                const ingName = item?.ingredients?.name || "Raw material";
                const unit = item?.ingredients?.base_unit || "";
                const qty = Number(item?.quantity) || 0;
                const unitCost =
                  item?.unit_cost_mmk ||
                  (qty > 0 ? Number(selectedPurchase.total_amount_mmk) / qty : 0);

                return (
                  <>
                    <div className="batch-detail-header-left">
                      <span className="batch-detail-emoji" aria-hidden="true">
                        🌾
                      </span>
                      <div>
                        <strong style={{ fontSize: "16px", color: "var(--ink)" }}>{ingName}</strong>
                        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>
                          {qty.toLocaleString()} {unit} purchased
                        </div>
                      </div>
                    </div>

                    <div className="batch-detail-metrics-grid">
                      <div className="batch-metric-box">
                        <small>Total Paid</small>
                        <strong style={{ color: "var(--coral)" }}>
                          {money(Number(selectedPurchase.total_amount_mmk))}
                        </strong>
                        <span>MMK</span>
                      </div>
                      <div className="batch-metric-box">
                        <small>Quantity</small>
                        <strong>{qty.toLocaleString()}</strong>
                        <span>{unit}</span>
                      </div>
                      <div className="batch-metric-box">
                        <small>Unit Cost</small>
                        <strong className="positive">
                          {unitCost.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                        </strong>
                        <span>K / {unit}</span>
                      </div>
                    </div>

                    <div className="batch-cost-card">
                      <div className="batch-cost-row">
                        <span>Supplier</span>
                        <strong>{selectedPurchase.supplier_name || "Not specified"}</strong>
                      </div>
                      <div className="batch-cost-row">
                        <span>Purchase Date</span>
                        <strong>{formatRecordDate(selectedPurchase.purchase_date)}</strong>
                      </div>
                      {selectedPurchase.note && (
                        <div className="batch-cost-row" style={{ alignItems: "flex-start" }}>
                          <span>Note</span>
                          <strong style={{ maxWidth: "200px", textAlign: "right" }}>
                            {selectedPurchase.note}
                          </strong>
                        </div>
                      )}
                      <div className="batch-cost-row highlight">
                        <span>Status</span>
                        {selectedPurchase.reversed_at ? (
                          <span className="reversed-badge">Reversed</span>
                        ) : (
                          <span className="badge-pill-success">Active Stock Entry</span>
                        )}
                      </div>
                    </div>

                    {selectedPurchase.reversed_at && (
                      <div className="batch-note-box" style={{ background: "#fae1d8", color: "#963d29" }}>
                        <strong>Transaction Reversed</strong>
                        <p style={{ margin: "4px 0 0", fontSize: "11px" }}>
                          {selectedPurchase.reversal_note
                            ? `Reason: “${selectedPurchase.reversal_note}”`
                            : "Reversed via accounting correction."}
                        </p>
                      </div>
                    )}

                    {!selectedPurchase.reversed_at && (
                      <div style={{ marginTop: "8px" }}>
                        {!reversing ? (
                          <button
                            type="button"
                            className="text-button batch-reverse-trigger"
                            onClick={() => setReversing(true)}
                          >
                            Need to reverse or correct this purchase?
                          </button>
                        ) : (
                          <div className="confirm-panel" style={{ margin: 0 }}>
                            <strong>Reverse this purchase?</strong>
                            <p>
                              This restores raw material inventory and cash flow balance by creating an opposite correction.
                            </p>
                            <label>
                              Reason for reversal
                              <input
                                value={reversalReason}
                                onChange={(e) => setReversalReason(e.target.value)}
                                placeholder="e.g. Wrong quantity entered, wrong ingredient selected"
                                autoFocus
                              />
                            </label>
                            {reversalError && <p className="form-error">{reversalError}</p>}
                            <div>
                              <button
                                type="button"
                                className="text-button"
                                disabled={reversalBusy}
                                onClick={() => {
                                  setReversing(false);
                                  setReversalReason("");
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="danger-action compact"
                                disabled={reversalBusy || !reversalReason.trim()}
                                onClick={() => void handleReversePurchase()}
                              >
                                {reversalBusy ? "Reversing…" : "Confirm Reversal"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <footer className="drawer-footer">
              <button
                type="button"
                className="primary-action"
                onClick={() => setSelectedPurchase(null)}
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

function Expense({
  token,
  backLabel,
  onCancel,
  onBack,
  onSaved,
}: {
  token: string;
  backLabel?: string;
  onCancel?: () => void;
  onBack?: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const queryClient = useQueryClient();
  const handleBack = onBack || onCancel;
  const [mode, setMode] = useState<"list" | "create">("list");
  const { data: expenses = [], isLoading: loading } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const res = await apiRequest<{ expenses: ExpenseRecord[] }>("/api/expenses", token);
      return res.expenses || [];
    },
  });
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRecord | null>(null);

  // Reversal states
  const [reversing, setReversing] = useState(false);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalBusy, setReversalBusy] = useState(false);
  const [reversalError, setReversalError] = useState("");

  // Create form states
  const [category, setCategory] = useState("packaging");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(getLocalDate());
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/expenses", token, {
        method: "POST",
        body: JSON.stringify({
          category,
          amountMmk: Number(amount),
          expenseDate,
          description: description.trim() || undefined,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      await onSaved();
      setAmount("");
      setDescription("");
      setMode("list");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save expense");
    } finally {
      setBusy(false);
    }
  }

  async function handleReverseExpense() {
    if (!selectedExpense || !reversalReason.trim()) return;
    setReversalBusy(true);
    setReversalError("");
    try {
      await apiRequest("/api/history", token, {
        method: "POST",
        body: JSON.stringify({
          type: "expense",
          id: selectedExpense.id,
          note: reversalReason.trim(),
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      await onSaved();
      setSelectedExpense(null);
      setReversing(false);
      setReversalReason("");
    } catch (err) {
      setReversalError(err instanceof Error ? err.message : "Could not reverse expense");
    } finally {
      setReversalBusy(false);
    }
  }

  // KPIs
  const activeExpenses = useMemo(() => expenses.filter((e) => !e.reversed_at), [expenses]);
  const totalSpend = useMemo(
    () => activeExpenses.reduce((sum, e) => sum + (Number(e.amount_mmk) || 0), 0),
    [activeExpenses]
  );
  const thisMonthExpenses = useMemo(
    () => activeExpenses.filter((e) => isThisMonth(e.expense_date)),
    [activeExpenses]
  );
  const thisMonthSpend = useMemo(
    () => thisMonthExpenses.reduce((sum, e) => sum + (Number(e.amount_mmk) || 0), 0),
    [thisMonthExpenses]
  );
  const topCategoryLabel = useMemo(() => {
    if (!thisMonthExpenses.length) return "None";
    const totalsByCategory: Record<string, number> = {};
    for (const e of thisMonthExpenses) {
      totalsByCategory[e.category] = (totalsByCategory[e.category] || 0) + Number(e.amount_mmk);
    }
    const sorted = Object.entries(totalsByCategory).sort((a, b) => b[1] - a[1]);
    const topKey = sorted[0]?.[0];
    const catObj = EXPENSE_CATEGORIES.find((c) => c.id === topKey);
    return catObj ? catObj.label : topKey || "None";
  }, [thisMonthExpenses]);

  // Filtered list
  const filteredExpenses = useMemo(() => {
    if (categoryFilter === "all") return expenses;
    return expenses.filter((e) => e.category === categoryFilter);
  }, [expenses, categoryFilter]);

  if (mode === "create") {
    return (
      <form className="page" onSubmit={submit}>
        <PageHeading
          eyebrow="Financial account"
          title="Add expense"
          onBack={() => setMode("list")}
          backLabel="Back to Expenses"
          action={
            <button
              type="button"
              className="text-button"
              onClick={() => setMode("list")}
            >
              Cancel
            </button>
          }
        />
        <section className="form-card">
          <label>
            Expense category
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.emoji} {cat.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount (MMK)
            <input
              type="number"
              min="1"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="e.g. 15000"
              required
            />
          </label>
          <label>
            Expense date
            <input
              type="date"
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
              required
            />
          </label>
          <label>
            Description <small>Optional</small>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. 100 cake boxes, diesel generator, delivery fee"
            />
          </label>
        </section>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-action" disabled={busy || !amount}>
          {busy ? "Saving expense…" : "Save expense"}
          <Icon name="arrow" size={18} />
        </button>
      </form>
    );
  }

  return (
    <div className="page">
      <PageHeading
        eyebrow="Financial account"
        title="Expenses"
        onBack={handleBack}
        backLabel={backLabel || "Back to More"}
        action={
          <button
            type="button"
            className="primary-action header-cta-btn"
            onClick={() => {
              setCategory("packaging");
              setAmount("");
              setExpenseDate(getLocalDate());
              setDescription("");
              setError("");
              setMode("create");
            }}
          >
            <Icon name="plus" size={16} />
            <span>Add Expense</span>
          </button>
        }
      />

      <section className="batch-stats-grid">
        <div className="batch-stat-card">
          <small>Total Expenses</small>
          <strong>{money(totalSpend)}</strong>
          <span>{activeExpenses.length} entries</span>
        </div>
        <div className="batch-stat-card">
          <small>This Month</small>
          <strong>{money(thisMonthSpend)}</strong>
          <span>{thisMonthExpenses.length} recorded</span>
        </div>
        <div className="batch-stat-card">
          <small>Top Category</small>
          <strong style={{ fontSize: "17px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {topCategoryLabel}
          </strong>
          <span>This month</span>
        </div>
      </section>

      <div className="filter-scroll">
        <button
          type="button"
          className={categoryFilter === "all" ? "active" : ""}
          onClick={() => setCategoryFilter("all")}
        >
          All
        </button>
        {EXPENSE_CATEGORIES.map((cat) => (
          <button
            type="button"
            key={cat.id}
            className={categoryFilter === cat.id ? "active" : ""}
            onClick={() => setCategoryFilter(cat.id)}
          >
            {cat.emoji} {cat.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="report-loading">Loading expenses…</div>
      ) : filteredExpenses.length === 0 ? (
        <EmptyState
          title={categoryFilter !== "all" ? "No expenses in this category" : "No expenses recorded"}
          detail={
            categoryFilter !== "all"
              ? "No expenses found for this category."
              : "Track packaging, utilities, rent, wages, and other operating costs."
          }
          action="Add first expense"
          onAction={() => {
            setCategoryFilter("all");
            setMode("create");
          }}
        />
      ) : (
        <section className="batch-list">
          {filteredExpenses.map((expense) => {
            const cat = EXPENSE_CATEGORIES.find((c) => c.id === expense.category);
            const emoji = cat?.emoji || "📝";
            const catLabel = cat?.label || expense.category;

            return (
              <article
                key={expense.id}
                className={`batch-item ${expense.reversed_at ? "reversed" : ""}`}
                onClick={() => {
                  setSelectedExpense(expense);
                  setReversing(false);
                  setReversalReason("");
                  setReversalError("");
                }}
              >
                <div className="batch-item-left">
                  <span className="batch-emoji" aria-hidden="true">
                    {emoji}
                  </span>
                  <div className="batch-item-info">
                    <strong>{expense.description || catLabel}</strong>
                    <small>
                      {catLabel} · {formatRecordDate(expense.expense_date)}
                    </small>
                  </div>
                </div>

                <div className="batch-item-right">
                  <strong style={{ fontFamily: "Georgia, serif", fontSize: "14px", color: "#a5452f" }}>
                    −{money(Number(expense.amount_mmk))}
                  </strong>
                  {expense.reversed_at ? (
                    <span className="reversed-badge">Reversed</span>
                  ) : (
                    <span className="batch-arrow-icon">›</span>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* Expense Detail & Reversal Drawer */}
      {selectedExpense && (
        <div
          className="cart-overlay"
          onClick={() => {
            if (!reversalBusy) setSelectedExpense(null);
          }}
        >
          <div
            className="cart-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Expense details"
          >
            <header className="drawer-header">
              <div>
                <h2>Expense Details</h2>
                <span>{formatRecordDate(selectedExpense.expense_date)}</span>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                aria-label="Close details"
                onClick={() => setSelectedExpense(null)}
              >
                ✕
              </button>
            </header>

            <div className="drawer-body batch-detail-body">
              {(() => {
                const cat = EXPENSE_CATEGORIES.find((c) => c.id === selectedExpense.category);
                const emoji = cat?.emoji || "📝";
                const catLabel = cat?.label || selectedExpense.category;

                return (
                  <>
                    <div className="batch-detail-header-left">
                      <span className="batch-detail-emoji" aria-hidden="true">
                        {emoji}
                      </span>
                      <div>
                        <strong style={{ fontSize: "16px", color: "var(--ink)" }}>
                          {selectedExpense.description || catLabel}
                        </strong>
                        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>
                          {catLabel}
                        </div>
                      </div>
                    </div>

                    <div className="batch-detail-metrics-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                      <div className="batch-metric-box">
                        <small>Amount</small>
                        <strong style={{ color: "#a5452f" }}>
                          {money(Number(selectedExpense.amount_mmk))}
                        </strong>
                        <span>MMK</span>
                      </div>
                      <div className="batch-metric-box">
                        <small>Category</small>
                        <strong style={{ fontSize: "16px" }}>{catLabel}</strong>
                        <span>Account</span>
                      </div>
                    </div>

                    <div className="batch-cost-card">
                      <div className="batch-cost-row">
                        <span>Date</span>
                        <strong>{formatRecordDate(selectedExpense.expense_date)}</strong>
                      </div>
                      {selectedExpense.description && (
                        <div className="batch-cost-row" style={{ alignItems: "flex-start" }}>
                          <span>Description</span>
                          <strong style={{ maxWidth: "200px", textAlign: "right" }}>
                            {selectedExpense.description}
                          </strong>
                        </div>
                      )}
                      <div className="batch-cost-row highlight">
                        <span>Status</span>
                        {selectedExpense.reversed_at ? (
                          <span className="reversed-badge">Reversed</span>
                        ) : (
                          <span className="badge-pill-success">Active Expense Entry</span>
                        )}
                      </div>
                    </div>

                    {selectedExpense.reversed_at && (
                      <div className="batch-note-box" style={{ background: "#fae1d8", color: "#963d29" }}>
                        <strong>Transaction Reversed</strong>
                        <p style={{ margin: "4px 0 0", fontSize: "11px" }}>
                          {selectedExpense.reversal_note
                            ? `Reason: “${selectedExpense.reversal_note}”`
                            : "Reversed via accounting correction."}
                        </p>
                      </div>
                    )}

                    {!selectedExpense.reversed_at && (
                      <div style={{ marginTop: "8px" }}>
                        {!reversing ? (
                          <button
                            type="button"
                            className="text-button batch-reverse-trigger"
                            onClick={() => setReversing(true)}
                          >
                            Need to reverse or correct this expense?
                          </button>
                        ) : (
                          <div className="confirm-panel" style={{ margin: 0 }}>
                            <strong>Reverse this expense?</strong>
                            <p>
                              This creates an opposite accounting entry to restore balance without destroying audit records.
                            </p>
                            <label>
                              Reason for reversal
                              <input
                                value={reversalReason}
                                onChange={(e) => setReversalReason(e.target.value)}
                                placeholder="e.g. Duplicate entry, incorrect amount"
                                autoFocus
                              />
                            </label>
                            {reversalError && <p className="form-error">{reversalError}</p>}
                            <div>
                              <button
                                type="button"
                                className="text-button"
                                disabled={reversalBusy}
                                onClick={() => {
                                  setReversing(false);
                                  setReversalReason("");
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="danger-action compact"
                                disabled={reversalBusy || !reversalReason.trim()}
                                onClick={() => void handleReverseExpense()}
                              >
                                {reversalBusy ? "Reversing…" : "Confirm Reversal"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <footer className="drawer-footer">
              <button
                type="button"
                className="primary-action"
                onClick={() => setSelectedExpense(null)}
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

function Reports({ token, backLabel, onBack }: { token: string; backLabel?: string; onBack?: () => void }) {
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");
  const { data: report, isLoading, error: reportError } = useQuery({
    queryKey: ["reports", period],
    queryFn: () => apiRequest<ReportData>(`/api/reports?period=${period}`, token),
  });
  const error = reportError instanceof Error ? reportError.message : "";
  const activity = report ? [...report.activity.sales.map((item) => ({ id: item.id, date: item.sold_at, label: "Sale", detail: "Money received", amount: Number(item.total_amount_mmk), income: true })), ...report.activity.purchases.map((item) => ({ id: item.id, date: item.purchase_date, label: "Ingredient purchase", detail: item.supplier_name || item.note || "Stock purchase", amount: Number(item.total_amount_mmk), income: false })), ...report.activity.expenses.map((item) => ({ id: item.id, date: item.expense_date, label: item.category.replace(/^./, (letter) => letter.toUpperCase()), detail: item.description || "Business expense", amount: Number(item.amount_mmk), income: false }))].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 12) : [];
  return <div className="page reports-page"><PageHeading eyebrow="Financial account" title="Reports" onBack={onBack} backLabel={backLabel || "Back to More"} action={onBack ? <button type="button" className="text-button" onClick={onBack}>Done</button> : undefined}/><div className="tabs report-tabs"><button className={period === "today" ? "active" : ""} onClick={() => setPeriod("today")}>Today</button><button className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>7 days</button><button className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>30 days</button></div>{error && <p className="form-error">{error}</p>}{isLoading && !report ? <div className="report-loading">Calculating report…</div> : report && <><section className="report-hero"><span>Estimated gross profit</span><strong>{money(report.summary.grossProfit)}</strong><small>Sales minus ingredient cost of products sold</small></section><section><div className="section-title"><h2>Profit view</h2><span>Performance</span></div><div className="money-grid"><ReportMetric label="Sales revenue" value={report.summary.revenue}/><ReportMetric label="Ingredients used" value={-report.summary.ingredientCost}/></div></section><section><div className="section-title"><h2>Cash-flow view</h2><span>Money in and out</span></div><div className="cash-card"><ReportLine label="Sales received" value={report.summary.revenue}/><ReportLine label="Ingredient purchases" value={-report.summary.purchaseSpend}/><ReportLine label="Other expenses" value={-report.summary.otherExpenses}/><ReportLine label="Net cash flow" value={report.summary.netCashFlow} total/></div></section><section><div className="section-title"><h2>Recent activity</h2><span>{activity.length} records</span></div>{activity.length ? <div className="activity-list">{activity.map((item) => <article key={`${item.label}-${item.id}`}><div><strong>{item.label}</strong><small>{item.detail} · {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Yangon" }).format(new Date(item.date))}</small></div><span className={item.income ? "income" : "outgoing"}>{item.income ? "+" : "−"}{money(item.amount)}</span></article>)}</div> : <p className="quiet-state">No financial activity in this period.</p>}</section></>}</div>;
}

function ReportMetric({ label, value }: { label: string; value: number }) { return <article><small>{label}</small><strong className={value < 0 ? "negative" : ""}>{value < 0 ? "−" : ""}{money(Math.abs(value))}</strong></article>; }
function ReportLine({ label, value, total = false }: { label: string; value: number; total?: boolean }) { return <div className={total ? "total" : ""}><span>{label}</span><strong className={value < 0 ? "negative" : ""}>{value < 0 ? "−" : ""}{money(Math.abs(value))}</strong></div>; }

function History({ token, backLabel, onBack, onChanged }: { token: string; backLabel?: string; onBack?: () => void; onChanged: () => Promise<void> }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [reversing, setReversing] = useState<{ type: string; id: string; label: string }>();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["history"],
    queryFn: () => apiRequest<HistoryData>("/api/history", token),
  });

  const activities = data ? [
    ...data.sales.map((item) => ({ type: "sale", group: "sales", id: String(item.id), date: String(item.sold_at), label: "Sale", detail: `${money(Number(item.total_amount_mmk))} received`, reversed: Boolean(item.reversed_at) })),
    ...data.purchases.map((item) => ({ type: "purchase", group: "purchases", id: String(item.id), date: String(item.purchase_date), label: "Ingredient purchase", detail: `${money(Number(item.total_amount_mmk))}${item.supplier_name ? ` · ${String(item.supplier_name)}` : ""}`, reversed: Boolean(item.reversed_at) })),
    ...data.batches.map((item) => { const product = item.products as Record<string, unknown> | null; return { type: "batch", group: "bakes", id: String(item.id), date: String(item.baked_at), label: `Bake · ${String(product?.name || "Product")}`, detail: `${Number(item.good_quantity)} good · ${Number(item.waste_quantity)} waste`, reversed: Boolean(item.reversed_at) }; }),
    ...data.expenses.map((item) => ({ type: "expense", group: "expenses", id: String(item.id), date: String(item.expense_date), label: String(item.category).replace(/^./, (letter) => letter.toUpperCase()), detail: `${money(Number(item.amount_mmk))}${item.description ? ` · ${String(item.description)}` : ""}`, reversed: Boolean(item.reversed_at) })),
    ...data.adjustments.map((item) => ({ type: "adjustment", group: "adjustments", id: String(item.id), date: String(item.occurred_at), label: "Stock adjustment", detail: `${Number(item.quantity_delta) > 0 ? "+" : ""}${Number(item.quantity_delta)} · ${String(item.note || "Count correction")}`, reversed: false })),
  ].filter((item) => filter === "all" || item.group === filter).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : [];

  async function reverse() {
    if (!reversing || !reason.trim()) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/history", token, { method: "POST", body: JSON.stringify({ type: reversing.type, id: reversing.id, note: reason }) });
      setReversing(undefined);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["history"] });
      await queryClient.invalidateQueries({ queryKey: ["bakery-data"] });
      await queryClient.invalidateQueries({ queryKey: ["batches"] });
      await queryClient.invalidateQueries({ queryKey: ["purchases"] });
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      await onChanged();
    } catch (reverseError) {
      setError(reverseError instanceof Error ? reverseError.message : "Could not reverse transaction");
    } finally {
      setBusy(false);
    }
  }

  return <div className="page"><PageHeading eyebrow="Audit trail" title="History & corrections" onBack={onBack} backLabel={backLabel || "Back to More"} action={onBack ? <button type="button" className="text-button" onClick={onBack}>Done</button> : undefined}/><p className="helper-copy history-help">Mistakes are corrected by reversal, so the original record and the correction both remain traceable.</p><div className="filter-scroll">{[["all","All"],["sales","Sales"],["purchases","Purchases"],["bakes","Bakes"],["expenses","Expenses"],["adjustments","Adjustments"]].map(([id,label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>)}</div>{error && <p className="form-error">{error}</p>}{isLoading && !data ? <div className="report-loading">Loading history…</div> : activities.length ? <div className="history-list">{activities.map((item) => <article key={`${item.type}-${item.id}`} className={item.reversed ? "reversed" : ""}><div><strong>{item.label}</strong><small>{item.detail}</small><time>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Yangon" }).format(new Date(item.date))}</time></div>{item.reversed ? <span className="reversed-badge">Reversed</span> : item.type !== "adjustment" && <button className="text-button" onClick={() => { setReversing({ type: item.type, id: item.id, label: item.label }); setReason(""); }}>Correct</button>}</article>)}</div> : <p className="quiet-state">No records in this category.</p>}{reversing && <div className="confirm-panel"><strong>Reverse “{reversing.label}”?</strong><p>This creates opposite stock/accounting entries. It does not erase history.</p><label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What was entered incorrectly?" autoFocus/></label><div><button className="text-button" onClick={() => setReversing(undefined)}>Cancel</button><button className="danger-action compact" disabled={busy || !reason.trim()} onClick={() => void reverse()}>{busy ? "Reversing…" : "Confirm reversal"}</button></div></div>}</div>;
}

function ResetData({ email, backLabel, onCancel, onReset }: { email: string; backLabel?: string; onCancel: () => void; onReset: () => Promise<void> }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"transactions" | "everything">("transactions"); const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [acknowledged, setAcknowledged] = useState(false); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const phrase = mode === "transactions" ? "RESET TRANSACTIONS" : "RESET EVERYTHING";
  function selectMode(nextMode: "transactions" | "everything") { setMode(nextMode); setConfirmation(""); setAcknowledged(false); setError(""); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (confirmation !== phrase || !acknowledged) return;
    setBusy(true); setError("");
    try {
      const { data, error: authError } = await getBrowserSupabase().auth.signInWithPassword({ email, password });
      if (authError || !data.session) throw new Error(authError?.message || "Password verification failed");
      await apiRequest("/api/reset-data", data.session.access_token, { method: "POST", body: JSON.stringify({ mode, confirmation }) });
      queryClient.clear();
      await onReset();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Could not reset test data");
    } finally {
      setBusy(false);
    }
  }
  return <form className="page reset-page" onSubmit={submit}><PageHeading eyebrow="Maintenance tool" title="Reset test data" onBack={onCancel} backLabel={backLabel || "Back to More"} action={<button type="button" className="text-button" onClick={onCancel}>Cancel</button>}/><div className="danger-banner"><Icon name="alert"/><div><strong>This action cannot be undone</strong><span>Use this only before the bakery starts recording real business data.</span></div></div><section className="reset-options"><button type="button" className={mode === "transactions" ? "selected" : ""} onClick={() => selectMode("transactions")}><span className="radio-dot"/><div><strong>Reset transactions</strong><small>Deletes sales, baking batches, purchases, expenses and all stock movements. Keeps products, ingredients and recipes.</small></div></button><button type="button" className={mode === "everything" ? "selected danger-choice" : "danger-choice"} onClick={() => selectMode("everything")}><span className="radio-dot"/><div><strong>Reset everything</strong><small>Also deletes the complete product, ingredient and recipe catalog. Your login account remains.</small></div></button></section><section className="form-card reset-confirm"><label>Current account password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required/></label><label>Type <strong>{phrase}</strong> to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} required/></label><label className="check-label"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)}/><span>I understand this permanently removes the selected bakery data.</span></label></section>{error && <p className="form-error" role="alert">{error}</p>}<button className="danger-action" disabled={busy || !password || confirmation !== phrase || !acknowledged}>{busy ? "Verifying and resetting…" : mode === "transactions" ? "Permanently reset transactions" : "Permanently reset everything"}</button></form>;
}

function Catalog({
  token,
  ingredients,
  products,
  backLabel,
  onBack,
  onSaved,
}: {
  token: string;
  ingredients: Ingredient[];
  products: Product[];
  backLabel?: string;
  onBack?: () => void;
  onSaved: (message?: string) => Promise<void>;
}) {
  const [kind, setKind] = useState<"ingredient" | "product">("ingredient");
  const [mode, setMode] = useState<"list" | "create">("list");
  const [search, setSearch] = useState("");

  // Create form states
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("g");
  const [price, setPrice] = useState("");
  const [threshold, setThreshold] = useState("0");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/catalog", token, {
        method: "POST",
        body: JSON.stringify(
          kind === "ingredient"
            ? { kind, name, baseUnit: unit, lowStockThreshold: Number(threshold) }
            : { kind, name, sellingPriceMmk: Number(price), lowStockThreshold: Number(threshold) }
        ),
      });
      setName("");
      setPrice("");
      setThreshold("0");
      setMode("list");
      await onSaved(kind === "ingredient" ? "Raw material added" : "Finished product added");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not add item");
    } finally {
      setBusy(false);
    }
  }

  const rows = kind === "ingredient" ? ingredients : products;
  const filteredRows = rows.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  if (mode === "create") {
    return (
      <form className="page" onSubmit={submit}>
        <PageHeading
          eyebrow="Catalog setup"
          title={kind === "ingredient" ? "Add raw material" : "Add finished product"}
          onBack={() => setMode("list")}
          backLabel="Back to Catalog"
          action={
            <button
              type="button"
              className="text-button"
              onClick={() => setMode("list")}
            >
              Cancel
            </button>
          }
        />

        <div className="tabs">
          <button
            type="button"
            className={kind === "ingredient" ? "active" : ""}
            onClick={() => {
              setKind("ingredient");
              setError("");
            }}
          >
            Raw material
          </button>
          <button
            type="button"
            className={kind === "product" ? "active" : ""}
            onClick={() => {
              setKind("product");
              setError("");
            }}
          >
            Finished product
          </button>
        </div>

        <section className="form-card">
          <label>
            {kind === "ingredient" ? "Material name" : "Product name"}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={kind === "ingredient" ? "e.g. Bread flour, Unsalted butter" : "e.g. Milk bread, Croissant"}
              required
              autoFocus
            />
          </label>

          {kind === "ingredient" ? (
            <label>
              Base unit
              <select value={unit} onChange={(event) => setUnit(event.target.value)}>
                <option value="g">gram (g)</option>
                <option value="kg">kilogram (kg)</option>
                <option value="ml">millilitre (ml)</option>
                <option value="l">litre (L)</option>
                <option value="pcs">pieces</option>
              </select>
            </label>
          ) : (
            <label>
              Selling price (MMK)
              <input
                inputMode="numeric"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="e.g. 2500"
                required
              />
            </label>
          )}

          <label>
            Low-stock warning threshold
            <input
              inputMode="decimal"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              placeholder="0"
              required
            />
            <small>Alert triggers when stock quantity falls at or below this amount.</small>
          </label>
        </section>

        {error && <p className="form-error">{error}</p>}

        <button className="primary-action" disabled={busy || !name.trim()}>
          {busy ? "Saving item…" : `Save ${kind === "ingredient" ? "raw material" : "product"}`}
          <Icon name="arrow" size={18} />
        </button>
      </form>
    );
  }

  return (
    <div className="page">
      <PageHeading
        eyebrow="Products and materials"
        title="Catalog"
        onBack={onBack}
        backLabel={backLabel || "Back to More"}
        action={
          <button
            type="button"
            className="primary-action header-cta-btn"
            onClick={() => {
              setName("");
              setPrice("");
              setThreshold("0");
              setError("");
              setMode("create");
            }}
          >
            <Icon name="plus" size={16} />
            <span>{kind === "ingredient" ? "Add Material" : "Add Product"}</span>
          </button>
        }
      />

      <div className="tabs">
        <button
          type="button"
          className={kind === "ingredient" ? "active" : ""}
          onClick={() => {
            setKind("ingredient");
            setSearch("");
          }}
        >
          Raw materials ({ingredients.length})
        </button>
        <button
          type="button"
          className={kind === "product" ? "active" : ""}
          onClick={() => {
            setKind("product");
            setSearch("");
          }}
        >
          Finished products ({products.length})
        </button>
      </div>

      {rows.length > 4 && (
        <div className="search-box">
          <span>⌕</span>
          <input
            aria-label={`Search ${kind === "ingredient" ? "materials" : "products"}`}
            placeholder={`Search ${kind === "ingredient" ? "materials" : "products"} by name…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearch("")}
              aria-label="Clear search query"
            >
              ×
            </button>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={kind === "ingredient" ? "No raw materials yet" : "No finished products yet"}
          detail={
            kind === "ingredient"
              ? "Add your flours, yeast, sugar, and butter to track recipe usage and stock."
              : "Add the breads, cakes, and pastries your bakery sells to customers."
          }
          action={kind === "ingredient" ? "Add first raw material" : "Add first product"}
          onAction={() => setMode("create")}
        />
      ) : filteredRows.length === 0 ? (
        <p className="quiet-state">No items match “{search}”.</p>
      ) : (
        <div className="catalog-list">
          {filteredRows.map((item) => (
            <CatalogRow
              key={item.id}
              kind={kind}
              item={item}
              token={token}
              onSaved={onSaved}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CatalogRow({
  kind,
  item,
  token,
  onSaved,
}: {
  kind: "ingredient" | "product";
  item: Ingredient | Product;
  token: string;
  onSaved: (message?: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [threshold, setThreshold] = useState(String("lowThreshold" in item ? item.lowThreshold : 0));
  const [price, setPrice] = useState(String("price" in item ? item.price : 0));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(active = true) {
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/catalog", token, {
        method: "PATCH",
        body: JSON.stringify({
          kind,
          id: item.id,
          name,
          lowStockThreshold: Number(threshold),
          sellingPriceMmk: Number(price),
          active,
        }),
      });
      setEditing(false);
      await onSaved(active ? "Catalog item updated" : "Catalog item archived");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update item");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <article className="catalog-edit">
        <label>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        {kind === "product" && (
          <label>
            Price (MMK)
            <input
              type="number"
              min="0"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              required
            />
          </label>
        )}
        <label>
          Low-stock alert threshold
          <input
            type="number"
            min="0"
            step="any"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setName(item.name);
              setThreshold(String("lowThreshold" in item ? item.lowThreshold : 0));
              setPrice(String("price" in item ? item.price : 0));
              setEditing(false);
            }}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="outline-button"
            onClick={() => void save()}
            disabled={busy || !name.trim()}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </article>
    );
  }

  return (
    <article>
      <div>
        <strong>{item.name}</strong>
        <small>
          {kind === "ingredient"
            ? `${(item as Ingredient).unit} base unit · Alert at ${(item as Ingredient).lowThreshold || 0}`
            : `${money((item as Product).price)} selling price`}
        </small>
      </div>
      <div>
        <button
          type="button"
          className="text-button"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
        <button
          type="button"
          className="archive-button"
          onClick={() => {
            if (window.confirm(`Archive ${item.name}? Existing history will be kept.`)) {
              void save(false);
            }
          }}
        >
          Archive
        </button>
      </div>
    </article>
  );
}

function More({ email, onNavigate, onSignOut }: { email: string; onNavigate: (view: View) => void; onSignOut: () => Promise<unknown> }) {
  const options: Array<readonly [string, string, IconName, View]> = [["Catalog", "Manage products and raw materials", "stock", "catalog"], ["Recipe blueprints", "Standard inputs and expected yield", "bake", "recipes"], ["Purchases", "Record ingredient buying", "bag", "purchase"], ["Expenses", "Packaging, bills, wages and more", "alert", "expense"], ["History & corrections", "Review and reverse mistakes safely", "chevron", "history"], ["Reports", "Gross profit and cash flow", "trend", "reports"], ...(resetEnabled ? [["Reset test data", "Password-protected maintenance tool", "alert", "reset"] as const] : [])];
  return <div className="page more-page"><PageHeading eyebrow="Bakery management" title="More"/><div className="profile-card"><span className="avatar big">BB</span><div><strong>Bakery owner</strong><small>{email}</small></div></div><div className="menu-list">{options.map(([title, detail, icon, destination]) => <button key={title} onClick={() => onNavigate(destination)}><span><Icon name={icon}/></span><div><strong>{title}</strong><small>{detail}</small></div><Icon name="chevron" size={18}/></button>)}</div><button className="sign-out" onClick={() => void onSignOut()}>Sign out</button><div className="version">Bakery Book · Connected to Supabase</div></div>;
}
