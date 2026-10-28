"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type View = "home" | "sell" | "bake" | "stock" | "purchase" | "catalog" | "recipes" | "adjust" | "history" | "expense" | "reports" | "reset" | "more";
type StockTab = "raw" | "finished";
type IconName = "home" | "sell" | "bake" | "stock" | "more" | "plus" | "arrow" | "trend" | "bag" | "chevron" | "alert" | "check";
type Product = { id: string; name: string; price: number; stock: number; emoji: string };
type Ingredient = { id: string; name: string; unit: string; quantity: number; lowThreshold: number; isLow: boolean };
type FinishedStock = { id: string; name: string; quantity: number; price: number; lowThreshold: number; isLow: boolean };
type Recipe = { id: string; name: string; productId: string; expectedYield: number; version: number; items: Array<{ ingredientId: string; quantity: number }> };
type HistoryData = { sales: Array<Record<string, unknown>>; purchases: Array<Record<string, unknown>>; batches: Array<Record<string, unknown>>; expenses: Array<Record<string, unknown>>; adjustments: Array<Record<string, unknown>> };
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
const resetEnabled = process.env.NEXT_PUBLIC_ENABLE_DATA_RESET === "true";

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
    trend: <><path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/></>, bag: <><path d="M6 8h12l1 13H5L6 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>, alert: <><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17h.01"/></>, check: <path d="m5 12 4 4L19 6"/>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>();
  useEffect(() => {
    const { data } = getBrowserSupabase().auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <LoadingScreen />;
  if (!session) return <LoginScreen />;
  return <BakeryApp session={session} />;
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
  const [view, setView] = useState<View>("home");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [stockTab, setStockTab] = useState<StockTab>("raw");
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [finishedStock, setFinishedStock] = useState<FinishedStock[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const token = session.access_token;

  const refreshData = useCallback(async () => {
    try {
      const [catalog, stock, dashboardResult] = await Promise.all([
        apiRequest<{ products: Array<Record<string, unknown>>; recipes: Array<Record<string, unknown>> }>("/api/catalog", token),
        apiRequest<{ raw: Array<Record<string, unknown>>; finished: Array<Record<string, unknown>> }>("/api/stock", token),
        apiRequest<{ today: DashboardData }>("/api/dashboard", token),
      ]);
      const finished = stock.finished.map((item) => ({ id: String(item.product_id), name: String(item.name), quantity: Number(item.quantity), price: Number(item.selling_price_mmk), lowThreshold: Number(item.low_stock_threshold), isLow: Boolean(item.is_low) }));
      setFinishedStock(finished);
      setProducts(catalog.products.map((item, index) => ({ id: String(item.id), name: String(item.name), price: Number(item.selling_price_mmk), stock: finished.find((row) => row.id === item.id)?.quantity ?? 0, emoji: productEmoji[index % productEmoji.length] })));
      setRecipes(catalog.recipes.map((item) => ({ id: String(item.id), name: String(item.name), productId: String(item.product_id), expectedYield: Number(item.expected_yield), version: Number(item.version), items: ((item.recipe_items as Array<Record<string, unknown>>) || []).map((recipeItem) => ({ ingredientId: String(recipeItem.ingredient_id), quantity: Number(recipeItem.quantity) })) })));
      setIngredients(stock.raw.map((item) => ({ id: String(item.ingredient_id), name: String(item.name), unit: String(item.base_unit), quantity: Number(item.quantity), lowThreshold: Number(item.low_stock_threshold), isLow: Boolean(item.is_low) })));
      setDashboard(dashboardResult.today);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load bakery data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Loading authenticated data is the external synchronization performed here.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refreshData(); }, [refreshData]);
  const cartCount = Object.values(cart).reduce((sum, count) => sum + count, 0);
  const cartTotal = useMemo(() => products.reduce((sum, product) => sum + product.price * (cart[product.id] || 0), 0), [cart, products]);
  const activeView: View = ["catalog", "recipes", "history", "expense", "reports", "reset"].includes(view) ? "more" : ["purchase", "adjust"].includes(view) ? "stock" : view;
  const initials = session.user.email?.slice(0, 2).toUpperCase() || "BB";

  function changeQuantity(id: string, change: number) {
    const product = products.find((item) => item.id === id);
    setCart((current) => ({ ...current, [id]: Math.min(product?.stock ?? 0, Math.max(0, (current[id] || 0) + change)) }));
  }
  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2400); }
  async function completeSale() {
    if (!cartCount) return;
    try {
      await apiRequest("/api/sales", token, { method: "POST", body: JSON.stringify({ items: products.filter((product) => cart[product.id]).map((product) => ({ productId: product.id, quantity: cart[product.id], unitPriceMmk: product.price })), paymentMethod: "cash" }) });
      setCart({}); showToast("Sale saved successfully"); await refreshData();
    } catch (saleError) { showToast(saleError instanceof Error ? saleError.message : "Sale failed"); }
  }

  return <main className="app-shell">
    <aside className="desktop-rail"><Brand/><nav aria-label="Main navigation"><NavItems view={activeView} onSelect={setView}/></nav><div className="rail-foot"><span className="avatar">{initials}</span><div><strong>Bakery owner</strong><small>{session.user.email}</small></div></div></aside>
    <section className="app-content"><header className="topbar"><Brand/><button className="avatar-button" aria-label="Open account" onClick={() => setView("more")}>{initials}</button></header>
      {error && <div className="global-error" role="alert">{error}<button onClick={() => void refreshData()}>Retry</button></div>}
      {view === "home" && <Dashboard data={dashboard} ingredients={ingredients} onNavigate={setView}/>} 
      {view === "sell" && <Sell products={products} cart={cart} total={cartTotal} count={cartCount} onChange={changeQuantity} onComplete={completeSale} onCatalog={() => setView("catalog")}/>} 
      {view === "bake" && <Bake products={products} ingredients={ingredients} recipes={recipes} token={token} onCatalog={() => setView("catalog")} onRecipes={() => setView("recipes")} onSaved={async () => { showToast("Baking batch recorded"); await refreshData(); setStockTab("finished"); setView("stock"); }}/>}
      {view === "stock" && <Stock tab={stockTab} onTab={setStockTab} ingredients={ingredients} finished={finishedStock} onPurchase={() => setView("purchase")} onBake={() => setView("bake")} onAdjust={() => setView("adjust")} onCatalog={() => setView("catalog")}/>}
      {view === "purchase" && <Purchase ingredients={ingredients} token={token} onCancel={() => setView("stock")} onSaved={async () => { showToast("Purchase saved"); await refreshData(); setView("stock"); }}/>} 
      {view === "adjust" && <StockAdjustment initialTab={stockTab} ingredients={ingredients} finished={finishedStock} token={token} onCancel={() => setView("stock")} onSaved={async () => { showToast("Stock count saved"); await refreshData(); setView("stock"); }}/>}
      {view === "catalog" && <Catalog token={token} ingredients={ingredients} products={products} onSaved={async (message = "Catalog saved") => { showToast(message); await refreshData(); }}/>}
      {view === "recipes" && <RecipeBuilder products={products} ingredients={ingredients} recipes={recipes} token={token} onCatalog={() => setView("catalog")} onSaved={async () => { showToast("Recipe blueprint saved"); await refreshData(); }}/>}
      {view === "history" && <History token={token} onChanged={async () => { showToast("Transaction reversed"); await refreshData(); }}/>}
      {view === "expense" && <Expense token={token} onCancel={() => setView("more")} onSaved={() => { showToast("Expense saved"); setView("reports"); }}/>} 
      {view === "reports" && <Reports token={token}/>} 
      {view === "reset" && <ResetData email={session.user.email || ""} onCancel={() => setView("more")} onReset={async () => { setCart({}); showToast("Test data reset complete"); await refreshData(); setView("home"); }}/>} 
      {view === "more" && <More email={session.user.email || "Owner"} onNavigate={setView} onSignOut={() => getBrowserSupabase().auth.signOut()}/>} 
      {loading && <div className="data-loading">Loading bakery data…</div>}
    </section>
    <nav className="bottom-nav" aria-label="Mobile navigation"><NavItems view={activeView} onSelect={setView}/></nav>
    {toast && <div className="toast" role="status"><Icon name="check" size={18}/>{toast}</div>}
  </main>;
}

function Brand() { return <div className="brand"><span className="brand-mark">B</span><div><strong>Bakery Book</strong><small>Simple daily records</small></div></div>; }

function NavItems({ view, onSelect }: { view: View; onSelect: (view: View) => void }) {
  const items: { id: View; label: string; icon: IconName }[] = [{ id: "home", label: "Home", icon: "home" }, { id: "sell", label: "Sell", icon: "sell" }, { id: "bake", label: "Bake", icon: "bake" }, { id: "stock", label: "Stock", icon: "stock" }, { id: "more", label: "More", icon: "more" }];
  return <>{items.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => onSelect(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>)}</>;
}

function PageHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) { return <div className="page-heading"><div><p>{eyebrow}</p><h1>{title}</h1></div>{action}</div>; }

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

function Sell({ products, cart, total, count, onChange, onComplete, onCatalog }: { products: Product[]; cart: Record<string, number>; total: number; count: number; onChange: (id: string, change: number) => void; onComplete: () => void; onCatalog: () => void }) {
  const [search, setSearch] = useState("");
  const visibleProducts = products.filter((product) => product.name.toLowerCase().includes(search.toLowerCase()));
  return <div className="page sell-page"><PageHeading eyebrow="Point of sale" title="New sale"/>{products.length === 0 ? <EmptyState title="No products yet" detail="Add the breads and cakes your sister sells before recording a sale." action="Add product" onAction={onCatalog}/> : <><div className="search-box"><span>⌕</span><input aria-label="Search products" placeholder="Search products" value={search} onChange={(event) => setSearch(event.target.value)}/></div><div className="product-grid">{visibleProducts.map((product) => <article className="product-card" key={product.id}><div className="product-photo">{product.emoji}<span>{product.stock} left</span></div><div className="product-info"><div><strong>{product.name}</strong><small>{money(product.price)}</small></div>{(cart[product.id] || 0) === 0 ? <button disabled={product.stock <= 0} aria-label={`Add ${product.name}`} onClick={() => onChange(product.id, 1)}><Icon name="plus"/></button> : <div className="stepper"><button onClick={() => onChange(product.id, -1)}>−</button><span>{cart[product.id]}</span><button onClick={() => onChange(product.id, 1)}>+</button></div>}</div></article>)}</div><div className="checkout-bar"><div><span>{count} {count === 1 ? "item" : "items"}</span><strong>{money(total)}</strong></div><button disabled={!count} onClick={onComplete}>Complete sale <Icon name="arrow" size={18}/></button></div></>}</div>;
}

function Bake({ products, ingredients, recipes, token, onCatalog, onRecipes, onSaved }: { products: Product[]; ingredients: Ingredient[]; recipes: Recipe[]; token: string; onCatalog: () => void; onRecipes: () => void; onSaved: () => Promise<void> }) {
  const [productId, setProductId] = useState(products[0]?.id || ""); const [batchCount, setBatchCount] = useState("1"); const [good, setGood] = useState(""); const [waste, setWaste] = useState("0"); const [amounts, setAmounts] = useState<Record<string, string>>({}); const [note, setNote] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const selectedProductId = productId || products[0]?.id || "";
  const recipe = recipes.find((item) => item.productId === selectedProductId);
  const multiplier = Math.max(0, Number(batchCount) || 0);
  const recipeRows = recipe?.items.map((recipeItem) => ({ ...recipeItem, ingredient: ingredients.find((item) => item.id === recipeItem.ingredientId), planned: recipeItem.quantity * multiplier })).filter((item) => item.ingredient) || [];
  function selectProduct(id: string) { setProductId(id); setAmounts({}); setGood(""); setError(""); }
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!recipe) return; setBusy(true); setError(""); try { const inputs = recipeRows.map((item) => ({ ingredientId: item.ingredientId, plannedQuantity: item.planned, actualQuantity: Number(amounts[item.ingredientId] ?? item.planned) })); await apiRequest("/api/batches", token, { method: "POST", body: JSON.stringify({ productId: selectedProductId, recipeId: recipe.id, batchCount: multiplier, inputs, goodQuantity: Number(good), wasteQuantity: Number(waste), note }) }); await onSaved(); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Could not save batch"); } finally { setBusy(false); } }
  if (!products.length || !ingredients.length) return <div className="page"><PageHeading eyebrow="Production" title="Record a bake"/><EmptyState title="Catalog setup needed" detail="Add at least one product and one raw material before recording a bake." action="Open catalog" onAction={onCatalog}/></div>;
  return <form className="page bake-page" onSubmit={submit}><PageHeading eyebrow="Production" title="Record a bake"/><section className="form-card"><label>Product<select value={selectedProductId} onChange={(event) => selectProduct(event.target.value)} required>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Number of batches<input type="number" min="0.01" step="0.01" inputMode="decimal" value={batchCount} onChange={(event) => setBatchCount(event.target.value)} required/></label></section>{!recipe ? <EmptyState title="Recipe blueprint needed" detail="This product has no active recipe. Create its standard ingredient amounts and expected yield first." action="Create recipe" onAction={onRecipes}/> : <><section className="recipe-card"><div className="section-title"><h2>Ingredients used</h2><span>{recipe.name} · v{recipe.version}</span></div><p className="helper-copy">Planned amounts are filled from the blueprint. Change only an amount that was actually different.</p>{recipeRows.map((item) => <label className="ingredient-input" key={item.ingredientId}><span>{item.ingredient?.name}<small>Plan {item.planned.toLocaleString()} {item.ingredient?.unit} · {item.ingredient?.quantity.toLocaleString()} available</small></span><span><input type="number" min="0.0001" step="any" inputMode="decimal" value={amounts[item.ingredientId] ?? String(item.planned)} onChange={(event) => setAmounts((current) => ({ ...current, [item.ingredientId]: event.target.value }))}/><em>{item.ingredient?.unit}</em></span></label>)}</section><section className="form-card output-fields"><div className="section-title"><h2>Actual output</h2><span>Expected {recipe.expectedYield * multiplier} pcs</span></div><div><label>Good products<input type="number" min="0.01" step="any" inputMode="decimal" value={good} onChange={(event) => setGood(event.target.value)} required/></label><label>Damaged / waste<input type="number" min="0" step="any" inputMode="decimal" value={waste} onChange={(event) => setWaste(event.target.value)} required/></label></div><label>Batch note <small>Optional</small><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="For example: oven ran hot"/></label></section>{error && <p className="form-error">{error}</p>}<button className="primary-action" disabled={busy || !good}>{busy ? "Saving batch…" : "Complete baking batch"}<Icon name="arrow" size={18}/></button></>}</form>;
}

function Stock({ tab, onTab, ingredients, finished, onPurchase, onBake, onAdjust, onCatalog }: { tab: StockTab; onTab: (tab: StockTab) => void; ingredients: Ingredient[]; finished: FinishedStock[]; onPurchase: () => void; onBake: () => void; onAdjust: () => void; onCatalog: () => void }) {
  const rows = tab === "raw" ? ingredients.map((item) => ({ id: item.id, name: item.name, amount: `${item.quantity} ${item.unit}`, isLow: item.isLow, level: item.lowThreshold > 0 ? Math.min(100, item.quantity / item.lowThreshold * 40) : 70 })) : finished.map((item) => ({ id: item.id, name: item.name, amount: `${item.quantity} pcs`, isLow: item.isLow, level: item.lowThreshold > 0 ? Math.min(100, item.quantity / item.lowThreshold * 40) : 70 }));
  return <div className="page stock-page"><PageHeading eyebrow="Inventory" title="Stock" action={<div className="heading-actions"><button className="text-button" onClick={onAdjust}>Count / adjust</button><button className="outline-button" onClick={tab === "raw" ? onPurchase : onBake}><Icon name="plus" size={18}/>{tab === "raw" ? "Purchase" : "Record bake"}</button></div>}/><div className="tabs"><button className={tab === "raw" ? "active" : ""} onClick={() => onTab("raw")}>Raw materials</button><button className={tab === "finished" ? "active" : ""} onClick={() => onTab("finished")}>Finished goods</button></div>{rows.length === 0 ? <EmptyState title="Nothing here yet" detail={`Add your first ${tab === "raw" ? "raw material" : "product"} to begin tracking stock.`} action="Open catalog" onAction={onCatalog}/> : <div className="stock-list">{rows.map((item) => <article key={item.id}><div className="stock-row"><div><strong>{item.name}</strong><small>{item.amount} available</small></div><span className={item.isLow ? "stock-status low" : "stock-status"}>{item.isLow ? "Low" : "Good"}</span></div><div className="stock-track"><span className={item.isLow ? "low" : ""} style={{ width: `${item.level}%` }}/></div></article>)}</div>}</div>;
}

function RecipeBuilder({ products, ingredients, recipes, token, onCatalog, onSaved }: { products: Product[]; ingredients: Ingredient[]; recipes: Recipe[]; token: string; onCatalog: () => void; onSaved: () => Promise<void> }) {
  const initialProduct = products[0]; const initialRecipe = recipes.find((item) => item.productId === initialProduct?.id);
  const [productId, setProductId] = useState(initialProduct?.id || ""); const [name, setName] = useState(initialRecipe?.name || `${initialProduct?.name || "Product"} recipe`); const [expectedYield, setExpectedYield] = useState(initialRecipe ? String(initialRecipe.expectedYield) : ""); const [amounts, setAmounts] = useState<Record<string, string>>(Object.fromEntries((initialRecipe?.items || []).map((item) => [item.ingredientId, String(item.quantity)]))); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const selectedProductId = productId || products[0]?.id || ""; const product = products.find((item) => item.id === selectedProductId); const current = recipes.find((item) => item.productId === selectedProductId);
  function chooseProduct(id: string) { const saved = recipes.find((item) => item.productId === id); const selected = products.find((item) => item.id === id); setProductId(id); setName(saved?.name || `${selected?.name || "Product"} recipe`); setExpectedYield(saved ? String(saved.expectedYield) : ""); setAmounts(Object.fromEntries((saved?.items || []).map((item) => [item.ingredientId, String(item.quantity)]))); setError(""); }
  async function submit(event: React.FormEvent) { event.preventDefault(); const items = ingredients.filter((item) => Number(amounts[item.id]) > 0).map((item) => ({ ingredientId: item.id, quantity: Number(amounts[item.id]) })); if (!items.length) { setError("Add at least one ingredient amount."); return; } setBusy(true); setError(""); try { await apiRequest("/api/recipes", token, { method: "POST", body: JSON.stringify({ productId: selectedProductId, name: name || `${product?.name} recipe`, expectedYield: Number(expectedYield), items }) }); await onSaved(); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Could not save recipe"); } finally { setBusy(false); } }
  if (!products.length || !ingredients.length) return <div className="page"><PageHeading eyebrow="Production setup" title="Recipe blueprints"/><EmptyState title="Catalog setup needed" detail="Recipes connect finished products to their raw materials. Add both first." action="Open catalog" onAction={onCatalog}/></div>;
  return <form className="page" onSubmit={submit}><PageHeading eyebrow="Production setup" title="Recipe blueprints"/><section className="form-card"><label>Finished product<select value={selectedProductId} onChange={(event) => chooseProduct(event.target.value)}>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Recipe name<input value={name} onChange={(event) => setName(event.target.value)} placeholder={current?.name || `${product?.name || "Product"} recipe`} required/></label><label>Expected good products per batch<input type="number" min="0.01" step="any" inputMode="decimal" value={expectedYield} onChange={(event) => setExpectedYield(event.target.value)} placeholder="20" required/></label>{current && <div className="calculation-note"><span>Current blueprint</span><strong>Version {current.version} · saving creates a new version</strong></div>}</section><section className="recipe-card"><div className="section-title"><h2>Standard amounts per batch</h2><span>Base units</span></div>{ingredients.map((item) => <label className="ingredient-input" key={item.id}><span>{item.name}<small>Measured in {item.unit}</small></span><span><input type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={amounts[item.id] || ""} onChange={(event) => setAmounts((value) => ({ ...value, [item.id]: event.target.value }))}/><em>{item.unit}</em></span></label>)}</section>{error && <p className="form-error">{error}</p>}<button className="primary-action" disabled={busy}>{busy ? "Saving blueprint…" : current ? "Save new recipe version" : "Save recipe blueprint"}<Icon name="arrow" size={18}/></button></form>;
}

function StockAdjustment({ initialTab, ingredients, finished, token, onCancel, onSaved }: { initialTab: StockTab; ingredients: Ingredient[]; finished: FinishedStock[]; token: string; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [tab, setTab] = useState(initialTab); const [itemId, setItemId] = useState(""); const [target, setTarget] = useState(""); const [unitCost, setUnitCost] = useState(""); const [note, setNote] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const rows = tab === "raw" ? ingredients : finished; const selectedId = itemId || rows[0]?.id || ""; const selected = rows.find((item) => item.id === selectedId); const unit = tab === "raw" ? (selected as Ingredient | undefined)?.unit : "pcs"; const increase = Number(target) > (selected?.quantity || 0);
  function changeTab(next: StockTab) { setTab(next); setItemId(""); setTarget(""); setUnitCost(""); setError(""); }
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await apiRequest("/api/adjustments", token, { method: "POST", body: JSON.stringify({ itemType: tab, itemId: selectedId, targetQuantity: Number(target), unitCostMmk: increase ? unitCost : "", note }) }); await onSaved(); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Could not save stock count"); } finally { setBusy(false); } }
  return <form className="page" onSubmit={submit}><PageHeading eyebrow="Inventory correction" title="Count actual stock" action={<button type="button" className="text-button" onClick={onCancel}>Cancel</button>}/><div className="danger-banner neutral-banner"><Icon name="alert"/><div><strong>Use this only after physically counting stock</strong><span>Normal raw stock comes from purchases; normal finished stock comes from baking. This records the difference as an adjustment.</span></div></div><div className="tabs"><button type="button" className={tab === "raw" ? "active" : ""} onClick={() => changeTab("raw")}>Raw materials</button><button type="button" className={tab === "finished" ? "active" : ""} onClick={() => changeTab("finished")}>Finished goods</button></div>{rows.length ? <><section className="form-card"><label>Item<select value={selectedId} onChange={(event) => { setItemId(event.target.value); setTarget(""); }}>{rows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="calculation-note"><span>Recorded stock</span><strong>{selected?.quantity.toLocaleString()} {unit}</strong></div><label>Actual counted quantity ({unit})<input type="number" min="0" step="any" inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} required/></label>{increase && <label>Cost per {unit} <small>Optional; useful for opening stock</small><input type="number" min="0" step="any" inputMode="decimal" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} placeholder="0"/></label>}<label>Reason for adjustment<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Opening stock, physical count, spoilage…" required/></label></section>{error && <p className="form-error">{error}</p>}<button className="primary-action" disabled={busy || target === "" || !note.trim()}>{busy ? "Saving count…" : "Save stock count"}<Icon name="arrow" size={18}/></button></> : <EmptyState title="No items to count" detail="Add items to the catalog first." action="Go back" onAction={onCancel}/>}</form>;
}

function Purchase({ ingredients, token, onCancel, onSaved }: { ingredients: Ingredient[]; token: string; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id || ""); const [quantity, setQuantity] = useState(""); const [totalPaid, setTotalPaid] = useState(""); const [supplierName, setSupplierName] = useState(""); const [purchaseDate, setPurchaseDate] = useState(getLocalDate()); const [note, setNote] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const selectedIngredientId = ingredientId || ingredients[0]?.id || "";
  const selectedIngredient = ingredients.find((item) => item.id === selectedIngredientId);
  const calculatedUnitCost = Number(quantity) > 0 && Number(totalPaid) > 0 ? Number(totalPaid) / Number(quantity) : 0;
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await apiRequest("/api/purchases", token, { method: "POST", body: JSON.stringify({ ingredientId: selectedIngredientId, quantity: Number(quantity), totalAmountMmk: Number(totalPaid), supplierName, purchaseDate, note }) }); await onSaved(); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Could not save purchase"); } finally { setBusy(false); } }
  return <form className="page" onSubmit={submit}><PageHeading eyebrow="Raw materials" title="Add purchase" action={<button type="button" className="text-button" onClick={onCancel}>Cancel</button>}/>{ingredients.length === 0 ? <EmptyState title="No raw materials" detail="Add ingredients in the catalog before recording purchases." action="Go back" onAction={onCancel}/> : <><section className="form-card"><label>Raw material<select value={selectedIngredientId} onChange={(event) => setIngredientId(event.target.value)} required>{ingredients.map((item) => <option value={item.id} key={item.id}>{item.name} ({item.unit})</option>)}</select></label><label>Quantity purchased ({selectedIngredient?.unit || "base unit"})<input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="25000" required/></label><label>Total amount paid (MMK)<input inputMode="numeric" value={totalPaid} onChange={(event) => setTotalPaid(event.target.value)} placeholder="62500" required/></label>{calculatedUnitCost > 0 && <div className="calculation-note"><span>Calculated unit cost</span><strong>{calculatedUnitCost.toLocaleString(undefined, { maximumFractionDigits: 2 })} MMK / {selectedIngredient?.unit}</strong></div>}<label>Supplier name <small>Optional</small><input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Shop or person name"/></label><label>Purchase date<input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} required/></label><label>Note <small>Optional</small><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything useful to remember"/></label></section>{error && <p className="form-error">{error}</p>}<button className="primary-action" disabled={busy}>{busy ? "Saving purchase…" : "Save purchase"}<Icon name="arrow" size={18}/></button></>}</form>;
}

function Expense({ token, onCancel, onSaved }: { token: string; onCancel: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState("packaging"); const [amount, setAmount] = useState(""); const [expenseDate, setExpenseDate] = useState(getLocalDate()); const [description, setDescription] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await apiRequest("/api/expenses", token, { method: "POST", body: JSON.stringify({ category, amountMmk: Number(amount), expenseDate, description }) }); onSaved(); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Could not save expense"); } finally { setBusy(false); } }
  return <form className="page" onSubmit={submit}><PageHeading eyebrow="Financial account" title="Add expense" action={<button type="button" className="text-button" onClick={onCancel}>Cancel</button>}/><section className="form-card"><label>Expense category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="packaging">Packaging</option><option value="utilities">Electricity / gas</option><option value="transport">Transport</option><option value="rent">Rent</option><option value="wages">Wages</option><option value="equipment">Equipment</option><option value="repairs">Repairs</option><option value="other">Other</option></select></label><label>Amount (MMK)<input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} required/></label><label>Expense date<input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required/></label><label>Description <small>Optional</small><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="For example: cake boxes"/></label></section>{error && <p className="form-error">{error}</p>}<button className="primary-action" disabled={busy}>{busy ? "Saving expense…" : "Save expense"}<Icon name="arrow" size={18}/></button></form>;
}

function Reports({ token }: { token: string }) {
  const [period, setPeriod] = useState<"today" | "week" | "month">("week"); const [report, setReport] = useState<ReportData>(); const [error, setError] = useState("");
  useEffect(() => { let active = true; apiRequest<ReportData>(`/api/reports?period=${period}`, token).then((data) => { if (active) { setReport(data); setError(""); } }).catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "Could not load report"); }); return () => { active = false; }; }, [period, token]);
  const activity = report ? [...report.activity.sales.map((item) => ({ id: item.id, date: item.sold_at, label: "Sale", detail: "Money received", amount: Number(item.total_amount_mmk), income: true })), ...report.activity.purchases.map((item) => ({ id: item.id, date: item.purchase_date, label: "Ingredient purchase", detail: item.supplier_name || item.note || "Stock purchase", amount: Number(item.total_amount_mmk), income: false })), ...report.activity.expenses.map((item) => ({ id: item.id, date: item.expense_date, label: item.category.replace(/^./, (letter) => letter.toUpperCase()), detail: item.description || "Business expense", amount: Number(item.amount_mmk), income: false }))].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 12) : [];
  return <div className="page reports-page"><PageHeading eyebrow="Financial account" title="Reports"/><div className="tabs report-tabs"><button className={period === "today" ? "active" : ""} onClick={() => { setReport(undefined); setPeriod("today"); }}>Today</button><button className={period === "week" ? "active" : ""} onClick={() => { setReport(undefined); setPeriod("week"); }}>7 days</button><button className={period === "month" ? "active" : ""} onClick={() => { setReport(undefined); setPeriod("month"); }}>30 days</button></div>{error && <p className="form-error">{error}</p>}{!report && !error ? <div className="report-loading">Calculating report…</div> : report && <><section className="report-hero"><span>Estimated gross profit</span><strong>{money(report.summary.grossProfit)}</strong><small>Sales minus ingredient cost of products sold</small></section><section><div className="section-title"><h2>Profit view</h2><span>Performance</span></div><div className="money-grid"><ReportMetric label="Sales revenue" value={report.summary.revenue}/><ReportMetric label="Ingredients used" value={-report.summary.ingredientCost}/></div></section><section><div className="section-title"><h2>Cash-flow view</h2><span>Money in and out</span></div><div className="cash-card"><ReportLine label="Sales received" value={report.summary.revenue}/><ReportLine label="Ingredient purchases" value={-report.summary.purchaseSpend}/><ReportLine label="Other expenses" value={-report.summary.otherExpenses}/><ReportLine label="Net cash flow" value={report.summary.netCashFlow} total/></div></section><section><div className="section-title"><h2>Recent activity</h2><span>{activity.length} records</span></div>{activity.length ? <div className="activity-list">{activity.map((item) => <article key={`${item.label}-${item.id}`}><div><strong>{item.label}</strong><small>{item.detail} · {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Yangon" }).format(new Date(item.date))}</small></div><span className={item.income ? "income" : "outgoing"}>{item.income ? "+" : "−"}{money(item.amount)}</span></article>)}</div> : <p className="quiet-state">No financial activity in this period.</p>}</section></>}</div>;
}

function ReportMetric({ label, value }: { label: string; value: number }) { return <article><small>{label}</small><strong className={value < 0 ? "negative" : ""}>{value < 0 ? "−" : ""}{money(Math.abs(value))}</strong></article>; }
function ReportLine({ label, value, total = false }: { label: string; value: number; total?: boolean }) { return <div className={total ? "total" : ""}><span>{label}</span><strong className={value < 0 ? "negative" : ""}>{value < 0 ? "−" : ""}{money(Math.abs(value))}</strong></div>; }

function History({ token, onChanged }: { token: string; onChanged: () => Promise<void> }) {
  const [data, setData] = useState<HistoryData>(); const [filter, setFilter] = useState("all"); const [error, setError] = useState(""); const [reversing, setReversing] = useState<{ type: string; id: string; label: string }>(); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData(await apiRequest<HistoryData>("/api/history", token)); setError(""); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Could not load history"); } }, [token]);
  // Transaction history is synchronized with the authenticated API here.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const activities = data ? [
    ...data.sales.map((item) => ({ type: "sale", group: "sales", id: String(item.id), date: String(item.sold_at), label: "Sale", detail: `${money(Number(item.total_amount_mmk))} received`, reversed: Boolean(item.reversed_at) })),
    ...data.purchases.map((item) => ({ type: "purchase", group: "purchases", id: String(item.id), date: String(item.purchase_date), label: "Ingredient purchase", detail: `${money(Number(item.total_amount_mmk))}${item.supplier_name ? ` · ${String(item.supplier_name)}` : ""}`, reversed: Boolean(item.reversed_at) })),
    ...data.batches.map((item) => { const product = item.products as Record<string, unknown> | null; return { type: "batch", group: "bakes", id: String(item.id), date: String(item.baked_at), label: `Bake · ${String(product?.name || "Product")}`, detail: `${Number(item.good_quantity)} good · ${Number(item.waste_quantity)} waste`, reversed: Boolean(item.reversed_at) }; }),
    ...data.expenses.map((item) => ({ type: "expense", group: "expenses", id: String(item.id), date: String(item.expense_date), label: String(item.category).replace(/^./, (letter) => letter.toUpperCase()), detail: `${money(Number(item.amount_mmk))}${item.description ? ` · ${String(item.description)}` : ""}`, reversed: Boolean(item.reversed_at) })),
    ...data.adjustments.map((item) => ({ type: "adjustment", group: "adjustments", id: String(item.id), date: String(item.occurred_at), label: "Stock adjustment", detail: `${Number(item.quantity_delta) > 0 ? "+" : ""}${Number(item.quantity_delta)} · ${String(item.note || "Count correction")}`, reversed: false })),
  ].filter((item) => filter === "all" || item.group === filter).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : [];
  async function reverse() { if (!reversing || !reason.trim()) return; setBusy(true); setError(""); try { await apiRequest("/api/history", token, { method: "POST", body: JSON.stringify({ type: reversing.type, id: reversing.id, note: reason }) }); setReversing(undefined); setReason(""); await load(); await onChanged(); } catch (reverseError) { setError(reverseError instanceof Error ? reverseError.message : "Could not reverse transaction"); } finally { setBusy(false); } }
  return <div className="page"><PageHeading eyebrow="Audit trail" title="History & corrections"/><p className="helper-copy history-help">Mistakes are corrected by reversal, so the original record and the correction both remain traceable.</p><div className="filter-scroll">{[["all","All"],["sales","Sales"],["purchases","Purchases"],["bakes","Bakes"],["expenses","Expenses"],["adjustments","Adjustments"]].map(([id,label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>)}</div>{error && <p className="form-error">{error}</p>}{!data ? <div className="report-loading">Loading history…</div> : activities.length ? <div className="history-list">{activities.map((item) => <article key={`${item.type}-${item.id}`} className={item.reversed ? "reversed" : ""}><div><strong>{item.label}</strong><small>{item.detail}</small><time>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Yangon" }).format(new Date(item.date))}</time></div>{item.reversed ? <span className="reversed-badge">Reversed</span> : item.type !== "adjustment" && <button className="text-button" onClick={() => { setReversing({ type: item.type, id: item.id, label: item.label }); setReason(""); }}>Correct</button>}</article>)}</div> : <p className="quiet-state">No records in this category.</p>}{reversing && <div className="confirm-panel"><strong>Reverse “{reversing.label}”?</strong><p>This creates opposite stock/accounting entries. It does not erase history.</p><label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What was entered incorrectly?" autoFocus/></label><div><button className="text-button" onClick={() => setReversing(undefined)}>Cancel</button><button className="danger-action compact" disabled={busy || !reason.trim()} onClick={() => void reverse()}>{busy ? "Reversing…" : "Confirm reversal"}</button></div></div>}</div>;
}

function ResetData({ email, onCancel, onReset }: { email: string; onCancel: () => void; onReset: () => Promise<void> }) {
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
      await onReset();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Could not reset test data");
    } finally {
      setBusy(false);
    }
  }
  return <form className="page reset-page" onSubmit={submit}><PageHeading eyebrow="Maintenance tool" title="Reset test data" action={<button type="button" className="text-button" onClick={onCancel}>Cancel</button>}/><div className="danger-banner"><Icon name="alert"/><div><strong>This action cannot be undone</strong><span>Use this only before the bakery starts recording real business data.</span></div></div><section className="reset-options"><button type="button" className={mode === "transactions" ? "selected" : ""} onClick={() => selectMode("transactions")}><span className="radio-dot"/><div><strong>Reset transactions</strong><small>Deletes sales, baking batches, purchases, expenses and all stock movements. Keeps products, ingredients and recipes.</small></div></button><button type="button" className={mode === "everything" ? "selected danger-choice" : "danger-choice"} onClick={() => selectMode("everything")}><span className="radio-dot"/><div><strong>Reset everything</strong><small>Also deletes the complete product, ingredient and recipe catalog. Your login account remains.</small></div></button></section><section className="form-card reset-confirm"><label>Current account password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required/></label><label>Type <strong>{phrase}</strong> to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} required/></label><label className="check-label"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)}/><span>I understand this permanently removes the selected bakery data.</span></label></section>{error && <p className="form-error" role="alert">{error}</p>}<button className="danger-action" disabled={busy || !password || confirmation !== phrase || !acknowledged}>{busy ? "Verifying and resetting…" : mode === "transactions" ? "Permanently reset transactions" : "Permanently reset everything"}</button></form>;
}

function Catalog({ token, ingredients, products, onSaved }: { token: string; ingredients: Ingredient[]; products: Product[]; onSaved: (message?: string) => Promise<void> }) {
  const [kind, setKind] = useState<"ingredient" | "product">("ingredient"); const [name, setName] = useState(""); const [unit, setUnit] = useState("g"); const [price, setPrice] = useState(""); const [threshold, setThreshold] = useState("0"); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await apiRequest("/api/catalog", token, { method: "POST", body: JSON.stringify(kind === "ingredient" ? { kind, name, baseUnit: unit, lowStockThreshold: Number(threshold) } : { kind, name, sellingPriceMmk: Number(price), lowStockThreshold: Number(threshold) }) }); setName(""); setPrice(""); await onSaved(); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Could not add item"); } finally { setBusy(false); } }
  const rows = kind === "ingredient" ? ingredients : products;
  return <div className="page"><PageHeading eyebrow="Products and materials" title="Catalog"/><div className="tabs"><button type="button" className={kind === "ingredient" ? "active" : ""} onClick={() => setKind("ingredient")}>Raw material</button><button type="button" className={kind === "product" ? "active" : ""} onClick={() => setKind("product")}>Finished product</button></div><form onSubmit={submit}><section className="form-card"><label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "ingredient" ? "Bread flour" : "Milk bread"} required/></label>{kind === "ingredient" ? <label>Base unit<select value={unit} onChange={(event) => setUnit(event.target.value)}><option value="g">gram (g)</option><option value="kg">kilogram (kg)</option><option value="ml">millilitre (ml)</option><option value="l">litre (L)</option><option value="pcs">pieces</option></select></label> : <label>Selling price (MMK)<input inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} required/></label>}<label>Low-stock warning level<input inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} required/></label></section>{error && <p className="form-error">{error}</p>}<button className="primary-action" disabled={busy}>{busy ? "Adding…" : `Add ${kind === "ingredient" ? "material" : "product"}`}<Icon name="plus" size={18}/></button></form><section><div className="section-title"><h2>Current {kind === "ingredient" ? "materials" : "products"}</h2><span>{rows.length} active</span></div>{rows.length ? <div className="catalog-list">{rows.map((item) => <CatalogRow key={item.id} kind={kind} item={item} token={token} onSaved={onSaved}/>)}</div> : <p className="quiet-state">No catalog items yet.</p>}</section></div>;
}

function CatalogRow({ kind, item, token, onSaved }: { kind: "ingredient" | "product"; item: Ingredient | Product; token: string; onSaved: (message?: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false); const [name, setName] = useState(item.name); const [threshold, setThreshold] = useState(String("lowThreshold" in item ? item.lowThreshold : 0)); const [price, setPrice] = useState(String("price" in item ? item.price : 0)); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function save(active = true) { setBusy(true); setError(""); try { await apiRequest("/api/catalog", token, { method: "PATCH", body: JSON.stringify({ kind, id: item.id, name, lowStockThreshold: Number(threshold), sellingPriceMmk: Number(price), active }) }); setEditing(false); await onSaved(active ? "Catalog item updated" : "Catalog item archived"); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Could not update item"); } finally { setBusy(false); } }
  if (editing) return <article className="catalog-edit"><label>Name<input value={name} onChange={(event) => setName(event.target.value)}/></label>{kind === "product" && <label>Price (MMK)<input type="number" min="0" value={price} onChange={(event) => setPrice(event.target.value)}/></label>}<label>Low warning<input type="number" min="0" step="any" value={threshold} onChange={(event) => setThreshold(event.target.value)}/></label>{error && <p className="form-error">{error}</p>}<div><button className="text-button" onClick={() => setEditing(false)} disabled={busy}>Cancel</button><button className="outline-button" onClick={() => void save()} disabled={busy}>Save</button></div></article>;
  return <article><div><strong>{item.name}</strong><small>{kind === "ingredient" ? `${(item as Ingredient).unit} base unit` : `${money((item as Product).price)} selling price`} · low at {"lowThreshold" in item ? item.lowThreshold : 0}</small></div><div><button className="text-button" onClick={() => setEditing(true)}>Edit</button><button className="archive-button" onClick={() => { if (window.confirm(`Archive ${item.name}? Existing history will be kept.`)) void save(false); }}>Archive</button></div></article>;
}

function More({ email, onNavigate, onSignOut }: { email: string; onNavigate: (view: View) => void; onSignOut: () => Promise<unknown> }) {
  const options: Array<readonly [string, string, IconName, View]> = [["Catalog", "Manage products and raw materials", "stock", "catalog"], ["Recipe blueprints", "Standard inputs and expected yield", "bake", "recipes"], ["Purchases", "Record ingredient buying", "bag", "purchase"], ["Expenses", "Packaging, bills, wages and more", "alert", "expense"], ["History & corrections", "Review and reverse mistakes safely", "chevron", "history"], ["Reports", "Gross profit and cash flow", "trend", "reports"], ...(resetEnabled ? [["Reset test data", "Password-protected maintenance tool", "alert", "reset"] as const] : [])];
  return <div className="page more-page"><PageHeading eyebrow="Bakery management" title="More"/><div className="profile-card"><span className="avatar big">BB</span><div><strong>Bakery owner</strong><small>{email}</small></div></div><div className="menu-list">{options.map(([title, detail, icon, destination]) => <button key={title} onClick={() => onNavigate(destination)}><span><Icon name={icon}/></span><div><strong>{title}</strong><small>{detail}</small></div><Icon name="chevron" size={18}/></button>)}</div><button className="sign-out" onClick={() => void onSignOut()}>Sign out</button><div className="version">Bakery Book · Connected to Supabase</div></div>;
}
