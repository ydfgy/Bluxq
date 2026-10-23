import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
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
  const { pathname } = useLocation();
  const isOverview = pathname === "/stake" || pathname === "/stake/";

  const {
    data: pools = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["market-pools", "stake"],
    enabled: isOverview,
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

  if (!isOverview) {
    return <Outlet />;
  }

  const poolBySymbol = new Map(pools.map((pool) => [pool.symbol, pool]));
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
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
