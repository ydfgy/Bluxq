import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BarChart3, Medal, Trophy } from "lucide-react";
import { Protected } from "@/components/AppShell";
import { getLeaderboard } from "@/lib/blux.functions";
import { fmt } from "@/lib/markets";

export const Route = createFileRoute("/ranking")({
  head: () => ({ meta: [{ title: "Ranking — Bluxq" }, { name: "description", content: "Top 10 traders por lucro percentual realizado." }] }),
  component: () => (
    <Protected>
      <Ranking />
    </Protected>
  ),
});

type Leader = {
  rank: number;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_anonymous: boolean;
  profit: number;
  margin: number;
  profit_percentage: number;
  trades: number;
};

function Ranking() {
  const load = useServerFn(getLeaderboard);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => load(),
    staleTime: 30_000,
  });
  const rows = (data ?? []) as Leader[];

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:py-12">
      <header className="flex flex-col justify-between gap-5 border-b border-border/70 pb-7 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            <Trophy className="h-4 w-4" /> Performance global
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">Top 10 traders</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Ranking por lucro percentual realizado: PnL acumulado dividido pela margem total das operações encerradas.
            Clique em um usuário para ver o perfil e enviar uma doação em BX.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <BarChart3 className="h-4 w-4 text-primary" /> Atualizado a cada 30s
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="grid grid-cols-[3rem_minmax(0,1fr)_7rem_7rem] gap-3 border-b bg-muted/30 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:grid-cols-[4rem_minmax(0,1fr)_9rem_8rem_7rem]">
          <span>#</span><span>Trader</span><span className="text-right">Lucro %</span><span className="hidden text-right sm:block">PnL BX</span><span className="text-right">Trades</span>
        </div>
        {isLoading && <div className="p-10 text-center text-sm text-muted-foreground">Carregando ranking…</div>}
        {isError && <div className="p-10 text-center text-sm text-bear">Não foi possível carregar o ranking.</div>}
        {!isLoading && !isError && !rows.length && <div className="p-10 text-center text-sm text-muted-foreground">Ainda não há operações encerradas suficientes para formar o ranking.</div>}
        {rows.map((row) => (
          <Link
            key={row.user_id}
            to="/profile/$userId"
            params={{ userId: row.user_id }}
            className="grid grid-cols-[3rem_minmax(0,1fr)_7rem_7rem] items-center gap-3 border-b px-4 py-4 transition-colors last:border-0 hover:bg-primary/5 sm:grid-cols-[4rem_minmax(0,1fr)_9rem_8rem_7rem]"
          >
            <div className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${row.rank <= 3 ? "bg-gold/15 text-gold" : "bg-muted text-muted-foreground"}`}>
              {row.rank <= 3 ? <Medal className="h-4 w-4" /> : row.rank}
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 font-bold text-primary">
                {row.avatar_url ? <img src={row.avatar_url} alt="" className="h-full w-full object-cover" /> : row.username.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold">{row.username}</div>
                <div className="truncate text-xs text-muted-foreground">{row.is_anonymous ? "Identidade protegida" : `${row.trades} operações encerradas`}</div>
              </div>
              <ArrowUpRight className="ml-auto hidden h-4 w-4 text-muted-foreground sm:block" />
            </div>
            <div className={`text-right font-mono font-semibold ${row.profit_percentage >= 0 ? "text-bull" : "text-bear"}`}>
              {row.profit_percentage >= 0 ? "+" : ""}{row.profit_percentage.toFixed(2)}%
            </div>
            <div className="hidden text-right font-mono text-sm text-muted-foreground sm:block">{fmt(row.profit, 2)} BX</div>
            <div className="text-right font-mono text-sm text-muted-foreground">{row.trades}</div>
          </Link>
        ))}
      </section>
      <p className="text-xs leading-5 text-muted-foreground">O ranking usa resultados realizados e pode mudar quando novas operações são encerradas. Usuários anônimos aparecem sem avatar ou nome identificável.</p>
    </main>
  );
}
