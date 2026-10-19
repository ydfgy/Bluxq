import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Protected } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { fmt, MARKETS } from "@/lib/markets";
import { Input } from "@/components/ui/input";

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
  const { data: pools = [], isLoading } = useQuery({
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
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-8">
      <div className="flex justify-start">
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
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card k="Pools ativas" v={String(pools.length)} />
        <Card k="Liquidez total" v={`$BX ${fmt(totalAssets)}`} />
        <Card k="Janela de dados" v="14 dias" />
      </div>
      {isLoading ? (
        <div className="rounded-xl border p-10 text-center text-muted-foreground">
          Carregando pools…
        </div>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {filtered.map((pool) => {
            const market = MARKETS.find((item) => item.symbol === pool.symbol);
            const reserved = Number(pool.total_reserved);
            const assets = Number(pool.total_assets);
            return (
              <Link
                key={pool.symbol}
                to="/stake/$symbol"
                params={{ symbol: pool.symbol }}
                className="block rounded-xl border bg-card p-4 text-left transition hover:border-primary/70 hover:bg-primary/5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">{market?.base ?? pool.symbol}</span>
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
                <div className="mt-3 text-xs font-semibold text-primary">Abrir pool →</div>
              </Link>
            );
          })}
        </section>
      )}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-xl border p-10 text-center text-sm text-muted-foreground">
          Nenhuma pool encontrada.
        </div>
      )}
    </main>
  );
}

function Card({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-mono text-lg">{v}</div>
    </div>
  );
}
