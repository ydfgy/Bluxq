import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Protected } from "@/components/AppShell";
import { useProfile } from "@/hooks/use-auth";
import {
  cancelDeposit,
  checkRobloxDeposit,
  hasRobloxCreatorApiKey,
  listMyDeposits,
  listRobloxGamePasses,
  requestDeposit,
  requestWithdraw,
  saveRobloxCreatorApiKey,
} from "@/lib/blux.functions";
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

type RobloxGamePass = {
  id: string;
  name: string;
  game_pass_id: number;
  robux_amount: number;
  active: boolean;
};
type Deposit = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  expires_at: string;
};

const ROBLOX_MIN_DEPOSIT = 50;
const CRYPTO_MIN_DEPOSIT = 10;

function Wallet() {
  const { data: p } = useProfile();
  const nav = useNavigate();
  const qc = useQueryClient();
  const dep = useServerFn(requestDeposit);
  const wd = useServerFn(requestWithdraw);
  const cancel = useServerFn(cancelDeposit);
  const checkDeposit = useServerFn(checkRobloxDeposit);
  const saveApiKey = useServerFn(saveRobloxCreatorApiKey);
  const checkApiKey = useServerFn(hasRobloxCreatorApiKey);
  const depositsQuery = useQuery<Deposit[]>({
    queryKey: ["my-deposits"],
    queryFn: () => listMyDeposits() as Promise<Deposit[]>,
    refetchInterval: 10_000,
  });
  const apiKeyQuery = useQuery({
    queryKey: ["roblox-api-key-saved"],
    queryFn: () => checkApiKey(),
    staleTime: 30_000,
  });
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
  const [walletSection, setWalletSection] = useState<"deposit" | "withdraw">("deposit");
  const depositValue = Number(depositAmount);
  const withdrawValue = Number(withdrawAmount);
  const gamePasses = gamePassesQuery.data ?? [];
  const pendingDeposit = depositsQuery.data?.find((item) => item.status === "pending");
  const robloxDepositQuery = useQuery({
    queryKey: ["roblox-deposit-check", pendingDeposit?.id],
    enabled: Boolean(pendingDeposit),
    queryFn: () => checkDeposit(),
    refetchInterval: pendingDeposit ? 5_000 : false,
    retry: false,
  });
  useEffect(() => {
    if (robloxDepositQuery.data?.status === "approved") {
      void Promise.all([depositsQuery.refetch(), qc.invalidateQueries({ queryKey: ["profile"] })]);
      toast.success("Compra confirmada. Seu saldo foi creditado.");
    }
  }, [depositsQuery, qc, robloxDepositQuery.data?.status]);
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

  async function run(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      toast.success(msg);
      qc.invalidateQueries();
      return true;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Unable to complete the operation.");
      return false;
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-8">
      <div className="border-b border-border pb-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setWalletSection("deposit")}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${walletSection === "deposit" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Depositar
          </button>
          <button
            type="button"
            onClick={() => setWalletSection("withdraw")}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${walletSection === "withdraw" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Sacar
          </button>
        </div>
      </div>
      <div className="space-y-6">
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
                  apiKeySaved={Boolean(apiKeyQuery.data?.saved)}
                  apiKeyLoading={
                    apiKeyQuery.isLoading || (apiKeyQuery.isFetching && !apiKeyQuery.data)
                  }
                  pendingDeposit={pendingDeposit}
                  onAmountChange={setDepositAmount}
                  onConnectAccount={() => nav({ to: "/verify" })}
                  onSaveApiKey={async (apiKey) => {
                    await saveApiKey({ data: { apiKey } });
                    await apiKeyQuery.refetch();
                  }}
                  onCancelDeposit={async () => {
                    if (!pendingDeposit) return;
                    await cancel({ data: { id: pendingDeposit.id } });
                    await depositsQuery.refetch();
                    toast.success("Depósito cancelado");
                  }}
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
  apiKeySaved,
  apiKeyLoading,
  pendingDeposit,
  onAmountChange,
  onConnectAccount,
  onSaveApiKey,
  onCancelDeposit,
  onSelectPass,
  onSubmit,
}: {
  username?: string | null | undefined;
  verified: boolean;
  gamePasses: RobloxGamePass[];
  amount: string;
  selectedGamePassId: string;
  matchingGamePass?: RobloxGamePass | undefined;
  recommendedGamePass?: RobloxGamePass | undefined;
  depositError: string;
  apiKeySaved: boolean;
  apiKeyLoading: boolean;
  pendingDeposit?: Deposit | undefined;
  onAmountChange: (value: string) => void;
  onConnectAccount: () => void;
  onSaveApiKey: (apiKey: string) => Promise<void>;
  onCancelDeposit: () => Promise<void>;
  onSelectPass: (pass: RobloxGamePass) => void;
  onSubmit: () => Promise<boolean>;
}) {
  const connected = verified && Boolean(username);
  const [step, setStep] = useState<"checking" | "link" | "api-key" | "gamepass" | "waiting">(
    apiKeyLoading ? "checking" : apiKeySaved ? "gamepass" : connected ? "api-key" : "link",
  );
  const [secondsLeft, setSecondsLeft] = useState(1800);
  const [cancelAvailable, setCancelAvailable] = useState(false);
  const nav = useNavigate();
  useEffect(() => {
    if (apiKeyLoading) {
      setStep("checking");
    } else if (apiKeySaved) {
      setStep((current) => (current === "waiting" ? current : "gamepass"));
    } else if (step === "checking" || step === "gamepass") {
      setStep(connected ? "api-key" : "link");
    }
  }, [apiKeyLoading, apiKeySaved, connected, step]);
  useEffect(() => {
    if (pendingDeposit) {
      const left = Math.max(
        0,
        Math.floor((new Date(pendingDeposit.expires_at).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(left);
      setCancelAvailable(Date.now() - new Date(pendingDeposit.created_at).getTime() >= 60_000);
    }
  }, [pendingDeposit]);
  useEffect(() => {
    if (!pendingDeposit) return;
    const timer = window.setInterval(() => {
      const created = new Date(pendingDeposit.created_at).getTime();
      const expires = new Date(pendingDeposit.expires_at).getTime();
      setSecondsLeft(Math.max(0, Math.floor((expires - Date.now()) / 1000)));
      setCancelAvailable(Date.now() - created >= 60_000);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pendingDeposit]);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  return (
    <div className="space-y-4">
      {step === "checking" && (
        <div className="space-y-2 rounded-lg border border-border bg-background/30 p-4">
          <h3 className="font-bold">Verificando sua configuração</h3>
          <p className="text-sm text-muted-foreground">
            Consultando a Creator API Key salva na sua conta.
          </p>
        </div>
      )}
      {step === "link" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-md border border-bull/60 bg-bull/15 text-bull">
              ◉
            </span>
            <div>
              <h3 className="font-bold">Robux</h3>
              <p className="text-sm leading-tight text-muted-foreground">
                Verifique sua conta Roblox e configure a Creator API Key para liberar depósitos em
                Robux.
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
              onClick={onConnectAccount}
              className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Vincular sua conta Roblox
            </button>
          </div>
        </div>
      )}

      {step === "api-key" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold">Configure sua Creator API Key</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie uma Creator API key com as permissões abaixo e cole-a aqui.
            </p>
          </div>
          <button
            type="button"
            onClick={() => nav({ to: "/roblox-api-tutorial" })}
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
            className="w-full"
            disabled={!apiKey.trim()}
            onClick={async () => {
              try {
                await onSaveApiKey(apiKey);
                toast.success("Creator API key validada e salva.");
                setStep("gamepass");
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Não foi possível validar a API key.",
                );
              }
            }}
          >
            Salvar e continuar
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
          <div className="flex items-center gap-2 rounded-md border border-bull/30 bg-bull/10 p-3 text-sm text-bull">
            <span aria-hidden="true">✓</span>
            Creator API Key configurada e pronta para confirmar sua compra.
          </div>
          <div className="rounded-md border border-gold/20 bg-gold/10 p-3 text-xs text-gold">
            ⚠ Compre somente com {username ?? "a conta Roblox conectada"}; compras de outras contas
            não serão creditadas.
          </div>
          <Field label="Quanto deseja depositar em Robux?">
            <Input
              type="number"
              min={ROBLOX_MIN_DEPOSIT}
              step="1"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              className="font-mono text-lg"
              placeholder="Ex.: 500"
            />
          </Field>
          <div className="rounded-lg border border-border bg-background/35 p-3">
            {matchingGamePass ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Game Pass de {fmt(matchingGamePass.robux_amount, 0)} Robux</span>
                  <span className="text-gold">Aguardando compra</span>
                </div>
                <a
                  href={`https://www.roblox.com/game-pass/${matchingGamePass.game_pass_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  Abrir Game Pass no Roblox ↗
                </a>
              </div>
            ) : recommendedGamePass ? (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  Não existe um Game Pass exato para esse valor.
                </p>
                <button
                  type="button"
                  onClick={() => onSelectPass(recommendedGamePass)}
                  className="font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  Usar o Game Pass de {fmt(recommendedGamePass.robux_amount, 0)} Robux
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum Game Pass ativo está disponível no momento.
              </p>
            )}
            <div className="mt-2 text-xs text-gold">
              ◷ Expira em{" "}
              {Math.floor(secondsLeft / 60)
                .toString()
                .padStart(2, "0")}
              :{(secondsLeft % 60).toString().padStart(2, "0")}
            </div>
          </div>
          {depositError && <p className="text-xs text-bear">{depositError}</p>}
          <Button
            className="w-full"
            disabled={Boolean(depositError) || !matchingGamePass}
            onClick={async () => {
              if (await onSubmit()) setStep("waiting");
            }}
          >
            Confirmar depósito de {fmt(Number(amount) || 0, 0)} Robux
          </Button>
          <button
            type="button"
            disabled={!cancelAvailable || !pendingDeposit}
            onClick={() => void onCancelDeposit()}
            className="w-full rounded-md bg-muted px-4 py-3 text-sm font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelAvailable ? "Cancelar depósito" : "Cancelar disponível após 60 segundos"}
          </button>
        </div>
      )}

      {step === "waiting" && (
        <div className="space-y-4 py-4 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border-4 border-primary/30 border-t-primary text-primary">
            ↻
          </div>
          <div>
            <h3 className="text-lg font-bold">Aguardando confirmação</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Sua solicitação foi enviada. O saldo será creditado quando a compra for identificada.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 text-left text-sm">
            <div className="flex justify-between">
              <span>Status</span>
              <span className="text-gold">Aguardando compra</span>
            </div>
            <div className="mt-2 h-1 rounded-full bg-muted">
              <div className="h-full w-1/3 rounded-full bg-primary" />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Expira em{" "}
              {Math.floor(secondsLeft / 60)
                .toString()
                .padStart(2, "0")}
              :{(secondsLeft % 60).toString().padStart(2, "0")}.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStep("link")}
            className="w-full rounded-md bg-muted px-4 py-3 text-sm font-semibold hover:bg-accent"
          >
            Fechar e acompanhar no histórico
          </button>
        </div>
      )}
    </div>
  );
}
