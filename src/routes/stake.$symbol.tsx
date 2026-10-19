import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, BarChart3, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { Protected } from "@/components/AppShell";
import { MarketIcon } from "@/components/MarketIcon";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getMarketPoolInsights, marketStake, marketUnstake } from "@/lib/blux.functions";
import { fmt, FEE_RATE, MARKETS } from "@/lib/markets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/stake/$symbol")({
  head: () => ({ meta: [{ title: "Detalhes da pool — Bluxq" }] }),
  component: () => (
    <Protected>
      <PoolDetails />
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
  daily: { day: string; nav: number }[];
  traders: {
    rank: number;
    displayName: string;
    trades: number;
    open: number;
    volume: number;
    pnl: number;
  }[];
};

function PoolDetails() {
  const { symbol } = Route.useParams();
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const stake = useServerFn(marketStake);
  const unstake = useServerFn(marketUnstake);
  const readInsights = useServerFn(getMarketPoolInsights);
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  const market = MARKETS.find((item) => item.symbol === symbol);
  const {
    data: pool,
    isLoading: poolLoading,
    isError: poolError,
  } = useQuery({
    queryKey: ["market-pool", symbol],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_pools")
        .select("symbol,total_assets,total_shares,total_reserved,fees_to_stakers")
        .eq("symbol", symbol)
        .single();
      if (error) throw error;
      return data as Pool;
    },
  });
  const { data: mine } = useQuery({
    queryKey: ["market-stake", session?.user.id, symbol],
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_stakes")
        .select("deposited,shares,started_at")
        .eq("user_id", session!.user.id)
        .eq("symbol", symbol)
        .maybeSingle();
      if (error) throw error;
      return data as { deposited: number; shares: number; started_at: string } | null;
    },
  });
  const { data: insight } = useQuery({
    queryKey: ["market-insights", symbol],
    enabled: Boolean(session),
    refetchInterval: 15000,
    queryFn: () => readInsights({ data: { symbol } }) as Promise<Insight>,
  });
  const totalAssets = Number(pool?.total_assets ?? 0);
  const totalShares = Number(pool?.total_shares ?? 0);
  const nav = totalShares > 0 ? totalAssets / totalShares : 1;
  const value = Number(mine?.shares ?? 0) * nav;
  const deposited = Number(mine?.deposited ?? 0);
  const free = Math.max(0, totalAssets - Number(pool?.total_reserved ?? 0));
  const profit = value - deposited;
  const allocation = Number(amount) || 0;
  const balance = Number(profile?.balance ?? 0);
  const amountIsValid = Number.isFinite(allocation) && allocation > 0;
  const firstNav = Number(insight?.daily?.[0]?.nav ?? 1);
  const return14d = firstNav ? (nav / firstNav - 1) * 100 : 0;
  const rateReference = totalAssets > 0 ? Number(pool?.fees_to_stakers ?? 0) / totalAssets : 0;
  const estimated = (allocation * rateReference * duration) / 30;

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      setAmount("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["market-pool", symbol] }),
        qc.invalidateQueries({ queryKey: ["market-stake"] }),
        qc.invalidateQueries({ queryKey: ["market-insights"] }),
        qc.invalidateQueries({ queryKey: ["profile"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    } finally {
      setBusy(false);
    }
  }

  if (poolLoading)
    return (
      <main className="mx-auto max-w-5xl p-6 text-muted-foreground">
        Carregando informações da pool…
      </main>
    );
  if (poolError || !pool)
    return (
      <main className="mx-auto max-w-5xl p-6 text-muted-foreground">
        Pool não encontrada ou indisponível no momento.
      </main>
    );
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      <Link
        to="/stake"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para todas as pools
      </Link>
      <div className="flex items-center gap-3">
        <MarketIcon base={market?.icon ?? symbol.replace("USDT", "")} size="lg" />
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-primary">
            Pool {market?.base ?? symbol.replace("USDT", "")}
          </div>
          <h1 className="mt-1 text-2xl font-bold">
            {market?.base ?? symbol.replace("USDT", "")}/USDT
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Informações, rendimento e alocação desta pool.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Card k="Total na pool" v={`$BX ${fmt(totalAssets)}`} />
        <Card k="Em operações" v={`$BX ${fmt(pool.total_reserved)}`} />
        <Card k="Livre agora" v={`$BX ${fmt(free)}`} />
        <Card k="Taxas stakers" v={`$BX ${fmt(pool.fees_to_stakers)}`} />
      </div>
      <section className="space-y-5">
        <div className="rounded-xl bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold">Rendimento dos últimos 14 dias</h2>
              <div
                className={`mt-1 font-mono text-lg ${return14d >= 0 ? "text-bull" : "text-bear"}`}
              >
                {return14d >= 0 ? "+" : ""}
                {return14d.toFixed(2)}%
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
                  height: `${Math.max(8, Math.min(100, (Number(day.nav) / Math.max(nav, 1)) * 100))}%`,
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
        <div className="rounded-xl bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Top 10 traders desta pool</h2>
            <span className="text-xs text-muted-foreground">últimos 14 dias</span>
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
                  <tr key={trader.rank}>
                    <td className="py-2 font-mono text-primary">{trader.rank}</td>
                    <td className="py-2 font-semibold">{trader.displayName}</td>
                    <td className="py-2 font-mono">
                      {trader.trades}
                      {trader.open ? (
                        <span className="ml-1 text-xs text-primary">({trader.open} abertas)</span>
                      ) : null}
                    </td>
                    <td className="py-2 font-mono">$BX {fmt(trader.volume)}</td>
                    <td className={`py-2 font-mono ${trader.pnl >= 0 ? "text-bull" : "text-bear"}`}>
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
        <section className="rounded-xl bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Alocar nesta pool</h2>
            <span className="text-xs text-muted-foreground">Saldo $BX {fmt(balance)}</span>
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              Você empresta BLUX para {market?.base ?? symbol}. As taxas das operações deste mercado
              aumentam o valor das suas cotas.
            </div>
            {balance <= 0 && (
              <div className="rounded-lg border border-gold/30 bg-gold/10 p-3 text-sm">
                <div className="font-semibold text-gold">Saldo insuficiente para começar</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sua Wallet está com $BX 0,00. Faça um depósito e volte para esta pool para alocar.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link to="/wallet">Ir para Wallet</Link>
                </Button>
              </div>
            )}
            <Input
              type="number"
              min="0.01"
              max={Math.max(balance, value)}
              step="any"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Quanto deseja alocar?"
              className="font-mono"
            />
            <div className="flex gap-2">
              {[0.25, 0.5, 1].map((fraction) => (
                <button
                  key={fraction}
                  type="button"
                  onClick={() => setAmount(String(Math.floor(balance * fraction * 100) / 100))}
                  className="rounded border px-2 py-1 text-xs text-muted-foreground hover:border-primary"
                >
                  {fraction * 100}% do saldo
                </button>
              ))}
            </div>
            {amount && !amountIsValid && (
              <p className="text-xs text-bear">Informe um valor maior que zero.</p>
            )}
            {amountIsValid && allocation > balance && allocation > value && (
              <p className="text-xs text-bear">
                O valor supera seu saldo e sua posição nesta pool.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                disabled={busy || !amountIsValid || allocation > balance}
                onClick={() =>
                  run(() => stake({ data: { symbol, amount: allocation } }), "BLUX alocado na pool")
                }
              >
                Alocar
              </Button>
              <Button
                variant="outline"
                disabled={busy || !amountIsValid || allocation > value}
                onClick={() =>
                  run(() => unstake({ data: { symbol, amount: allocation } }), "Alocação retirada")
                }
              >
                Retirar
              </Button>
            </div>
            <div className="space-y-1 pt-3 text-sm">
              <Row k="Sua posição" v={`$BX ${fmt(value)}`} />
              <Row k="Capital depositado" v={`$BX ${fmt(deposited)}`} />
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
        <section className="rounded-xl bg-primary/5 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Clock3 className="h-4 w-4 text-primary" />
            Simulação de retorno
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
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
          <div className="mt-4 space-y-1">
            <Row k="Retorno estimado" v={`+$BX ${fmt(estimated)}`} cls="text-bull" />
            <Row k="Total estimado" v={`$BX ${fmt(allocation + estimated)}`} cls="text-gold" />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            O prazo é uma projeção, não um bloqueio. Você pode retirar quando quiser, desde que
            exista liquidez livre. A taxa do trader é de {FEE_RATE * 100}% e o retorno real varia
            conforme o volume, lucros, liquidações e taxas.
          </p>
        </section>
      </section>
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
function Row({ k, v, cls = "" }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className={`font-mono ${cls}`}>{v}</span>
    </div>
  );
}
