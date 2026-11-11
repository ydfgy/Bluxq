import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  CircleDollarSign,
  Gamepad2,
  LineChart,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";

export const Route = createFileRoute("/tutorial")({
  component: TutorialPage,
});

type StepProps = {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
};

function Step({ number, title, description, children }: StepProps) {
  return (
    <article className="grid gap-6 border-t border-border py-8 md:grid-cols-[minmax(0,0.82fr)_minmax(360px,1.18fr)] md:items-center md:gap-12">
      <div>
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {number}
          </span>
          <span className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            Passo {number}
          </span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        <p className="mt-3 max-w-lg text-base leading-7 text-muted-foreground">{description}</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card p-4">{children}</div>
    </article>
  );
}

function MockHeader({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </div>
      <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
        Bluxq
      </span>
    </div>
  );
}

function TutorialPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 lg:px-8">
      <header className="max-w-3xl pb-10">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
          Guia rápido
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Comece na Bluxq em poucos passos
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          Um caminho direto para criar sua conta, operar, depositar por Game Pass e solicitar seu
          saque.
        </p>
      </header>

      <section aria-label="Passos do tutorial">
        <Step
          number="1"
          title="Crie sua conta e verifique o Roblox"
          description="Entre ou crie sua conta. Depois, abra a verificação e siga a instrução exibida para vincular seu perfil Roblox com segurança."
        >
          <MockHeader
            title="Verificação Roblox"
            icon={<Gamepad2 className="h-4 w-4 text-primary" />}
          />
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm font-semibold text-foreground">Sua frase de verificação</p>
            <div className="mt-3 rounded-md border border-primary/40 bg-background px-3 py-3 font-mono text-sm text-primary">
              BLUXQ-VERIFY-2026
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-bull">
              <Check className="h-4 w-4" /> Perfil pronto para verificar
            </div>
          </div>
        </Step>

        <Step
          number="2"
          title="Escolha um mercado e abra sua operação"
          description="No Trade, escolha o ativo, defina Long ou Short, informe sua margem e confirme. Acompanhe tudo pelo gráfico e pelo painel da posição."
        >
          <MockHeader
            title="Terminal de Trade"
            icon={<LineChart className="h-4 w-4 text-primary" />}
          />
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 rounded-lg bg-muted p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>BTCUSDT</span>
                <span className="text-bull">+2,41%</span>
              </div>
              <div className="mt-5 flex h-20 items-end gap-1">
                {[34, 48, 40, 62, 54, 76, 68, 88, 80, 96].map((height, index) => (
                  <span
                    key={index}
                    className="flex-1 rounded-t bg-primary/70"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Lado</p>
              <div className="mt-3 grid gap-2">
                <span className="rounded bg-bull/15 px-2 py-2 text-center text-xs text-bull">
                  Long
                </span>
                <span className="rounded bg-muted px-2 py-2 text-center text-xs text-muted-foreground">
                  Short
                </span>
              </div>
            </div>
          </div>
        </Step>

        <Step
          number="3"
          title="Deposite usando um Game Pass"
          description="Abra Wallet, selecione Robux, escolha o Game Pass com o valor desejado e envie o depósito. O pedido aparece no histórico para análise."
        >
          <MockHeader
            title="Wallet · Depositar"
            icon={<WalletCards className="h-4 w-4 text-primary" />}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-primary bg-primary/5 p-4">
              <p className="text-xs text-muted-foreground">Método</p>
              <p className="mt-2 font-semibold text-foreground">Robux · Game Pass</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">Valor selecionado</p>
              <p className="mt-2 font-mono font-semibold text-foreground">100 R$</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-muted p-4">
            <span className="text-sm text-foreground">Game Pass de 100 Robux</span>
            <Check className="h-5 w-5 text-bull" />
          </div>
        </Step>

        <Step
          number="4"
          title="Solicite seu saque"
          description="Quando quiser retirar, abra Wallet, escolha o método e informe um valor mínimo de 100. No saque Roblox, a taxa de 30% é mostrada antes da confirmação."
        >
          <MockHeader
            title="Wallet · Sacar"
            icon={<CircleDollarSign className="h-4 w-4 text-primary" />}
          />
          <div className="rounded-lg bg-muted p-4 text-sm">
            <div className="flex justify-between text-foreground">
              <span>Valor bruto</span>
              <strong>100 R$</strong>
            </div>
            <div className="mt-3 flex justify-between text-muted-foreground">
              <span>Taxa Roblox (30%)</span>
              <span>-30 R$</span>
            </div>
            <div className="mt-3 flex justify-between border-t border-border pt-3 font-semibold text-primary">
              <span>Você recebe</span>
              <span>70 R$</span>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-primary/30 px-4 py-3 text-xs text-muted-foreground">
            O pedido fica pendente até a análise do administrador.
          </div>
        </Step>
      </section>

      <footer className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-8">
        <Link
          to="/trade"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Ir para o Trade <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          to="/wallet"
          className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted"
        >
          Abrir Wallet
        </Link>
      </footer>
    </main>
  );
}
