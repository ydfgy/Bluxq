import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Protected } from "@/components/AppShell";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getCopyAllocations,
  getCopyEvents,
  getCopyLeaderboard,
  getCopyTraderStatus,
  saveCopyAllocation,
  setCopyTraderOptIn,
  toggleCopyAllocation,
} from "@/lib/blux.functions";
import { fmt } from "@/lib/markets";

export const Route = createFileRoute("/copy")({
  head: () => ({
    meta: [
      { title: "Copy Trade — Bluxq" },
      {
        name: "description",
        content: "Acompanhe traders participantes e copie operações com limite de alocação.",
      },
    ],
  }),
  component: () => (
    <Protected>
      <Copy />
    </Protected>
  ),
});

type Trader = {
  id: string;
  displayName: string;
  pnl: number;
  trades: number;
  winRate: number;
  bestSymbol: string;
  symbols: { symbol: string; pnl: number; trades: number }[];
  curve: { value: number }[];
};
type Allocation = {
  id: string;
  trader_id: string;
  budget: number;
  is_active: boolean;
  created_at: string;
};
type CopyEvent = {
  id: string;
  allocation_id: string;
  status: "copied" | "skipped" | "closed";
  reason: string | null;
  created_at: string;
};
function Copy() {
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [copyTarget, setCopyTarget] = useState<Trader | null>(null);
  const [budgetText, setBudgetText] = useState("10");
  const [chartOpen, setChartOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const uid = session?.user.id;
  const loadLeaderboard = useServerFn(getCopyLeaderboard);
  const loadAllocations = useServerFn(getCopyAllocations);
  const loadEvents = useServerFn(getCopyEvents);
  const loadOptIn = useServerFn(getCopyTraderStatus);
  const saveAllocation = useServerFn(saveCopyAllocation);
  const setOptIn = useServerFn(setCopyTraderOptIn);
  const setAllocationActive = useServerFn(toggleCopyAllocation);
  const leaderboardQuery = useQuery({
    queryKey: ["copy-leaderboard"],
    enabled: Boolean(uid),
    queryFn: async () => (await loadLeaderboard()) as unknown as Trader[],
    refetchInterval: 30_000,
    retry: false,
  });
  const allocationsQuery = useQuery({
    queryKey: ["copy-allocations", uid],
    enabled: Boolean(uid),
    queryFn: async () => (await loadAllocations()) as Allocation[],
    refetchInterval: 15_000,
    retry: false,
  });
  const optInQuery = useQuery({
    queryKey: ["copy-trader-status", uid],
    enabled: Boolean(uid),
    queryFn: () => loadOptIn(),
    retry: false,
  });
  const eventsQuery = useQuery({
    queryKey: ["copy-events", uid],
    enabled: Boolean(uid),
    queryFn: async () => (await loadEvents()) as CopyEvent[],
    refetchInterval: 15_000,
    retry: false,
  });
  const traders = leaderboardQuery.data ?? [];
  const allocations = useMemo(() => allocationsQuery.data ?? [], [allocationsQuery.data]);
  const allocationByTrader = useMemo(
    () => new Map(allocations.map((item) => [item.trader_id, item])),
    [allocations],
  );
  const balance = Number(profile?.balance ?? 0);
  const active = allocations.filter((item) => item.is_active);
  const activeBudget = active.reduce((sum, item) => sum + Number(item.budget), 0);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["copy-allocations", uid] }),
        queryClient.invalidateQueries({ queryKey: ["profile", uid] }),
        queryClient.invalidateQueries({ queryKey: ["copy-leaderboard"] }),
        queryClient.invalidateQueries({ queryKey: ["copy-trader-status", uid] }),
        queryClient.invalidateQueries({ queryKey: ["copy-events", uid] }),
      ]);
      setCopyTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    } finally {
      setBusy(false);
    }
  }
  function openCopy(trader: Trader) {
    setBudgetText("10");
    setCopyTarget(trader);
  }
  const parsedBudget = Number(budgetText);
  const budgetError =
    !Number.isFinite(parsedBudget) || parsedBudget < 10
      ? "A alocação mínima é $BX 10."
      : parsedBudget > balance
        ? "A alocação não pode exceder seu saldo disponível."
        : parsedBudget > 10_000_000
          ? "O limite por trader é $BX 10.000.000."
          : "";

  return (
    <main className="mx-auto max-w-6xl space-y-7 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Bluxq · estratégias
          </p>
          <h1 className="mt-2 text-3xl font-bold">Copy trading</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Veja resultados realizados de traders que optaram por participar e defina um limite para
            acompanhar novas posições.
          </p>
        </div>
        <div className="rounded-xl border px-4 py-3 text-right">
          <div className="text-xs text-muted-foreground">Saldo disponível</div>
          <div className="font-mono text-xl font-bold">$BX {fmt(balance)}</div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Cópias ativas" value={String(active.length)} />
        <Metric label="Limite total ativo" value={`$BX ${fmt(activeBudget)}`} />
        <Metric label="Saldo atual" value={`$BX ${fmt(balance)}`} />
      </section>
      <section className="rounded-xl border p-5">
        <h2 className="font-bold">Atividade recente das cópias</h2>
        {eventsQuery.isError ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Não foi possível carregar a atividade. Verifique se a migração está aplicada.
          </p>
        ) : !eventsQuery.data?.length ? (
          <p className="mt-2 text-sm text-muted-foreground">
            As novas posições copiadas ou ignoradas aparecerão aqui.
          </p>
        ) : (
          <div className="mt-3 divide-y">
            {eventsQuery.data.map((event) => {
              const allocation = allocations.find((item) => item.id === event.allocation_id);
              const trader = traders.find((item) => item.id === allocation?.trader_id);
              const label =
                event.status === "copied"
                  ? "Posição copiada"
                  : event.status === "closed"
                    ? "Cópia encerrada"
                    : "Posição ignorada";
              return (
                <div
                  key={event.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <div>
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {trader?.displayName ?? "Trader"}
                    </span>
                    {event.reason && (
                      <p className="text-xs text-muted-foreground">{event.reason}</p>
                    )}
                  </div>
                  <time className="text-xs text-muted-foreground" dateTime={event.created_at}>
                    {new Date(event.created_at).toLocaleString("pt-BR")}
                  </time>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed">
        <strong>Risco e alocação:</strong> a alocação define o limite de margem aberta para aquele
        trader; não é deduzida do saldo no momento da configuração. Novas operações espelham lado,
        ativo e alavancagem do trader e podem perder margem. Pausar interrompe novas cópias;
        posições já abertas continuam até serem fechadas pelo trader ou manualmente.
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Top 5 — lucro realizado</h2>
            <p className="text-sm text-muted-foreground">
              P&L acumulado em posições encerradas. Atualizado automaticamente.
            </p>
          </div>
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Dados reais · opt-in
          </span>
        </div>
        {leaderboardQuery.isPending ? (
          <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
            Carregando desempenho…
          </div>
        ) : leaderboardQuery.isError ? (
          <div className="rounded-xl border border-destructive/40 p-5 text-sm">
            <p className="font-semibold">Não foi possível carregar o ranking.</p>
            <p className="mt-1 text-muted-foreground">
              Confira se a migração copy trading foi aplicada no Supabase e tente novamente.
            </p>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => void leaderboardQuery.refetch()}
            >
              Tentar novamente
            </Button>
          </div>
        ) : traders.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <h3 className="font-semibold">Ainda não há traders no ranking</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              O ranking só inclui traders verificados que optaram por compartilhar desempenho e já
              têm operações encerradas. Nenhum resultado de demonstração é mostrado.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {traders.map((trader, index) => {
              const allocation = allocationByTrader.get(trader.id);
              const isExpanded = chartOpen === trader.id;
              return (
                <article key={trader.id} className="rounded-xl border p-4 sm:p-5">
                  <div className="grid items-center gap-4 lg:grid-cols-[auto_minmax(170px,1.1fr)_minmax(120px,.8fr)_minmax(130px,.8fr)_minmax(150px,1fr)_auto]">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-mono font-bold text-primary">
                      #{index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{trader.displayName}</div>
                      <div className="text-xs text-muted-foreground">
                        {trader.trades} encerradas · {trader.winRate}% vencedoras
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">P&L realizado</div>
                      <div
                        className={`font-mono font-bold ${trader.pnl >= 0 ? "text-emerald-500" : "text-destructive"}`}
                      >
                        {trader.pnl >= 0 ? "+" : ""}$BX {fmt(trader.pnl)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Melhor moeda</div>
                      <div className="font-semibold">{trader.bestSymbol || "—"}</div>
                    </div>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? "Recolher" : "Abrir"} gráfico de ${trader.displayName}`}
                      onClick={() => setChartOpen(isExpanded ? null : trader.id)}
                      className="rounded-lg border p-2 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>Curva acumulada</span>
                        <span>{isExpanded ? "Fechar" : "Ver gráfico"}</span>
                      </div>
                      <MiniChart
                        values={trader.curve.map((point) => point.value)}
                        positive={trader.pnl >= 0}
                      />
                    </button>
                    <Button onClick={() => openCopy(trader)} disabled={busy}>
                      {allocation?.is_active
                        ? "Editar limite"
                        : allocation
                          ? "Retomar cópia"
                          : "Copiar trader"}
                    </Button>
                  </div>
                  {isExpanded && (
                    <div className="mt-4 grid gap-4 border-t pt-4 md:grid-cols-2">
                      <div>
                        <div className="mb-2 text-sm font-semibold">Desempenho por moeda</div>
                        <div className="space-y-2">
                          {trader.symbols.slice(0, 8).map((coin) => (
                            <div
                              key={coin.symbol}
                              className="flex items-center justify-between gap-2 text-sm"
                            >
                              <span>
                                {coin.symbol}{" "}
                                <span className="text-xs text-muted-foreground">
                                  · {coin.trades} trades
                                </span>
                              </span>
                              <span
                                className={`font-mono ${coin.pnl >= 0 ? "text-emerald-500" : "text-destructive"}`}
                              >
                                {coin.pnl >= 0 ? "+" : ""}$BX {fmt(coin.pnl)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 text-sm font-semibold">Histórico de P&L acumulado</div>
                        <MiniChart
                          values={trader.curve.map((point) => point.value)}
                          positive={trader.pnl >= 0}
                          large
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          Até 30 posições encerradas mais recentes; valores em $BX.
                        </p>
                      </div>
                    </div>
                  )}
                  {allocation && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
                      <span>
                        Limite:{" "}
                        <strong className="font-mono">$BX {fmt(Number(allocation.budget))}</strong>{" "}
                        · {allocation.is_active ? "ativa" : "pausada"}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              setAllocationActive({
                                data: {
                                  allocationId: allocation.id,
                                  active: !allocation.is_active,
                                },
                              }),
                            allocation.is_active
                              ? "Cópia pausada; posições abertas continuam."
                              : "Cópia retomada.",
                          )
                        }
                      >
                        {allocation.is_active ? "Pausar novas cópias" : "Retomar cópias"}
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-bold">Compartilhe seu desempenho</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Participação opcional. Você aparece como trader anônimo por padrão; seu nome Roblox só
              será mostrado se você escolher compartilhar.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={busy || !profile?.verified || optInQuery.isPending}
            onClick={() =>
              void run(
                () =>
                  setOptIn({
                    data: {
                      enabled: !optInQuery.data?.enabled,
                      showName: optInQuery.data?.showName ?? false,
                    },
                  }),
                optInQuery.data?.enabled
                  ? "Você saiu do ranking; novas cópias foram pausadas."
                  : "Você entrou no ranking anonimamente.",
              )
            }
          >
            {!profile?.verified
              ? "Verifique a conta para participar"
              : optInQuery.data?.enabled
                ? "Sair do ranking"
                : "Participar anonimamente"}
          </Button>
        </div>
        {optInQuery.data?.enabled && (
          <div className="mt-4 flex items-center gap-2 text-sm">
            <input
              id="copy-show-name"
              type="checkbox"
              checked={optInQuery.data.showName}
              disabled={busy}
              onChange={(event) =>
                void run(
                  () => setOptIn({ data: { enabled: true, showName: event.target.checked } }),
                  event.target.checked
                    ? "Seu nome foi incluído no ranking."
                    : "Seu nome foi ocultado.",
                )
              }
            />
            <Label htmlFor="copy-show-name">Exibir meu nome Roblox no ranking (opcional)</Label>
          </div>
        )}
      </section>

      {copyTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCopyTarget(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="copy-dialog-title"
            className="w-full max-w-md space-y-4 rounded-xl border bg-background p-5 shadow-xl"
          >
            <div>
              <h2 id="copy-dialog-title" className="text-xl font-bold">
                Copiar {copyTarget.displayName}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Defina o limite máximo de margem aberta para este trader.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="copy-budget">Limite da alocação ($BX)</Label>
              <Input
                id="copy-budget"
                type="number"
                min="10"
                max={Math.min(balance, 10_000_000)}
                step="0.01"
                value={budgetText}
                onChange={(event) => setBudgetText(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Saldo atual: $BX {fmt(balance)} · mínimo $BX 10 · máximo $BX 10.000.000.
              </p>
              {budgetError && <p className="text-sm text-destructive">{budgetError}</p>}
            </div>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm leading-relaxed">
              Ao ativar, novas posições podem ser abertas automaticamente com base nas operações
              futuras deste trader. O limite restringe a margem copiada, mas não evita perdas; a
              alavancagem acompanha a estratégia. Posições já abertas não são encerradas ao pausar.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCopyTarget(null)} disabled={busy}>
                Cancelar
              </Button>
              <Button
                disabled={busy || Boolean(budgetError)}
                onClick={() =>
                  void run(
                    () =>
                      saveAllocation({
                        data: {
                          traderId: copyTarget.id,
                          budget: Math.round(parsedBudget * 100) / 100,
                        },
                      }),
                    "Copy trade ativado. Somente novas posições elegíveis serão copiadas.",
                  )
                }
              >
                {busy ? "Salvando…" : "Confirmar e ativar cópia"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function MiniChart({
  values,
  positive,
  large = false,
}: {
  values: number[];
  positive: boolean;
  large?: boolean;
}) {
  if (values.length < 2)
    return (
      <div
        className={`mt-1 flex items-center text-xs text-muted-foreground ${large ? "h-32" : "h-9"}`}
      >
        Histórico insuficiente
      </div>
    );
  const width = large ? 440 : 148;
  const height = large ? 116 : 34;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map(
      (value, index) =>
        `${(index / (values.length - 1)) * width},${height - 3 - ((value - min) / range) * (height - 6)}`,
    )
    .join(" ");
  const color = positive ? "#10b981" : "#ef4444";
  return (
    <svg
      className={`mt-1 w-full ${large ? "h-32" : "h-9"}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Gráfico de P&L acumulado ${positive ? "positivo" : "negativo"}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={large ? 2.5 : 2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl font-bold">{value}</div>
    </div>
  );
}
