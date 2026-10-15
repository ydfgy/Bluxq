import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Protected } from "@/components/AppShell";
import { useIsAdmin } from "@/hooks/use-auth";
import { adminOverview, claimAdmin, reviewDeposit, reviewWithdraw } from "@/lib/blux.functions";
import { fmt } from "@/lib/markets";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — BluxTrade" }, { name: "description", content: "Painel de administração da BluxTrade." }, { property: "og:title", content: "Admin — BluxTrade" }, { property: "og:description", content: "Aprovar depósitos e saques." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: () => (<Protected><Admin /></Protected>),
});

function Admin() {
  const { data: isAdmin, isLoading } = useIsAdmin();
  const qc = useQueryClient();
  const claim = useServerFn(claimAdmin);
  const overview = useServerFn(adminOverview);
  const rd = useServerFn(reviewDeposit);
  const rw = useServerFn(reviewWithdraw);
  const { data } = useQuery({ queryKey: ["admin"], enabled: !!isAdmin, refetchInterval: 5000, queryFn: () => overview() });

  async function run(fn: () => Promise<unknown>, msg: string) {
    try { await fn(); toast.success(msg); qc.invalidateQueries(); } catch (e: any) { toast.error(e.message); }
  }

  if (isLoading) return null;
  if (!isAdmin) return (
    <main className="mx-auto max-w-md px-4 py-12 space-y-4 text-center">
      <p className="text-muted-foreground">Você não é administrador. Se ainda não existe nenhum, o primeiro a clicar vira o dono.</p>
      <Button onClick={() => run(() => claim(), "Agora você é admin")}>Virar administrador</Button>
    </main>
  );

  const user = (x: any) => x.profile ? `${x.profile.roblox_username} (#${x.profile.roblox_user_id ?? "?"})` : x.user_id.slice(0, 8);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Admin</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <Box k="Pool" v={fmt(data?.pool?.total_assets)} />
        <Box k="Reservado" v={fmt(data?.pool?.total_reserved)} />
        <Box k="Receita da plataforma" v={fmt(data?.pool?.platform_revenue)} />
      </div>
      <section className="rounded-xl border bg-card">
        <h2 className="font-bold p-4 border-b">Depósitos aguardando ({data?.deposits.length ?? 0})</h2>
        <p className="px-4 pt-2 text-xs text-muted-foreground">Confira no Roblox se esse usuário comprou o item do grupo nesse valor antes de aprovar.</p>
        {data?.deposits.map((x) => (
          <div key={x.id} className="flex flex-wrap items-center gap-3 border-b last:border-0 px-4 py-3 text-sm">
            <span className="flex-1">{user(x)}</span>
            <span className="font-mono text-gold">{fmt(x.amount, 0)} R$</span>
            <span className="text-xs text-muted-foreground">{new Date(x.created_at).toLocaleString("pt-BR")}</span>
            <Button size="sm" onClick={() => run(() => rd({ data: { id: x.id, approve: true } }), "Aprovado")}>Aprovar</Button>
            <Button size="sm" variant="outline" onClick={() => run(() => rd({ data: { id: x.id, approve: false } }), "Recusado")}>Recusar</Button>
          </div>
        ))}
      </section>
      <section className="rounded-xl border bg-card">
        <h2 className="font-bold p-4 border-b">Saques aguardando ({data?.withdrawals.length ?? 0})</h2>
        <p className="px-4 pt-2 text-xs text-muted-foreground">Pague os Robux pelo grupo e marque como pago. "Devolver" estorna o saldo ao usuário.</p>
        {data?.withdrawals.map((x) => (
          <div key={x.id} className="flex flex-wrap items-center gap-3 border-b last:border-0 px-4 py-3 text-sm">
            <span className="flex-1">{user(x)}</span>
            <span className="font-mono text-gold">{fmt(x.amount, 0)} R$</span>
            <span className="text-xs text-muted-foreground">{new Date(x.created_at).toLocaleString("pt-BR")}</span>
            <Button size="sm" onClick={() => run(() => rw({ data: { id: x.id, paid: true } }), "Marcado como pago")}>Paguei</Button>
            <Button size="sm" variant="outline" onClick={() => run(() => rw({ data: { id: x.id, paid: false } }), "Devolvido")}>Devolver</Button>
          </div>
        ))}
      </section>
    </main>
  );
}

function Box({ k, v }: { k: string; v: string }) {
  return <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">{k}</div><div className="font-mono text-lg">B$ {v}</div></div>;
}
