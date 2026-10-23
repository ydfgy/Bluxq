import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/copy")({
  head: () => ({
    meta: [
      { title: "Copy — Bluxq" },
      { name: "description", content: "Copie estratégias de traders na Bluxq." },
    ],
  }),
  component: Copy,
});

function Copy() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold">Copy Trade</h1>
      </header>

      <section className="rounded-xl border bg-transparent p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Suas cópias
            </div>
            <div className="mt-2 font-mono text-4xl font-bold text-primary">$BX 0,00</div>
            <p className="mt-1 text-sm text-muted-foreground">Resultado acumulado</p>
          </div>
          <Link
            to="/trade"
            className="rounded-md border px-4 py-2 text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
          >
            Ir para Trade
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Estratégias disponíveis</h2>
          <span className="rounded-full border border-primary/30 px-3 py-1 text-xs text-primary">
            Indisponível
          </span>
        </div>

        <div className="rounded-xl border border-dashed p-8 text-center">
          <h3 className="font-semibold">Copy Trade ainda não está ativo</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Não há estratégias ou histórico de cópias configurados no banco de dados ainda. Esta
            tela não inventa traders nem resultados: quando o módulo for ativado, as estratégias e
            suas métricas aparecerão aqui.
          </p>
          <Link
            to="/trade"
            className="mt-5 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Operar manualmente
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Metric label="Capital copiado" value="$BX 0,00" />
        <Metric label="Estratégias seguidas" value="0" />
        <Metric label="Resultado hoje" value="$BX 0,00" />
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-transparent p-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl">{value}</div>
    </div>
  );
}
