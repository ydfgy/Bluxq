import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Clock3, Coins, Search, ShieldCheck, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { Protected } from "@/components/AppShell";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { stake, unstake } from "@/lib/blux.functions";
import { fmt, FEE_RATE } from "@/lib/markets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/stake")({
  head: () => ({
    meta: [
      { title: "Stake — Bluxq" },
      { property: "og:title", content: "Stake — Bluxq" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Protected>
      <Stake />
    </Protected>
  ),
});

const DURATIONS = [7, 30, 90] as const;

function Stake() {
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const placeStake = useServerFn(stake);
  const withdrawStake = useServerFn(unstake);
  const [amount, setAmount] = useState("");
  const [search, setSearch] = useState("");
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(30);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["stake", session?.user.id],
    refetchInterval: 5000,
    queryFn: async () => {
      const [pool, mine] = await Promise.all([
        supabase
          .from("pool")
          .select("total_assets, total_reserved, total_shares, fees_to_stakers")
          .single(),
        supabase
          .from("stakes")
          .select("deposited, shares")
          .eq("user_id", session!.user.id)
          .maybeSingle(),
      ]);
      if (pool.error) throw pool.error;
      if (mine.error) throw mine.error;
      return { pool: pool.data, mine: mine.data };
    },
  });

  const pool = data?.pool;
  const mine = data?.mine;
  const totalAssets = Number(pool?.total_assets ?? 0);
  const totalShares = Number(pool?.total_shares ?? 0);
  const feesToStakers = Number(pool?.fees_to_stakers ?? 0);
  const pps = totalShares > 0 ? totalAssets / totalShares : 1;
  const stakeValue = Number(mine?.shares ?? 0) * pps;
  const deposited = Number(mine?.deposited ?? 0);
  const profit = stakeValue - deposited;
  const poolShare = totalShares > 0 ? (Number(mine?.shares ?? 0) / totalShares) * 100 : 0;
  const free = Math.max(0, totalAssets - Number(pool?.total_reserved ?? 0));
  const allocation = Number(amount) || 0;
  const feeYieldReference = totalAssets > 0 ? feesToStakers / totalAssets : 0;
  const estimatedReturn = allocation * feeYieldReference * (duration / 30);
  const estimatedTotal = allocation + estimatedReturn;
  const availableBalance = Number(profile?.balance ?? 0);
  const matchingPool = useMemo(
    () =>
      !search.trim() ||
      "bluxq liquidity pool taxas traders liquidez".includes(search.trim().toLowerCase()),
    [search],
  );

  async function run(fn: () => Promise<unknown>, message: string) {
    try {
      await fn();
      toast.success(message);
      setAmount("");
      setDetailsOpen(false);
      await qc.invalidateQueries({ queryKey: ["stake", session?.user.id] });
      await qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Stake</h1>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar pool"
            aria-label="Buscar pool de liquidez"
            className="h-9 pl-9 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card k="Total na pool" v={`$BX ${fmt(totalAssets)}`} />
        <Card k="Em operações" v={`$BX ${fmt(pool?.total_reserved)}`} />
        <Card k="Livre agora" v={`$BX ${fmt(free)}`} />
        <Card k="Taxas para stakers" v={`$BX ${fmt(feesToStakers)}`} />
      </div>

      {!matchingPool ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhuma pool encontrada.
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          className="w-full rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary/70 hover:bg-card/80"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold">Bluxq Liquidity Pool</h2>
                  <span className="rounded-full border border-bull/40 px-2 py-0.5 text-[10px] text-bull">
                    ATIVA
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Liquidez usada nas operações e nas taxas da plataforma.
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg text-gold">$BX {fmt(stakeValue)}</div>
              <div className="text-xs text-muted-foreground">valor da sua posição</div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 border-t pt-4 text-sm sm:grid-cols-3">
            <PoolFact
              icon={<TrendingUp className="h-4 w-4" />}
              label="Taxas acumuladas"
              value={`$BX ${fmt(feesToStakers)}`}
            />
            <PoolFact
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Sua participação"
              value={`${poolShare.toFixed(2)}%`}
            />
            <PoolFact icon={<Clock3 className="h-4 w-4" />} label="Prazo" value="Flexível" />
          </div>
        </button>
      )}

      <div className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-bold">Sua posição</h2>
          <div className="mt-3 font-mono text-3xl text-gold">$BX {fmt(stakeValue)}</div>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Capital alocado</span>
              <span className="font-mono">$BX {fmt(deposited)}</span>
            </div>
            <div
              className={`flex justify-between gap-3 font-mono ${profit >= 0 ? "text-bull" : "text-bear"}`}
            >
              <span className="font-sans text-muted-foreground">Resultado estimado atual</span>
              <span>
                {profit >= 0 ? "+" : ""}$BX {fmt(profit)}
              </span>
            </div>
            <div className="flex justify-between gap-3 text-muted-foreground">
              <span>Participação na pool</span>
              <span className="font-mono">{poolShare.toFixed(2)}%</span>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
            Seu stake não tem bloqueio fixo. Você pode retirar quando quiser, desde que exista
            liquidez livre; operações abertas podem reduzir o valor disponível para saque.
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold">Alocar na pool</h2>
            <span className="text-xs text-muted-foreground">Saldo $BX {fmt(availableBalance)}</span>
          </div>
          <div className="mt-4 space-y-3">
            <Input
              type="number"
              min="1"
              max={availableBalance}
              placeholder="Quanto deseja alocar?"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="font-mono"
            />
            <div className="flex flex-wrap gap-2">
              {[0.25, 0.5, 1].map((fraction) => (
                <button
                  key={fraction}
                  type="button"
                  onClick={() =>
                    setAmount(String(Math.floor(availableBalance * fraction * 100) / 100))
                  }
                  className="rounded-md border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
                >
                  {fraction * 100}% do saldo
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                disabled={!allocation || allocation > availableBalance || isLoading}
                onClick={() =>
                  run(() => placeStake({ data: { amount: allocation } }), "Stake alocado")
                }
              >
                Alocar
              </Button>
              <Button
                variant="outline"
                disabled={!allocation || allocation > stakeValue || isLoading}
                onClick={() =>
                  run(() => withdrawStake({ data: { amount: allocation } }), "Stake retirado")
                }
              >
                Retirar
              </Button>
            </div>
            <button
              type="button"
              className="text-xs text-primary underline"
              onClick={() => setAmount(String(Math.floor(stakeValue * 100) / 100))}
            >
              Usar valor total do stake
            </button>
          </div>
        </section>
      </div>

      {detailsOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          onClick={() => setDetailsOpen(false)}
        >
          <section
            className="w-full max-w-lg rounded-2xl border bg-card p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-primary">
                  Detalhes da pool
                </div>
                <h2 className="mt-1 text-xl font-bold">Bluxq Liquidity Pool</h2>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                aria-label="Fechar detalhes"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Card k="Pool total" v={`$BX ${fmt(totalAssets)}`} />
              <Card k="Taxas stakers" v={`$BX ${fmt(feesToStakers)}`} />
              <Card k="Taxa trader" v={`${FEE_RATE * 100}%`} />
            </div>
            <div className="mt-5 space-y-3">
              <div>
                <label htmlFor="modal-stake-amount" className="text-sm font-semibold">
                  Quanto alocar
                </label>
                <Input
                  id="modal-stake-amount"
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="Ex.: 100"
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold">Prazo da simulação</div>
                <div className="grid grid-cols-3 gap-2">
                  {DURATIONS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setDuration(days)}
                      className={`rounded-lg border px-3 py-2 text-sm ${duration === days ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {days} dias
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Retorno estimado</span>
                  <span className="font-mono text-bull">+$BX {fmt(estimatedReturn)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between font-semibold">
                  <span>Total estimado</span>
                  <span className="font-mono text-gold">$BX {fmt(estimatedTotal)}</span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Referência variável baseada nas taxas para stakers já acumuladas. A plataforma
                  retém a parte definida pelas regras financeiras; o retorno real depende do volume,
                  dos lucros e das liquidações.
                </p>
              </div>
              <div className="rounded-lg border p-3 text-xs leading-relaxed text-muted-foreground">
                A taxa do trader é de {FEE_RATE * 100}%. As regras atuais distribuem parte dessas
                taxas para os stakers e parte para a plataforma. Seu stake continua flexível: o
                prazo acima é apenas uma projeção, não um bloqueio.
              </div>
              <Button
                className="w-full"
                disabled={!allocation || allocation > availableBalance || isLoading}
                onClick={() =>
                  run(() => placeStake({ data: { amount: allocation } }), "Stake alocado")
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

function PoolFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-primary">{icon}</span>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-mono text-sm">{value}</div>
      </div>
    </div>
  );
}
