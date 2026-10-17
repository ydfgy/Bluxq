import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Protected } from "@/components/AppShell";
import { useIsAdmin } from "@/hooks/use-auth";
import { adminOverview, claimAdmin, reviewDeposit, reviewWithdraw } from "@/lib/blux.functions";
import { fmt } from "@/lib/markets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AdminRequest = {
  profile: { roblox_username: string; roblox_user_id: number | null } | undefined;
  user_id: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Bluxq" },
      { name: "description", content: "Painel de administração da Bluxq." },
      { property: "og:title", content: "Admin — Bluxq" },
      { property: "og:description", content: "Aprovar depósitos e saques." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <Protected>
      <Admin />
    </Protected>
  ),
});

function Admin() {
  const { data: isAdmin, isLoading } = useIsAdmin();
  const qc = useQueryClient();
  const claim = useServerFn(claimAdmin);
  const overview = useServerFn(adminOverview);
  const rd = useServerFn(reviewDeposit);
  const rw = useServerFn(reviewWithdraw);
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const { data } = useQuery({
    queryKey: ["admin"],
    enabled: !!isAdmin,
    refetchInterval: 5000,
    queryFn: () => overview(),
  });

  async function run(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      toast.success(msg);
      qc.invalidateQueries();
    } catch (error: unknown) {
      toast.error(errorMessage(error));
    }
  }

  if (isLoading) return null;
  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-md space-y-4 px-4 py-12">
        <h1 className="text-xl font-bold">Inicializar administração</h1>
        <p className="text-sm text-muted-foreground">
          A administração só pode ser inicializada uma vez pelo proprietário, usando a chave
          configurada no ambiente do servidor.
        </p>
        <Input
          type="password"
          autoComplete="off"
          placeholder="Chave de bootstrap"
          value={bootstrapSecret}
          onChange={(event) => setBootstrapSecret(event.target.value)}
        />
        <Button
          className="w-full"
          disabled={bootstrapSecret.length < 32}
          onClick={() => run(() => claim({ data: { bootstrapSecret } }), "Agora você é admin")}
        >
          Inicializar administração
        </Button>
      </main>
    );
  }

  const user = (x: AdminRequest) =>
    x.profile
      ? `${x.profile.roblox_username} (#${x.profile.roblox_user_id ?? "?"})`
      : x.user_id.slice(0, 8);
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold">Admin</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <Box k="Pool" v={fmt(data?.pool?.total_assets)} />
        <Box k="Reservado" v={fmt(data?.pool?.total_reserved)} />
        <Box k="Receita da plataforma" v={fmt(data?.pool?.platform_revenue)} />
      </div>
      <section className="rounded-xl border bg-card">
        <h2 className="border-b p-4 font-bold">
          Depósitos aguardando ({data?.deposits.length ?? 0})
        </h2>
        <p className="px-4 pt-2 text-xs text-muted-foreground">
          Confira no Roblox se esse usuário comprou o item do grupo nesse valor antes de aprovar.
        </p>
        {data?.deposits.map((x) => (
          <div
            key={x.id}
            className="flex flex-wrap items-center gap-3 border-b px-4 py-3 text-sm last:border-0"
          >
            <span className="flex-1">{user(x)}</span>
            <span className="font-mono text-gold">{fmt(x.amount, 0)} $BX</span>
            <span className="text-xs text-muted-foreground">
              {x.payment_method === "crypto"
                ? `Crypto: ${x.asset ?? "?"} / ${x.network ?? "?"} · TX: ${x.transaction_hash ?? "?"}`
                : "Roblox / Robux"}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(x.created_at).toLocaleString("pt-BR")}
            </span>
            <Button
              size="sm"
              onClick={() => run(() => rd({ data: { id: x.id, approve: true } }), "Aprovado")}
            >
              Aprovar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => run(() => rd({ data: { id: x.id, approve: false } }), "Recusado")}
            >
              Recusar
            </Button>
          </div>
        ))}
      </section>
      <section className="rounded-xl border bg-card">
        <h2 className="border-b p-4 font-bold">
          Saques aguardando ({data?.withdrawals.length ?? 0})
        </h2>
        <p className="px-4 pt-2 text-xs text-muted-foreground">
          Para Roblox, pague os Robux pelo grupo. Para Crypto, envie para o endereço informado e
          marque como pago. “Devolver” estorna o saldo ao usuário.
        </p>
        {data?.withdrawals.map((x) => (
          <div
            key={x.id}
            className="flex flex-wrap items-center gap-3 border-b px-4 py-3 text-sm last:border-0"
          >
            <span className="flex-1">{user(x)}</span>
            <span className="font-mono text-gold">{fmt(x.amount, 0)} $BX</span>
            <span className="text-xs text-muted-foreground">
              {x.payout_method === "crypto"
                ? `Crypto: ${x.asset ?? "?"} / ${x.network ?? "?"} · ${x.destination ?? "?"}`
                : "Roblox / Robux"}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(x.created_at).toLocaleString("pt-BR")}
            </span>
            <Button
              size="sm"
              onClick={() => run(() => rw({ data: { id: x.id, paid: true } }), "Marcado como pago")}
            >
              Paguei
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => run(() => rw({ data: { id: x.id, paid: false } }), "Devolvido")}
            >
              Devolver
            </Button>
          </div>
        ))}
      </section>
    </main>
  );
}

function Box({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-mono text-lg">$BX {v}</div>
    </div>
  );
}
