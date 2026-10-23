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
  head: () => ({ meta: [{ title: "Afiliados — Bluxq" }] }),
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

  async function copyLink() {
    if (!referralLink) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(referralLink);
      } else {
        const input = document.createElement("textarea");
        input.value = referralLink;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        if (!document.execCommand("copy")) throw new Error("copy failed");
        input.remove();
      }
      setCopied(true);
      toast.success("Link copiado");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Não foi possível copiar o link. Selecione e copie manualmente.");
    }
  }

  async function doClaim() {
    if (pending <= 0 || claiming) return;
    setClaiming(true);
    try {
      const result = await claim({ data: undefined });
      toast.success(`B$ ${fmt(result.amount)} adicionados ao saldo`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["affiliate-summary", uid] }),
        qc.invalidateQueries({ queryKey: ["profile", uid] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível resgatar.");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <section className="rounded-xl border bg-transparent p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Disponível para resgatar
            </div>
            <div className="mt-2 font-mono text-4xl font-bold text-primary sm:text-5xl">
              B$ {isLoading ? "—" : fmt(pending)}
            </div>
          </div>
          <Button onClick={doClaim} disabled={pending <= 0 || isLoading || claiming}>
            {claiming ? "Resgatando…" : pending > 0 ? "Resgatar" : "Nada para resgatar"}
          </Button>
        </div>
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Stat label="Convidados" value={String(summary?.invitedCount ?? 0)} />
        <Stat label="Total ganho" value={`B$ ${fmt(summary?.total)}`} />
      </div>

      <section className="mt-4 rounded-xl border bg-transparent p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Seu link de convite</h2>
          <span className="font-mono text-sm text-primary">{summary?.referralCode ?? "—"}</span>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={referralLink}
            className="min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm text-foreground"
            aria-label="Link de convite"
          />
          <Button onClick={copyLink} disabled={!referralLink}>
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-transparent p-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl">{value}</div>
    </div>
  );
}
