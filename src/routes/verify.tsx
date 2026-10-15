import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Protected } from "@/components/AppShell";
import { useProfile } from "@/hooks/use-auth";
import { getVerificationChallenge, verifyRoblox } from "@/lib/blux.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Verificar Roblox — BluxTrade" },
      { name: "description", content: "Verifique sua conta Roblox" },
      { property: "og:title", content: "Verificar Roblox" },
      { property: "og:description", content: "Verifique sua conta Roblox" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Protected requireVerified={false}>
      <Verify />
    </Protected>
  ),
});

function Verify() {
  const { data: p } = useProfile();
  const verify = useServerFn(verifyRoblox);
  const loadChallenge = useServerFn(getVerificationChallenge);
  const qc = useQueryClient();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const { data: challenge, isLoading: challengeLoading } = useQuery({
    queryKey: ["verification-challenge"],
    enabled: !!p && !p.verified,
    queryFn: () => loadChallenge(),
  });

  if (!p) return null;
  if (p.verified)
    return (
      <main className="mx-auto max-w-md p-8">
        Conta Roblox <b>{p.roblox_username}</b> verificada.
      </main>
    );

  async function copyPhrase() {
    if (!challenge?.phrase) return;
    try {
      await navigator.clipboard.writeText(challenge.phrase);
      toast.success("Frase copiada");
    } catch {
      toast.error("Não foi possível copiar a frase");
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-12">
      <h1 className="text-2xl font-bold">Verifique sua conta Roblox</h1>
      <p className="text-muted-foreground">
        Cole esta frase em Sobre no perfil Roblox <b>{p.roblox_username}</b> e clique em verificar.
        A conferência é feita no servidor.
      </p>
      <div className="rounded-lg border bg-card p-4 font-mono text-gold" aria-live="polite">
        {challengeLoading
          ? "Carregando frase…"
          : revealed
            ? challenge?.phrase
            : "•••• •••• •••••••••••••••••••••••••••••••••"}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          onClick={() => setRevealed((value) => !value)}
          disabled={challengeLoading || !challenge?.phrase}
        >
          {revealed ? "Ocultar frase" : "Mostrar frase"}
        </Button>
        <Button variant="outline" onClick={copyPhrase} disabled={!revealed || !challenge?.phrase}>
          Copiar frase
        </Button>
      </div>
      <Button
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await verify();
            await qc.invalidateQueries();
            toast.success("Verificado!");
            nav({ to: "/trade" });
          } catch (error: unknown) {
            toast.error(
              error instanceof Error ? error.message : "Não foi possível verificar agora.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Verificar
      </Button>
    </main>
  );
}
