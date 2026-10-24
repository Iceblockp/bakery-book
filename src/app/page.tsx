"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type View = "home" | "sell" | "bake" | "stock" | "purchase" | "catalog" | "expense" | "reports" | "reset" | "more";
type StockTab = "raw" | "finished";
type IconName = "home" | "sell" | "bake" | "stock" | "more" | "plus" | "arrow" | "trend" | "bag" | "chevron" | "alert" | "check";
type Product = { id: string; name: string; price: number; stock: number; emoji: string };
type Ingredient = { id: string; name: string; unit: string; quantity: number; lowThreshold: number; isLow: boolean };
type FinishedStock = { id: string; name: string; quantity: number; price: number; lowThreshold: number; isLow: boolean };
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
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const token = session.access_token;

  const refreshData = useCallback(async () => {
    try {
      const [catalog, stock, dashboardResult] = await Promise.all([
        apiRequest<{ products: Array<Record<string, unknown>> }>("/api/catalog", token),
        apiRequest<{ raw: Array<Record<string, unknown>>; finished: Array<Record<string, unknown>> }>("/api/stock", token),
        apiRequest<{ today: DashboardData }>("/api/dashboard", token),
      ]);
      const finished = stock.finished.map((item) => ({ id: String(item.product_id), name: String(item.name), quantity: Number(item.quantity), price: Number(item.selling_price_mmk), lowThreshold: Number(item.low_stock_threshold), isLow: Boolean(item.is_low) }));
      setFinishedStock(finished);
      setProducts(catalog.products.map((item, index) => ({ id: String(item.id), name: String(item.name), price: Number(item.selling_price_mmk), stock: finished.find((row) => row.id === item.id)?.quantity ?? 0, emoji: productEmoji[index % productEmoji.length] })));
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
  const activeView: View = ["catalog", "expense", "reports", "reset"].includes(view) ? "more" : view === "purchase" ? "stock" : view;
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
      {view === "bake" && <Bake products={products} ingredients={ingredients} token={token} onCatalog={() => setView("catalog")} onSaved={async () => { showToast("Baking batch recorded"); await refreshData(); setView("stock"); }}/>} 
      {view === "stock" && <Stock tab={stockTab} onTab={setStockTab} ingredients={ingredients} finished={finishedStock} onPurchase={() => setView("purchase")} onCatalog={() => setView("catalog")}/>} 
      {view === "purchase" && <Purchase ingredients={ingredients} token={token} onCancel={() => setView("stock")} onSaved={async () => { showToast("Purchase saved"); await refreshData(); setView("stock"); }}/>} 
      {view === "catalog" && <Catalog token={token} onSaved={async () => { showToast("Catalog item added"); await refreshData(); }}/>} 
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

function Bake({ products, ingredients, token, onCatalog, onSaved }: { products: Product[]; ingredients: Ingredient[]; token: string; onCatalog: () => void; onSaved: () => Promise<void> }) {
  const [productId, setProductId] = useState(products[0]?.id || ""); const [batchCount, setBatchCount] = useState("1"); const [good, setGood] = useState(""); const [waste, setWaste] = useState("0"); const [amounts, setAmounts] = useState<Record<string, string>>({}); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const selectedProductId = productId || products[0]?.id || "";
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const inputs = ingredients.filter((item) => Number(amounts[item.id]) > 0).map((item) => ({ ingredientId: item.id, plannedQuantity: Number(amounts[item.id]), actualQuantity: Number(amounts[item.id]) })); await apiRequest("/api/batches", token, { method: "POST", body: JSON.stringify({ productId: selectedProductId, batchCount: Number(batchCount), inputs, goodQuantity: Number(good), wasteQuantity: Number(waste) }) }); await onSaved(); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Could not save batch"); } finally { setBusy(false); } }
  if (!products.length || !ingredients.length) return <div className="page"><PageHeading eyebrow="Production" title="Record a bake"/><EmptyState title="Catalog setup needed" detail="Add at least one product and one raw material before recording a bake." action="Open catalog" onAction={onCatalog}/></div>;
  return <form className="page bake-page" onSubmit={submit}><PageHeading eyebrow="Production" title="Record a bake"/><section className="form-card"><label>Product<select value={selectedProductId} onChange={(event) => setProductId(event.target.value)} required><option value="">Select a product</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Number of batches<input inputMode="decimal" value={batchCount} onChange={(event) => setBatchCount(event.target.value)} required/></label></section><section className="recipe-card"><div className="section-title"><h2>Actual ingredients used</h2><span>Use base units</span></div>{ingredients.map((item) => <label className="ingredient-input" key={item.id}><span>{item.name}<small>{item.quantity} {item.unit} available</small></span><span><input inputMode="decimal" placeholder="0" value={amounts[item.id] || ""} onChange={(event) => setAmounts((current) => ({ ...current, [item.id]: event.target.value }))}/><em>{item.unit}</em></span></label>)}</section><section className="form-card output-fields"><h2>Actual output</h2><div><label>Good products<input inputMode="decimal" value={good} onChange={(event) => setGood(event.target.value)} required/></label><label>Damaged<input inputMode="decimal" value={waste} onChange={(event) => setWaste(event.target.value)} required/></label></div></section>{error && <p className="form-error">{error}</p>}<button className="primary-action" disabled={busy}>{busy ? "Saving batch…" : "Complete baking batch"}<Icon name="arrow" size={18}/></button></form>;
}

function Stock({ tab, onTab, ingredients, finished, onPurchase, onCatalog }: { tab: StockTab; onTab: (tab: StockTab) => void; ingredients: Ingredient[]; finished: FinishedStock[]; onPurchase: () => void; onCatalog: () => void }) {
  const rows = tab === "raw" ? ingredients.map((item) => ({ id: item.id, name: item.name, amount: `${item.quantity} ${item.unit}`, isLow: item.isLow, level: item.lowThreshold > 0 ? Math.min(100, item.quantity / item.lowThreshold * 40) : 70 })) : finished.map((item) => ({ id: item.id, name: item.name, amount: `${item.quantity} pcs`, isLow: item.isLow, level: item.lowThreshold > 0 ? Math.min(100, item.quantity / item.lowThreshold * 40) : 70 }));
  return <div className="page stock-page"><PageHeading eyebrow="Inventory" title="Stock" action={<button className="outline-button" onClick={onPurchase}><Icon name="plus" size={18}/> Purchase</button>}/><div className="tabs"><button className={tab === "raw" ? "active" : ""} onClick={() => onTab("raw")}>Raw materials</button><button className={tab === "finished" ? "active" : ""} onClick={() => onTab("finished")}>Finished goods</button></div>{rows.length === 0 ? <EmptyState title="Nothing here yet" detail={`Add your first ${tab === "raw" ? "raw material" : "product"} to begin tracking stock.`} action="Open catalog" onAction={onCatalog}/> : <div className="stock-list">{rows.map((item) => <article key={item.id}><div className="stock-row"><div><strong>{item.name}</strong><small>{item.amount} available</small></div><span className={item.isLow ? "stock-status low" : "stock-status"}>{item.isLow ? "Low" : "Good"}</span></div><div className="stock-track"><span className={item.isLow ? "low" : ""} style={{ width: `${item.level}%` }}/></div></article>)}</div>}</div>;
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

function Catalog({ token, onSaved }: { token: string; onSaved: () => Promise<void> }) {
  const [kind, setKind] = useState<"ingredient" | "product">("ingredient"); const [name, setName] = useState(""); const [unit, setUnit] = useState("g"); const [price, setPrice] = useState(""); const [threshold, setThreshold] = useState("0"); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await apiRequest("/api/catalog", token, { method: "POST", body: JSON.stringify(kind === "ingredient" ? { kind, name, baseUnit: unit, lowStockThreshold: Number(threshold) } : { kind, name, sellingPriceMmk: Number(price), lowStockThreshold: Number(threshold) }) }); setName(""); setPrice(""); await onSaved(); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Could not add item"); } finally { setBusy(false); } }
  return <form className="page" onSubmit={submit}><PageHeading eyebrow="Products and materials" title="Catalog"/><div className="tabs"><button type="button" className={kind === "ingredient" ? "active" : ""} onClick={() => setKind("ingredient")}>Raw material</button><button type="button" className={kind === "product" ? "active" : ""} onClick={() => setKind("product")}>Finished product</button></div><section className="form-card"><label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "ingredient" ? "Bread flour" : "Milk bread"} required/></label>{kind === "ingredient" ? <label>Base unit<select value={unit} onChange={(event) => setUnit(event.target.value)}><option value="g">gram (g)</option><option value="kg">kilogram (kg)</option><option value="ml">millilitre (ml)</option><option value="l">litre (L)</option><option value="pcs">pieces</option></select></label> : <label>Selling price (MMK)<input inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} required/></label>}<label>Low-stock warning level<input inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} required/></label></section>{error && <p className="form-error">{error}</p>}<button className="primary-action" disabled={busy}>{busy ? "Adding…" : `Add ${kind === "ingredient" ? "material" : "product"}`}<Icon name="plus" size={18}/></button></form>;
}

function More({ email, onNavigate, onSignOut }: { email: string; onNavigate: (view: View) => void; onSignOut: () => Promise<unknown> }) {
  const options: Array<readonly [string, string, IconName, View]> = [["Catalog", "Manage products and raw materials", "stock", "catalog"], ["Purchases", "Record ingredient buying", "bag", "purchase"], ["Expenses", "Packaging, bills, wages and more", "alert", "expense"], ["Reports", "Gross profit and cash flow", "trend", "reports"], ...(resetEnabled ? [["Reset test data", "Password-protected maintenance tool", "alert", "reset"] as const] : [])];
  return <div className="page more-page"><PageHeading eyebrow="Bakery management" title="More"/><div className="profile-card"><span className="avatar big">BB</span><div><strong>Bakery owner</strong><small>{email}</small></div></div><div className="menu-list">{options.map(([title, detail, icon, destination]) => <button key={title} onClick={() => onNavigate(destination)}><span><Icon name={icon}/></span><div><strong>{title}</strong><small>{detail}</small></div><Icon name="chevron" size={18}/></button>)}</div><button className="sign-out" onClick={() => void onSignOut()}>Sign out</button><div className="version">Bakery Book · Connected to Supabase</div></div>;
}
