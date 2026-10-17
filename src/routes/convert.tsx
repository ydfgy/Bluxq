import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Protected } from "@/components/AppShell";
import { useProfile } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";

type Currency = "robux" | "blux";

export const Route = createFileRoute("/convert")({
  head: () => ({ meta: [{ title: "Conversor — Bluxq" }] }),
  component: () => (
    <Protected>
      <Converter />
    </Protected>
  ),
});

function CurrencyIcon({ currency }: { currency: Currency }) {
  return (
    <img
      src={currency === "robux" ? "/robux-icon.png" : "/bluxq-icon.png"}
      alt=""
      className="h-12 w-12 object-contain"
    />
  );
}

function currencyLabel(currency: Currency) {
  return currency === "robux" ? "Robux" : "$BX";
}

function Converter() {
  const { data: profile } = useProfile();
  const [from, setFrom] = useState<Currency>("robux");
  const [amount, setAmount] = useState("100");
  const to = from === "robux" ? "blux" : "robux";
  const converted = Math.max(0, Number(amount) || 0);
  const balance = Number(profile?.balance ?? 0);

  function swap() {
    setFrom(to);
    setAmount(to === "blux" ? balance.toFixed(2) : "100");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="grid items-end gap-5 sm:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-2">
            <label htmlFor="convert-amount" className="text-xs text-muted-foreground">
              De
            </label>
            <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
              <CurrencyIcon currency={from} />
              <div className="min-w-0 flex-1">
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
                <span className="text-xs text-muted-foreground">{currencyLabel(from)}</span>
              </div>
            </div>
            {from === "blux" && (
              <p className="text-xs text-muted-foreground">Saldo: $BX {balance.toFixed(2)}</p>
            )}
          </div>

          <button
            type="button"
            onClick={swap}
            className="mx-auto grid h-9 w-9 place-items-center rounded-full border text-muted-foreground transition hover:border-primary hover:text-primary"
            aria-label="Inverter conversão"
            title="Inverter conversão"
          >
            <ArrowRightLeft aria-hidden="true" className="h-4 w-4" />
          </button>

          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">Para</span>
            <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
              <CurrencyIcon currency={to} />
              <div>
                <div className="font-mono text-lg">{converted.toFixed(2)}</div>
                <span className="text-xs text-muted-foreground">{currencyLabel(to)}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
