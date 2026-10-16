import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-4xl items-center justify-center px-4 py-12">
      <section className="w-full rounded-xl border bg-card p-8 text-center sm:p-12">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gold text-2xl font-bold text-gold-foreground glow-gold">
          B$
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Trade real, com dados ao vivo
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Acompanhe BTC, ETH, SOL e outros mercados com candles da Binance, Long/Short e alavancagem
          de até 50x.
        </p>
        <Link
          to="/trade"
          className="mt-7 inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Abrir terminal de trade
        </Link>
      </section>
    </main>
  );
}
