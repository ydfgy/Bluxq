import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, MoveUpRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <main className="bluxq-showcase">
      <section className="showcase-hero">
        <div className="showcase-hero-copy">
          <p className="showcase-kicker">BLUXQ / digital movement</p>
          <h1>
            Mova o saldo.
            <em>Mude o ritmo.</em>
          </h1>
          <p className="showcase-lead">
            Trade, Robux, copy e controle em uma experiência feita para acompanhar o seu próximo
            movimento.
          </p>
          <Link className="showcase-action" to="/trade">
            Entrar no movimento <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <div className="showcase-hero-art" aria-label="Arte animada da Bluxq">
          <div className="portal portal-main" />
          <div className="portal portal-small" />
          <div className="orbit orbit-a" />
          <div className="orbit orbit-b" />
          <div className="orbit orbit-c" />
          <span className="particle particle-a" />
          <span className="particle particle-b" />
          <span className="particle particle-c" />
          <span className="particle particle-d" />
          <div className="hero-glyph">B</div>
          <span className="hero-caption">ROBux / CRYPTO / MARKETS</span>
        </div>
        <div className="showcase-scroll">
          <ArrowDown aria-hidden="true" /> role para ver
        </div>
      </section>

      <section className="showcase-statement showcase-statement-one">
        <div className="statement-number">01</div>
        <div className="statement-copy">
          <p className="showcase-kicker">começa no saldo</p>
          <h2>Seu dinheiro não fica parado.</h2>
          <p>
            Deposite por Robux ou crypto, acompanhe o status e escolha o destino sem atravessar
            telas confusas.
          </p>
        </div>
        <div className="statement-art deposit-art" aria-hidden="true">
          <span className="coin coin-one">◉</span>
          <span className="coin coin-two">◉</span>
          <span className="coin coin-three">◉</span>
          <div className="deposit-well">
            <span>saldo</span>
            <b>+</b>
          </div>
        </div>
      </section>

      <section className="showcase-statement showcase-statement-two">
        <div className="statement-art market-art" aria-hidden="true">
          <div className="market-wave market-wave-one" />
          <div className="market-wave market-wave-two" />
          <span className="market-dot market-dot-one" />
          <span className="market-dot market-dot-two" />
          <span className="market-dot market-dot-three" />
          <div className="market-word">MOVE</div>
        </div>
        <div className="statement-number">02</div>
        <div className="statement-copy">
          <p className="showcase-kicker">continua no mercado</p>
          <h2>Veja o que está mudando.</h2>
          <p>
            Dados ao vivo, risco visível e uma leitura limpa para decidir com intenção, não no
            escuro.
          </p>
          <Link className="showcase-text-link" to="/trade">
            Explorar o terminal <MoveUpRight aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="showcase-statement showcase-statement-three">
        <div className="statement-number">03</div>
        <div className="statement-copy">
          <p className="showcase-kicker">ganha outra escala</p>
          <h2>Uma estratégia pode se mover com você.</h2>
          <p>
            Encontre traders no ranking semanal, acompanhe performance e copie apenas o que faz
            sentido para o seu perfil.
          </p>
        </div>
        <div className="statement-art copy-art" aria-hidden="true">
          <div className="copy-core">◎</div>
          <div className="copy-branch branch-one" />
          <div className="copy-branch branch-two" />
          <div className="copy-branch branch-three" />
          <span className="copy-node node-one" />
          <span className="copy-node node-two" />
          <span className="copy-node node-three" />
        </div>
      </section>

      <section className="showcase-finale">
        <div className="finale-mark">
          B<span>×</span>Q
        </div>
        <p className="showcase-kicker">o próximo movimento é seu</p>
        <h2>Entra. Vê. Decide.</h2>
        <Link className="showcase-action showcase-action-light" to="/wallet">
          Abrir minha wallet <ArrowRight aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
