import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Coins, Layers3, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { MarketIcon } from "@/components/MarketIcon";
import { supabase } from "@/integrations/supabase/client";
import { MARKETS, fmt } from "@/lib/markets";

export const Route = createFileRoute("/stake")({
  head: () => ({
    meta: [
      { title: "Stake — Bluxq" },
      { name: "description", content: "Escolha uma moeda e aloque saldo em uma pool de liquidez." },
    ],
  }),
  component: StakeOverview,
});

type Pool = {
  symbol: string;
  total_assets: number;
  total_reserved: number;
  total_shares: number;
  fees_to_stakers: number;
};

function StakeOverview() {
  const {
    data: pools = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["market-pools", "stake"],
    refetchInterval: 8000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_pools")
        .select("symbol,total_assets,total_reserved,total_shares,fees_to_stakers")
        .in(
          "symbol",
          MARKETS.map((market) => market.symbol),
        );
      if (error) throw error;
      return (data ?? []) as Pool[];
    },
  });

  const poolBySymbol = new Map(pools.map((pool) => [pool.symbol, pool]));
  const totalLiquidity = pools.reduce((sum, pool) => sum + Number(pool.total_assets ?? 0), 0);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-gold/25 bg-hero p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold">
              <Layers3 className="h-3.5 w-3.5" /> Liquidity pools
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Faça seu saldo trabalhar
            </h1>
            <p className="mt-3 text-muted-foreground">
              Escolha uma moeda, compare a liquidez disponível e aloque seus $BX na pool que fizer
              sentido para você.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
            <Metric
              icon={<Coins className="h-4 w-4" />}
              label="Pools ativas"
              value={String(pools.length)}
            />
            <Metric
              icon={<TrendingUp className="h-4 w-4" />}
              label="Liquidez total"
              value={`${fmt(totalLiquidity)} $BX`}
            />
          </div>
        </div>
      </section>

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Moedas disponíveis</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Selecione um ativo para ver as informações da pool.
          </p>
        </div>
        <span className="hidden text-xs text-muted-foreground sm:block">
          Dados atualizados em tempo real
        </span>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MARKETS.map((market) => (
            <div key={market.symbol} className="h-44 animate-pulse rounded-xl border bg-card" />
          ))}
        </div>
      ) : (
        <>
          {isError && (
            <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm text-gold">
              Os valores das pools estão temporariamente indisponíveis, mas você ainda pode abrir
              qualquer moeda para ver seus detalhes.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MARKETS.map((market) => {
              const pool = poolBySymbol.get(market.symbol);
              const available = Math.max(
                0,
                Number(pool?.total_assets ?? 0) - Number(pool?.total_reserved ?? 0),
              );
              return (
                <Link
                  key={market.symbol}
                  to="/stake/$symbol"
                  params={{ symbol: market.symbol }}
                  className="group rounded-xl border bg-card p-5 transition-colors hover:border-gold/60 hover:bg-gold/[0.04]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <MarketIcon base={market.base} size="md" />
                      <div>
                        <div className="font-bold">{market.base}</div>
                        <div className="text-xs text-muted-foreground">{market.name}</div>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-gold" />
                  </div>
                  <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Liquidez</div>
                      <div className="mt-1 font-mono">
                        {pool ? `${fmt(pool.total_assets)} $BX` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Disponível</div>
                      <div className="mt-1 font-mono text-bull">
                        {pool ? `${fmt(available)} $BX` : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                    <span>Pool {market.base}/$BX</span>
                    <span className="text-gold">Ver detalhes</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-mono text-sm font-bold">{value}</div>
    </div>
  );
}
