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
      { title: "Wallet — BluxTrade" },
      { name: "description", content: "Manage Robux and crypto deposits and withdrawals." },
      { property: "og:title", content: "Wallet — BluxTrade" },
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
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Paid",
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
  const [depositMethodSearch, setDepositMethodSearch] = useState("");
  const [withdrawMethodSearch, setWithdrawMethodSearch] = useState("");
  const [asset, setAsset] = useState("USDT");
  const [network, setNetwork] = useState("TRC20");
  const [transactionHash, setTransactionHash] = useState("");
  const [destination, setDestination] = useState("");
  const uid = session?.user.id;

  const { data: hist } = useQuery({
    queryKey: ["wallet-hist", uid],
    refetchInterval: 5000,
    queryFn: async () => {
      const [a, b] = await Promise.all([
        supabase
          .from("deposits")
          .select("*")
          .eq("user_id", uid!)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("withdrawals")
          .select("*")
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
      <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm">
        <b>Importante:</b> BluxTrade é uma plataforma independente e não é afiliada, patrocinada ou
        associada à Roblox Corporation, Roblox ou qualquer outra empresa mencionada no site. Roblox
        e Robux são referências do fluxo de pagamento.
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <div>
            <h2 className="text-lg font-bold">Depositar</h2>
            <p className="text-sm text-muted-foreground">
              Escolha como quer enviar o valor para sua carteira.
            </p>
          </div>
          <MethodSearch
            value={depositMethodSearch}
            selected={depositMethod}
            onSearch={setDepositMethodSearch}
            onSelect={setDepositMethod}
          />
          {depositMethod === "roblox" ? (
            <>
              <ol className="list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
                <li>
                  Entre no{" "}
                  <a
                    href={ROBLOX_GROUP_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    grupo Roblox
                  </a>
                  .
                </li>
                <li>
                  Compre o item/pass do grupo usando a conta <b>{p?.roblox_username}</b>.
                </li>
                <li>Informe o mesmo valor abaixo e envie para confirmação.</li>
              </ol>
              <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                Conta vinculada para este fluxo:{" "}
                <b className="text-foreground">{p?.roblox_username}</b>. Ela já fica salva após a
                verificação.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Envie a cripto e informe os dados da transação. A confirmação é feita manualmente
                pela equipe.
              </p>
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
          <Field label="Valor em B$">
            <Input
              type="number"
              min={10}
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="font-mono"
            />
          </Field>
          <Button
            className="w-full"
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

        <section className="space-y-3 rounded-xl border bg-card p-5">
          <div>
            <h2 className="text-lg font-bold">Sacar</h2>
            <p className="text-sm text-muted-foreground">Escolha onde deseja receber seu saldo.</p>
          </div>
          <MethodSearch
            value={withdrawMethodSearch}
            selected={withdrawMethod}
            onSearch={setWithdrawMethodSearch}
            onSelect={setWithdrawMethod}
          />
          {withdrawMethod === "roblox" ? (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
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
              min={10}
              placeholder="Quantidade de B$"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="font-mono"
            />
          </Field>
          <Button
            variant="outline"
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

      <section className="rounded-xl border bg-card">
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
            <span className="font-mono">{fmt(x.amount, 0)} B$</span>
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

function MethodSearch({
  value,
  selected,
  onSearch,
  onSelect,
}: {
  value: string;
  selected: "roblox" | "crypto";
  onSearch: (value: string) => void;
  onSelect: (value: "roblox" | "crypto") => void;
}) {
  const showCrypto = value.trim().toLowerCase() === "crypto";
  return (
    <Field label="Pesquisar forma de pagamento">
      <Input
        value={value}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Digite o nome exato da forma"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-md border px-3 py-2 text-sm ${selected === "roblox" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
          onClick={() => onSelect("roblox")}
        >
          Roblox / Robux
        </button>
        {showCrypto && (
          <button
            type="button"
            className={`rounded-md border px-3 py-2 text-sm ${selected === "crypto" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            onClick={() => onSelect("crypto")}
          >
            Crypto
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Crypto aparece somente quando você pesquisa exatamente “crypto”.
      </p>
    </Field>
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
    <div className="grid grid-cols-2 gap-2">
      <Field label="Moeda">
        <Input
          value={asset}
          onChange={(e) => onAsset(e.target.value.toUpperCase())}
          placeholder="USDT"
        />
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
