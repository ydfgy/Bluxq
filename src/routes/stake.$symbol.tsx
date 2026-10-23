import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarketIcon } from "@/components/MarketIcon";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { marketStake, marketUnstake } from "@/lib/blux.functions";
import { MARKETS, fmt } from "@/lib/markets";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/stake/$symbol")({
  head: ({ params }) => ({
    meta: [{ title: `Stake ${params.symbol.replace("USDT", "")} — Bluxq` }],
  }),
  component: StakeDetails,
});

function StakeDetails() {
  const { symbol } = Route.useParams();
  const market = MARKETS.find((item) => item.symbol === symbol) ?? MARKETS[0];
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
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
      return data;
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
  const numericAmount = Number(amount);
  const amountError =
    amount && (!Number.isFinite(numericAmount) || numericAmount <= 0)
      ? "Informe um valor maior que zero."
      : numericAmount > balance
        ? "O valor excede seu saldo disponível."
        : numericAmount > available
          ? "O valor excede a liquidez disponível da pool."
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
      toast.success(
        action === "stake"
          ? `Alocação em ${market.base} confirmada.`
          : `Retirada de ${market.base} solicitada.`,
      );
      setAmount("");
      await qc.invalidateQueries({ queryKey: ["market-stake", session?.user.id, symbol] });
      await qc.invalidateQueries({ queryKey: ["market-pools"] });
      await qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        to="/stake"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para as moedas
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-6">
          <div className="rounded-2xl border bg-transparent p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-4">
              <MarketIcon base={market.base} size="lg" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl font-bold">Pool {market.base}</h1>
                  <span className="rounded-full bg-bull/10 px-2 py-1 text-xs font-semibold text-bull">
                    Ativa
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  Liquidez para operações de {market.name}
                </p>
              </div>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <Stat label="Liquidez total" value={poolLoading ? "…" : `${fmt(totalAssets)} $BX`} />
              <Stat
                label="Disponível para operações"
                value={poolLoading ? "…" : `${fmt(available)} $BX`}
                tone="bull"
              />
              <Stat label="Taxas para stakers" value={`${fmt(pool?.fees_to_stakers)} $BX`} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Info
              icon={<ShieldCheck />}
              title="Pool transparente"
              text="Acompanhe os ativos e a liquidez em tempo real."
            />
            <Info
              icon={<LockKeyhole />}
              title="Flexível"
              text="Você pode retirar sua posição quando quiser."
            />
            <Info
              icon={<WalletCards />}
              title="Saldo Bluxq"
              text="Alocação feita com seu saldo disponível."
            />
          </div>
        </section>

        <section className="rounded-2xl border border-primary/40 bg-transparent p-6 lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Alocar na pool</h2>
              <p className="mt-1 text-sm text-muted-foreground">Pool {market.base}/$BX</p>
            </div>
            <MarketIcon base={market.base} size="sm" />
          </div>
          {!session ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Entre na sua conta para consultar seu saldo e alocar valor nesta pool.
              </p>
              <Button asChild className="w-full">
                <Link to="/auth">Entrar para fazer stake</Link>
              </Button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Saldo disponível</span>
                <span className="font-mono">{fmt(balance)} $BX</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stake-amount">Valor da alocação</Label>
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
                  <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">
                    $BX
                  </span>
                </div>
                {amountError && <p className="text-xs text-bear">{amountError}</p>}
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setAmount(String(Math.max(0, balance).toFixed(2)))}
                >
                  Usar saldo máximo
                </button>
              </div>
              <div className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Você está alocando</span>
                  <span className="font-mono text-foreground">{fmt(numericAmount)} $BX</span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span>Sua posição atual</span>
                  <span className="font-mono text-foreground">{fmt(position?.deposited)} $BX</span>
                </div>
              </div>
              <Button
                className="w-full"
                disabled={busy || Boolean(amountError) || !amount}
                onClick={() => run("stake")}
              >
                {busy ? "Confirmando…" : "Confirmar alocação"}
              </Button>
              {Number(position?.deposited ?? 0) > 0 && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy || !amount}
                  onClick={() => run("unstake")}
                >
                  Retirar valor da pool
                </Button>
              )}
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                Ao confirmar, você concorda com os termos de staking da plataforma. A posição será
                atualizada após a confirmação.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" }) {
  return (
    <div className="rounded-lg border bg-transparent p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-2 font-mono text-sm font-bold ${tone === "bull" ? "text-bull" : ""}`}>
        {value}
      </div>
    </div>
  );
}
function Info({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border bg-transparent p-4">
      <div className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="font-semibold">{title}</div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}
