import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { CoinRain } from "@/components/AppShell";
import { MarketIcon } from "@/components/MarketIcon";
import { PriceChart, type Line } from "@/components/PriceChart";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  getPlatformOpenPositions,
  openPosition,
  closePosition,
  syncPositions,
} from "@/lib/blux.functions";
import {
  MARKETS,
  fmt,
  fmtPrice,
  calcPnl,
  FEE_RATE,
  PROFIT_CAP,
  LIQ_LOSS,
  MIN_LEVERAGE,
  MAX_LEVERAGE,
} from "@/lib/markets";
import { getBinanceTickers } from "@/lib/market-data";
import { connectOrderBookStream, fetchOrderBook, type OrderBook } from "@/lib/order-book";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/trade")({
  head: () => ({
    meta: [
      { title: "Trade com alavancagem — Bluxq" },
      {
        name: "description",
        content: "Opere Long e Short em cripto real com blux e alavancagem até 50x.",
      },
      { property: "og:title", content: "Trade — Bluxq" },
      { property: "og:description", content: "Gráfico ao vivo, Long/Short e alavancagem até 50x." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Trade,
});

const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"];

function marginWithinBudget(balance: number, fraction = 1) {
  const budgetCents = Math.max(0, Math.floor(balance * fraction * 100 + 0.000001));
  let marginCents = Math.floor(budgetCents / 1.1);
  while (marginCents + Math.round(marginCents / 10) > budgetCents) marginCents -= 1;
  while (marginCents + 1 + Math.round((marginCents + 1) / 10) <= budgetCents) marginCents += 1;
  return marginCents / 100;
}

type PositionDetails = {
  id: string;
  symbol: string;
  side: "long" | "short";
  margin: number | string;
  leverage: number;
  qty: number | string;
  entry_price: number | string;
  liq_price: number | string;
  opened_at: string;
};

function useTickers() {
  return useQuery({
    queryKey: ["tickers"],
    refetchInterval: 10000,
    queryFn: async () => {
      return getBinanceTickers(MARKETS.map((m) => m.symbol));
    },
  });
}

function useOrderBook(symbol: string) {
  const [book, setBook] = useState<OrderBook | null>(null);
  useEffect(() => {
    let dead = false;
    let socket: WebSocket | undefined;
    setBook(null);
    fetchOrderBook(symbol, 5)
      .then((next) => {
        if (!dead) setBook(next);
      })
      .catch(() => {});
    try {
      socket = connectOrderBookStream(
        symbol,
        (next) => {
          if (!dead) setBook({ ...next, asks: next.asks.slice(0, 5), bids: next.bids.slice(0, 5) });
        },
        () => {},
      );
    } catch {
      // The REST snapshot remains available if the stream is unavailable.
    }
    return () => {
      dead = true;
      socket?.close();
    };
  }, [symbol]);
  return book;
}

function Trade() {
  const { session } = useAuth();
  const nav = useNavigate();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState(() => {
    if (typeof window === "undefined") return "BTCUSDT";
    const requested = new URLSearchParams(window.location.search).get("symbol");
    return MARKETS.some((market) => market.symbol === requested) ? requested! : "BTCUSDT";
  });
  const [interval, setIntervalV] = useState("15m");
  const [price, setPrice] = useState(0);
  const [margin, setMargin] = useState("100");
  const [lev, setLev] = useState(MIN_LEVERAGE);
  const [busy, setBusy] = useState(false);
  const [rain, setRain] = useState(0);
  const [marketMenuOpen, setMarketMenuOpen] = useState(false);
  const [marketSearch, setMarketSearch] = useState("");
  const [orderBookOpen, setOrderBookOpen] = useState(true);
  const [orderBookSide, setOrderBookSide] = useState<"left" | "right">("right");
  const [tab, setTab] = useState<"open" | "history" | "top">("open");
  const [selectedPosition, setSelectedPosition] = useState<PositionDetails | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [orderPanelOpen, setOrderPanelOpen] = useState(true);
  const { data: tickers } = useTickers();
  const orderBook = useOrderBook(symbol);
  const { data: pool } = useQuery({
    queryKey: ["market-pool", symbol],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_pools")
        .select("total_assets,total_reserved")
        .eq("symbol", symbol)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const open = useServerFn(openPosition);
  const close = useServerFn(closePosition);
  const sync = useServerFn(syncPositions);
  const platformOpen = useServerFn(getPlatformOpenPositions);

  const { data: positions = [] } = useQuery({
    queryKey: ["positions", session?.user.id],
    refetchInterval: 4000,
    enabled: Boolean(session),
    queryFn: async () =>
      (
        await supabase
          .from("positions")
          .select(
            "id, symbol, side, margin, leverage, qty, entry_price, liq_price, opened_at, closed_at, exit_price, pnl, fee, payout, status",
          )
          .order("opened_at", { ascending: false })
          .limit(100)
      ).data ?? [],
  });
  const { data: platformPositions = [] } = useQuery({
    queryKey: ["platform-open-positions"],
    refetchInterval: 1000,
    enabled: Boolean(session),
    queryFn: () => platformOpen(),
  });
  const openPos = positions.filter((p) => p.status === "open");
  const history = positions.filter((p) => p.status !== "open");
  const realizedPnl = history.reduce((total, position) => total + Number(position.pnl ?? 0), 0);
  const realizedMargin = history.reduce(
    (total, position) => total + Number(position.margin ?? 0),
    0,
  );
  const realizedPct = realizedMargin ? (realizedPnl / realizedMargin) * 100 : 0;
  const winningTrades = history.filter((position) => Number(position.pnl ?? 0) > 0).length;
  const performanceValues = history
    .slice()
    .reverse()
    .reduce<number[]>((values, position) => {
      values.push((values.at(-1) ?? 0) + Number(position.pnl ?? 0));
      return values;
    }, []);
  const t = tickers?.[symbol];
  const currentPrice = price || Number(t?.lastPrice ?? 0);
  const orderBookDepthMax = Math.max(
    ...(orderBook?.asks ?? []).map((row) => row.total),
    ...(orderBook?.bids ?? []).map((row) => row.total),
    1,
  );
  const filteredMarkets = MARKETS.filter((market) => {
    const query = marketSearch.trim().toLowerCase();
    return !query || `${market.base} ${market.name}`.toLowerCase().includes(query);
  });
  const selectedMarket = MARKETS.find((market) => market.symbol === symbol) ?? MARKETS[0];
  const recentPositions = [...platformPositions]
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
    .slice(0, 10);

  // preços ao vivo de todas as moedas com posição aberta
  const livePx = (s: string) =>
    s === symbol && currentPrice ? currentPrice : Number(tickers?.[s]?.lastPrice ?? 0);

  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => {
      sync().catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [sync, session]);

  const balance = Number(profile?.balance ?? 0);
  const rawMargin = Number(margin);
  const m = Number.isFinite(rawMargin) ? Math.round(rawMargin * 100) / 100 : 0;
  const marginInCents = Math.round(m * 100);
  const openingFee = Math.round(marginInCents / 10) / 100;
  const totalRequired = Math.round((m + openingFee) * 100) / 100;
  const maxAffordableMargin = marginWithinBudget(balance);
  const canAfford = Boolean(profile) && totalRequired <= balance + 0.000001;
  const shortfall = Math.max(0, Math.round((totalRequired - balance) * 100) / 100);
  const poolFree = Math.max(0, Number(pool?.total_assets ?? 0) - Number(pool?.total_reserved ?? 0));
  // The position reserves margin * (alavancagem + 4): dívida + lucro máximo garantido.
  const poolMaxLev =
    m > 0 && pool ? Math.min(MAX_LEVERAGE, Math.floor(poolFree / m - 4)) : MAX_LEVERAGE;
  const sliderMax = Math.max(MIN_LEVERAGE, poolMaxLev);
  const size = m * lev;
  const liqLong = currentPrice * (1 - LIQ_LOSS / lev);
  const liqShort = currentPrice * (1 + LIQ_LOSS / lev);

  useEffect(() => {
    if (pool && lev > sliderMax) setLev(sliderMax);
  }, [pool, sliderMax, lev]);

  const lines = useMemo<Line[]>(
    () =>
      openPos
        .filter((p) => p.symbol === symbol)
        .flatMap((p) => [
          {
            price: Number(p.entry_price),
            color: p.side === "long" ? "#16a34a" : "#dc2626",
            title: `${p.side === "long" ? "LONG" : "SHORT"} ${p.leverage}x entrada`,
          },
          { price: Number(p.liq_price), color: "#f59e0b", title: "Liquidation" },
        ]),
    [openPos, symbol],
  );

  async function go(side: "long" | "short") {
    if (!session) {
      nav({ to: "/auth", search: { mode: "signup" } });
      return;
    }
    setBusy(true);
    try {
      if (!profile) {
        throw new Error("Não foi possível carregar seu saldo. Tente novamente.");
      }
      if (!canAfford) {
        throw new Error(
          `Saldo insuficiente: esta ordem exige $BX ${fmt(totalRequired)} (margem + taxa). Saldo: $BX ${fmt(balance)}.`,
        );
      }
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        throw new Error("Preço de mercado indisponível. Aguarde a atualização e tente novamente.");
      }
      if (poolMaxLev < MIN_LEVERAGE)
        throw new Error(
          `The pool has liquidity for at most ${Math.max(poolMaxLev, 0)}x on this margin. Reduce the margin or wait for more stakes.`,
        );
      if (lev > poolMaxLev)
        throw new Error(`The maximum leverage available now is ${poolMaxLev}x.`);
      const r = await open({ data: { symbol, side, margin: m, leverage: lev } });
      toast.success(`${side === "long" ? "Long" : "Short"} aberto a ${fmtPrice(r.price ?? 0)}`);
      await qc.invalidateQueries({ queryKey: ["platform-open-positions"] });
      await qc.invalidateQueries({ queryKey: ["positions", session?.user.id] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Unable to open the position.");
    } finally {
      setBusy(false);
    }
  }
  async function doClose(id: string) {
    try {
      const r = await close({ data: { id } });
      if (r.pnl > 0) setRain(Date.now());
      toast[r.pnl >= 0 ? "success" : "error"](
        `Fechada: ${r.pnl >= 0 ? "+" : ""}${fmt(r.pnl)} $BX (taxa ${fmt(r.fee)})`,
      );
      await qc.invalidateQueries({ queryKey: ["platform-open-positions"] });
      await qc.invalidateQueries({ queryKey: ["positions", session?.user.id] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Unable to close the position.");
    }
  }

  const chg = Number(t?.priceChangePercent ?? 0);
  const unreal = openPos.reduce(
    (a, p) =>
      a + calcPnl(p.side, Number(p.qty), Number(p.entry_price), livePx(p.symbol), Number(p.margin)),
    0,
  );
  const openMargin = openPos.reduce((a, p) => a + Number(p.margin), 0);
  const unrealPct = openMargin ? (unreal / openMargin) * 100 : 0;
  function currentResultText() {
    return [
      "Bluxq — resultado atual",
      `Pares abertos: ${openPos.length}`,
      `Profit/loss: ${unreal >= 0 ? "+" : ""}${fmt(unreal)} $BX (${unrealPct >= 0 ? "+" : ""}${unrealPct.toFixed(2)}%)`,
      `Atualizado em: ${new Date().toLocaleString("pt-BR")}`,
    ].join("\n");
  }
  async function copyCurrentResult() {
    await navigator.clipboard.writeText(currentResultText());
    toast.success("Resultado atual copiado");
  }
  function downloadCurrentResult() {
    const blob = new Blob([currentResultText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bluxq-resultado-atual.txt";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Resultado baixado");
  }
  function downloadPositionImage(position: PositionDetails) {
    const px = livePx(position.symbol);
    const pnl = calcPnl(
      position.side,
      Number(position.qty),
      Number(position.entry_price),
      px,
      Number(position.margin),
    );
    const roe = (pnl / Number(position.margin)) * 100;
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 700;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#16a34a";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#16a34a";
    context.font = "700 34px sans-serif";
    context.fillText("Bluxq", 70, 90);
    context.fillStyle = "#f4f4f5";
    context.font = "700 54px sans-serif";
    context.fillText(`${position.symbol.replace("USDT", "")} / USDT`, 70, 190);
    context.fillStyle = position.side === "long" ? "#16a34a" : "#dc2626";
    context.font = "700 34px monospace";
    context.fillText(`${position.side.toUpperCase()} ${position.leverage}x`, 70, 245);
    context.fillStyle = pnl >= 0 ? "#16a34a" : "#dc2626";
    context.font = "700 72px monospace";
    context.fillText(`${pnl >= 0 ? "+" : ""}${fmt(pnl)} $BX`, 70, 385);
    context.font = "32px monospace";
    context.fillText(`${roe >= 0 ? "+" : ""}${roe.toFixed(2)}%`, 75, 440);
    context.fillStyle = "#d4d4d8";
    context.font = "24px monospace";
    context.fillText(`Entrada: ${fmtPrice(Number(position.entry_price))}`, 70, 535);
    context.fillText(
      `Atual: ${fmtPrice(px)}   Quantidade: ${Number(position.qty).toPrecision(7)}`,
      70,
      580,
    );
    context.fillText(new Date().toLocaleString("pt-BR"), 70, 635);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bluxq-${position.symbol.toLowerCase()}-${position.side}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  return (
    <main
      className={`mx-auto grid max-w-[1800px] -translate-y-1 gap-3 p-3 ${orderBookSide === "left" ? (orderBookOpen ? "lg:grid-cols-[220px_minmax(0,1fr)_256px]" : "lg:grid-cols-[40px_minmax(0,1fr)_256px]") : orderBookOpen ? "lg:grid-cols-[minmax(0,1fr)_220px_256px]" : "lg:grid-cols-[minmax(0,1fr)_40px_256px]"}`}
    >
      <CoinRain show={rain} />
      {/* livro de ordens e posições abertas */}
      <section
        className={`order-2 space-y-3 ${orderBookSide === "left" ? "lg:order-1" : "lg:order-2"}`}
      >
        <aside className={`overflow-hidden ${orderBookOpen ? "w-full lg:min-w-0" : "h-fit w-10"}`}>
          {!orderBookOpen ? (
            <div className="flex min-h-14 w-full flex-col items-center justify-center gap-1 py-1">
              <button
                type="button"
                onClick={() => setOrderBookSide(orderBookSide === "left" ? "right" : "left")}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Mover livro para o outro lado"
                title="Mover livro para o outro lado"
              >
                <ArrowLeftRight aria-hidden="true" className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOrderBookOpen(true)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Abrir livro de ordens"
                title="Abrir livro de ordens"
              >
                {orderBookSide === "left" ? (
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                )}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs uppercase text-muted-foreground">Livro de ordens</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setOrderBookSide("left")}
                    className={`text-muted-foreground hover:text-foreground ${orderBookSide === "left" ? "text-primary" : ""}`}
                    aria-label="Mover livro para a esquerda"
                    title="Mover livro para a esquerda"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderBookOpen(false)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Minimizar livro de ordens"
                    title="Minimizar livro de ordens"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderBookSide("right")}
                    className={`text-muted-foreground hover:text-foreground ${orderBookSide === "right" ? "text-primary" : ""}`}
                    aria-label="Mover livro para a direita"
                    title="Mover livro para a direita"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 px-3 py-2 text-[10px] text-muted-foreground">
                <span>Price</span>
                <span className="text-right">Qtd.</span>
                <span className="text-right">Total</span>
              </div>
              <div className="px-2 font-mono text-[11px]">
                <div className="space-y-0.5">
                  {(orderBook?.asks.slice().reverse() ?? []).map((row) => (
                    <OrderRow
                      key={`ask-${row.price}`}
                      row={row}
                      side="ask"
                      depthMax={orderBookDepthMax}
                    />
                  ))}
                </div>
                <div className="my-2 flex items-center justify-between py-2 text-base font-bold">
                  <span className="text-primary">
                    {currentPrice ? fmtPrice(currentPrice) : "—"}
                  </span>
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {orderBook ? "LIVE" : "carregando"}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {(orderBook?.bids ?? []).map((row) => (
                    <OrderRow
                      key={`bid-${row.price}`}
                      row={row}
                      side="bid"
                      depthMax={orderBookDepthMax}
                    />
                  ))}
                </div>
                {!orderBook && (
                  <div className="py-6 text-center font-sans text-xs text-muted-foreground">
                    Loading market levels…
                  </div>
                )}
              </div>
              <aside className="mt-3 p-3 font-mono text-[10px]">
                <div className="mb-2 flex items-center justify-between text-muted-foreground">
                  <span>Recent positions</span>
                  <span>{recentPositions.length}/10</span>
                </div>
                <div className="space-y-0.5">
                  {recentPositions.map((position) => (
                    <div
                      key={`recent-${position.id}`}
                      className="rounded px-1 py-1 hover:bg-white/5"
                    >
                      <div className={position.side === "long" ? "text-bull" : "text-bear"}>
                        {position.side.toUpperCase()} {position.symbol.replace("USDT", "")} ·{" "}
                        {position.leverage}x
                      </div>
                      <div className="text-muted-foreground">
                        Margin $BX {fmt(Number(position.margin))} · Size $BX{" "}
                        {fmt(Number(position.margin) * Number(position.leverage))} ·{" "}
                        {new Date(position.opened_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  ))}
                  {recentPositions.length === 0 && (
                    <div className="py-2 text-center text-muted-foreground">
                      No opened positions
                    </div>
                  )}
                </div>
              </aside>
            </>
          )}
        </aside>
      </section>

      {/* gráfico */}
      <section
        className={`order-1 min-w-0 space-y-3 ${orderBookSide === "left" ? "lg:order-2" : "lg:order-1"}`}
      >
        <div className="overflow-hidden rounded-xl bg-black">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 bg-black p-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setMarketMenuOpen((open) => !open)}
                className="flex items-center gap-2 text-lg font-bold hover:text-primary"
              >
                <MarketIcon base={selectedMarket.icon} size="sm" />
                <span>{selectedMarket.base}/USDT</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              {marketMenuOpen && (
                <div className="absolute left-0 top-11 z-30 w-72 rounded-xl border border-border bg-card p-2 shadow-xl">
                  <div className="relative mb-2">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                      autoFocus
                      value={marketSearch}
                      onChange={(event) => setMarketSearch(event.target.value)}
                      placeholder="Buscar moeda..."
                      className="h-9 w-full rounded-md border border-border bg-black pl-8 pr-3 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div className="max-h-72 space-y-1 overflow-y-auto">
                    {filteredMarkets.map((mk) => (
                      <button
                        type="button"
                        key={mk.symbol}
                        onClick={() => {
                          setSymbol(mk.symbol);
                          setPrice(0);
                          setMarketMenuOpen(false);
                          setMarketSearch("");
                        }}
                        className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted ${symbol === mk.symbol ? "bg-muted" : ""}`}
                      >
                        <MarketIcon base={mk.icon} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{mk.base}/USDT</span>
                          <span className="block text-xs text-muted-foreground">{mk.name}</span>
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {tickers?.[mk.symbol]?.lastPrice
                            ? fmtPrice(Number(tickers[mk.symbol]?.lastPrice))
                            : "—"}
                        </span>
                      </button>
                    ))}
                    {filteredMarkets.length === 0 && (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Nenhuma moeda encontrada.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className={`font-mono text-xl ${chg >= 0 ? "text-bull" : "text-bear"}`}>
              {currentPrice ? fmtPrice(currentPrice) : "…"}
            </div>
            <Stat k="24h" v={`${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`} />
            <Stat k="Máx 24h" v={t ? fmtPrice(Number(t.highPrice)) : "—"} />
            <Stat k="Mín 24h" v={t ? fmtPrice(Number(t.lowPrice)) : "—"} />
            <Stat k="Volume" v={t ? `$${fmt(Number(t.quoteVolume) / 1e6, 1)}M` : "—"} />
            <div className="ml-auto flex gap-1">
              {INTERVALS.map((i) => (
                <button
                  key={i}
                  onClick={() => setIntervalV(i)}
                  className={`rounded px-2 py-1 text-xs font-mono ${interval === i ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[460px] bg-black p-1">
            <PriceChart symbol={symbol} interval={interval} lines={lines} onPrice={setPrice} />
          </div>
        </div>

        {/* posições */}
        <div className="rounded-xl bg-black">
          <div className="flex items-center gap-4 px-3">
            {(["open", "history", "top"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`py-2 text-sm ${tab === k ? "border-b-2 border-primary font-semibold" : "text-muted-foreground"}`}
              >
                {k === "open"
                  ? `Open positions (${openPos.length})`
                  : k === "history"
                    ? "History"
                    : "Top trades"}
              </button>
            ))}
            {tab === "open" && openPos.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className={`font-mono text-sm ${unreal >= 0 ? "text-bull" : "text-bear"}`}>
                  PnL {unreal >= 0 ? "+" : ""}
                  {fmt(unreal)} $BX ({unrealPct >= 0 ? "+" : ""}
                  {unrealPct.toFixed(2)}%)
                </span>
                <button
                  onClick={copyCurrentResult}
                  className="rounded border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Copiar
                </button>
                <button
                  onClick={downloadCurrentResult}
                  className="rounded border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Baixar
                </button>
              </div>
            )}
          </div>
          {tab === "top" ? (
            <TopTrades
              history={history}
              realizedPnl={realizedPnl}
              realizedPct={realizedPct}
              winningTrades={winningTrades}
              performanceValues={performanceValues}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left">
                    <th className="p-2">Par</th>
                    <th>Lado</th>
                    <th>Margem</th>
                    <th>Tamanho</th>
                    <th>Entrada</th>
                    <th>{tab === "open" ? "Atual" : "Saída"}</th>
                    <th>Liquidation</th>
                    <th>PnL</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {(tab === "open" ? openPos : history).map((p) => {
                    const px = tab === "open" ? livePx(p.symbol) : Number(p.exit_price ?? 0);
                    const pnl =
                      tab === "open"
                        ? calcPnl(
                            p.side,
                            Number(p.qty),
                            Number(p.entry_price),
                            px,
                            Number(p.margin),
                          )
                        : Number(p.pnl ?? 0);
                    const roe = (pnl / Number(p.margin)) * 100;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => tab === "open" && setSelectedPosition(p as PositionDetails)}
                        className="cursor-pointer hover:bg-muted/40"
                      >
                        <td className="p-2 font-sans font-semibold">
                          {p.symbol.replace("USDT", "")}
                        </td>
                        <td className={p.side === "long" ? "text-bull" : "text-bear"}>
                          {p.side.toUpperCase()} {p.leverage}x
                        </td>
                        <td>{fmt(p.margin)}</td>
                        <td>{fmt(Number(p.margin) * p.leverage)}</td>
                        <td>{fmtPrice(Number(p.entry_price))}</td>
                        <td>{px ? fmtPrice(px) : "—"}</td>
                        <td className="text-gold">{fmtPrice(Number(p.liq_price))}</td>
                        <td className={pnl >= 0 ? "text-bull" : "text-bear"}>
                          {pnl >= 0 ? "+" : ""}
                          {fmt(pnl)} <span className="text-xs">({roe.toFixed(1)}%)</span>
                        </td>
                        <td className="pr-2 text-right">
                          {tab === "open" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                void doClose(p.id);
                              }}
                            >
                              Fechar
                            </Button>
                          ) : (
                            <span
                              className={`font-sans text-xs ${p.status === "liquidated" ? "text-bear" : "text-muted-foreground"}`}
                            >
                              {p.status === "liquidated" ? "Liquidada" : "Fechada"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(tab === "open" ? openPos : history).length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-6 text-center font-sans text-muted-foreground">
                        Nada aqui ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ordem */}
      {orderPanelOpen ? (
        <aside className="order-3 h-fit space-y-4 p-4 lg:sticky lg:top-16">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Nova ordem
            </span>
            <button
              type="button"
              onClick={() => setOrderPanelOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Minimizar painel de ordem"
              title="Minimizar"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Margem</label>
            <Input
              type="number"
              min={10}
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
              className="border-0 bg-transparent font-mono shadow-none focus-visible:ring-0"
            />
            <div className="flex gap-1">
              {[0.1, 0.25, 0.5, 1].map((f) => (
                <button
                  key={f}
                  onClick={() => setMargin(marginWithinBudget(balance, f).toFixed(2))}
                  className="flex-1 rounded py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {f * 100}%
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Alavancagem</span>
              <span className="rounded-md px-2 py-1 font-mono font-bold text-primary">{lev}x</span>
            </div>
            <input
              aria-label="Arraste para escolher a alavancagem"
              type="range"
              min={MIN_LEVERAGE}
              max={sliderMax}
              step={1}
              value={Math.min(lev, sliderMax)}
              onChange={(event) => setLev(Number(event.target.value))}
              className="blux-range"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>{MIN_LEVERAGE}x mín.</span>
              <span>{poolMaxLev > 0 ? `${poolMaxLev}x máx.` : "indisponível"}</span>
            </div>
          </div>
          <div className="space-y-1 px-1 py-2 text-sm">
            <div className="mb-2">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>Total para abrir</span>
                <span className="font-mono text-base font-bold text-primary">
                  <CurrencyAmount value={fmt(totalRequired)} />
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Tamanho da posição</span>
                <span className="font-mono text-sm font-bold text-primary">
                  <CurrencyAmount value={fmt(size)} />
                </span>
              </div>
            </div>
            {!session && (
              <p className="mb-2 text-xs text-muted-foreground">
                Explore o mercado livremente. Para enviar uma ordem, crie uma conta.
              </p>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Margem da posição</span>
              <span className="font-mono">
                <CurrencyAmount value={fmt(m)} />
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Taxa de abertura (10%)</span>
              <span className="font-mono">
                <CurrencyAmount value={fmt(openingFee)} />
              </span>
            </div>
          </div>
          {profile && m >= 10 && shortfall > 0 && (
            <p role="status" className="text-xs leading-relaxed text-bear">
              Saldo insuficiente: faltam <CurrencyAmount value={fmt(shortfall)} />. Margem máxima
              agora: <CurrencyAmount value={fmt(maxAffordableMargin)} />.
            </p>
          )}
          <button
            type="button"
            className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowOrderDetails((value) => !value)}
          >
            <span>Detalhes da operação</span>
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 transition-transform ${showOrderDetails ? "rotate-180" : ""}`}
            />
          </button>
          {showOrderDetails && (
            <div className="space-y-1 p-3 font-mono text-xs">
              <Row
                k="Quantidade"
                v={
                  currentPrice
                    ? `${(size / currentPrice).toPrecision(5)} ${symbol.replace("USDT", "")}`
                    : "—"
                }
              />
              <Row
                k="Liquidation Long"
                v={currentPrice ? fmtPrice(liqLong) : "—"}
                cls="text-bull"
              />
              <Row
                k="Liquidation Short"
                v={currentPrice ? fmtPrice(liqShort) : "—"}
                cls="text-bear"
              />
              <Row k="Movimento p/ liquidar" v={`${((LIQ_LOSS / lev) * 100).toFixed(2)}%`} />
              <Row k="Maximum profit" v={<CurrencyAmount value={fmt(m * PROFIT_CAP)} />} />
              <Row k="Taxa de abertura" v={<CurrencyAmount value={fmt(openingFee)} />} />
            </div>
          )}
          <div className="grid grid-cols-2 items-stretch gap-2">
            <Button
              disabled={
                busy ||
                !currentPrice ||
                (Boolean(session) &&
                  (m < 10 || !canAfford || poolMaxLev < MIN_LEVERAGE || lev > poolMaxLev))
              }
              onClick={() => go("long")}
              className="h-11 rounded-md bg-bull text-bull-foreground hover:bg-bull/90"
            >
              Long ↑
            </Button>
            <Button
              disabled={
                busy ||
                !currentPrice ||
                (Boolean(session) &&
                  (m < 10 || !canAfford || poolMaxLev < MIN_LEVERAGE || lev > poolMaxLev))
              }
              onClick={() => go("short")}
              className="h-11 rounded-md bg-bear text-bear-foreground hover:bg-bear/90"
            >
              Short ↓
            </Button>
          </div>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setOrderPanelOpen(true)}
          className="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 items-center gap-1 rounded-l-lg border border-r-0 bg-card px-2 py-3 text-xs font-semibold text-muted-foreground shadow-lg hover:text-foreground lg:sticky lg:top-28 lg:col-start-3 lg:row-start-1 lg:h-fit lg:self-start"
          aria-label="Abrir painel de ordem"
          title="Abrir ordem"
        >
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
          <span className="[writing-mode:vertical-rl]">Ordem</span>
        </button>
      )}
      {selectedPosition && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          onClick={() => setSelectedPosition(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Operação Bluxq</div>
                <h2 className="mt-1 text-2xl font-bold">
                  {selectedPosition.symbol.replace("USDT", "")} / USDT
                </h2>
              </div>
              <button
                onClick={() => setSelectedPosition(null)}
                className="text-xl text-muted-foreground hover:text-foreground"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div
              className={`mt-4 text-xl font-mono font-bold ${selectedPosition.side === "long" ? "text-bull" : "text-bear"}`}
            >
              {selectedPosition.side.toUpperCase()} {selectedPosition.leverage}x
            </div>
            <div className="mt-4 space-y-2 rounded-lg border p-3 font-mono text-sm">
              <Row k="Margem" v={`${fmt(Number(selectedPosition.margin))} $BX`} />
              <Row k="Quantidade" v={Number(selectedPosition.qty).toPrecision(7)} />
              <Row k="Entrada" v={fmtPrice(Number(selectedPosition.entry_price))} />
              <Row k="Price atual" v={fmtPrice(livePx(selectedPosition.symbol))} />
              <Row k="Liquidation" v={fmtPrice(Number(selectedPosition.liq_price))} />
              <Row k="Aberta em" v={new Date(selectedPosition.opened_at).toLocaleString("pt-BR")} />
            </div>
            <div
              className={`mt-4 text-center text-3xl font-mono font-bold ${calcPnl(selectedPosition.side, Number(selectedPosition.qty), Number(selectedPosition.entry_price), livePx(selectedPosition.symbol), Number(selectedPosition.margin)) >= 0 ? "text-bull" : "text-bear"}`}
            >
              {(() => {
                const pnl = calcPnl(
                  selectedPosition.side,
                  Number(selectedPosition.qty),
                  Number(selectedPosition.entry_price),
                  livePx(selectedPosition.symbol),
                  Number(selectedPosition.margin),
                );
                return `${pnl >= 0 ? "+" : ""}${fmt(pnl)} $BX`;
              })()}
            </div>
            <div className="mt-5 flex gap-2">
              <Button className="flex-1" onClick={() => downloadPositionImage(selectedPosition)}>
                Baixar imagem
              </Button>
              <Button variant="outline" onClick={() => setSelectedPosition(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

type TopTradePosition = {
  symbol: string;
  side: string;
  pnl: number | string | null;
  margin: number | string;
  leverage: number;
};

function TopTrades({
  history,
  realizedPnl,
  realizedPct,
  winningTrades,
  performanceValues,
}: {
  history: TopTradePosition[];
  realizedPnl: number;
  realizedPct: number;
  winningTrades: number;
  performanceValues: number[];
}) {
  const width = 560;
  const height = 190;
  const pad = 18;
  const maxAbs = Math.max(1, ...performanceValues.map((value) => Math.abs(value)));
  const points = performanceValues
    .map((value, index) => {
      const x = pad + (index / Math.max(1, performanceValues.length - 1)) * (width - pad * 2);
      const y = height / 2 - (value / maxAbs) * (height / 2 - pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const bestTrade = history.reduce<TopTradePosition | null>(
    (best, position) =>
      !best || Number(position.pnl ?? 0) > Number(best.pnl ?? 0) ? position : best,
    null,
  );
  const winRate = history.length ? (winningTrades / history.length) * 100 : 0;

  return (
    <div className="grid gap-4 p-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <MetricCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Resultado total"
          value={`${realizedPnl >= 0 ? "+" : ""}${fmt(realizedPnl)} $BX`}
          tone={realizedPnl >= 0 ? "bull" : "bear"}
        />
        <MetricCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Percentual de lucro"
          value={`${realizedPct >= 0 ? "+" : ""}${realizedPct.toFixed(2)}%`}
          tone={realizedPct >= 0 ? "bull" : "bear"}
        />
        <MetricCard
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Taxa de acerto"
          value={`${winRate.toFixed(1)}% (${winningTrades}/${history.length})`}
        />
        <div className="rounded-lg border border-border/70 bg-card/70 p-3">
          <div className="text-xs text-muted-foreground">Melhor operação</div>
          <div className="mt-1 font-mono text-sm text-gold">
            {bestTrade
              ? `${bestTrade.symbol.replace("USDT", "")}/${bestTrade.side.toUpperCase()} · +${fmt(Number(bestTrade.pnl ?? 0))} $BX`
              : "Nenhuma operação fechada"}
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-border/70 bg-card/70 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Evolução do resultado</div>
            <div className="text-xs text-muted-foreground">
              PnL acumulado das operações fechadas
            </div>
          </div>
          <span className="font-mono text-xs text-muted-foreground">{history.length} trades</span>
        </div>
        {performanceValues.length ? (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-44 w-full"
            role="img"
            aria-label="Gráfico de evolução do lucro"
          >
            <line
              x1={pad}
              x2={width - pad}
              y1={height / 2}
              y2={height / 2}
              stroke="currentColor"
              strokeOpacity="0.2"
            />
            <polyline
              points={points}
              fill="none"
              stroke={realizedPnl >= 0 ? "#16a34a" : "#dc2626"}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <div className="grid h-44 place-items-center text-center text-sm text-muted-foreground">
            Feche sua primeira operação para visualizar o gráfico.
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "bull" | "bear";
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/70 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={tone === "bear" ? "text-bear" : tone === "bull" ? "text-bull" : "text-primary"}
        >
          {icon}
        </span>
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-lg font-semibold ${tone === "bear" ? "text-bear" : tone === "bull" ? "text-bull" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

function OrderRow({
  row,
  side,
  depthMax,
}: {
  row: { price: number; quantity: number; total: number };
  side: "ask" | "bid";
  depthMax: number;
}) {
  const depth = Math.min(100, Math.max(2, (row.total / depthMax) * 100));
  return (
    <div
      className={`relative grid grid-cols-3 gap-2 overflow-hidden rounded px-1 py-0.5 ${side === "ask" ? "text-bear" : "text-bull"}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 right-0 opacity-10 ${side === "ask" ? "bg-bear" : "bg-bull"}`}
        style={{ width: `${depth}%` }}
      />
      <span>{fmtPrice(row.price)}</span>
      <span className="text-right text-foreground">{row.quantity.toPrecision(5)}</span>
      <span className="text-right text-foreground">{fmt(row.total)}</span>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="text-xs">
      <div className="text-muted-foreground">{k}</div>
      <div className="font-mono">{v}</div>
    </div>
  );
}

function CurrencyAmount({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <img src="/bluxq-icon.png" alt="" className="h-4 w-4 object-contain" />
      <span>{value}</span>
    </span>
  );
}

function Row({ k, v, cls = "" }: { k: string; v: ReactNode; cls?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground font-sans">{k}</span>
      <span className={cls}>{v}</span>
    </div>
  );
}
