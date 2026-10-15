import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Protected } from "@/components/AppShell";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { stake, unstake } from "@/lib/blux.functions";
import { fmt, FEE_RATE, STAKER_SHARE } from "@/lib/markets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/stake")({
  head: () => ({ meta: [{ title: "Stake — BluxTrade" }, { name: "description", content: "Faça stake de Blux e ganhe com as taxas e perdas dos traders." }, { property: "og:title", content: "Stake — BluxTrade" }, { property: "og:description", content: "Seja a casa: ganhe com taxas e liquidações." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => (<Protected><Stake /></Protected>),
});

function Stake() {
  const { session } = useAuth();
  const { data: p } = useProfile();
  const qc = useQueryClient();
  const s = useServerFn(stake);
  const u = useServerFn(unstake);
  const [a, setA] = useState("");
  const { data } = useQuery({
    queryKey: ["stake", session?.user.id],
    refetchInterval: 5000,
    queryFn: async () => {
      const [pool, mine] = await Promise.all([
        supabase.from("pool").select("*").single(),
        supabase.from("stakes").select("*").eq("user_id", session!.user.id).maybeSingle(),
      ]);
      return { pool: pool.data, mine: mine.data };
    },
  });
  const pool = data?.pool; const mine = data?.mine;
  const pps = pool && Number(pool.total_shares) > 0 ? Number(pool.total_assets) / Number(pool.total_shares) : 1;
  const value = Number(mine?.shares ?? 0) * pps;
  const profit = value - Number(mine?.deposited ?? 0);
  const share = pool && Number(pool.total_shares) > 0 ? (Number(mine?.shares ?? 0) / Number(pool.total_shares)) * 100 : 0;
  const free = pool ? Number(pool.total_assets) - Number(pool.total_reserved) : 0;

  async function run(fn: () => Promise<unknown>, msg: string) {
    try { await fn(); toast.success(msg); setA(""); qc.invalidateQueries(); } catch (e: any) { toast.error(e.message); }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stake — seja a casa</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Seus Blux entram na pool que paga o lucro dos traders. Você ganha quando eles perdem ou são liquidados, e recebe {STAKER_SHARE * 100}% da taxa de {FEE_RATE * 100}% sobre todo lucro. Se os traders ganharem, a pool diminui.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Card k="Total na pool" v={`B$ ${fmt(pool?.total_assets)}`} />
        <Card k="Reservado em posições" v={`B$ ${fmt(pool?.total_reserved)}`} />
        <Card k="Livre p/ saque" v={`B$ ${fmt(free)}`} />
        <Card k="Taxas p/ stakers" v={`B$ ${fmt(pool?.fees_to_stakers)}`} />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border bg-card p-5 space-y-2">
          <h2 className="font-bold">Seu stake</h2>
          <div className="font-mono text-3xl text-gold">B$ {fmt(value)}</div>
          <div className="text-sm">Depositado: <span className="font-mono">{fmt(mine?.deposited)}</span></div>
          <div className={`text-sm font-mono ${profit >= 0 ? "text-bull" : "text-bear"}`}>Resultado: {profit >= 0 ? "+" : ""}{fmt(profit)} B$</div>
          <div className="text-sm text-muted-foreground">Sua fatia da pool: {share.toFixed(2)}%</div>
        </section>
        <section className="rounded-xl border bg-card p-5 space-y-3">
          <div className="text-sm text-muted-foreground">Saldo: <span className="font-mono text-gold">B$ {fmt(p?.balance)}</span></div>
          <Input type="number" placeholder="Quantidade de B$" value={a} onChange={(e) => setA(e.target.value)} className="font-mono" />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => run(() => s({ data: { amount: Number(a) } }), "Stake feito")}>Fazer stake</Button>
            <Button variant="outline" onClick={() => run(() => u({ data: { amount: Number(a) } }), "Retirado do stake")}>Retirar</Button>
          </div>
          <button className="text-xs text-primary underline" onClick={() => setA(String(Math.floor(value * 100) / 100))}>Usar valor total do stake</button>
        </section>
      </div>
    </main>
  );
}

function Card({ k, v }: { k: string; v: string }) {
  return <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">{k}</div><div className="font-mono text-lg">{v}</div></div>;
}
