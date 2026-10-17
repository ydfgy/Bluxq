import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Coins, ExternalLink, Gamepad2, WalletCards } from "lucide-react";
import { Protected } from "@/components/AppShell";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { requestDeposit, requestWithdraw } from "@/lib/blux.functions";
import { fmt, ROBLOX_GROUP_URL } from "@/lib/markets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Carteira — BluxTrade" },
      {
        name: "description",
        content: "Converta Robux em B$ para operar e retire seus ganhos em Robux.",
      },
      { property: "og:title", content: "Carteira — BluxTrade" },
      {
        property: "og:description",
        content: "Converta Robux em B$ e retire seus ganhos em Robux.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Protected>
      <Wallet />
    </Protected>
  ),
});

const STATUS: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Recusado",
  paid: "Pago",
};

function Wallet() {
  const { session } = useAuth();
  const { data: p } = useProfile();
  const qc = useQueryClient();
  const dep = useServerFn(requestDeposit);
  const wd = useServerFn(requestWithdraw);
  const [d, setD] = useState("100");
  const [w, setW] = useState("");
  const uid = session?.user.id;

  const { data: hist } = useQuery({
    queryKey: ["wallet-hist", uid],
    refetchInterval: 5000,
    queryFn: async () => {
      const [a, b] = await Promise.all([
        supabase
          .from("deposits")
          .select("*")
          .eq("user_id", uid!)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("withdrawals")
          .select("*")
          .eq("user_id", uid!)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      return [
        ...(a.data ?? []).map((x) => ({ ...x, kind: "Entrada" })),
        ...(b.data ?? []).map((x) => ({ ...x, kind: "Saída" })),
      ].sort((x, y) => y.created_at.localeCompare(x.created_at));
    },
  });

  async function run(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      toast.success(msg);
      qc.invalidateQueries();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir a operação.");
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-8">
      <section className="flex items-center justify-between rounded-xl border bg-card px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-gold/15 text-gold">
            <WalletCards aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Saldo B$
            </div>
            <div className="font-mono text-3xl font-bold text-gold">B$ {fmt(p?.balance)}</div>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-right text-xs text-muted-foreground sm:flex">
          <Coins aria-hidden="true" className="h-4 w-4 text-gold" />
          <span>1 Robux = 1 B$</span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
              <Gamepad2 aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-bold">
                Robux <ArrowRight aria-hidden="true" className="mx-1 inline h-4 w-4" /> B$
              </h2>
              <p className="text-xs text-muted-foreground">Adicionar saldo para operar</p>
            </div>
          </div>
          <div className="space-y-3">
            <Input
              type="number"
              min={10}
              step={1}
              value={d}
              onChange={(e) => setD(e.target.value)}
              aria-label="Quantidade de Robux para converter em B$"
              className="font-mono"
              placeholder="Quantidade de Robux"
            />
            <a
              href={ROBLOX_GROUP_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary hover:bg-primary/10"
            >
              <span>1. Compre a quantia no grupo Roblox usando {p?.roblox_username}</span>
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            </a>
            <Button
              className="w-full"
              disabled={!Number.isFinite(Number(d)) || Number(d) < 10}
              onClick={() =>
                run(
                  () => dep({ data: { amount: Math.floor(Number(d)) } }),
                  "Conversão enviada para confirmação",
                )
              }
            >
              Converter Robux em B$
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-gold/10 text-gold">
              <Coins aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-bold">
                B$ <ArrowRight aria-hidden="true" className="mx-1 inline h-4 w-4" /> Robux
              </h2>
              <p className="text-xs text-muted-foreground">Retirar saldo para seu Roblox</p>
            </div>
          </div>
          <div className="space-y-3">
            <Input
              type="number"
              min={1}
              step={1}
              placeholder="Quantidade de B$"
              value={w}
              onChange={(e) => setW(e.target.value)}
              aria-label="Quantidade de B$ para converter em Robux"
              className="font-mono"
            />
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              O grupo enviará os Robux para <b className="text-foreground">{p?.roblox_username}</b>{" "}
              após a aprovação.
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={
                !Number.isFinite(Number(w)) || Number(w) <= 0 || Number(w) > Number(p?.balance ?? 0)
              }
              onClick={() =>
                run(() => wd({ data: { amount: Number(w) } }), "Conversão para Robux solicitada")
              }
            >
              Converter B$ em Robux
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3 text-sm font-bold">Atividade recente</div>
        {(hist ?? []).map((x) => (
          <div
            key={x.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-sm last:border-0"
          >
            <span className="flex items-center gap-2">
              <span className={x.kind === "Entrada" ? "text-bull" : "text-gold"}>
                {x.kind === "Entrada" ? "↓" : "↑"}
              </span>
              {x.kind}
            </span>
            <span className="font-mono">B$ {fmt(x.amount, 0)}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(x.created_at).toLocaleString("pt-BR")}
            </span>
            <span
              className={
                x.status === "pending"
                  ? "text-gold"
                  : x.status === "rejected"
                    ? "text-bear"
                    : "text-bull"
              }
            >
              {STATUS[x.status] ?? x.status}
            </span>
          </div>
        ))}
        {!hist?.length && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma atividade ainda.
          </div>
        )}
      </section>
    </main>
  );
}
