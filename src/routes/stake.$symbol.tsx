import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MarketIcon } from "@/components/MarketIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { marketStake, marketUnstake } from "@/lib/blux.functions";
import { MARKETS, fmt } from "@/lib/markets";
import { useServerFn } from "@tanstack/react-start";

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

type PoolDay = {
  day: string;
  total_assets: number;
  total_reserved: number;
};

function StakeDetails() {
  const { symbol } = Route.useParams();
  const market = MARKETS.find((item) => item.symbol === symbol) ?? MARKETS[0];
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [action, setAction] = useState<"stake" | "unstake">("stake");
  const [busy, setBusy] = useState(false);
  const stake = useServerFn(marketStake);
  const unstake = useServerFn(marketUnstake);

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
  const { data: history = [] } = useQuery({
    queryKey: ["market-pool-history", symbol],
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
  const { data: position } = useQuery({
    queryKey: ["market-stake", session?.user.id, symbol],
    enabled: Boolean(session),
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_stakes")
        .select("deposited,shares,started_at,last_reward_at")
        .eq("user_id", session!.user.id)
        .eq("symbol", symbol)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const totalAssets = Number(pool?.total_assets ?? 0);
  const reserved = Number(pool?.total_reserved ?? 0);
  const available = Math.max(0, totalAssets - reserved);
  const balance = Number(profile?.balance ?? 0);
  const positionValue = Number(position?.deposited ?? 0);
  const numericAmount = Number(amount);
  const amountError =
    amount && (!Number.isFinite(numericAmount) || numericAmount <= 0)
      ? "Informe um valor maior que zero."
      : action === "stake" && numericAmount > balance
        ? "O valor excede seu saldo disponível."
        : action === "stake" && numericAmount > available
          ? "O valor excede a liquidez disponível da pool."
          : action === "unstake" && numericAmount > positionValue
            ? "O valor excede sua posição nesta pool."
            : "";

  async function run(action: "stake" | "unstake") {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || amountError) {
      toast.error(amountError || "Informe um valor válido.");
      return;
    }
    setBusy(true);
    try {
      if (action === "stake") await stake({ data: { symbol, amount: value } });
      else await unstake({ data: { symbol, amount: value } });
      toast.success(action === "stake" ? "Alocação confirmada." : "Retirada solicitada.");
      setAmount("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["market-stake", session?.user.id, symbol] }),
        qc.invalidateQueries({ queryKey: ["market-pool", symbol] }),
        qc.invalidateQueries({ queryKey: ["market-pools"] }),
        qc.invalidateQueries({ queryKey: ["profile"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex items-center gap-3">
        <MarketIcon base={market.base} size="md" />
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="text-2xl font-bold">Pool {market.base}</h1>
          <span className="rounded-full bg-bull/10 px-2 py-1 text-[11px] font-semibold text-bull">
            Ativa
          </span>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Liquidez da pool em $BX
          </span>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-x-4 border-y py-2 sm:grid-cols-4 sm:divide-x sm:divide-border/70">
        <PoolStat label="Volume da pool" value={poolLoading ? "…" : `${fmt(totalAssets)} $BX`} />
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
      </section>

      <section className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          <div className="overflow-hidden rounded-xl border bg-transparent">
            <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
              <BarChart3 className="h-4 w-4 text-primary" />
              Volume histórico da pool ($BX)
            </div>
            <div className="h-[300px] bg-black px-4 py-5 sm:h-[360px]">
              <PoolVolumeChart data={history} current={totalAssets} />
            </div>
          </div>
          <div className="grid content-start gap-x-4 gap-y-2 px-1 sm:grid-cols-3">
            <Info title="Liquidez da pool" value={`${fmt(totalAssets)} $BX`} />
            <Info title="Disponível para alocar" value={`${fmt(available)} $BX`} />
            <Info title="Sua posição" value={`${fmt(positionValue)} $BX`} />
          </div>
        </div>
        <AllocationPanel
          session={Boolean(session)}
          balance={balance}
          action={action}
          setAction={(nextAction) => {
            setAction(nextAction);
            setAmount("");
          }}
          amount={amount}
          setAmount={setAmount}
          amountError={amountError}
          position={positionValue}
          busy={busy}
          onStake={() => run("stake")}
          onUnstake={() => run("unstake")}
        />
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
  tone?: "default" | "primary" | "bull";
}) {
  const color =
    tone === "primary" ? "text-primary" : tone === "bull" ? "text-bull" : "text-foreground";
  return (
    <div className="px-3 py-1.5 first:pl-0 sm:pl-4">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}

function Info({ title, value }: { title: string; value: string }) {
  return (
    <div className="px-1 py-1">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-2 font-mono font-semibold">{value}</div>
    </div>
  );
}

function AllocationPanel({
  session,
  balance,
  action,
  setAction,
  amount,
  setAmount,
  amountError,
  position,
  busy,
  onStake,
  onUnstake,
}: {
  session: boolean;
  balance: number;
  action: "stake" | "unstake";
  setAction: (action: "stake" | "unstake") => void;
  amount: string;
  setAmount: (value: string) => void;
  amountError: string;
  position: number;
  busy: boolean;
  onStake: () => void;
  onUnstake: () => void;
}) {
  return (
    <section className="rounded-xl border border-primary/40 p-4 md:sticky md:top-4">
      <h2 className="font-semibold">Gerenciar stake</h2>
      {!session ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Entre na sua conta para consultar seu saldo e alocar valor nesta pool.
          </p>
          <Button asChild className="w-full">
            <Link to="/auth">Entrar para fazer stake</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div
            className="grid grid-cols-2 rounded-lg border bg-muted/30 p-1"
            role="tablist"
            aria-label="Ação do stake"
          >
            <button
              type="button"
              role="tab"
              aria-selected={action === "stake"}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${action === "stake" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setAction("stake")}
            >
              Adicionar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={action === "unstake"}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${action === "unstake" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setAction("unstake")}
            >
              Retirar
            </button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {action === "stake" ? "Saldo disponível" : "Sua posição"}
            </span>
            <span className="font-mono">{fmt(action === "stake" ? balance : position)} $BX</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stake-amount">
              {action === "stake" ? "Valor para adicionar" : "Valor para retirar"}
            </Label>
            <div className="relative">
              <Input
                id="stake-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0,00"
                className="pr-14 font-mono text-lg"
                aria-invalid={Boolean(amountError)}
              />
              <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">$BX</span>
            </div>
            {amountError && <p className="text-xs text-bear">{amountError}</p>}
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() =>
                setAmount(Math.max(0, action === "stake" ? balance : position).toFixed(2))
              }
            >
              Usar máximo
            </button>
          </div>
          <Button
            className="w-full"
            disabled={busy || Boolean(amountError) || !amount}
            onClick={action === "stake" ? onStake : onUnstake}
          >
            {busy ? "Confirmando…" : action === "stake" ? "Adicionar à pool" : "Retirar da pool"}
          </Button>
          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            Sua posição acompanha o volume e as taxas da pool em $BX.
          </p>
        </div>
      )}
    </section>
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
  const area = `0,100 ${line} 100,100`;
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
        <polygon points={area} fill="url(#pool-volume-fill)" />
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
