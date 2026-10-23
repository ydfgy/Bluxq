import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { MarketIcon } from "@/components/MarketIcon";
import { PriceChart } from "@/components/PriceChart";
import { supabase } from "@/integrations/supabase/client";
import { getBinanceTickers } from "@/lib/market-data";
import { MARKETS, fmt, fmtPrice } from "@/lib/markets";

export const Route = createFileRoute("/stake/$symbol")({
  head: ({ params }) => ({
    meta: [{ title: `Pool ${params.symbol.replace("USDT", "")} — Bluxq` }],
  }),
  component: StakeDetails,
});

type Pool = {
  symbol: string;
  total_assets: number;
  total_reserved: number;
  total_shares: number;
  fees_to_stakers: number;
};

function StakeDetails() {
  const { symbol } = Route.useParams();
  const market = MARKETS.find((item) => item.symbol === symbol) ?? MARKETS[0];
  const [interval, setInterval] = useState("15m");
  const [price, setPrice] = useState(0);

  const { data: pool, isLoading: poolLoading } = useQuery({
    queryKey: ["market-pool", symbol, "stake-page"],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_pools")
        .select("symbol,total_assets,total_reserved,total_shares,fees_to_stakers")
        .eq("symbol", symbol)
        .single();
      if (error) throw error;
      return data as Pool;
    },
  });
  const { data: tickers = {} } = useQuery({
    queryKey: ["market-tickers", symbol, "stake-page"],
    refetchInterval: 10000,
    queryFn: () => getBinanceTickers([symbol]),
  });

  const ticker = tickers[symbol];
  const totalAssets = Number(pool?.total_assets ?? 0);
  const available = Math.max(0, totalAssets - Number(pool?.total_reserved ?? 0));
  const change = Number(ticker?.priceChangePercent ?? 0);

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <a
        href="/stake"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para as moedas
      </a>

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <MarketIcon base={market.base} size="md" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Pool {market.base}</h1>
              <span className="rounded-full bg-bull/10 px-2 py-1 text-[11px] font-semibold text-bull">
                Ativa
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{market.name} / $BX</p>
          </div>
        </div>
        <div className={`font-mono text-xl ${change >= 0 ? "text-bull" : "text-bear"}`}>
          {price || ticker?.lastPrice ? fmtPrice(price || Number(ticker?.lastPrice)) : "…"}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PoolStat label="Pool total" value={poolLoading ? "…" : `${fmt(totalAssets)} $BX`} />
        <PoolStat
          label="Disponível"
          value={poolLoading ? "…" : `${fmt(available)} $BX`}
          tone="bull"
        />
        <PoolStat
          label="Volume 24h"
          value={ticker ? `$${fmt(Number(ticker.quoteVolume) / 1e6, 1)}M` : "—"}
          tone="primary"
        />
        <PoolStat
          label="Variação 24h"
          value={`${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
          tone={change >= 0 ? "bull" : "bear"}
        />
      </section>

      <section className="overflow-hidden rounded-xl border bg-transparent">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="h-4 w-4 text-primary" />
            Gráfico de {market.base}
          </div>
          <div className="flex gap-1">
            {["1m", "5m", "15m", "1h", "4h", "1d"].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInterval(value)}
                className={`rounded px-2 py-1 text-xs font-mono ${interval === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-primary/10"}`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[390px] bg-black p-2 sm:h-[460px]">
          <PriceChart symbol={symbol} interval={interval} lines={[]} onPrice={setPrice} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-3 sm:grid-cols-3">
          <Info title="Liquidez da pool" value={`${fmt(totalAssets)} $BX`} />
          <Info title="Reservado em posições" value={`${fmt(pool?.total_reserved)} $BX`} />
          <Info title="Taxas para stakers" value={`${fmt(pool?.fees_to_stakers)} $BX`} />
        </div>
        <QuickTrade symbol={symbol} base={market.base} />
      </section>
    </main>
  );
}

function PoolStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "bull" | "bear";
}) {
  const toneClass = {
    default: "text-foreground",
    primary: "text-primary",
    bull: "text-bull",
    bear: "text-bear",
  }[tone];
  return (
    <div className="rounded-lg border px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-sm font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function Info({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border px-4 py-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-2 font-mono font-semibold">{value}</div>
    </div>
  );
}

function QuickTrade({ symbol, base }: { symbol: string; base: string }) {
  const href = `/trade?symbol=${encodeURIComponent(symbol)}`;
  return (
    <div className="rounded-xl border border-primary/40 p-4">
      <div className="flex items-center gap-2">
        <MarketIcon base={base} size="sm" />
        <div>
          <h2 className="font-semibold">Operar {base}</h2>
          <p className="text-xs text-muted-foreground">Abra uma posição no gráfico</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href={href}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-bull px-3 py-2 text-sm font-bold text-bull-foreground hover:brightness-110"
        >
          <TrendingUp className="h-4 w-4" /> Long
        </a>
        <a
          href={href}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-bear px-3 py-2 text-sm font-bold text-bear-foreground hover:brightness-110"
        >
          <TrendingDown className="h-4 w-4" /> Short
        </a>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        O painel completo de margem e alavancagem abre na tela Trade.
      </p>
    </div>
  );
}
