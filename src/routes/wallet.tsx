import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Protected } from "@/components/AppShell";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { requestDeposit, requestWithdraw } from "@/lib/blux.functions";
import { fmt, ROBLOX_GROUP_URL } from "@/lib/markets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — Bluxq" },
      { name: "description", content: "Manage Robux and crypto deposits and withdrawals." },
      { property: "og:title", content: "Wallet — Bluxq" },
      { property: "og:description", content: "Deposite e saque por Roblox ou Crypto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Protected>
      <Wallet />
    </Protected>
  ),
});

const STATUS: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
  paid: "Pago",
};

function Wallet() {
  const { session } = useAuth();
  const { data: p } = useProfile();
  const qc = useQueryClient();
  const dep = useServerFn(requestDeposit);
  const wd = useServerFn(requestWithdraw);
  const [depositAmount, setDepositAmount] = useState("100");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState<"roblox" | "crypto">("roblox");
  const [withdrawMethod, setWithdrawMethod] = useState<"roblox" | "crypto">("roblox");
  const [asset, setAsset] = useState("BTC");
  const [network, setNetwork] = useState("TRC20");
  const [transactionHash, setTransactionHash] = useState("");
  const [destination, setDestination] = useState("");
  const uid = session?.user.id;
  const depositValue = Number(depositAmount);
  const withdrawValue = Number(withdrawAmount);
  const depositError =
    !Number.isFinite(depositValue) || depositValue < 10
      ? "Informe um depósito de pelo menos 10."
      : depositMethod === "crypto" && !transactionHash.trim()
        ? "Informe o hash da transação."
        : "";
  const withdrawError =
    !Number.isFinite(withdrawValue) || withdrawValue < 60
      ? "Informe um saque de pelo menos 60."
      : withdrawValue > Number(p?.balance ?? 0)
        ? "O valor excede seu saldo disponível."
        : withdrawMethod === "crypto" && !destination.trim()
          ? "Informe o endereço de destino."
          : "";

  const { data: hist } = useQuery({
    queryKey: ["wallet-hist", uid],
    refetchInterval: 5000,
    queryFn: async () => {
      const [a, b] = await Promise.all([
        supabase
          .from("deposits")
          .select(
            "id, amount, payment_method, asset, network, transaction_hash, status, created_at",
          )
          .eq("user_id", uid!)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("withdrawals")
          .select("id, amount, payout_method, asset, network, destination, status, created_at")
          .eq("user_id", uid!)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      return [
        ...(a.data ?? []).map((x) => ({ ...x, kind: "Deposit", method: x.payment_method })),
        ...(b.data ?? []).map((x) => ({ ...x, kind: "Withdrawal", method: x.payout_method })),
      ].sort((x, y) => y.created_at.localeCompare(x.created_at));
    },
  });

  async function run(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      toast.success(msg);
      qc.invalidateQueries();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Unable to complete the operation.");
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-3 rounded-xl border bg-transparent p-5">
          <h2 className="text-lg font-bold">Depositar</h2>
          <PaymentChoice selected={depositMethod} onSelect={setDepositMethod} />
          {depositMethod === "roblox" ? (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
              <div className="text-xs text-muted-foreground">Conta para depósito</div>
              <a
                href={ROBLOX_GROUP_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block font-semibold text-primary underline"
              >
                Grupo Roblox · {p?.roblox_username ?? "conta verificada"}
              </a>
            </div>
          ) : (
            <>
              <CryptoFields
                asset={asset}
                network={network}
                onAsset={setAsset}
                onNetwork={setNetwork}
              />
              <Field label="Hash da transação (TXID)">
                <Input
                  value={transactionHash}
                  onChange={(e) => setTransactionHash(e.target.value)}
                  placeholder="Cole o hash da transação"
                />
              </Field>
            </>
          )}
          <Field label={depositMethod === "roblox" ? "Valor em Robux" : "Valor em B$"}>
            <Input
              type="number"
              min={10}
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="font-mono"
            />
          </Field>
          {depositError && <p className="text-xs text-bear">{depositError}</p>}
          <Button
            className="w-full"
            disabled={Boolean(depositError)}
            onClick={() =>
              run(
                () =>
                  dep({
                    data: {
                      amount: Math.floor(Number(depositAmount)),
                      paymentMethod: depositMethod,
                      asset: depositMethod === "crypto" ? asset : undefined,
                      network: depositMethod === "crypto" ? network : undefined,
                      transactionHash: depositMethod === "crypto" ? transactionHash : undefined,
                    },
                  }),
                "Depósito enviado para confirmação",
              )
            }
          >
            Enviar depósito
          </Button>
        </section>

        <section className="space-y-3 rounded-xl border bg-transparent p-5">
          <h2 className="text-lg font-bold">Sacar</h2>
          <PaymentChoice selected={withdrawMethod} onSelect={setWithdrawMethod} />
          {withdrawMethod === "roblox" ? (
            <p className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              O pagamento será enviado pelo grupo para a conta Roblox verificada:{" "}
              <b className="text-foreground">{p?.roblox_username}</b>.
            </p>
          ) : (
            <>
              <CryptoFields
                asset={asset}
                network={network}
                onAsset={setAsset}
                onNetwork={setNetwork}
              />
              <Field label="Endereço de destino">
                <Input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Endereço da sua carteira"
                />
              </Field>
            </>
          )}
          <Field label="Valor em B$">
            <Input
              type="number"
              min={60}
              placeholder="Quantidade de $BX"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="font-mono"
            />
          </Field>
          {withdrawError && <p className="text-xs text-bear">{withdrawError}</p>}
          <Button
            variant="outline"
            disabled={Boolean(withdrawError)}
            className="w-full"
            onClick={() =>
              run(
                () =>
                  wd({
                    data: {
                      amount: Number(withdrawAmount),
                      payoutMethod: withdrawMethod,
                      asset: withdrawMethod === "crypto" ? asset : undefined,
                      network: withdrawMethod === "crypto" ? network : undefined,
                      destination: withdrawMethod === "crypto" ? destination : undefined,
                    },
                  }),
                "Saque solicitado",
              )
            }
          >
            Solicitar saque
          </Button>
        </section>
      </div>

      <section className="rounded-xl border bg-transparent">
        <h2 className="border-b p-4 font-bold">Histórico</h2>
        {(hist ?? []).map((x) => (
          <div
            key={x.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm last:border-0"
          >
            <span>
              {x.kind} ·{" "}
              {x.method === "crypto" ? `Crypto${x.asset ? ` (${x.asset})` : ""}` : "Roblox"}
            </span>
            <span className="font-mono">{fmt(x.amount, 0)} $BX</span>
            <span className="text-xs text-muted-foreground">
              {new Date(x.created_at).toLocaleString("pt-BR")}
            </span>
            <span
              className={
                x.status === "pending"
                  ? "text-gold"
                  : x.status === "rejected"
                    ? "text-bear"
                    : "text-bull"
              }
            >
              {STATUS[x.status] ?? x.status}
            </span>
          </div>
        ))}
        {!hist?.length && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma atividade ainda.
          </div>
        )}
      </section>
    </main>
  );
}

const CRYPTO_ASSETS = ["BTC", "ETH", "SOL"] as const;

function WalletAssetIcon({ asset, size = "md" }: { asset: string; size?: "sm" | "md" }) {
  const normalized = asset.toLowerCase();
  const isRobux = normalized === "robux";
  const sizeClass = size === "sm" ? "h-5 w-5" : "h-8 w-8";

  return (
    <span
      className={`grid ${sizeClass} shrink-0 place-items-center overflow-hidden rounded-full bg-black/20`}
      aria-hidden="true"
    >
      <img
        src={isRobux ? "/robux-icon.png" : `/crypto-icons/${normalized}.svg`}
        alt=""
        className={isRobux ? "h-[125%] w-[125%] object-contain" : "h-full w-full object-contain"}
      />
    </span>
  );
}

function CryptoPreviewIcons() {
  return (
    <span className="flex items-center -space-x-1" aria-label="BTC, ETH e SOL">
      {CRYPTO_ASSETS.map((crypto) => (
        <WalletAssetIcon key={crypto} asset={crypto} size="sm" />
      ))}
    </span>
  );
}

function PaymentChoice({
  selected,
  onSelect,
}: {
  selected: "roblox" | "crypto";
  onSelect: (value: "roblox" | "crypto") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Forma de pagamento">
      <button
        type="button"
        aria-pressed={selected === "roblox"}
        className={`flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${selected === "roblox" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-primary hover:text-primary"}`}
        onClick={() => onSelect("roblox")}
      >
        <WalletAssetIcon asset="robux" />
        <span>
          <span className="block text-sm font-semibold">Robux</span>
          <span className="block text-xs text-muted-foreground">Via Roblox</span>
        </span>
      </button>
      <button
        type="button"
        aria-pressed={selected === "crypto"}
        className={`flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${selected === "crypto" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-primary hover:text-primary"}`}
        onClick={() => onSelect("crypto")}
      >
        <CryptoPreviewIcons />
        <span>
          <span className="block text-sm font-semibold">Crypto</span>
          <span className="block text-xs text-muted-foreground">BTC · ETH · SOL</span>
        </span>
      </button>
    </div>
  );
}

function CryptoFields({
  asset,
  network,
  onAsset,
  onNetwork,
}: {
  asset: string;
  network: string;
  onAsset: (value: string) => void;
  onNetwork: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Escolha a moeda">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Moeda crypto">
          {CRYPTO_ASSETS.map((crypto) => (
            <button
              key={crypto}
              type="button"
              role="radio"
              aria-checked={asset === crypto}
              className={`flex items-center justify-center gap-2 rounded-md border px-2 py-2 text-sm font-semibold transition-colors ${asset === crypto ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-primary hover:text-primary"}`}
              onClick={() => onAsset(crypto)}
            >
              <WalletAssetIcon asset={crypto} size="sm" />
              {crypto}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Rede">
        <Input
          value={network}
          onChange={(e) => onNetwork(e.target.value.toUpperCase())}
          placeholder="TRC20"
        />
      </Field>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
