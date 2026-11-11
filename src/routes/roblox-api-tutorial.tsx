import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Protected } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/roblox-api-tutorial")({
  head: () => ({
    meta: [
      { title: "Tutorial Roblox — Bluxq" },
      {
        name: "description",
        content: "Aprenda a criar uma Creator API Key do Roblox com segurança.",
      },
    ],
  }),
  component: () => (
    <Protected>
      <RobloxApiTutorial />
    </Protected>
  ),
});

type StepProps = {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
};

function Step({ number, title, description, children }: StepProps) {
  return (
    <article className="grid gap-6 border-t border-border py-8 md:grid-cols-[minmax(0,0.78fr)_minmax(360px,1.22fr)] md:items-center md:gap-12">
      <div>
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {number}
          </span>
          <span className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            Etapa {number}
          </span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{description}</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card p-4">{children}</div>
    </article>
  );
}

function FakeTopbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
      <span className="text-sm font-semibold text-foreground">Roblox Creator Dashboard</span>
      <span className="rounded-md bg-muted px-3 py-1 text-xs text-muted-foreground">
        create.roblox.com
      </span>
    </div>
  );
}

function RobloxApiTutorial() {
  const nav = useNavigate();

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <header className="max-w-3xl border-b border-border pb-8">
        <div className="mb-4 flex items-center gap-3 text-primary">
          <KeyRound className="h-5 w-5" />
          <span className="text-sm font-semibold uppercase tracking-[0.2em]">Tutorial Roblox</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Crie sua Creator API Key
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          Configure a chave uma vez e use depósitos Game Pass com segurança. Siga as quatro etapas
          abaixo.
        </p>
      </header>

      <section
        className="grid gap-4 border-b border-border py-8 sm:grid-cols-3"
        aria-label="Requisitos"
      >
        <div>
          <p className="font-semibold text-foreground">Conta correta</p>
          <p className="mt-1 text-sm text-muted-foreground">Use o Roblox conectado à Bluxq.</p>
        </div>
        <div>
          <p className="font-semibold text-foreground">Acesso ao Creator</p>
          <p className="mt-1 text-sm text-muted-foreground">Abra o painel oficial do Roblox.</p>
        </div>
        <div>
          <p className="font-semibold text-foreground">Chave privada</p>
          <p className="mt-1 text-sm text-muted-foreground">Nunca compartilhe ou publique.</p>
        </div>
      </section>

      <section aria-label="Passos para criar a chave">
        <Step
          number="1"
          title="Abra o painel de credenciais"
          description="Entre no Creator Dashboard com a conta Roblox correta e abra a área de credenciais."
        >
          <FakeTopbar>
            <span />
          </FakeTopbar>
          <div className="rounded-lg bg-muted p-5">
            <p className="text-lg font-semibold text-foreground">Credenciais</p>
            <p className="mt-2 text-sm text-muted-foreground">Gerencie suas chaves de API</p>
            <div className="mt-5 h-2 w-2/3 rounded bg-border" />
            <div className="mt-3 h-2 w-1/2 rounded bg-border" />
          </div>
          <a
            href="https://create.roblox.com/dashboard/credentials"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Abrir Creator Dashboard <ExternalLink className="h-4 w-4" />
          </a>
        </Step>

        <Step
          number="2"
          title="Crie uma chave nova"
          description="Clique em criar chave, dê um nome que você reconheça e mantenha a chave restrita ao uso necessário."
        >
          <FakeTopbar>
            <span />
          </FakeTopbar>
          <div className="rounded-lg bg-muted p-5">
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold text-foreground">API Keys</p>
              <span className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                Create API Key
              </span>
            </div>
            <div className="mt-5 rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-semibold text-foreground">Nome da chave</p>
              <div className="mt-3 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                Bluxq Game Pass
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm text-bull">
                <Check className="h-4 w-4" /> Chave restrita
              </div>
            </div>
          </div>
        </Step>

        <Step
          number="3"
          title="Configure somente estas permissões"
          description="Na seção de permissões, use exatamente as opções abaixo. Não adicione permissões desnecessárias."
        >
          <FakeTopbar>
            <span />
          </FakeTopbar>
          <div className="space-y-3 rounded-lg bg-muted p-5 text-sm">
            <div className="flex items-center justify-between rounded-md bg-background p-3">
              <span className="text-foreground">Inventory</span>
              <span className="font-semibold text-bull">Read</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-background p-3">
              <span className="text-foreground">Game Passes</span>
              <span className="font-semibold text-bull">Read &amp; Write on your place</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-background p-3">
              <span className="text-foreground">Restrict IP</span>
              <span className="font-semibold text-bull">Off</span>
            </div>
          </div>
        </Step>

        <Step
          number="4"
          title="Copie e cole somente na Bluxq"
          description="Copie a chave uma única vez e cole apenas no campo protegido da Bluxq. Se ela vazar, revogue no Roblox e crie outra."
        >
          <FakeTopbar>
            <span />
          </FakeTopbar>
          <div className="rounded-lg bg-muted p-5">
            <div className="flex items-center gap-3 text-bull">
              <ShieldCheck className="h-6 w-6" />
              <p className="text-lg font-semibold text-foreground">Chave pronta</p>
            </div>
            <div className="mt-5 rounded-md border border-primary/40 bg-background px-4 py-3 font-mono text-sm text-primary">
              ••••••••••••••••••••
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="h-4 w-4 text-bull" /> Cole no campo protegido da Bluxq
            </div>
          </div>
        </Step>
      </section>

      <section className="border-t border-border py-8">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="font-bold text-foreground">Regra de segurança</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              A Creator API Key é secreta. Não envie por mensagem, não coloque no código e não salve
              em capturas de tela. A Bluxq usa a chave somente no backend.
            </p>
          </div>
        </div>
      </section>

      <footer className="flex flex-wrap items-center gap-3 border-t border-border pt-8">
        <Button
          onClick={() => {
            window.sessionStorage.setItem("bluxq-roblox-tutorial-complete", "1");
            nav({ to: "/wallet" });
          }}
        >
          Continuar para a Wallet <ArrowRight className="h-4 w-4" />
        </Button>
        <Button asChild variant="outline">
          <Link to="/trade">Voltar para a plataforma</Link>
        </Button>
      </footer>
    </main>
  );
}
