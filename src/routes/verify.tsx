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
      { title: "Verify Roblox — Bluxq" },
      { name: "description", content: "Verify your Roblox account" },
      { property: "og:title", content: "Verify Roblox" },
      { property: "og:description", content: "Verify your Roblox account" },
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
  const [copying, setCopying] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const {
    data: challenge,
    isLoading: challengeLoading,
    isError: challengeError,
    refetch: retryChallenge,
  } = useQuery({
    queryKey: ["verification-challenge"],
    enabled: !!p && !p.verified,
    queryFn: () => loadChallenge(),
  });

  if (!p)
    return (
      <main className="mx-auto max-w-md p-8" aria-busy="true">
        Loading verification…
      </main>
    );
  if (p.verified)
    return (
      <main className="mx-auto max-w-md p-8">
        Conta Roblox <b>{p.roblox_username}</b> verified.
      </main>
    );

  if (challengeError)
    return (
      <main className="mx-auto max-w-md space-y-4 px-4 py-12">
        <h1 className="text-2xl font-bold">Verify your Roblox account</h1>
        <p className="text-muted-foreground">Unable to load your verification phrase right now.</p>
        <Button className="w-full" onClick={() => retryChallenge()}>
          Tentar novamente
        </Button>
      </main>
    );

  async function copyPhrase() {
    if (!challenge?.phrase) return;
    setCopying(true);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(challenge.phrase);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = challenge.phrase;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Clipboard unavailable");
      }
      toast.success("Frase copiada");
    } catch {
      toast.error("Unable to copy the phrase");
    } finally {
      setCopying(false);
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-12">
      <h1 className="text-2xl font-bold">Verify your Roblox account</h1>
      <p className="text-muted-foreground">
        Paste this phrase into About on the Roblox profile <b>{p.roblox_username}</b> and click
        verify. Verification is performed server-side.
      </p>
      <div
        className="rounded-lg border bg-card p-4 font-mono text-gold"
        aria-live="polite"
        aria-busy={challengeLoading}
      >
        {challengeLoading
          ? "Loading phrase…"
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
        <Button variant="outline" onClick={copyPhrase} disabled={copying || !challenge?.phrase}>
          {copying ? "Copiando…" : "Copiar frase"}
        </Button>
      </div>
      <Button
        className="w-full"
        disabled={busy || challengeLoading || !challenge?.phrase}
        onClick={async () => {
          setBusy(true);
          try {
            await verify();
            await qc.invalidateQueries();
            toast.success("Verificado!");
            nav({ to: "/trade" });
          } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Unable to verify right now.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Verificando…" : "Verificar"}
      </Button>
    </main>
  );
}
