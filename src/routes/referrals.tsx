import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Protected } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { claimAffiliate, getAffiliateSummary } from "@/lib/blux.functions";
import { fmt } from "@/lib/markets";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/referrals")({
  head: () => ({
    meta: [
      { title: "Afiliados — BluxTrade" },
      { name: "description", content: "Indique traders e acompanhe suas comissões na BluxTrade." },
    ],
  }),
  component: () => (
    <Protected>
      <Referrals />
    </Protected>
  ),
});

function Referrals() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const claim = useServerFn(claimAffiliate);
  const getSummary = useServerFn(getAffiliateSummary);
  const [copied, setCopied] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const uid = session?.user.id;
  const { data: summary, isLoading } = useQuery({
    queryKey: ["affiliate-summary", uid],
    enabled: Boolean(uid),
    refetchInterval: 5000,
    queryFn: () => getSummary(),
  });
  const referralLink = summary?.referralCode
    ? `${window.location.origin}/auth?mode=signup&ref=${encodeURIComponent(summary.referralCode)}`
    : "";
  const pending = summary?.pending ?? 0;
  const recentClaims = summary?.recentClaims ?? [];

  async function copyLink() {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Link de convite copiado");
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function doClaim() {
    if (pending <= 0 || claiming) return;
    setClaiming(true);
    try {
      const result = await claim({ data: undefined });
      toast.success(`B$ ${fmt(result.amount)} adicionados ao seu saldo`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["affiliate-summary", uid] }),
        qc.invalidateQueries({ queryKey: ["profile", uid] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível resgatar a comissão.");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
          Programa de afiliados
        </p>
        <h1 className="mt-2 text-3xl font-bold">Afiliados</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Receba 1% da margem nas operações dos traders que você indicar.
        </p>
      </div>

      <section className="mx-auto max-w-xl rounded-2xl border bg-card p-6 text-center shadow-xl">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Disponível para resgate
        </div>
        <div className="mt-3 font-mono text-5xl font-bold text-primary">
          B$ {isLoading ? "—" : fmt(pending)}
        </div>
        <Button
          className="mt-6 w-full"
          onClick={doClaim}
          disabled={pending <= 0 || isLoading || claiming}
        >
          {claiming
            ? "Resgatando…"
            : pending > 0
              ? `Resgatar B$ ${fmt(pending)}`
              : "Nada para resgatar"}
        </Button>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Stat label="Convidados" value={String(summary?.invitedCount ?? 0)} />
        <Stat label="Total ganho" value={`B$ ${fmt(summary?.total)}`} />
      </div>

      <section className="mt-6 rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Resgates recentes</h2>
          <span className="text-xs text-muted-foreground">Últimos 3</span>
        </div>
        <div className="mt-3 divide-y border-t">
          {recentClaims.map((item) => (
            <div
              key={item.claimedAt}
              className="flex items-center justify-between gap-3 py-3 text-sm"
            >
              <span className="text-muted-foreground">
                {new Date(item.claimedAt).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
              <span className="font-mono text-primary">+ B$ {fmt(item.amount)}</span>
            </div>
          ))}
          {!isLoading && recentClaims.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">Nenhum resgate realizado ainda.</p>
          )}
          {isLoading && <p className="py-4 text-sm text-muted-foreground">Carregando…</p>}
        </div>
      </section>

      <section className="mt-6 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Seu link de convite</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              O convite fica vinculado no cadastro.
            </p>
          </div>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-sm text-primary">
            {summary?.referralCode ?? "Carregando…"}
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={referralLink}
            className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground"
            aria-label="Link de convite"
          />
          <Button onClick={copyLink} disabled={!referralLink}>
            {copied ? "Copiado" : "Copiar link"}
          </Button>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl">{value}</div>
    </div>
  );
}
