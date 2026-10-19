import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BarChart3, Clock3, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Protected } from "@/components/AppShell";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getMarketPoolInsights, marketStake, marketUnstake } from "@/lib/blux.functions";
import { fmt, FEE_RATE, MARKETS } from "@/lib/markets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/stake")({
  head: () => ({
    meta: [
      { title: "Pools — Bluxq" },
      {
        name: "description",
        content: "Alocação de liquidez por mercado com histórico e traders da pool.",
      },
    ],
  }),
  component: () => (
    <Protected>
      <Stake />
    </Protected>
  ),
});

type Pool = {
  symbol: string;
  total_assets: number;
  total_shares: number;
  total_reserved: number;
  fees_to_stakers: number;
};
type Insight = {
  daily: {
    day: string;
    total_assets: number;
    total_reserved: number;
    fees_to_stakers: number;
    nav: number;
  }[];
  traders: {
    rank: number;
    displayName: string;
    avatarUrl: string | null;
    trades: number;
    open: number;
    volume: number;
    pnl: number;
    fees: number;
  }[];
};

function Stake() {
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const placeStake = useServerFn(marketStake);
  const withdrawStake = useServerFn(marketUnstake);
  const readInsights = useServerFn(getMarketPoolInsights);
  const [selected, setSelected] = useState("BTCUSDT");
  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [duration, setDuration] = useState(30);

  const { data: pools = [], isLoading } = useQuery({
    queryKey: ["market-pools"],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_pools")
        .select("symbol,total_assets,total_shares,total_reserved,fees_to_stakers")
        .order("symbol");
      if (error) throw error;
      return (data ?? []) as Pool[];
    },
  });
  const selectedPool = pools.find((pool) => pool.symbol === selected) ?? pools[0];
  const { data: mine } = useQuery({
    queryKey: ["market-stake", session?.user.id, selectedPool?.symbol],
    enabled: Boolean(session && selectedPool),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_stakes")
        .select("deposited,shares,started_at")
        .eq("user_id", session!.user.id)
        .eq("symbol", selectedPool!.symbol)
        .maybeSingle();
      if (error) throw error;
      return data as { deposited: number; shares: number; started_at: string } | null;
    },
  });
  const { data: insight } = useQuery({
    queryKey: ["market-insights", selectedPool?.symbol],
    enabled: Boolean(session && selectedPool),
    refetchInterval: 15000,
    queryFn: () => readInsights({ data: { symbol: selectedPool!.symbol } }) as Promise<Insight>,
  });
  const filtered = useMemo(
    () =>
      pools.filter((pool) => {
        const item = MARKETS.find((m) => m.symbol === pool.symbol);
        const q = search.trim().toLowerCase();
        return !q || `${item?.base ?? pool.symbol} ${item?.name ?? ""}`.toLowerCase().includes(q);
      }),
    [pools, search],
  );
  const totalAssets = Number(selectedPool?.total_assets ?? 0);
  const totalShares = Number(selectedPool?.total_shares ?? 0);
  const pps = totalShares > 0 ? totalAssets / totalShares : 1;
  const stakeValue = Number(mine?.shares ?? 0) * pps;
  const free = Math.max(0, totalAssets - Number(selectedPool?.total_reserved ?? 0));
  const profit = stakeValue - Number(mine?.deposited ?? 0);
  const allocation = Number(amount) || 0;
  const balance = Number(profile?.balance ?? 0);
  const market = MARKETS.find((item) => item.symbol === selectedPool?.symbol);
  const firstNav = Number(insight?.daily?.[0]?.nav ?? 1);
  const currentNav = Number(insight?.daily?.at(-1)?.nav ?? pps);
  const periodReturn = firstNav ? (currentNav / firstNav - 1) * 100 : 0;
  const rateReference =
    totalAssets > 0 ? Number(selectedPool?.fees_to_stakers ?? 0) / totalAssets : 0;
  const estimatedReturn = allocation * rateReference * (duration / 30);

  async function run(fn: () => Promise<unknown>, message: string) {
    try {
      await fn();
      toast.success(message);
      setAmount("");
      setDetailsOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["market-pools"] }),
        qc.invalidateQueries({ queryKey: ["market-stake"] }),
        qc.invalidateQueries({ queryKey: ["market-insights"] }),
        qc.invalidateQueries({ queryKey: ["profile"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    }
  }
  function selectPool(symbol: string) {
    setSelected(symbol);
    setDetailsOpen(true);
    setAmount("");
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-primary">
            Liquidez por mercado
          </div>
          <h1 className="mt-1 text-2xl font-bold">Pools</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha uma moeda, veja quem negocia nela e aloque BLUX diretamente nessa pool.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar moeda"
            className="h-9 pl-9 pr-8"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-2">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Card k="Pools ativas" v={String(pools.length)} />
        <Card
          k="Liquidez total"
          v={`$BX ${fmt(pools.reduce((sum, pool) => sum + Number(pool.total_assets), 0))}`}
        />
        <Card k="Pool selecionada" v={market?.base ?? "—"} />
        <Card k="Janela de dados" v="14 dias" />
      </div>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {filtered.map((pool) => {
          const item = MARKETS.find((m) => m.symbol === pool.symbol);
          const active = selectedPool?.symbol === pool.symbol;
          return (
            <button
              key={pool.symbol}
              type="button"
              onClick={() => selectPool(pool.symbol)}
              className={`rounded-xl border p-4 text-left transition ${active ? "border-primary bg-primary/10" : "bg-card hover:border-primary/60"}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{item?.base ?? pool.symbol}</span>
                <span className="text-[10px] uppercase text-bull">Ativa</span>
              </div>
              <div className="mt-3 font-mono text-lg">$BX {fmt(pool.total_assets)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Livre $BX{" "}
                {fmt(Math.max(0, Number(pool.total_assets) - Number(pool.total_reserved)))}
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${Math.min(100, Number(pool.total_assets) ? (Number(pool.total_reserved) / Number(pool.total_assets)) * 100 : 0)}%`,
                  }}
                />
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {fmt(pool.total_reserved)} reservado
              </div>
            </button>
          );
        })}
      </section>
      {isLoading && (
        <div className="rounded-xl border p-10 text-center text-muted-foreground">
          Carregando pools…
        </div>
      )}
      {selectedPool && (
        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5 rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-primary">
                  Pool {market?.base ?? selectedPool.symbol}
                </div>
                <h2 className="mt-1 text-2xl font-bold">
                  {market?.name ?? selectedPool.symbol}/USDT
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Apenas operações deste mercado entram nestas métricas e remuneram seus alocadores.
                </p>
              </div>
              <Button onClick={() => setDetailsOpen(true)}>Ver detalhes</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Card k="Total na pool" v={`$BX ${fmt(totalAssets)}`} />
              <Card k="Em operações" v={`$BX ${fmt(selectedPool.total_reserved)}`} />
              <Card k="Livre agora" v={`$BX ${fmt(free)}`} />
              <Card k="Taxas stakers" v={`$BX ${fmt(selectedPool.fees_to_stakers)}`} />
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">Rendimento dos últimos 14 dias</div>
                  <div
                    className={`mt-1 font-mono text-lg ${periodReturn >= 0 ? "text-bull" : "text-bear"}`}
                  >
                    {periodReturn >= 0 ? "+" : ""}
                    {periodReturn.toFixed(2)}%
                  </div>
                </div>
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-4 flex h-24 items-end gap-1">
                {(insight?.daily ?? []).map((day) => (
                  <div
                    key={day.day}
                    title={`${day.day}: NAV ${Number(day.nav).toFixed(6)}`}
                    className="min-w-1 flex-1 rounded-t bg-primary/70"
                    style={{
                      height: `${Math.max(8, Math.min(100, (Number(day.nav) / Math.max(currentNav, 1)) * 100))}%`,
                    }}
                  />
                ))}
                {!insight?.daily?.length && (
                  <div className="grid w-full place-items-center text-xs text-muted-foreground">
                    O histórico será preenchido conforme a pool operar.
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">Top 10 traders desta pool</h3>
                <span className="text-xs text-muted-foreground">volume · últimos 14 dias</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="pb-2">#</th>
                      <th>Trader</th>
                      <th>Operações</th>
                      <th>Volume</th>
                      <th>PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(insight?.traders ?? []).map((trader) => (
                      <tr key={trader.rank} className="border-t border-border/60">
                        <td className="py-2 font-mono text-primary">{trader.rank}</td>
                        <td className="py-2 font-semibold">{trader.displayName}</td>
                        <td className="py-2 font-mono">
                          {trader.trades}
                          {trader.open ? (
                            <span className="ml-1 text-xs text-primary">
                              ({trader.open} abertas)
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 font-mono">$BX {fmt(trader.volume)}</td>
                        <td
                          className={`py-2 font-mono ${trader.pnl >= 0 ? "text-bull" : "text-bear"}`}
                        >
                          {trader.pnl >= 0 ? "+" : ""}
                          {fmt(trader.pnl)}
                        </td>
                      </tr>
                    ))}
                    {!insight?.traders?.length && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-muted-foreground">
                          Ainda não há traders nesta pool.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <section className="h-fit rounded-xl border bg-card p-5 lg:sticky lg:top-20">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Alocar nesta pool</h2>
              <span className="text-xs text-muted-foreground">Saldo $BX {fmt(balance)}</span>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                Você empresta BLUX para {market?.base ?? selectedPool.symbol}. As taxas das
                operações deste mercado aumentam o valor das suas cotas.
              </div>
              <Input
                type="number"
                min="1"
                max={balance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Quanto deseja alocar?"
                className="font-mono"
              />
              <div className="flex gap-2">
                {[0.25, 0.5, 1].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setAmount(String(Math.floor(balance * f * 100) / 100))}
                    className="rounded border px-2 py-1 text-xs text-muted-foreground hover:border-primary"
                  >
                    {f * 100}% do saldo
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  disabled={!allocation || allocation > balance || isLoading}
                  onClick={() =>
                    run(
                      () =>
                        placeStake({ data: { symbol: selectedPool.symbol, amount: allocation } }),
                      "BLUX alocado na pool",
                    )
                  }
                >
                  Alocar
                </Button>
                <Button
                  variant="outline"
                  disabled={!allocation || allocation > stakeValue || isLoading}
                  onClick={() =>
                    run(
                      () =>
                        withdrawStake({
                          data: { symbol: selectedPool.symbol, amount: allocation },
                        }),
                      "Alocação retirada",
                    )
                  }
                >
                  Retirar
                </Button>
              </div>
              <div className="space-y-1 border-t pt-3 text-sm">
                <Row k="Sua posição" v={`$BX ${fmt(stakeValue)}`} />
                <Row k="Capital depositado" v={`$BX ${fmt(mine?.deposited)}`} />
                <Row
                  k="Resultado atual"
                  v={`${profit >= 0 ? "+" : ""}$BX ${fmt(profit)}`}
                  cls={profit >= 0 ? "text-bull" : "text-bear"}
                />
                <Row
                  k="Início da alocação"
                  v={mine?.started_at ? new Date(mine.started_at).toLocaleDateString("pt-BR") : "—"}
                />
              </div>
            </div>
          </section>
        </section>
      )}
      {detailsOpen && selectedPool && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          onClick={() => setDetailsOpen(false)}
        >
          <section
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-primary">
                  Detalhes da pool
                </div>
                <h2 className="mt-1 text-xl font-bold">{market?.name ?? selectedPool.symbol}</h2>
              </div>
              <button type="button" onClick={() => setDetailsOpen(false)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Card k="NAV atual" v={currentNav.toFixed(6)} />
              <Card k="Taxa trader" v={`${FEE_RATE * 100}%`} />
              <Card k="Prazo" v="Flexível" />
            </div>
            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Clock3 className="h-4 w-4 text-primary" />
                Simulação de retorno
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[7, 30, 90].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setDuration(days)}
                    className={`rounded-lg border px-3 py-2 text-sm ${duration === days ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground"}`}
                  >
                    {days} dias
                  </button>
                ))}
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <Row k="Retorno estimado" v={`+$BX ${fmt(estimatedReturn)}`} cls="text-bull" />
                <Row
                  k="Total estimado"
                  v={`$BX ${fmt(allocation + estimatedReturn)}`}
                  cls="text-gold"
                />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                O prazo é uma projeção, não um bloqueio. Você pode retirar quando quiser, desde que
                a liquidez livre desta pool seja suficiente. O retorno real varia conforme o volume,
                lucros, liquidações e taxas dos traders.
              </p>
              <Button
                className="w-full"
                disabled={!allocation || allocation > balance}
                onClick={() =>
                  run(
                    () => placeStake({ data: { symbol: selectedPool.symbol, amount: allocation } }),
                    "BLUX alocado na pool",
                  )
                }
              >
                Confirmar alocação de $BX {fmt(allocation)}
              </Button>
            </div>
          </section>
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
function Row({ k, v, cls = "" }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className={`font-mono ${cls}`}>{v}</span>
    </div>
  );
}
