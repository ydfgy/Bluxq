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
  saveRobloxGamePass,
  deleteRobloxGamePass,
  searchAdminUsers,
  setAdminUserBan,
} from "@/lib/blux.functions";
import { fmt } from "@/lib/markets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AdminRequest = {
  profile: { roblox_username: string; roblox_user_id: number | null } | undefined;
  user_id: string;
};

type AdminUser = {
  id: string;
  roblox_username: string;
  roblox_display_name: string | null;
  roblox_user_id: number | null;
  avatar_url: string | null;
  verified: boolean;
  created_at: string;
  is_banned: boolean;
  banned_until: string | null;
  ban_reason: string | null;
};

function isActiveBan(user: Pick<AdminUser, "is_banned" | "banned_until">) {
  return Boolean(
    user.is_banned && (!user.banned_until || new Date(user.banned_until).getTime() > Date.now()),
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

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
  const searchUsers = useServerFn(searchAdminUsers);
  const changeUserBan = useServerFn(setAdminUserBan);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirmation, setPinConfirmation] = useState("");
  const [authStage, setAuthStage] = useState<
    "pin" | "pin-confirmation" | "password" | "password-confirmation"
  >("pin");
  const [section, setSection] = useState<
    "overview" | "deposits" | "withdrawals" | "gamepasses" | "users"
  >("overview");
  const [gamePassName, setGamePassName] = useState("");
  const [gamePassId, setGamePassId] = useState("");
  const [gamePassAmount, setGamePassAmount] = useState("");
  const [editingGamePassId, setEditingGamePassId] = useState<string | undefined>();
  const [userSearch, setUserSearch] = useState("");
  const [banDurationHours, setBanDurationHours] = useState("24");
  const [banReason, setBanReason] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : sessionStorage.getItem("bluxq-admin-access"),
  );
  const [authenticating, setAuthenticating] = useState(false);

  async function unlock() {
    setAuthenticating(true);
    try {
      const result = await authenticate({
        data: { password, pin },
      });
      sessionStorage.setItem("bluxq-admin-access", result.token);
      setAccessToken(result.token);
      toast.success("Painel desbloqueado");
    } catch (error: unknown) {
      toast.error(errorMessage(error));
      setPassword("");
      setPasswordConfirmation("");
      setPin("");
      setPinConfirmation("");
      setAuthStage("pin");
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

  const usersQuery = useQuery({
    queryKey: ["admin-users", accessToken, userSearch],
    enabled: Boolean(accessToken && section === "users" && userSearch.trim().length >= 2),
    queryFn: () =>
      searchUsers({
        data: { query: userSearch.trim(), adminAccessToken: accessToken! },
      }) as Promise<AdminUser[]>,
    retry: false,
  });

  useEffect(() => {
    if (!(adminError instanceof Error)) return;
    if (!adminError.message.includes("expirado ou inválido")) return;
    sessionStorage.removeItem("bluxq-admin-access");
    setAccessToken(null);
    toast.error("A sessão administrativa expirou. Confirme o PIN e a senha novamente.");
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
        <h1 className="text-xl font-bold">Painel admin</h1>
        <p className="text-sm text-muted-foreground">Confirme suas credenciais para entrar.</p>
        {authStage === "pin" ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (pin.length === 6) setAuthStage("pin-confirmation");
            }}
          >
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="PIN de 6 dígitos"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <Button className="w-full" disabled={pin.length !== 6}>
              Continuar
            </Button>
          </form>
        ) : authStage === "pin-confirmation" ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (pinConfirmation === pin) setAuthStage("password");
            }}
          >
            <div className="flex justify-between text-sm">
              <span>Confirmar PIN</span>
              <button
                type="button"
                className="text-zinc-300"
                onClick={() => {
                  setPin("");
                  setPinConfirmation("");
                  setAuthStage("pin");
                }}
              >
                Alterar PIN
              </button>
            </div>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="Digite o PIN novamente"
              value={pinConfirmation}
              onChange={(event) =>
                setPinConfirmation(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
            />
            <Button
              className="w-full"
              disabled={pinConfirmation.length !== 6 || pinConfirmation !== pin}
            >
              Confirmar PIN
            </Button>
          </form>
        ) : authStage === "password" ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (password.length >= 8) setAuthStage("password-confirmation");
            }}
          >
            <div className="flex justify-between text-sm">
              <span>Senha</span>
              <button
                type="button"
                className="text-zinc-300"
                onClick={() => {
                  setPin("");
                  setPinConfirmation("");
                  setAuthStage("pin");
                }}
              >
                Alterar PIN
              </button>
            </div>
            <Input
              type="password"
              autoComplete="new-password"
              minLength={8}
              placeholder="Senha administrativa"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Mínimo de 8 caracteres ({password.length}/8).
            </p>
            <Button className="w-full" disabled={password.length < 8}>
              Continuar
            </Button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (passwordConfirmation === password) void unlock();
            }}
          >
            <div className="flex justify-between text-sm">
              <span>Confirmar senha</span>
              <button
                type="button"
                className="text-zinc-300"
                onClick={() => {
                  setPassword("");
                  setPasswordConfirmation("");
                  setAuthStage("password");
                }}
              >
                Alterar senha
              </button>
            </div>
            <Input
              type="password"
              autoComplete="new-password"
              minLength={8}
              placeholder="Digite a senha novamente"
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
            />
            {passwordConfirmation.length > 0 && passwordConfirmation !== password && (
              <p className="text-xs text-red-400">As senhas não coincidem.</p>
            )}
            <Button
              className="w-full"
              disabled={
                passwordConfirmation.length < 8 ||
                passwordConfirmation !== password ||
                authenticating
              }
            >
              {authenticating ? "Aprovando acesso…" : "Confirmar senha e entrar"}
            </Button>
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
    <div className="flex min-h-screen bg-black text-zinc-100">
      <aside className="hidden w-64 shrink-0 border-r border-zinc-800 bg-zinc-950 p-5 md:block">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-300">Bluxq</p>
        <h1 className="mt-2 text-lg font-bold">Admin Console</h1>
        <nav className="mt-10 space-y-2" aria-label="Menu administrativo">
          <button
            onClick={() => setSection("overview")}
            className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
              section === "overview"
                ? "bg-zinc-100 text-black"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
          >
            Visão geral
          </button>
          <button
            onClick={() => setSection("deposits")}
            className={`flex w-full justify-between rounded-lg px-3 py-2 text-left text-sm ${
              section === "deposits"
                ? "bg-zinc-100 text-black"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
          >
            Depósitos <span>{data?.deposits.length ?? 0}</span>
          </button>
          <button
            onClick={() => setSection("withdrawals")}
            className={`flex w-full justify-between rounded-lg px-3 py-2 text-left text-sm ${
              section === "withdrawals"
                ? "bg-zinc-100 text-black"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
          >
            Saques <span>{data?.withdrawals.length ?? 0}</span>
          </button>
          <button
            onClick={() => setSection("users")}
            className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
              section === "users"
                ? "bg-zinc-100 text-black"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
          >
            Usuários
          </button>
          <button
            onClick={() => setSection("gamepasses")}
            className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
              section === "gamepasses"
                ? "bg-zinc-100 text-black"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
          >
            Game Passes
          </button>
        </nav>
        <Button
          variant="outline"
          className="mt-12 w-full border-zinc-700"
          onClick={() => {
            sessionStorage.removeItem("bluxq-admin-access");
            setAccessToken(null);
          }}
        >
          Bloquear painel
        </Button>
      </aside>
      <main className="mx-auto w-full max-w-6xl space-y-6 bg-black px-4 py-8 md:px-8">
        <nav className="flex gap-2 overflow-x-auto border-b border-zinc-800 pb-3 md:hidden">
          {(
            [
              ["overview", "Visão geral"],
              ["deposits", "Depósitos"],
              ["withdrawals", "Saques"],
              ["gamepasses", "Game Passes"],
              ["users", "Usuários"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${
                section === key ? "bg-zinc-100 text-black" : "bg-zinc-900 text-zinc-400"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500">
              Área restrita / {section}
            </p>
            <h1 className="text-2xl font-bold">
              {section === "overview"
                ? "Visão geral"
                : section === "deposits"
                  ? "Depósitos pendentes"
                  : section === "withdrawals"
                    ? "Saques pendentes"
                    : section === "gamepasses"
                      ? "Configuração de Game Passes"
                      : "Usuários e banimentos"}
            </h1>
          </div>
          <Button
            variant="outline"
            className="border-zinc-700"
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
          className={`${section !== "overview" && section !== "deposits" ? "hidden " : ""}rounded-xl border border-zinc-800 bg-zinc-900`}
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
              <span className="font-mono text-zinc-100">{fmt(x.amount, 0)} $BX</span>
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
        <section
          className={`${section !== "overview" && section !== "withdrawals" ? "hidden " : ""}rounded-xl border border-zinc-800 bg-zinc-900`}
        >
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
              <span className="font-mono text-zinc-100">
                {fmt(x.amount, 0)} $BX · líquido {fmt(x.amount * 0.7, 0)} R$
              </span>
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
        <section
          className={`${section !== "gamepasses" ? "hidden " : ""}space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4`}
        >
          <div>
            <h2 className="font-bold">Game Passes de depósito</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Cadastre o nome, o ID real e o valor em Robux. A Creator API Key não deve ser colocada
              no navegador: mantenha-a como segredo do servidor.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <Input
              value={gamePassName}
              onChange={(e) => setGamePassName(e.target.value)}
              placeholder="Nome exibido"
              className="border-zinc-700 bg-zinc-950"
            />
            <Input
              value={gamePassId}
              onChange={(e) => setGamePassId(e.target.value.replace(/\D/g, ""))}
              placeholder="ID do Game Pass"
              inputMode="numeric"
              className="border-zinc-700 bg-zinc-950"
            />
            <Input
              value={gamePassAmount}
              onChange={(e) => setGamePassAmount(e.target.value.replace(/\D/g, ""))}
              placeholder="Valor em Robux"
              inputMode="numeric"
              className="border-zinc-700 bg-zinc-950"
            />
          </div>
          <Button
            disabled={!gamePassName.trim() || !gamePassId || !gamePassAmount}
            onClick={() =>
              run(
                () =>
                  saveRobloxGamePass({
                    data: {
                      id: editingGamePassId,
                      name: gamePassName,
                      gamePassId: Number(gamePassId),
                      robuxAmount: Number(gamePassAmount),
                      active: true,
                      adminAccessToken: accessToken!,
                    },
                  }),
                editingGamePassId ? "Game Pass atualizado." : "Game Pass adicionado.",
              ).then(() => {
                setGamePassName("");
                setGamePassId("");
                setGamePassAmount("");
                setEditingGamePassId(undefined);
              })
            }
          >
            {editingGamePassId ? "Salvar alteração" : "Adicionar Game Pass"}
          </Button>
          <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {data?.gamePasses?.map(
              (pass: { id: string; name: string; game_pass_id: number; robux_amount: number }) => (
                <div key={pass.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="flex-1 font-semibold">{pass.name}</span>
                  <span className="font-mono text-primary">ID {pass.game_pass_id}</span>
                  <span>{fmt(pass.robux_amount, 0)} R$</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingGamePassId(pass.id);
                      setGamePassName(pass.name);
                      setGamePassId(String(pass.game_pass_id));
                      setGamePassAmount(String(pass.robux_amount));
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      run(
                        () =>
                          deleteRobloxGamePass({
                            data: { id: pass.id, adminAccessToken: accessToken! },
                          }),
                        "Game Pass removido.",
                      )
                    }
                  >
                    Remover
                  </Button>
                </div>
              ),
            )}
            {!data?.gamePasses?.length && (
              <p className="p-4 text-sm text-zinc-400">Nenhum Game Pass cadastrado.</p>
            )}
          </div>
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-xs text-amber-200">
            Permissões recomendadas: <b>Inventory: Read</b>,{" "}
            <b>Game Passes: Read &amp; Write on your place</b> e <b>Restrict IP: Off</b> somente se
            o backend não tiver IP fixo.
          </div>
        </section>
        <section
          className={`${section !== "users" ? "hidden " : ""}space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4`}
        >
          <div>
            <h2 className="font-bold">Banir usuário</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Pesquise pelo UUID da conta ou pelo username cadastrado na plataforma.
            </p>
          </div>
          <Input
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder="UUID ou username"
            className="border-zinc-700 bg-zinc-950"
          />
          {userSearch.trim().length < 2 ? (
            <p className="text-sm text-zinc-500">Digite pelo menos 2 caracteres para pesquisar.</p>
          ) : usersQuery.isPending ? (
            <p className="text-sm text-zinc-400">Buscando usuários…</p>
          ) : usersQuery.isError ? (
            <p className="text-sm text-red-300">Não foi possível buscar este usuário.</p>
          ) : usersQuery.data?.length ? (
            <div className="space-y-3">
              {usersQuery.data.map((user) => {
                const active = isActiveBan(user);
                const expired = user.is_banned && !active;
                const temporary = Boolean(user.banned_until);
                const duration = Number(banDurationHours);
                return (
                  <div key={user.id} className="space-y-3 rounded-lg border border-zinc-800 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt=""
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-zinc-800" />
                          )}
                          <div className="font-semibold">{user.roblox_username}</div>
                        </div>
                        {user.roblox_display_name && (
                          <div className="text-xs text-zinc-400">{user.roblox_display_name}</div>
                        )}
                        <div className="mt-1 break-all font-mono text-xs text-zinc-500">
                          {user.id}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          Roblox ID: {user.roblox_user_id ?? "—"} · Criado em{" "}
                          {new Date(user.created_at).toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          active
                            ? "bg-red-950 text-red-300"
                            : expired
                              ? "bg-amber-950 text-amber-300"
                              : "bg-emerald-950 text-emerald-300"
                        }`}
                      >
                        {active ? "Banido" : expired ? "Banimento expirado" : "Ativo"}
                      </span>
                    </div>
                    {active && (
                      <div className="text-xs text-zinc-400">
                        {temporary && user.banned_until
                          ? `Até ${new Date(user.banned_until).toLocaleString("pt-BR")}`
                          : "Banimento permanente"}
                        {user.ban_reason ? ` · ${user.ban_reason}` : ""}
                      </div>
                    )}
                    <div className="flex flex-wrap items-end gap-2">
                      {active ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-zinc-700"
                          onClick={() =>
                            run(
                              () =>
                                changeUserBan({
                                  data: {
                                    userId: user.id,
                                    action: "unban",
                                    adminAccessToken: accessToken,
                                  },
                                }),
                              "Usuário desbanido.",
                            )
                          }
                        >
                          Desbanir
                        </Button>
                      ) : (
                        <>
                          <div className="w-28">
                            <label
                              className="mb-1 block text-xs text-zinc-500"
                              htmlFor={`ban-hours-${user.id}`}
                            >
                              Horas
                            </label>
                            <Input
                              id={`ban-hours-${user.id}`}
                              type="number"
                              min="1"
                              max="8760"
                              value={banDurationHours}
                              onChange={(event) => setBanDurationHours(event.target.value)}
                              className="border-zinc-700 bg-zinc-950"
                            />
                          </div>
                          <div className="min-w-52 flex-1">
                            <label
                              className="mb-1 block text-xs text-zinc-500"
                              htmlFor={`ban-reason-${user.id}`}
                            >
                              Motivo (opcional)
                            </label>
                            <Input
                              id={`ban-reason-${user.id}`}
                              value={banReason}
                              onChange={(event) => setBanReason(event.target.value)}
                              placeholder="Motivo do banimento"
                              className="border-zinc-700 bg-zinc-950"
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-900 text-red-300 hover:bg-red-950"
                            onClick={() =>
                              run(
                                () =>
                                  changeUserBan({
                                    data: {
                                      userId: user.id,
                                      action: "ban",
                                      durationHours: null,
                                      reason: banReason,
                                      adminAccessToken: accessToken,
                                    },
                                  }),
                                "Usuário banido permanentemente.",
                              )
                            }
                          >
                            Banir permanente
                          </Button>
                          <Button
                            size="sm"
                            disabled={
                              !Number.isInteger(duration) || duration < 1 || duration > 8760
                            }
                            onClick={() =>
                              run(
                                () =>
                                  changeUserBan({
                                    data: {
                                      userId: user.id,
                                      action: "ban",
                                      durationHours: duration,
                                      reason: banReason,
                                      adminAccessToken: accessToken,
                                    },
                                  }),
                                "Banimento temporário aplicado.",
                              )
                            }
                          >
                            Banir temporário
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-zinc-400">Nenhum usuário encontrado.</p>
          )}
        </section>
      </main>
    </div>
  );
}

function Box({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-mono text-lg">$BX {v}</div>
    </div>
  );
}
