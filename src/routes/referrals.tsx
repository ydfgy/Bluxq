import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Protected } from "@/components/AppShell";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { claimAffiliate } from "@/lib/blux.functions";
import { fmt } from "@/lib/markets";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/referrals")({
  head: () => ({
    meta: [
      { title: "Referrals — BluxTrade" },
      { name: "description", content: "Earn commissions by referring traders to BluxTrade." },
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
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const claim = useServerFn(claimAffiliate);
  const [copied, setCopied] = useState(false);
  const uid = session?.user.id;
  const { data: referralProfile } = useQuery({
    queryKey: ["referral-profile", uid],
    enabled: Boolean(uid),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("referral_code")
        .eq("id", uid!)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const referralCode = referralProfile?.referral_code;
  const referralLink = referralCode
    ? `${window.location.origin}/auth?mode=signup&ref=${encodeURIComponent(referralCode)}`
    : "";

  const { data: earnings = [], isLoading } = useQuery({
    queryKey: ["affiliate-earnings", uid],
    enabled: Boolean(uid),
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affiliate_earnings")
        .select("id, amount, created_at, claimed_at")
        .eq("affiliate_id", uid!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const pending = earnings
    .filter((earning) => !earning.claimed_at)
    .reduce((sum, earning) => sum + Number(earning.amount), 0);
  const claimed = earnings
    .filter((earning) => earning.claimed_at)
    .reduce((sum, earning) => sum + Number(earning.amount), 0);

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
      toast.success(`B$ ${fmt(result.amount)} added to your balance`);
      await qc.invalidateQueries({ queryKey: ["affiliate-earnings", uid] });
      await qc.invalidateQueries({ queryKey: ["profile", uid] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to claim affiliate earnings");
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
          Affiliate program
        </p>
        <h1 className="mt-2 text-3xl font-bold">Invite traders. Earn Blux.</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          You earn 1% of the opening fee from every permanently referred trader. Commissions stay
          pending until you claim them.
        </p>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Your referral link</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The referral is locked to the new account at signup.
            </p>
          </div>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-sm text-primary">
            {referralCode ?? "Generating…"}
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

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Pending to claim" value={`B$ ${fmt(pending)}`} />
        <Stat label="Already claimed" value={`B$ ${fmt(claimed)}`} />
        <Stat label="Total earned" value={`B$ ${fmt(pending + claimed)}`} />
      </div>

      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Commission balance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Claiming moves the pending amount into your available Blux balance.
            </p>
          </div>
          <Button onClick={doClaim} disabled={pending <= 0}>
            Claim B$ {fmt(pending)}
          </Button>
        </div>
        <div className="mt-5 divide-y border-t">
          {isLoading && <p className="py-5 text-sm text-muted-foreground">Loading earnings…</p>}
          {!isLoading &&
            earnings.map((earning) => (
              <div
                key={earning.id}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <span className="text-muted-foreground">
                  {new Date(earning.created_at).toLocaleString("en-US")}
                </span>
                <span className="font-mono text-primary">+ B$ {fmt(earning.amount)}</span>
                <span className="text-xs text-muted-foreground">
                  {earning.claimed_at ? "Claimed" : "Pending"}
                </span>
              </div>
            ))}
          {!isLoading && earnings.length === 0 && (
            <p className="py-5 text-sm text-muted-foreground">
              No commissions yet. Share your link to get started.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl">{value}</div>
    </div>
  );
}
