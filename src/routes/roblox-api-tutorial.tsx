import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Protected } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/roblox-api-tutorial")({
  head: () => ({
    meta: [
      { title: "Tutorial Creator API Key — Bluxq" },
      {
        name: "description",
        content: "Aprenda a criar uma Creator API Key do Roblox para usar depósitos e saques.",
      },
    ],
  }),
  component: () => (
    <Protected>
      <RobloxApiTutorial />
    </Protected>
  ),
});

function RobloxApiTutorial() {
  const nav = useNavigate();

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Roblox</p>
        <h1 className="text-3xl font-bold">Como criar sua Creator API Key</h1>
        <p className="max-w-2xl text-muted-foreground">
          Siga os passos abaixo para criar uma chave segura e permitir que a Bluxq identifique suas
          compras de Game Pass. Não compartilhe essa chave com ninguém.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold">Antes de começar</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Use a mesma conta Roblox que está vinculada ao seu perfil Bluxq.</li>
          <li>Você precisa ter acesso ao Roblox Creator Dashboard.</li>
          <li>
            A chave deve ser usada somente nesta plataforma e nunca publicada em chats ou imagens.
          </li>
        </ul>
      </section>

      <ol className="space-y-4">
        <li className="rounded-xl border border-border bg-card p-5">
          <div className="flex gap-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              1
            </span>
            <div className="space-y-2">
              <h2 className="font-bold">Abra as credenciais do Roblox</h2>
              <p className="text-sm text-muted-foreground">
                Entre no Creator Dashboard com a conta Roblox correta e abra a área de credenciais
                para criar uma nova chave.
              </p>
              <a
                href="https://create.roblox.com/dashboard/credentials"
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Abrir Creator Dashboard
              </a>
            </div>
          </div>
        </li>

        <li className="rounded-xl border border-border bg-card p-5">
          <div className="flex gap-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              2
            </span>
            <div className="space-y-2">
              <h2 className="font-bold">Crie uma nova API Key</h2>
              <p className="text-sm text-muted-foreground">
                Clique para criar uma nova chave, dê um nome que você reconheça e mantenha a chave
                restrita. Não use uma chave de outro projeto.
              </p>
            </div>
          </div>
        </li>

        <li className="rounded-xl border border-border bg-card p-5">
          <div className="flex gap-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              3
            </span>
            <div className="space-y-3">
              <h2 className="font-bold">Configure as permissões exigidas</h2>
              <p className="text-sm text-muted-foreground">
                Na seção de permissões da chave, deixe exatamente estas opções:
              </p>
              <div className="space-y-2 rounded-lg bg-background p-4 font-mono text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span>inventory</span>
                  <span className="text-bull">read</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>game-passes</span>
                  <span className="text-bull">read and write on your place</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Restrict IP</span>
                  <span className="text-bull">off</span>
                </div>
              </div>
            </div>
          </div>
        </li>

        <li className="rounded-xl border border-border bg-card p-5">
          <div className="flex gap-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              4
            </span>
            <div className="space-y-2">
              <h2 className="font-bold">Copie a chave uma única vez</h2>
              <p className="text-sm text-muted-foreground">
                Depois de criar a chave, copie o valor exibido. Cole-o somente no campo protegido da
                Bluxq e confirme. Se você perder a chave, revogue-a no Roblox e crie outra.
              </p>
            </div>
          </div>
        </li>
      </ol>

      <section className="rounded-xl border border-gold/30 bg-gold/10 p-5 text-sm text-gold">
        <b>Importante:</b> a chave não deve ser enviada por mensagem, colocada no código ou salva em
        capturas de tela. Se suspeitar que ela vazou, revogue-a imediatamente no Creator Dashboard.
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          className="flex-1"
          onClick={() => {
            window.sessionStorage.setItem("bluxq-roblox-tutorial-complete", "1");
            nav({ to: "/wallet" });
          }}
        >
          Continuar para o depósito
        </Button>
        <Button asChild variant="outline" className="flex-1">
          <Link to="/trade">Voltar para o Bluxq</Link>
        </Button>
      </div>
    </main>
  );
}
