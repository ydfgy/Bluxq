import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Protected } from "@/components/AppShell";
import { useProfile } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const USD_PER_BLUX = 0.0125;

type Target = "usd" | "robux";

export const Route = createFileRoute("/convert")({
  head: () => ({
    meta: [
      { title: "Conversor $BX — Bluxq" },
      { name: "description", content: "Converta o saldo $BX para dólares ou Robux." },
    ],
  }),
  component: () => (
    <Protected>
      <Converter />
    </Protected>
  ),
});

function Converter() {
  const { data: profile } = useProfile();
  const [amount, setAmount] = useState(String(profile?.balance ?? 0));
  const [target, setTarget] = useState<Target>("usd");
  const blux = Math.max(0, Number(amount) || 0);
  const converted = target === "usd" ? blux * USD_PER_BLUX : blux;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Carteira</p>
        <h1 className="text-3xl font-bold">Conversor $BX</h1>
        <p className="text-muted-foreground">
          Veja quanto o seu saldo em $BX representa na moeda escolhida. Esta é uma referência de
          conversão, não uma ordem automática de saque.
        </p>
      </section>

      <section className="space-y-5 rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="blux-amount">Valor em $BX</Label>
            <Input
              id="blux-amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="font-mono text-lg"
            />
            <p className="text-xs text-muted-foreground">
              Saldo disponível: $BX {Number(profile?.balance ?? 0).toFixed(2)}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Converter para</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTarget("usd")}
                className={`rounded-md border px-3 py-3 text-left text-sm ${target === "usd" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
              >
                US$
                <span className="mt-1 block text-xs text-muted-foreground">Dólar americano</span>
              </button>
              <button
                type="button"
                onClick={() => setTarget("robux")}
                className={`rounded-md border px-3 py-3 text-left text-sm ${target === "robux" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
              >
                <span className="flex items-center gap-2">
                  <img src="/robux-icon.png" alt="" className="h-6 w-6 object-contain" />
                  Robux
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">1 $BX = 1 Robux</span>
              </button>
            </div>
          </div>
        </div>

        <div className="border-t pt-5">
          <p className="text-sm text-muted-foreground">Valor convertido</p>
          <p className="mt-1 font-mono text-4xl text-gold">
            {target === "usd" ? `US$ ${converted.toFixed(4)}` : `${converted.toFixed(2)} Robux`}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Cotação de referência: 1 $BX = 1 Robux = US$ {USD_PER_BLUX.toFixed(4)}.
          </p>
        </div>
      </section>

      <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm text-muted-foreground">
        Bluxq é independente e não é afiliada, patrocinada ou associada à Roblox Corporation, Roblox
        ou qualquer outra empresa citada no site. Roblox e Robux são marcas de seus respectivos
        proprietários.
      </div>
    </main>
  );
}
