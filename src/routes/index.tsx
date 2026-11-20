import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  ChartNoAxesCombined,
  ChevronRight,
  CircleDollarSign,
  Copy,
  LockKeyhole,
  MoveUpRight,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { BrandIcon } from "@/components/AppShell";

export const Route = createFileRoute("/")({
  component: Index,
});

const steps = [
  {
    number: "01",
    title: "Conecte e deposite",
    description: "Escolha Robux ou crypto e acompanhe cada etapa sem sair da sua conta.",
    icon: WalletCards,
    tone: "bull",
  },
  {
    number: "02",
    title: "Escolha seu mercado",
    description: "Leia os dados ao vivo e defina sua posição com controle de risco claro.",
    icon: ChartNoAxesCombined,
    tone: "primary",
  },
  {
    number: "03",
    title: "Opere ou copie",
    description: "Use alavancagem com limites visíveis ou acompanhe traders elegíveis.",
    icon: Copy,
    tone: "gold",
  },
  {
    number: "04",
    title: "Saque com rastreio",
    description: "Veja status, taxas e histórico antes de confirmar qualquer retirada.",
    icon: CircleDollarSign,
    tone: "bull",
  },
];

const capabilities = [
  {
    icon: Activity,
    eyebrow: "MERCADO AO VIVO",
    title: "Decisão em movimento",
    description:
      "Candles, preço, livro e PnL se atualizam no mesmo terminal para você agir com contexto.",
    stat: "50x",
    statLabel: "alavancagem máxima",
    accent: "primary",
  },
  {
    icon: Copy,
    eyebrow: "COPY TRADE",
    title: "Estratégia sem ruído",
    description:
      "Veja pódio, performance semanal e curva de resultado antes de escolher quem acompanhar.",
    stat: "TOP 10",
    statLabel: "ranking semanal",
    accent: "gold",
  },
  {
    icon: ShieldCheck,
    eyebrow: "CONTROLE",
    title: "Tudo com confirmação",
    description:
      "Depósitos, saques e posições têm status, validações e histórico para você saber o que aconteceu.",
    stat: "24/7",
    statLabel: "status da operação",
    accent: "bull",
  },
];

function Index() {
  return (
    <main className="presentation-page overflow-hidden">
      <section className="presentation-hero relative mx-auto max-w-7xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24 lg:pb-32">
        <div className="presentation-orbit presentation-orbit-one" />
        <div className="presentation-orbit presentation-orbit-two" />
        <div className="relative grid items-center gap-14 lg:grid-cols-[1.02fr_0.98fr] lg:gap-20">
          <div className="presentation-reveal max-w-2xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Bluxq / terminal financeiro
            </div>
            <h1 className="max-w-2xl text-5xl font-bold leading-[0.98] tracking-[-0.06em] text-foreground sm:text-7xl">
              Seu saldo em movimento.
              <span className="mt-2 block text-primary text-glow">Sua decisão no controle.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Uma plataforma para operar mercados, mover saldo por Robux ou crypto e acompanhar cada
              decisão com clareza.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/trade"
                className="group inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-1"
              >
                Abrir terminal
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                to="/wallet"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/60 px-5 py-3 text-sm font-bold transition-colors hover:border-primary/60 hover:bg-primary/10"
              >
                Ver minha wallet
                <MoveUpRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-bull animate-pulse" /> dados ao vivo
              </span>
              <span className="inline-flex items-center gap-2">
                <LockKeyhole className="h-3.5 w-3.5 text-gold" /> controle por etapa
              </span>
            </div>
          </div>

          <div className="presentation-reveal presentation-reveal-delay mx-auto w-full max-w-xl lg:ml-auto">
            <div className="bluxq-art" aria-label="Composição animada do fluxo Bluxq">
              <div className="bluxq-art-noise" />
              <div className="bluxq-art-ring bluxq-art-ring-one" />
              <div className="bluxq-art-ring bluxq-art-ring-two" />
              <div className="bluxq-art-core">
                <BrandIcon />
              </div>
              <div className="bluxq-art-beam bluxq-art-beam-one" />
              <div className="bluxq-art-beam bluxq-art-beam-two" />
              <div className="bluxq-art-node bluxq-art-node-one">
                <span>ROBux</span>
                <b>saldo</b>
              </div>
              <div className="bluxq-art-node bluxq-art-node-two">
                <span>BTC</span>
                <b>mercado</b>
              </div>
              <div className="bluxq-art-node bluxq-art-node-three">
                <span>copy</span>
                <b>estratégia</b>
              </div>
              <div className="bluxq-art-wordmark">
                BLUXQ <span>MOVE WITH INTENT</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-y border-border/70 bg-card/25 px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 max-w-2xl presentation-reveal-on-scroll">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary">
              Um fluxo, quatro movimentos
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
              Do saldo à decisão sem tela perdida.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <article
                  key={step.number}
                  className={`flow-step presentation-reveal-on-scroll flow-step-${index + 1}`}
                >
                  <div className={`flow-icon flow-icon-${step.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="mt-7 font-mono text-xs font-bold tracking-[0.2em] text-muted-foreground">
                    {step.number}
                  </p>
                  <h3 className="mt-3 text-xl font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
                  {index < steps.length - 1 && (
                    <ChevronRight className="flow-arrow hidden lg:block" />
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
          <div className="presentation-reveal-on-scroll">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-gold">
              Feito para acompanhar
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
              Menos promessa. Mais sinal.
            </h2>
            <p className="mt-5 max-w-md leading-7 text-muted-foreground">
              Cada parte da plataforma responde a uma pergunta real: onde está meu saldo, o que está
              acontecendo e qual é o próximo passo?
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {capabilities.map((item, index) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.title}
                  className={`capability-card presentation-reveal-on-scroll capability-delay-${index + 1}`}
                >
                  <div className={`capability-icon capability-icon-${item.accent}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="mt-7 text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
                    {item.eyebrow}
                  </p>
                  <h3 className="mt-3 text-xl font-bold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
                  <div className="mt-8 border-t border-border/70 pt-4">
                    <p className={`font-mono text-2xl font-bold text-${item.accent}`}>
                      {item.stat}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.statLabel}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative mx-5 mb-16 overflow-hidden rounded-2xl border border-primary/30 bg-primary/10 px-6 py-12 sm:mx-8 sm:px-12 lg:mx-auto lg:max-w-7xl">
        <div className="cta-radar" />
        <div className="relative flex flex-col gap-7 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary">
              Pronto para o próximo movimento?
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Abra o terminal e veja por você.
            </h2>
          </div>
          <Link
            to="/trade"
            className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-1"
          >
            Começar agora{" "}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>
    </main>
  );
}
