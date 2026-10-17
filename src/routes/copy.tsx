import { createFileRoute } from "@tanstack/react-router";
import { Protected } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/copy")({
  head: () => ({
    meta: [
      { title: "Copy — Bluxq" },
      { name: "description", content: "Copie estratégias de traders na Bluxq." },
    ],
  }),
  component: () => (
    <Protected>
      <Copy />
    </Protected>
  ),
});

function Copy() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Bluxq</p>
        <h1 className="mt-1 text-2xl font-bold">Copy Trading</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Acompanhe estratégias de traders e escolha quais posições deseja copiar.
        </p>
      </header>

      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Suas cópias
            </div>
            <div className="mt-2 font-mono text-4xl font-bold text-primary">$BX 0,00</div>
            <p className="mt-1 text-sm text-muted-foreground">Resultado acumulado</p>
          </div>
          <Button variant="outline">Ver histórico</Button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Estratégias disponíveis</h2>
            <p className="text-sm text-muted-foreground">
              Compare desempenho e risco antes de começar a copiar.
            </p>
          </div>
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            0 ativas
          </span>
        </div>

        <div className="rounded-xl border bg-card p-8 text-center">
          <h3 className="font-semibold">Nenhuma estratégia disponível</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Quando houver traders compartilhando estratégias, elas aparecerão aqui para você
            analisar e copiar.
          </p>
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
    <div className="rounded-xl border bg-card p-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl">{value}</div>
    </div>
  );
}
