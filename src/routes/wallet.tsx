import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Protected } from "@/components/AppShell";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { listRobloxGamePasses, requestDeposit, requestWithdraw } from "@/lib/blux.functions";
import { fmt, ROBLOX_GROUP_URL } from "@/lib/markets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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

type RobloxGamePass = {
  id: string;
  name: string;
  game_pass_id: number;
  robux_amount: number;
  active: boolean;
};

const ROBLOX_MIN_DEPOSIT = 50;
const CRYPTO_MIN_DEPOSIT = 10;

function Wallet() {
  const { session } = useAuth();
  const { data: p } = useProfile();
  const qc = useQueryClient();
  const dep = useServerFn(requestDeposit);
  const wd = useServerFn(requestWithdraw);
  const gamePassesQuery = useQuery<RobloxGamePass[]>({
    queryKey: ["roblox-game-passes"],
    queryFn: () => listRobloxGamePasses(),
    staleTime: 30_000,
  });
  const [depositAmount, setDepositAmount] = useState("50");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState<"roblox" | "crypto">("roblox");
  const [withdrawMethod, setWithdrawMethod] = useState<"roblox" | "crypto">("roblox");
  const [asset, setAsset] = useState("BTC");
  const [network, setNetwork] = useState("TRC20");
  const [transactionHash, setTransactionHash] = useState("");
  const [destination, setDestination] = useState("");
  const [selectedGamePassId, setSelectedGamePassId] = useState("");
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletSection, setWalletSection] = useState<"deposit" | "withdraw" | null>(null);
  const uid = session?.user.id;
  const depositValue = Number(depositAmount);
  const withdrawValue = Number(withdrawAmount);
  const gamePasses = gamePassesQuery.data ?? [];
  const matchingGamePass =
    depositMethod === "roblox"
      ? gamePasses.find((pass) => pass.robux_amount === depositValue)
      : undefined;
  const recommendedGamePass =
    depositMethod === "roblox" && gamePasses.length
      ? [...gamePasses].sort(
          (a, b) =>
            Math.abs(a.robux_amount - depositValue) - Math.abs(b.robux_amount - depositValue),
        )[0]
      : undefined;
  const depositMinimum = depositMethod === "roblox" ? ROBLOX_MIN_DEPOSIT : CRYPTO_MIN_DEPOSIT;
  const depositError =
    !Number.isFinite(depositValue) || depositValue < depositMinimum
      ? `Informe um depósito de pelo menos ${depositMinimum}${depositMethod === "roblox" ? " Robux" : ""}.`
      : depositMethod === "roblox" && !matchingGamePass
        ? "Não existe Game Pass para esse valor. Selecione uma recomendação abaixo."
        : depositMethod === "crypto" && !transactionHash.trim()
          ? "Informe o hash da transação."
          : "";
  const withdrawError =
    !Number.isFinite(withdrawValue) || withdrawValue < 100
      ? "Informe um saque de pelo menos 100."
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
      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setWalletSection("deposit");
            setWalletOpen(true);
          }}
          className="group rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-xl text-primary">
              ＋
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Adicionar saldo
            </span>
          </div>
          <h2 className="text-lg font-bold group-hover:text-primary">Depositar</h2>
          <p className="mt-1 text-sm text-muted-foreground">Robux ou Crypto · mínimo de 50 Robux</p>
        </button>
        <button
          type="button"
          onClick={() => {
            setWalletSection("withdraw");
            setWalletOpen(true);
          }}
          className="group rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-xl text-primary">
              ↗
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Retirar saldo
            </span>
          </div>
          <h2 className="text-lg font-bold group-hover:text-primary">Sacar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Solicite o pagamento do seu saldo disponível
          </p>
        </button>
      </div>

      <Dialog open={walletOpen} onOpenChange={setWalletOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto border-zinc-700 bg-[#20272d] p-0 text-foreground">
          <div className="border-b border-border px-5 py-4 pr-12">
            {walletSection ? (
              <button
                type="button"
                onClick={() => setWalletSection(null)}
                className="mb-3 text-sm font-semibold text-foreground transition-colors hover:text-primary"
              >
                ← Voltar para métodos
              </button>
            ) : null}
            <DialogTitle className="text-left text-lg">
              {walletSection === "deposit"
                ? "Depositar"
                : walletSection === "withdraw"
                  ? "Sacar"
                  : "Escolha uma operação"}
            </DialogTitle>
          </div>

          {!walletSection ? (
            <div className="grid gap-3 p-5">
              <button
                type="button"
                onClick={() => setWalletSection("deposit")}
                className="rounded-lg border border-border bg-background/40 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <div className="font-semibold">Depositar</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Adicionar Robux ou Crypto à carteira
                </div>
              </button>
              <button
                type="button"
                onClick={() => setWalletSection("withdraw")}
                className="rounded-lg border border-border bg-background/40 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <div className="font-semibold">Sacar</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Enviar uma solicitação de pagamento
                </div>
              </button>
            </div>
          ) : (
            <div className="space-y-6 p-5">
              <div className="space-y-3">
                {walletSection === "deposit" && (
                  <section className="space-y-3 rounded-xl border bg-transparent p-5">
                    <div>
                      <h2 className="text-lg font-bold">Depositar</h2>
                      <p className="text-sm text-muted-foreground">
                        Adicione saldo por Roblox ou Crypto.
                      </p>
                    </div>
                    {depositMethod === "roblox" ? (
                      <RobloxDepositFlow
                        username={p?.roblox_username}
                        verified={Boolean(p?.verified)}
                        gamePasses={gamePasses}
                        amount={depositAmount}
                        selectedGamePassId={selectedGamePassId}
                        matchingGamePass={matchingGamePass}
                        recommendedGamePass={recommendedGamePass}
                        depositError={depositError}
                        onSelectPass={(pass) => {
                          setSelectedGamePassId(pass.id);
                          setDepositAmount(String(pass.robux_amount));
                        }}
                        onSubmit={() =>
                          run(
                            () =>
                              dep({
                                data: {
                                  amount: Math.floor(Number(depositAmount)),
                                  paymentMethod: "roblox",
                                  gamePassId: matchingGamePass?.game_pass_id,
                                },
                              }),
                            "Depósito enviado para confirmação",
                          )
                        }
                      />
                    ) : (
                      <>
                        <PaymentChoice selected={depositMethod} onSelect={setDepositMethod} />
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
                    {depositMethod === "crypto" && (
                      <>
                        <Field label="Valor em B$">
                          <Input
                            type="number"
                            min={CRYPTO_MIN_DEPOSIT}
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
                                    paymentMethod: "crypto",
                                    asset,
                                    network,
                                    transactionHash,
                                  },
                                }),
                              "Depósito cripto enviado para confirmação",
                            )
                          }
                        >
                          Enviar depósito
                        </Button>
                      </>
                    )}
                  </section>
                )}

                {walletSection === "withdraw" && (
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
                    <Field label="Valor bruto do saque em B$">
                      <Input
                        type="number"
                        min={100}
                        placeholder="Quantidade de $BX"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="font-mono"
                      />
                    </Field>
                    {withdrawMethod === "roblox" &&
                      Number.isFinite(withdrawValue) &&
                      withdrawValue >= 100 && (
                        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
                          <div className="flex justify-between">
                            <span>Valor bruto</span>
                            <b>{fmt(withdrawValue, 0)} R$</b>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>Taxa Roblox (30%)</span>
                            <span>-{fmt(withdrawValue * 0.3, 0)} R$</span>
                          </div>
                          <div className="mt-1 flex justify-between border-t border-primary/20 pt-1 font-semibold">
                            <span>Você recebe</span>
                            <span className="text-primary">{fmt(withdrawValue * 0.7, 0)} R$</span>
                          </div>
                        </div>
                      )}
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
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

function RobloxDepositFlow({
  username,
  verified,
  gamePasses,
  amount,
  selectedGamePassId,
  matchingGamePass,
  recommendedGamePass,
  depositError,
  onSelectPass,
  onSubmit,
}: {
  username?: string | null;
  verified: boolean;
  gamePasses: RobloxGamePass[];
  amount: string;
  selectedGamePassId: string;
  matchingGamePass?: RobloxGamePass;
  recommendedGamePass?: RobloxGamePass;
  depositError: string;
  onSelectPass: (pass: RobloxGamePass) => void;
  onSubmit: () => void;
}) {
  const [step, setStep] = useState<"methods" | "api-key" | "gamepass">("methods");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const connected = verified && Boolean(username);

  const backLabel = step === "api-key" ? "← Voltar para depósito Roblox" : "← Voltar para métodos";

  return (
    <div className="space-y-4">
      {step !== "methods" && (
        <button
          type="button"
          onClick={() => setStep(step === "api-key" ? "methods" : "methods")}
          className="text-sm font-semibold text-foreground transition-colors hover:text-primary"
        >
          {backLabel}
        </button>
      )}

      {step === "methods" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-md border border-bull/60 bg-bull/15 text-bull">
              ◉
            </span>
            <div>
              <h3 className="font-bold">Robux</h3>
              <p className="text-sm leading-tight text-muted-foreground">
                Conecte sua conta Roblox com uma Creator API key para depositar ou sacar Robux.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/30 p-3">
            <div className="flex items-center gap-3 text-sm font-semibold">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-foreground">
                ●
              </span>
              {connected ? username : "Nenhuma conta conectada"}
            </div>
            <button
              type="button"
              onClick={() => setStep(connected ? "gamepass" : "api-key")}
              className="rounded-md bg-lime-400 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-lime-300"
            >
              {connected ? "Depositar Robux" : "Vincular sua conta Roblox"}
            </button>
          </div>
        </div>
      )}

      {step === "api-key" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold">Conecte com uma Creator API key</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie uma Creator API key com as permissões abaixo e cole-a aqui.
            </p>
          </div>
          <button
            type="button"
            className="w-full rounded-md bg-muted px-4 py-3 text-sm font-bold hover:bg-accent"
          >
            Como obter sua Creator API key
          </button>
          <div className="space-y-2 rounded-md bg-background/45 p-3 text-sm">
            <div className="flex items-center justify-between">
              <code className="rounded bg-muted px-2 py-1">inventory</code>
              <span className="text-bull">✓ read</span>
            </div>
            <div className="flex items-center justify-between">
              <code className="rounded bg-muted px-2 py-1">game-passes</code>
              <span className="text-bull">✓ read and write on your place</span>
            </div>
            <div className="flex items-center justify-between">
              <code className="rounded bg-muted px-2 py-1">Restrict IP</code>
              <span className="text-bull">✓ off</span>
            </div>
          </div>
          <Field label="Creator API key">
            <div className="flex gap-2">
              <Input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Cole sua API key"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowApiKey((value) => !value)}
              >
                {showApiKey ? "Ocultar" : "Mostrar"}
              </Button>
            </div>
          </Field>
          <Button
            className="w-full bg-lime-500 text-black hover:bg-lime-400"
            disabled={!apiKey.trim()}
            onClick={() => setStep("gamepass")}
          >
            Conectar API key
          </Button>
        </div>
      )}

      {step === "gamepass" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-md border border-bull/60 bg-bull/15 text-bull">
              ◉
            </span>
            <div>
              <h3 className="font-bold">Robux</h3>
              <p className="text-sm leading-tight text-muted-foreground">
                Compre o Game Pass abaixo com{" "}
                <b className="text-foreground">{username ?? "sua conta Roblox"}</b>. Seu saldo será
                creditado automaticamente.
              </p>
            </div>
          </div>
          <div className="rounded-md border border-gold/20 bg-gold/10 p-3 text-xs text-gold">
            ⚠ Compre somente com {username ?? "a conta Roblox conectada"}; compras de outras contas
            não serão creditadas.
          </div>
          <div className="rounded-lg border border-border bg-background/35 p-3">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold">
              <span>{fmt(Number(amount) || 0, 0)} / 0</span>
              <span className="rounded bg-bull/15 px-2 py-1 text-xs text-bull">0%</span>
            </div>
            <div className="mb-3 h-1 rounded-full bg-muted">
              <div className="h-full w-0 rounded-full bg-bull" />
            </div>
            {gamePasses.length ? (
              gamePasses.map((pass) => (
                <button
                  key={pass.id}
                  type="button"
                  onClick={() => onSelectPass(pass)}
                  className={`mb-2 w-full rounded-md border p-3 text-left ${selectedGamePassId === pass.id ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                >
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span>Game Pass {pass.name}</span>
                    <span className="text-gold">Aguardando compra</span>
                  </div>
                  <div className="rounded bg-lime-400 px-3 py-2 text-center text-sm font-bold text-black">
                    Comprar por ◉ {fmt(pass.robux_amount, 0)}
                  </div>
                </button>
              ))
            ) : (
              <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                Nenhum Game Pass ativo está disponível no momento.
              </p>
            )}
            <div className="mt-2 text-xs text-gold">◷ Expira em 29:31</div>
          </div>
          {depositError && <p className="text-xs text-bear">{depositError}</p>}
          <Button
            className="w-full"
            disabled={Boolean(depositError) || !matchingGamePass}
            onClick={onSubmit}
          >
            Confirmar depósito de {fmt(Number(amount) || 0, 0)} Robux
          </Button>
          <button
            type="button"
            onClick={() => setStep("methods")}
            className="w-full rounded-md bg-muted px-4 py-3 text-sm font-semibold hover:bg-accent"
          >
            Cancelar depósito
          </button>
        </div>
      )}
    </div>
  );
}
