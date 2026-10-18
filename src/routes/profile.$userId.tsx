import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Gift, ShieldCheck, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Protected } from "@/components/AppShell";
import { useProfile } from "@/hooks/use-auth";
import { donateToUser, getPublicProfile } from "@/lib/blux.functions";
import { fmt } from "@/lib/markets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/profile/$userId")({
  head: () => ({ meta: [{ title: "Perfil do trader — Bluxq" }] }),
  component: () => (
    <Protected>
      <PublicProfile />
    </Protected>
  ),
});

type PublicProfileData = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_anonymous: boolean;
  profit: number;
  margin: number;
  profit_percentage: number;
  trades: number;
  received_donations: number;
};

function PublicProfile() {
  const { userId } = Route.useParams();
  const own = useProfile();
  const load = useServerFn(getPublicProfile);
  const send = useServerFn(donateToUser);
  const qc = useQueryClient();
  const [amount, setAmount] = useState("10");
  const [sending, setSending] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-profile", userId],
    queryFn: () => load({ data: { userId } }),
  });
  const profile = data as PublicProfileData | null | undefined;

  async function donate() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 1) {
      toast.error("Informe uma quantia de pelo menos 1 BX.");
      return;
    }
    setSending(true);
    try {
      await send({ data: { recipientId: userId, amount: value } });
      toast.success("Doação enviada com sucesso.");
      setAmount("10");
      await Promise.all([qc.invalidateQueries({ queryKey: ["profile"] }), qc.invalidateQueries({ queryKey: ["public-profile", userId] })]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a doação.");
    } finally {
      setSending(false);
    }
  }

  if (isLoading) return <div className="grid min-h-[60vh] place-items-center text-muted-foreground">Carregando perfil…</div>;
  if (isError || !profile) return <div className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-xl font-semibold">Perfil não encontrado</h1><Link to="/ranking" className="mt-4 inline-block text-sm text-primary underline">Voltar ao ranking</Link></div>;

  const isSelf = own.data?.id === profile.user_id;
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:py-12">
      <Link to="/ranking" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar ao ranking</Link>
      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="h-28 bg-gradient-to-r from-primary/30 via-primary/5 to-gold/20" />
        <div className="-mt-10 flex flex-col gap-5 px-5 pb-6 sm:flex-row sm:items-end sm:px-8">
          <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border-4 border-card bg-primary/15 text-2xl font-bold text-primary shadow-lg">
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : profile.username.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><h1 className="truncate text-2xl font-bold">{profile.username}</h1>{profile.is_anonymous && <ShieldCheck className="h-4 w-4 text-primary" />}</div>
            <p className="text-sm text-muted-foreground">{profile.is_anonymous ? "Trader com identidade protegida" : profile.display_name ?? "Perfil público"}</p>
          </div>
          <div className="rounded-xl border border-bull/20 bg-bull/5 px-4 py-3 text-right"><div className="text-xs text-muted-foreground">Lucro percentual</div><div className={`font-mono text-xl font-bold ${profile.profit_percentage >= 0 ? "text-bull" : "text-bear"}`}>{profile.profit_percentage >= 0 ? "+" : ""}{profile.profit_percentage.toFixed(2)}%</div></div>
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="PnL realizado" value={`${fmt(profile.profit, 2)} BX`} accent={profile.profit >= 0} />
        <Stat label="Operações encerradas" value={String(profile.trades)} />
        <Stat label="Doações recebidas" value={`${fmt(profile.received_donations, 2)} BX`} />
      </div>
      {!isSelf && (
        <section className="rounded-2xl border border-gold/20 bg-gold/5 p-5 sm:p-6">
          <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold"><Gift className="h-5 w-5" /></div><div><h2 className="font-semibold">Apoiar {profile.username}</h2><p className="mt-1 text-sm text-muted-foreground">Envie BX diretamente do seu saldo. A transferência é registrada e não pode ser feita para a própria conta.</p></div></div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row"><Input type="number" min="1" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="font-mono sm:max-w-xs" aria-label="Valor da doação em BX" /><Button onClick={donate} disabled={sending}>{sending ? "Enviando…" : "Enviar doação"}</Button></div>
          <p className="mt-3 text-xs text-muted-foreground">Seu saldo atual: {fmt(Number(own.data?.balance ?? 0), 2)} BX</p>
        </section>
      )}
      {isSelf && <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">Este é o seu perfil público. Para receber apoio, compartilhe o link do perfil.</div>}
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-4 w-4 text-primary" /> Métricas baseadas somente em operações realizadas.</div>
    </main>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-2 font-mono text-lg font-semibold ${accent ? "text-bull" : "text-foreground"}`}>{value}</div></div>;
}
