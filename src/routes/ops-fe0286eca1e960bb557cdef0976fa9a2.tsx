import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  adminOverview,
  authenticateAdminPanel,
  reviewDeposit,
  reviewWithdraw,
} from "@/lib/blux.functions";
import { fmt } from "@/lib/markets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AdminRequest = {
  profile: { roblox_username: string; roblox_user_id: number | null } | undefined;
  user_id: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

const ADMIN_PATH_SECRET = "ops-fe0286eca1e960bb557cdef0976fa9a2";

export const Route = createFileRoute("/ops-fe0286eca1e960bb557cdef0976fa9a2")({
  head: () => ({
    meta: [
      { title: "Administração segura — Bluxq" },
      { name: "description", content: "Área administrativa isolada da plataforma Bluxq." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const qc = useQueryClient();
  const authenticate = useServerFn(authenticateAdminPanel);
  const overview = useServerFn(adminOverview);
  const rd = useServerFn(reviewDeposit);
  const rw = useServerFn(reviewWithdraw);
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [authStage, setAuthStage] = useState<"password" | "pin">("password");
  const [section, setSection] = useState<"overview" | "deposits" | "withdrawals">("overview");
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : sessionStorage.getItem("bluxq-admin-access"),
  );
  const [authenticating, setAuthenticating] = useState(false);

  async function unlock() {
    setAuthenticating(true);
    try {
      const result = await authenticate({
        data: { adminPath: ADMIN_PATH_SECRET, password, pin },
      });
      sessionStorage.setItem("bluxq-admin-access", result.token);
      setAccessToken(result.token);
      toast.success("Painel desbloqueado");
    } catch (error: unknown) {
      toast.error(errorMessage(error));
      setPassword("");
      setPin("");
      setAuthStage("password");
    } finally {
      setAuthenticating(false);
    }
  }

  const { data, error: adminError } = useQuery({
    queryKey: ["admin", accessToken],
    enabled: !!accessToken,
    refetchInterval: 5000,
    queryFn: () => overview({ data: { adminAccessToken: accessToken! } }),
  });

  useEffect(() => {
    if (!(adminError instanceof Error)) return;
    if (!adminError.message.includes("expirado ou inválido")) return;
    sessionStorage.removeItem("bluxq-admin-access");
    setAccessToken(null);
    toast.error("A sessão administrativa expirou. Informe o PIN novamente.");
  }, [adminError]);

  async function run(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      toast.success(msg);
      qc.invalidateQueries();
    } catch (error: unknown) {
      toast.error(errorMessage(error));
    }
  }

  if (!accessToken) {
    return (
      <main className="mx-auto max-w-md space-y-4 px-4 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">
          Bluxq / Secure Admin
        </p>
        <h1 className="text-xl font-bold">Acesso administrativo</h1>
        <p className="text-sm text-muted-foreground">
          Esta área é separada da plataforma e exige senha administrativa e PIN.
        </p>
        {authStage === "password" ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (password.length >= 12) setAuthStage("pin");
            }}
          >
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="Senha administrativa"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button className="w-full" disabled={password.length < 12}>
              Continuar
            </Button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (pin.length === 6) void unlock();
            }}
          >
            <div className="flex justify-between text-sm">
              <span>PIN de segurança</span>
              <button
                type="button"
                className="text-cyan-400"
                onClick={() => setAuthStage("password")}
              >
                Alterar senha
              </button>
            </div>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="PIN de 6 dígitos"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <Button className="w-full" disabled={pin.length !== 6 || authenticating}>
              {authenticating ? "Verificando…" : "Entrar"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Máximo de 3 tentativas. Depois disso, este acesso fica bloqueado por 7 dias.
            </p>
          </form>
        )}
      </main>
    );
  }
  const user = (x: AdminRequest) =>
    x.profile
      ? `${x.profile.roblox_username} (#${x.profile.roblox_user_id ?? "?"})`
      : x.user_id.slice(0, 8);
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="hidden w-64 shrink-0 border-r border-slate-800 bg-slate-900/80 p-5 md:block">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">Bluxq</p>
        <h1 className="mt-2 text-lg font-bold">Admin Console</h1>
        <nav className="mt-10 space-y-2" aria-label="Menu administrativo">
          <button
            onClick={() => setSection("overview")}
            className="block w-full rounded-lg bg-cyan-400/10 px-3 py-2 text-left text-sm text-cyan-300"
          >
            Visão geral
          </button>
          <button
            onClick={() => setSection("deposits")}
            className="flex w-full justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            Depósitos <span>{data?.deposits.length ?? 0}</span>
          </button>
          <button
            onClick={() => setSection("withdrawals")}
            className="flex w-full justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            Saques <span>{data?.withdrawals.length ?? 0}</span>
          </button>
        </nav>
        <Button
          variant="outline"
          className="mt-12 w-full border-slate-700"
          onClick={() => {
            sessionStorage.removeItem("bluxq-admin-access");
            setAccessToken(null);
          }}
        >
          Bloquear painel
        </Button>
      </aside>
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">
              Área restrita / {section}
            </p>
            <h1 className="text-2xl font-bold">
              {section === "overview"
                ? "Visão geral"
                : section === "deposits"
                  ? "Depósitos pendentes"
                  : "Saques pendentes"}
            </h1>
          </div>
          <Button
            variant="outline"
            className="border-slate-700"
            onClick={() => {
              sessionStorage.removeItem("bluxq-admin-access");
              setAccessToken(null);
            }}
          >
            Sair
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Box k="Pool" v={fmt(data?.pool?.total_assets)} />
          <Box k="Reservado" v={fmt(data?.pool?.total_reserved)} />
          <Box k="Receita da plataforma" v={fmt(data?.pool?.platform_revenue)} />
        </div>
        <section
          className={`${section === "withdrawals" ? "hidden " : ""}rounded-xl border bg-card`}
        >
          <h2 className="border-b p-4 font-bold">
            Depósitos aguardando ({data?.deposits.length ?? 0})
          </h2>
          <p className="px-4 pt-2 text-xs text-muted-foreground">
            Confira no Roblox se esse usuário comprou o item do grupo nesse valor antes de aprovar.
          </p>
          {data?.deposits.map((x) => (
            <div
              key={x.id}
              className="flex flex-wrap items-center gap-3 border-b px-4 py-3 text-sm last:border-0"
            >
              <span className="flex-1">{user(x)}</span>
              <span className="font-mono text-gold">{fmt(x.amount, 0)} $BX</span>
              <span className="text-xs text-muted-foreground">
                {x.payment_method === "crypto"
                  ? `Crypto: ${x.asset ?? "?"} / ${x.network ?? "?"} · TX: ${x.transaction_hash ?? "?"}`
                  : "Roblox / Robux"}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(x.created_at).toLocaleString("pt-BR")}
              </span>
              <Button
                size="sm"
                onClick={() =>
                  run(
                    () => rd({ data: { id: x.id, approve: true, adminAccessToken: accessToken } }),
                    "Aprovado",
                  )
                }
              >
                Aprovar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  run(
                    () => rd({ data: { id: x.id, approve: false, adminAccessToken: accessToken } }),
                    "Recusado",
                  )
                }
              >
                Recusar
              </Button>
            </div>
          ))}
        </section>
        <section className={`${section === "deposits" ? "hidden " : ""}rounded-xl border bg-card`}>
          <h2 className="border-b p-4 font-bold">
            Saques aguardando ({data?.withdrawals.length ?? 0})
          </h2>
          <p className="px-4 pt-2 text-xs text-muted-foreground">
            Para Roblox, pague os Robux pelo grupo. Para Crypto, envie para o endereço informado e
            marque como pago.
          </p>
          {data?.withdrawals.map((x) => (
            <div
              key={x.id}
              className="flex flex-wrap items-center gap-3 border-b px-4 py-3 text-sm last:border-0"
            >
              <span className="flex-1">{user(x)}</span>
              <span className="font-mono text-gold">{fmt(x.amount, 0)} $BX</span>
              <span className="text-xs text-muted-foreground">
                {x.payout_method === "crypto"
                  ? `Crypto: ${x.asset ?? "?"} / ${x.network ?? "?"} · ${x.destination ?? "?"}`
                  : "Roblox / Robux"}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(x.created_at).toLocaleString("pt-BR")}
              </span>
              <Button
                size="sm"
                onClick={() =>
                  run(
                    () => rw({ data: { id: x.id, paid: true, adminAccessToken: accessToken } }),
                    "Marcado como pago",
                  )
                }
              >
                Paguei
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  run(
                    () => rw({ data: { id: x.id, paid: false, adminAccessToken: accessToken } }),
                    "Devolvido",
                  )
                }
              >
                Devolver
              </Button>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

function Box({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-mono text-lg">$BX {v}</div>
    </div>
  );
}
