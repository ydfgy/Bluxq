import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRightLeft, Coins, Gamepad2 } from "lucide-react";
import { Protected } from "@/components/AppShell";
import { useProfile } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";

type Currency = "robux" | "blux";

export const Route = createFileRoute("/convert")({
  head: () => ({
    meta: [
      { title: "Conversor — Bluxq" },
      { name: "description", content: "Consulte a conversão entre Robux e B$." },
    ],
  }),
  component: () => (
    <Protected>
      <Converter />
    </Protected>
  ),
});

function CurrencyIcon({ currency }: { currency: Currency }) {
  return currency === "robux" ? (
    <Gamepad2 aria-hidden="true" className="h-5 w-5" />
  ) : (
    <Coins aria-hidden="true" className="h-5 w-5" />
  );
}

function currencyLabel(currency: Currency) {
  return currency === "robux" ? "Robux" : "B$";
}

function Converter() {
  const { data: profile } = useProfile();
  const [from, setFrom] = useState<Currency>("robux");
  const [amount, setAmount] = useState("100");
  const to = from === "robux" ? "blux" : "robux";
  const numericAmount = Math.max(0, Number(amount) || 0);
  const converted = numericAmount;
  const balance = Number(profile?.balance ?? 0);

  function swap() {
    setFrom(to);
    setAmount(to === "blux" ? balance.toFixed(2) : "100");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-2">
            <label htmlFor="convert-amount" className="text-xs text-muted-foreground">
              De
            </label>
            <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <CurrencyIcon currency={from} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">Você envia</div>
                <Input
                  id="convert-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="h-8 border-0 bg-transparent p-0 font-mono text-lg shadow-none focus-visible:ring-0"
                  aria-label={`Quantidade de ${currencyLabel(from)}`}
                />
              </div>
              <span className="font-semibold">{currencyLabel(from)}</span>
            </div>
            {from === "blux" && (
              <p className="text-xs text-muted-foreground">
                Saldo disponível: B$ {balance.toFixed(2)}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={swap}
            className="mx-auto grid h-9 w-9 place-items-center rounded-full border bg-card text-muted-foreground transition hover:border-primary hover:text-primary"
            aria-label="Inverter conversão"
            title="Inverter conversão"
          >
            <ArrowRightLeft aria-hidden="true" className="h-4 w-4" />
          </button>

          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">Para</span>
            <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-gold/15 text-gold">
                <CurrencyIcon currency={to} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">Você recebe</div>
                <div className="font-mono text-lg">{converted.toFixed(2)}</div>
              </div>
              <span className="font-semibold">{currencyLabel(to)}</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
