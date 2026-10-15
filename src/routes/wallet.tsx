import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Protected } from "@/components/AppShell";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { requestDeposit, requestWithdraw } from "@/lib/blux.functions";
import { fmt, ROBLOX_GROUP_URL } from "@/lib/markets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{ title: "Carteira — BluxTrade" }, { name: "description", content: "Deposite e saque Robux na BluxTrade." }, { property: "og:title", content: "Carteira — BluxTrade" }, { property: "og:description", content: "Deposite Robux e receba Blux para operar." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => (<Protected><Wallet /></Protected>),
});

const STATUS: Record<string, string> = { pending: "Aguardando", approved: "Aprovado", rejected: "Recusado", paid: "Pago" };

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
        supabase.from("deposits").select("*").eq("user_id", uid!).order("created_at", { ascending: false }).limit(30),
        supabase.from("withdrawals").select("*").eq("user_id", uid!).order("created_at", { ascending: false }).limit(30),
      ]);
      return [...(a.data ?? []).map((x) => ({ ...x, kind: "Depósito" })), ...(b.data ?? []).map((x) => ({ ...x, kind: "Saque" }))]
        .sort((x, y) => y.created_at.localeCompare(x.created_at));
    },
  });

  async function run(fn: () => Promise<unknown>, msg: string) {
    try { await fn(); toast.success(msg); qc.invalidateQueries(); } catch (e: any) { toast.error(e.message); }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="rounded-xl border bg-card p-6">
        <div className="text-sm text-muted-foreground">Saldo disponível</div>
        <div className="font-mono text-4xl text-gold">B$ {fmt(p?.balance)}</div>
        <div className="text-xs text-muted-foreground mt-1">1 Robux = 1 Blux (B$)</div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-bold text-lg">Depositar</h2>
          <ol className="text-sm text-muted-foreground list-decimal pl-4 space-y-1">
            <li>Entre no <a href={ROBLOX_GROUP_URL} target="_blank" rel="noreferrer" className="text-primary underline">nosso grupo Roblox</a>.</li>
            <li>Compre o item/passe do grupo no valor que quer depositar, usando a conta <b>{p?.roblox_username}</b>.</li>
            <li>Informe o valor abaixo. Assim que confirmarmos, os Blux caem na sua conta.</li>
          </ol>
          <Input type="number" min={10} value={d} onChange={(e) => setD(e.target.value)} className="font-mono" />
          <Button className="w-full" onClick={() => run(() => dep({ data: { amount: Math.floor(Number(d)) } }), "Depósito enviado para confirmação")}>Informar depósito</Button>
        </section>
        <section className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-bold text-lg">Sacar</h2>
          <p className="text-sm text-muted-foreground">O valor sai do seu saldo agora e é pago em Robux pelo grupo para <b>{p?.roblox_username}</b>.</p>
          <Input type="number" placeholder="Quantidade de B$" value={w} onChange={(e) => setW(e.target.value)} className="font-mono" />
          <Button variant="outline" className="w-full" onClick={() => run(() => wd({ data: { amount: Number(w) } }), "Saque solicitado")}>Solicitar saque</Button>
        </section>
      </div>
      <section className="rounded-xl border bg-card">
        <h2 className="font-bold p-4 border-b">Histórico</h2>
        {(hist ?? []).map((x) => (
          <div key={x.id} className="flex items-center justify-between border-b last:border-0 px-4 py-2 text-sm">
            <span>{x.kind}</span>
            <span className="font-mono">{fmt(x.amount, 0)} B$</span>
            <span className="text-muted-foreground text-xs">{new Date(x.created_at).toLocaleString("pt-BR")}</span>
            <span className={x.status === "pending" ? "text-gold" : x.status === "rejected" ? "text-bear" : "text-bull"}>{STATUS[x.status] ?? x.status}</span>
          </div>
        ))}
        {!hist?.length && <div className="p-6 text-center text-sm text-muted-foreground">Sem movimentações.</div>}
      </section>
    </main>
  );
}
