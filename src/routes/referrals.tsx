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
      { title: "Referrals — Bluxq" },
      { name: "description", content: "Earn commissions by referring traders to Bluxq." },
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

  async function copyLink() {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Referral link copied");
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function doClaim() {
    try {
      const result = await claim({ data: undefined });
      toast.success(`$BX ${fmt(result.amount)} added to your balance`);
      await qc.invalidateQueries({ queryKey: ["affiliate-summary", uid] });
      await qc.invalidateQueries({ queryKey: ["profile", uid] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to claim affiliate earnings");
    }
  }

  const pending = summary?.pending ?? 0;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
          Affiliate program
        </p>
        <h1 className="mt-2 text-3xl font-bold">Referral center</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Invite traders and earn 1% of the opening margin fee. Your commission stays pending until
          you claim it.
        </p>
      </div>

      <section className="mx-auto max-w-xl rounded-2xl border bg-card p-6 text-center shadow-xl">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Available to claim
        </div>
        <div className="mt-3 font-mono text-5xl font-bold text-primary">$BX {fmt(pending)}</div>
        <Button className="mt-6 w-full" onClick={doClaim} disabled={pending <= 0 || isLoading}>
          {pending > 0 ? `Claim $BX ${fmt(pending)}` : "Nothing to claim"}
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          The button stays disabled until you have pending commission.
        </p>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Invited traders" value={String(summary?.invitedCount ?? 0)} />
        <Stat label="Total earned" value={`$BX ${fmt(summary?.total)}`} />
        <Stat label="Recently claimed" value={`$BX ${fmt(summary?.claimed)}`} />
      </div>

      <section className="mt-6 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Your referral link</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The referral is permanent after signup.
            </p>
          </div>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-sm text-primary">
            {summary?.referralCode ?? "Loading…"}
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={referralLink}
            className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground"
            aria-label="Referral link"
          />
          <Button onClick={copyLink} disabled={!referralLink}>
            {copied ? "Copied" : "Copy link"}
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
