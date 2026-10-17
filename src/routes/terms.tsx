import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Termos — Bluxq" },
      { name: "description", content: "Termos e avisos da plataforma Bluxq." },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <header className="flex items-end justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Bluxq</p>
          <h1 className="mt-1 text-3xl font-bold">Termos e avisos</h1>
        </div>
        <Link to="/" className="text-sm text-primary hover:underline">
          Início
        </Link>
      </header>
      <article className="space-y-7 text-sm leading-6 text-muted-foreground">
        <section>
          <h2 className="mb-2 text-lg font-bold text-foreground">Não associação</h2>
          <p>
            A Bluxq é uma plataforma independente e não é afiliada, patrocinada, endossada ou
            administrada pela Roblox Corporation, Roblox ou qualquer outra empresa. Roblox e Robux
            são mencionados apenas para identificar o ecossistema usado no fluxo de pagamento.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-bold text-foreground">$BX, Robux e conversão</h2>
          <p>
            A plataforma usa $BX como unidade interna. A referência informativa atual é{" "}
            <b className="text-foreground">1 $BX = 1 Robux = US$ 0,0125</b>. Essa referência não é
            uma cotação oficial, promessa de valor ou garantia de pagamento por terceiros.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-bold text-foreground">Verificação</h2>
          <p>
            O fluxo de Robux exige conta autenticada e conta Roblox verificada pelo procedimento da
            Bluxq. A verificação não cria associação, parceria ou endosso da Roblox à plataforma.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-bold text-foreground">Risco e operações</h2>
          <p>
            Operações com margem e alavancagem envolvem risco de perda. Leia as regras de
            liquidação, liquidez, taxas e limites antes de operar. A Bluxq não oferece
            aconselhamento financeiro.
          </p>
        </section>
      </article>
    </main>
  );
}
