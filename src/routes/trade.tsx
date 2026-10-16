import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Protected, CoinRain } from "@/components/AppShell";
import { PriceChart, type Line } from "@/components/PriceChart";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { openPosition, closePosition, syncPositions } from "@/lib/blux.functions";
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
import { Slider } from "@/components/ui/slider";

export const Route = createFileRoute("/trade")({
  head: () => ({
    meta: [
      { title: "Trade com alavancagem — BluxTrade" },
      {
        name: "description",
        content: "Opere Long e Short em cripto real com Blux e alavancagem até 50x.",
      },
      { property: "og:title", content: "Trade — BluxTrade" },
      { property: "og:description", content: "Gráfico ao vivo, Long/Short e alavancagem até 50x." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Protected>
      <Trade />
    </Protected>
  ),
});

const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"];

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
    fetchOrderBook(symbol)
      .then((next) => {
        if (!dead) setBook(next);
      })
      .catch(() => {});
    try {
      socket = connectOrderBookStream(
        symbol,
        (next) => {
          if (!dead) setBook(next);
        },
        () => {},
      );
    } catch {
      // O snapshot REST continua disponível mesmo se o stream estiver indisponível.
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
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setIntervalV] = useState("15m");
  const [price, setPrice] = useState(0);
  const [margin, setMargin] = useState("100");
  const [lev, setLev] = useState(MIN_LEVERAGE);
  const [busy, setBusy] = useState(false);
  const [rain, setRain] = useState(0);
  const [marketMenuOpen, setMarketMenuOpen] = useState(false);
  const [tab, setTab] = useState<"open" | "history">("open");
  const { data: tickers } = useTickers();
  const orderBook = useOrderBook(symbol);
  const { data: pool } = useQuery({
    queryKey: ["pool"],
    refetchInterval: 5000,
    queryFn: async () =>
      (await supabase.from("pool").select("total_assets,total_reserved").single()).data,
  });
  const open = useServerFn(openPosition);
  const close = useServerFn(closePosition);
  const sync = useServerFn(syncPositions);

  const { data: positions = [] } = useQuery({
    queryKey: ["positions", session?.user.id],
    refetchInterval: 4000,
    queryFn: async () =>
      (
        await supabase
          .from("positions")
          .select("*")
          .order("opened_at", { ascending: false })
          .limit(100)
      ).data ?? [],
  });
  const openPos = positions.filter((p) => p.status === "open");
  const history = positions.filter((p) => p.status !== "open");
  const t = tickers?.[symbol];
  const currentPrice = price || Number(t?.lastPrice ?? 0);

  // preços ao vivo de todas as moedas com posição aberta
  const livePx = (s: string) =>
    s === symbol && currentPrice ? currentPrice : Number(tickers?.[s]?.lastPrice ?? 0);

  useEffect(() => {
    const t = setInterval(() => {
      sync().catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [sync]);

  const m = Number(margin) || 0;
  const poolFree = Math.max(0, Number(pool?.total_assets ?? 0) - Number(pool?.total_reserved ?? 0));
  // A posição reserva margem * (alavancagem + 4): dívida + lucro máximo garantido.
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
            color: p.side === "long" ? "#22c55e" : "#ef4444",
            title: `${p.side === "long" ? "LONG" : "SHORT"} ${p.leverage}x entrada`,
          },
          { price: Number(p.liq_price), color: "#f59e0b", title: "Liquidação" },
        ]),
    [JSON.stringify(openPos.map((p) => p.id)), symbol],
  );

  async function go(side: "long" | "short") {
    setBusy(true);
    try {
      if (poolMaxLev < MIN_LEVERAGE)
        throw new Error(
          `A pool tem liquidez para no máximo ${Math.max(poolMaxLev, 0)}x nesta margem. Reduza a margem ou aguarde novos stakes.`,
        );
      if (lev > poolMaxLev)
        throw new Error(`A alavancagem máxima disponível agora é ${poolMaxLev}x.`);
      const r = await open({ data: { symbol, side, margin: m, leverage: lev } });
      toast.success(`${side === "long" ? "Long" : "Short"} aberto a ${fmtPrice(r.price ?? 0)}`);
      qc.invalidateQueries();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir a posição.");
    } finally {
      setBusy(false);
    }
  }
  async function doClose(id: string) {
    try {
      const r = await close({ data: { id } });
      if (r.pnl > 0) setRain(Date.now());
      toast[r.pnl >= 0 ? "success" : "error"](
        `Fechada: ${r.pnl >= 0 ? "+" : ""}${fmt(r.pnl)} B$ (taxa ${fmt(r.fee)})`,
      );
      qc.invalidateQueries();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível fechar a posição.");
    }
  }

  const chg = Number(t?.priceChangePercent ?? 0);
  const unreal = openPos.reduce(
    (a, p) =>
      a + calcPnl(p.side, Number(p.qty), Number(p.entry_price), livePx(p.symbol), Number(p.margin)),
    0,
  );

  return (
    <main className="mx-auto max-w-[1600px] p-3 grid gap-3 lg:grid-cols-[220px_1fr_320px]">
      <CoinRain show={rain} />
      {/* livro de ordens */}
      <aside className="rounded-xl border bg-card overflow-hidden order-2 lg:order-1">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs uppercase text-muted-foreground">Livro de ordens</span>
          <span className="text-[10px] text-muted-foreground">tempo real</span>
        </div>
        <div className="grid grid-cols-3 px-3 py-2 text-[10px] text-muted-foreground">
          <span>Preço (USDT)</span>
          <span className="text-right">Qtd.</span>
          <span className="text-right">Total</span>
        </div>
        <div className="px-2 font-mono text-[11px]">
          <div className="space-y-0.5">
            {(orderBook?.asks.slice().reverse() ?? []).map((row) => (
              <OrderRow key={`ask-${row.price}`} row={row} side="ask" />
            ))}
          </div>
          <div className="my-2 flex items-center justify-between border-y border-border/60 py-2 text-base font-bold">
            <span className="text-primary">{currentPrice ? fmtPrice(currentPrice) : "—"}</span>
            <span className="text-[10px] font-normal text-muted-foreground">
              {orderBook ? "● ao vivo" : "carregando"}
            </span>
          </div>
          <div className="space-y-0.5">
            {(orderBook?.bids ?? []).map((row) => (
              <OrderRow key={`bid-${row.price}`} row={row} side="bid" />
            ))}
          </div>
          {!orderBook && (
            <div className="py-6 text-center font-sans text-xs text-muted-foreground">
              Carregando ordens…
            </div>
          )}
        </div>
      </aside>

      {/* gráfico */}
      <section className="-mt-2 space-y-3 order-1 lg:order-2 min-w-0">
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="sticky top-14 z-20 flex flex-wrap items-center gap-x-6 gap-y-1 border-b bg-card/95 p-3 backdrop-blur">
            <div className="relative">
              <button
                onClick={() => setMarketMenuOpen((open) => !open)}
                className="flex items-center gap-2 text-lg font-bold hover:text-primary"
              >
                <MarketIcon
                  base={
                    MARKETS.find((mk) => mk.symbol === symbol)?.icon ??
                    symbol.replace("USDT", "").toLowerCase()
                  }
                  size="md"
                />
                {symbol.replace("USDT", "")}/USDT{" "}
                <span className="text-xs text-muted-foreground">⌄</span>
              </button>
              {marketMenuOpen && (
                <div className="absolute left-0 top-10 z-30 w-52 rounded-lg border bg-card p-1 shadow-xl">
                  {MARKETS.map((mk) => (
                    <button
                      key={mk.symbol}
                      onClick={() => {
                        setSymbol(mk.symbol);
                        setPrice(0);
                        setMarketMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded px-2 py-2 text-sm hover:bg-muted ${symbol === mk.symbol ? "bg-muted" : ""}`}
                    >
                      <span className="flex items-center gap-2">
                        <MarketIcon base={mk.icon} />
                        {mk.base}/USDT
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {tickers?.[mk.symbol]?.lastPrice
                          ? fmtPrice(Number(tickers[mk.symbol]?.lastPrice))
                          : "—"}
                      </span>
                    </button>
                  ))}
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
          <div className="h-[460px] p-1">
            <PriceChart symbol={symbol} interval={interval} lines={lines} onPrice={setPrice} />
          </div>
        </div>

        {/* posições */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center gap-4 border-b px-3">
            {(["open", "history"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`py-2 text-sm ${tab === k ? "border-b-2 border-primary font-semibold" : "text-muted-foreground"}`}
              >
                {k === "open" ? `Posições abertas (${openPos.length})` : "Histórico"}
              </button>
            ))}
            {tab === "open" && openPos.length > 0 && (
              <span
                className={`ml-auto font-mono text-sm ${unreal >= 0 ? "text-bull" : "text-bear"}`}
              >
                PnL total {unreal >= 0 ? "+" : ""}
                {fmt(unreal)} B$
              </span>
            )}
          </div>
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
                  <th>Liquidação</th>
                  <th>PnL</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {(tab === "open" ? openPos : history).map((p) => {
                  const px = tab === "open" ? livePx(p.symbol) : Number(p.exit_price ?? 0);
                  const pnl =
                    tab === "open"
                      ? calcPnl(p.side, Number(p.qty), Number(p.entry_price), px, Number(p.margin))
                      : Number(p.pnl ?? 0);
                  const roe = (pnl / Number(p.margin)) * 100;
                  return (
                    <tr key={p.id} className="border-t">
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
                          <Button size="sm" variant="outline" onClick={() => doClose(p.id)}>
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
        </div>
      </section>

      {/* ordem */}
      <aside className="rounded-xl border bg-card p-4 space-y-4 order-3 h-fit lg:sticky lg:top-16">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Saldo</span>
          <span className="font-mono text-gold">B$ {fmt(profile?.balance)}</span>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Margem (B$)</label>
          <Input
            type="number"
            min={10}
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            className="font-mono"
          />
          <div className="flex gap-1">
            {[0.1, 0.25, 0.5, 1].map((f) => (
              <button
                key={f}
                onClick={() => setMargin(String(Math.floor(Number(profile?.balance ?? 0) * f)))}
                className="flex-1 rounded border py-1 text-xs hover:bg-muted"
              >
                {f * 100}%
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Alavancagem</span>
            <span className="rounded-md border border-primary/40 bg-primary/10 px-2 py-1 font-mono font-bold text-primary">
              {lev}x
            </span>
          </div>
          <Slider
            aria-label="Alavancagem"
            min={MIN_LEVERAGE}
            max={sliderMax}
            step={1}
            value={[Math.min(lev, sliderMax)]}
            onValueChange={(v) => setLev(v[0] ?? MIN_LEVERAGE)}
            className="py-2"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
            <span>{MIN_LEVERAGE}x mín.</span>
            <span>arraste para ajustar</span>
            <span>{poolMaxLev > 0 ? `${poolMaxLev}x máx.` : "indisponível"}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Pool livre: <span className="font-mono text-gold">B$ {fmt(poolFree)}</span>
          </div>
        </div>
        <div className="rounded-lg bg-muted/40 p-3 space-y-1 text-xs font-mono">
          <Row k="Tamanho da posição" v={`${fmt(size)} B$`} />
          <Row
            k="Quantidade"
            v={
              currentPrice
                ? `${(size / currentPrice).toPrecision(5)} ${symbol.replace("USDT", "")}`
                : "—"
            }
          />
          <Row k="Liquidação Long" v={currentPrice ? fmtPrice(liqLong) : "—"} cls="text-bull" />
          <Row k="Liquidação Short" v={currentPrice ? fmtPrice(liqShort) : "—"} cls="text-bear" />
          <Row k="Movimento p/ liquidar" v={`${((LIQ_LOSS / lev) * 100).toFixed(2)}%`} />
          <Row k="Lucro máximo" v={`${fmt(m * PROFIT_CAP)} B$`} />
          <Row k="Taxa" v={`${FEE_RATE * 100}% do lucro`} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            disabled={
              busy || !currentPrice || m < 10 || poolMaxLev < MIN_LEVERAGE || lev > poolMaxLev
            }
            onClick={() => go("long")}
            className="bg-bull text-bull-foreground hover:bg-bull/90"
          >
            Long ↑
          </Button>
          <Button
            disabled={
              busy || !currentPrice || m < 10 || poolMaxLev < MIN_LEVERAGE || lev > poolMaxLev
            }
            onClick={() => go("short")}
            className="bg-bear text-bear-foreground hover:bg-bear/90"
          >
            Short ↓
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Preços reais da Binance. Alavancagem mínima: {MIN_LEVERAGE}x. O máximo varia conforme a
          liquidez livre da pool, até {MAX_LEVERAGE}x. Você é liquidado quando perde{" "}
          {LIQ_LOSS * 100}% da margem. O lucro é pago pela pool e limitado a {PROFIT_CAP}x a margem.
        </p>
      </aside>
    </main>
  );
}

function OrderRow({
  row,
  side,
}: {
  row: { price: number; quantity: number; total: number };
  side: "ask" | "bid";
}) {
  return (
    <div
      className={`grid grid-cols-3 gap-2 rounded px-1 py-0.5 ${side === "ask" ? "text-bear" : "text-bull"}`}
    >
      <span>{fmtPrice(row.price)}</span>
      <span className="text-right text-foreground">{row.quantity.toPrecision(5)}</span>
      <span className="text-right text-foreground">{row.total.toPrecision(5)}</span>
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
function Row({ k, v, cls = "" }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground font-sans">{k}</span>
      <span className={cls}>{v}</span>
    </div>
  );
}

function MarketIcon({ base, size = "sm" }: { base: string; size?: "sm" | "md" }) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-full bg-muted font-mono text-[9px] text-muted-foreground ${size === "md" ? "h-7 w-7" : "h-5 w-5"}`}
    >
      <span aria-hidden="true">{base.slice(0, 1).toUpperCase()}</span>
      <img
        src={`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${base}.png`}
        alt=""
        className={`${size === "md" ? "h-7 w-7" : "h-5 w-5"} rounded-full`}
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
      <span className="sr-only">{base}</span>
    </span>
  );
}
