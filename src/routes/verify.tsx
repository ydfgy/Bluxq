import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Protected } from "@/components/AppShell";
import { useProfile } from "@/hooks/use-auth";
import { verifyRoblox } from "@/lib/blux.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/verify")({
  head: () => ({ meta: [{ title: "Verificar Roblox — BluxTrade" }, { name: "description", content: "Verifique sua conta Roblox" }, { property: "og:title", content: "Verificar Roblox" }, { property: "og:description", content: "Verifique sua conta Roblox" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => (<Protected requireVerified={false}><Verify /></Protected>),
});

function Verify() {
  const { data: p } = useProfile();
  const verify = useServerFn(verifyRoblox);
  const qc = useQueryClient(); const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!p) return null;
  if (p.verified) return <main className="mx-auto max-w-md p-8">Conta Roblox <b>{p.roblox_username}</b> verificada ✅</main>;
  return (
    <main className="mx-auto max-w-md px-4 py-12 space-y-4">
      <h1 className="text-2xl font-bold">Verifique sua conta Roblox</h1>
      <p className="text-muted-foreground">Cole esta frase na bio (Sobre) do seu perfil Roblox <b>{p.roblox_username}</b> e clique em verificar:</p>
      <div className="rounded-lg border bg-card p-4 font-mono text-gold">{p.verify_phrase}</div>
      <Button className="w-full" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await verify(); await qc.invalidateQueries(); toast.success("Verificado!"); nav({ to: "/trade" }); }
        catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
      }}>Verificar</Button>
    </main>
  );
}
