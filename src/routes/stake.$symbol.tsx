import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MarketIcon } from "@/components/MarketIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getOperationSettings, marketStake, marketUnstake } from "@/lib/blux.functions";
import { MARKETS, fmt } from "@/lib/markets";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/stake/$symbol")({
  head: ({ params }) => ({
    meta: [{ title: `Stake ${params.symbol.replace("USDT", "")} — Bluxq` }],
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
type PoolDay = { day: string; total_assets: number; total_reserved: number };
type StakePosition = {
  id: string;
  shares: number;
  principal: number;
  lock_days: number;
  started_at: string;
  unlocks_at: string;
  status: string;
};
type OperationSettings = {
  stake_min_amount: number;
  stake_min_lock_days: number;
  stake_max_lock_days: number;
  stake_default_lock_days: number;
  stake_allow_early_withdrawal: boolean;
};

function StakeDetails() {
  const { symbol } = Route.useParams();
  const market = MARKETS.find((item) => item.symbol === symbol) ?? MARKETS[0];
  const { session, ready } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const canView = ready && Boolean(session);
  const [amount, setAmount] = useState("");
  const [lockDays, setLockDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const stake = useServerFn(marketStake);
  const unstake = useServerFn(marketUnstake);
  const loadSettings = useServerFn(getOperationSettings);

  const { data: pool, isLoading: poolLoading } = useQuery({
    queryKey: ["market-pool", symbol, "stake-page"],
    enabled: canView,
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
  const { data: history = [] } = useQuery({
    queryKey: ["market-pool-history", symbol],
    enabled: canView,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_pool_daily")
        .select("day,total_assets,total_reserved")
        .eq("symbol", symbol)
        .order("day", { ascending: true })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as PoolDay[];
    },
  });
  const { data: settings } = useQuery({
    queryKey: ["operation-settings"],
    enabled: canView,
    staleTime: 60000,
    queryFn: () => loadSettings() as unknown as Promise<OperationSettings>,
  });
  const { data: positions = [] } = useQuery({
    queryKey: ["market-stake-positions", session?.user.id, symbol],
    enabled: Boolean(session),
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_stake_positions")
        .select("id,shares,principal,lock_days,started_at,unlocks_at,status")
        .eq("user_id", session!.user.id)
        .eq("symbol", symbol)
        .eq("status", "open")
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StakePosition[];
    },
  });
  const totalAssets = Number(pool?.total_assets ?? 0);
  const reserved = Number(pool?.total_reserved ?? 0);
  const available = Math.max(0, totalAssets - reserved);
  const nav = Number(pool?.total_shares ?? 0) > 0 ? totalAssets / Number(pool?.total_shares) : 1;
  const balance = Number(profile?.balance ?? 0);
  const minAmount = Number(settings?.stake_min_amount ?? 1);
  const minDays = Number(settings?.stake_min_lock_days ?? 1);
  const maxDays = Number(settings?.stake_max_lock_days ?? 365);
  const effectiveDays = Math.min(
    maxDays,
    Math.max(minDays, lockDays || Number(settings?.stake_default_lock_days ?? 30)),
  );
  const value = Number(amount);
  const amountError =
    amount && (!Number.isFinite(value) || value < minAmount)
      ? `O mínimo é $BX ${fmt(minAmount)}.`
      : value > balance
        ? "O valor excede seu saldo disponível."
        : "";

  async function addStake() {
    if (!Number.isFinite(value) || value < minAmount || value > balance || amountError) {
      toast.error(amountError || "Informe um valor válido.");
      return;
    }
    setBusy(true);
    try {
      await stake({ data: { symbol, amount: value, lockDays: effectiveDays } });
      toast.success(`Stake travado por ${effectiveDays} dias.`);
      setAmount("");
      await invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir o stake.");
    } finally {
      setBusy(false);
    }
  }
  async function withdraw(position: StakePosition) {
    if (
      !settings?.stake_allow_early_withdrawal &&
      new Date(position.unlocks_at).getTime() > Date.now()
    ) {
      toast.error(`Este valor está travado até ${formatDate(position.unlocks_at)}.`);
      return;
    }
    setSelectedPosition(position.id);
    setBusy(true);
    try {
      await unstake({ data: { positionId: position.id } });
      toast.success("Stake retirado com PnL atualizado.");
      await invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível retirar este stake.");
    } finally {
      setBusy(false);
      setSelectedPosition(null);
    }
  }
  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["market-stake-positions", session?.user.id, symbol] }),
      qc.invalidateQueries({ queryKey: ["market-pool", symbol] }),
      qc.invalidateQueries({ queryKey: ["market-pools"] }),
      qc.invalidateQueries({ queryKey: ["profile"] }),
    ]);
  }

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          {canView ? (
            <div className="overflow-hidden rounded-xl border bg-transparent">
              <div className="flex flex-col gap-4 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <MarketIcon base={market.base} size="md" />
                  <h1 className="text-lg font-bold">Stake {market.base}</h1>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <PoolStat
                    label="Volume da pool"
                    value={poolLoading ? "…" : `${fmt(totalAssets)} $BX`}
                  />
                  <PoolStat
                    label="Disponível"
                    value={poolLoading ? "…" : `${fmt(available)} $BX`}
                    tone="bull"
                  />
                  <PoolStat label="Reservado" value={`${fmt(reserved)} $BX`} />
                  <PoolStat
                    label="Taxas para stakers"
                    value={`${fmt(pool?.fees_to_stakers)} $BX`}
                    tone="primary"
                  />
                </div>
              </div>
              <div className="h-[260px] bg-black px-4 py-5 sm:h-[320px]">
                <PoolVolumeChart data={history} current={totalAssets} />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
              Entre ou crie uma conta para consultar os valores desta pool.
              <Link to="/auth" className="mt-3 block font-semibold text-primary hover:underline">
                Entrar ou criar conta
              </Link>
            </div>
          )}
          {canView && (
            <section className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Seus stakes</h2>
                  <p className="text-xs text-muted-foreground">
                    Cada aporte possui prazo e PnL próprios.
                  </p>
                </div>
                <span className="font-mono text-sm">
                  {fmt(positions.reduce((sum, p) => sum + Number(p.shares) * nav, 0))} $BX travado
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {positions.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Nenhum valor travado nesta pool.
                  </p>
                ) : (
                  positions.map((position) => (
                    <StakeCard
                      key={position.id}
                      position={position}
                      nav={nav}
                      busy={busy && selectedPosition === position.id}
                      allowEarly={Boolean(settings?.stake_allow_early_withdrawal)}
                      onWithdraw={() => void withdraw(position)}
                    />
                  ))
                )}
              </div>
            </section>
          )}
        </div>
        <section className="rounded-xl border p-4 md:sticky md:top-4">
          <h2 className="font-semibold">Novo stake</h2>
          {!session ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Entre na sua conta para alocar valor nesta pool.
              </p>
              <Button asChild className="w-full">
                <Link to="/auth">Entrar para fazer stake</Link>
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Saldo disponível</span>
                <span className="font-mono">{fmt(balance)} $BX</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stake-amount">Valor para travar</Label>
                <div className="relative">
                  <Input
                    id="stake-amount"
                    type="number"
                    min={minAmount}
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0,00"
                    className="pr-14 font-mono text-lg"
                    aria-invalid={Boolean(amountError)}
                  />
                  <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">
                    $BX
                  </span>
                </div>
                {amountError && <p className="text-xs text-bear">{amountError}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="stake-lock">Prazo de bloqueio</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="stake-lock"
                    type="number"
                    min={minDays}
                    max={maxDays}
                    step="1"
                    value={lockDays}
                    onChange={(event) => setLockDays(Number(event.target.value))}
                  />
                  <span className="text-sm text-muted-foreground">dias</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Permitido: {minDays}–{maxDays} dias. O desbloqueio é individual.
                </p>
              </div>
              <Button
                className="w-full"
                disabled={busy || Boolean(amountError) || !amount}
                onClick={() => void addStake()}
              >
                {busy ? "Confirmando…" : "Travar na pool"}
              </Button>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function StakeCard({
  position,
  nav,
  busy,
  allowEarly,
  onWithdraw,
}: {
  position: StakePosition;
  nav: number;
  busy: boolean;
  allowEarly: boolean;
  onWithdraw: () => void;
}) {
  const principal = Number(position.principal);
  const current = Number(position.shares) * nav;
  const pnl = current - principal;
  const pnlPercent = principal > 0 ? (pnl / principal) * 100 : 0;
  const unlocked = allowEarly || new Date(position.unlocks_at).getTime() <= Date.now();
  return (
    <article className="rounded-lg border bg-card/30 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold">$BX {fmt(current)}</span>
            <span
              className={`text-xs font-semibold ${pnl >= 0 ? "text-emerald-500" : "text-destructive"}`}
            >
              {pnl >= 0 ? "+" : ""}
              {pnlPercent.toFixed(2)}% PnL
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Aporte {fmt(principal)} · {position.lock_days} dias · iniciado{" "}
            {formatDate(position.started_at)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {unlocked
              ? "Desbloqueado para retirada"
              : `Travado até ${formatDate(position.unlocks_at)}`}
          </div>
        </div>
        <Button
          size="sm"
          variant={unlocked ? "default" : "outline"}
          disabled={!unlocked || busy}
          onClick={onWithdraw}
        >
          {busy ? "Retirando…" : unlocked ? "Retirar" : "Travado"}
        </Button>
      </div>
    </article>
  );
}
function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function PoolStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "bull";
}) {
  return (
    <div className="px-3 py-1.5 first:pl-0 sm:pl-4">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-mono text-sm font-bold ${tone === "primary" ? "text-primary" : tone === "bull" ? "text-bull" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}
function PoolVolumeChart({ data, current }: { data: PoolDay[]; current: number }) {
  const points = useMemo(() => {
    const rows = data.length ? data : [{ day: "agora", total_assets: current, total_reserved: 0 }];
    const values = rows.map((row) => Number(row.total_assets ?? 0));
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = Math.max(max - min, 1);
    return rows.map((row, index) => ({
      x: rows.length === 1 ? 50 : (index / (rows.length - 1)) * 100,
      y: 92 - ((Number(row.total_assets ?? 0) - min) / range) * 78,
      value: Number(row.total_assets ?? 0),
      day: row.day,
    }));
  }, [data, current]);
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const latest = points.at(-1);
  return (
    <div className="relative h-full w-full">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label="Volume histórico da pool em BX"
      >
        <defs>
          <linearGradient id="pool-volume-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(37 99 235)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(37 99 235)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2="100" y1="92" y2="92" stroke="rgb(148 163 184 / 0.18)" strokeWidth="0.4" />
        <polygon points={`0,100 ${line} 100,100`} fill="url(#pool-volume-fill)" />
        <polyline
          points={line}
          fill="none"
          stroke="rgb(59 130 246)"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="absolute left-0 top-0 text-xs text-muted-foreground">
        {latest ? `${fmt(latest.value)} $BX` : "—"}
      </div>
      <div className="absolute bottom-0 left-0 text-[10px] text-muted-foreground">
        {points[0]?.day ?? ""}
      </div>
      <div className="absolute bottom-0 right-0 text-[10px] text-muted-foreground">
        {latest?.day ?? ""}
      </div>
    </div>
  );
}
