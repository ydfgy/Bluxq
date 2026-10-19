import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, Layers3, RefreshCw, Search, X } from "lucide-react";
import { Protected } from "@/components/AppShell";
import { MarketIcon } from "@/components/MarketIcon";
import { supabase } from "@/integrations/supabase/client";
import { fmt, MARKETS } from "@/lib/markets";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/stake")({
  head: () => ({ meta: [{ title: "Pools — Bluxq" }] }),
  component: () => (
    <Protected>
      <Stake />
    </Protected>
  ),
});

type Pool = { symbol: string; total_assets: number; total_reserved: number };

function Stake() {
  const [search, setSearch] = useState("");
  const {
    data: pools = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["market-pools"],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_pools")
        .select("symbol,total_assets,total_reserved")
        .order("symbol");
      if (error) throw error;
      return (data ?? []) as Pool[];
    },
  });
  const filtered = useMemo(
    () =>
      pools.filter((pool) => {
        const market = MARKETS.find((item) => item.symbol === pool.symbol);
        const query = search.trim().toLowerCase();
        return (
          !query ||
          `${market?.base ?? pool.symbol} ${market?.name ?? ""}`.toLowerCase().includes(query)
        );
      }),
    [pools, search],
  );
  const totalAssets = pools.reduce((sum, pool) => sum + Number(pool.total_assets), 0);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <section className="rounded-2xl bg-hero p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Layers3 className="h-4 w-4" />
              Bluxq Stake
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Alocação por mercado</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Escolha uma pool, acompanhe o rendimento e aloque seu saldo $BX. Você pode abrir a
              mesma pool novamente a qualquer momento para consultar ou ajustar sua posição.
            </p>
          </div>
          <div className="rounded-xl bg-background/60 px-4 py-3 text-sm">
            <div className="text-xs text-muted-foreground">Saldo total nas pools</div>
            <div className="mt-1 font-mono text-lg text-gold">$BX {fmt(totalAssets)}</div>
          </div>
        </div>
      </section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar moeda"
            aria-label="Buscar moeda"
            className="h-9 pl-9 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-2"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "pool disponível" : "pools disponíveis"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card k="Pools ativas" v={String(pools.length)} />
        <Card k="Liquidez total" v={`$BX ${fmt(totalAssets)}`} />
        <Card k="Janela de dados" v="14 dias" />
      </div>
      {isLoading ? (
        <div className="rounded-xl bg-card/60 p-10 text-center text-muted-foreground">
          Carregando pools…
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-bear/30 bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">Não foi possível carregar as pools agora.</p>
          <Button className="mt-4" variant="outline" onClick={() => void refetch()}>
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </Button>
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((pool) => {
            const market = MARKETS.find((item) => item.symbol === pool.symbol);
            const reserved = Number(pool.total_reserved);
            const assets = Number(pool.total_assets);
            return (
              <Link
                key={pool.symbol}
                to="/stake/$symbol"
                params={{ symbol: pool.symbol }}
                className="group block rounded-2xl border bg-card p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-bold">
                    <MarketIcon base={market?.icon ?? pool.symbol.replace("USDT", "")} size="sm" />
                    {market?.base ?? pool.symbol}
                  </span>
                  <span className="text-[10px] uppercase text-bull">Ativa</span>
                </div>
                <div className="mt-3 font-mono text-lg">$BX {fmt(assets)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Livre $BX {fmt(Math.max(0, assets - reserved))}
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.min(100, assets ? (reserved / assets) * 100 : 0)}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {fmt(reserved)} reservado
                </div>
                <div className="mt-4 flex items-center justify-between text-xs font-semibold text-primary">
                  <span>Abrir pool e alocar</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </section>
      )}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-xl bg-card/60 p-10 text-center text-sm text-muted-foreground">
          Nenhuma pool encontrada.
        </div>
      )}
    </main>
  );
}

function Card({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-card p-4">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-mono text-lg">{v}</div>
    </div>
  );
}
