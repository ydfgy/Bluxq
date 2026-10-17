import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  validateSearch: (s) =>
    z
      .object({ mode: z.enum(["login", "signup"]).optional(), ref: z.string().max(10).optional() })
      .parse(s),
  head: () => ({
    meta: [
      { title: "Sign in — Bluxq" },
      { name: "description", content: "Sign in or create your Bluxq account" },
      { property: "og:title", content: "Sign in — Bluxq" },
      { property: "og:description", content: "Sign in or create your account" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode, ref } = Route.useSearch();
  const [signup, setSignup] = useState(mode === "signup");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [rbx, setRbx] = useState("");
  const [referralCode, setReferralCode] = useState(ref?.toUpperCase() ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const nav = useNavigate();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (signup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: pw,
          options: {
            data: {
              roblox_username: rbx,
              referral_code: referralCode.trim().toUpperCase() || null,
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setConfirmationPending(true);
          setSignup(false);
          setPw("");
          toast.success("Cadastro iniciado. Confirme seu email antes de entrar.");
          return;
        }
        setConfirmationPending(false);
        toast.success("Account created successfully!");
        nav({ to: "/verify" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) {
          if (error.message.toLowerCase().includes("email not confirmed")) {
            setConfirmationPending(true);
            throw new Error("Confirme seu email pelo link enviado antes de entrar.");
          }
          throw error;
        }
        setConfirmationPending(false);
        nav({ to: "/verify" });
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Unable to complete authentication.");
    } finally {
      setBusy(false);
    }
  }
  async function resendConfirmation() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      toast.success("Enviamos outro link de confirmação para seu email.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reenviar o email.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">{signup ? "Create account" : "Entrar"}</h1>
      <form onSubmit={submit} className="mt-6 space-y-3">
        {confirmationPending && (
          <div
            className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"
            role="status"
          >
            <p>
              Confirme o endereço de email pelo link enviado para concluir o cadastro. Confira
              também a pasta de spam.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={resendConfirmation}
              disabled={busy || !email}
            >
              Reenviar email de confirmação
            </Button>
          </div>
        )}
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          type="password"
          placeholder="Password"
          minLength={6}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
        />
        {signup && (
          <>
            <Input
              placeholder="Roblox username"
              value={rbx}
              onChange={(e) => setRbx(e.target.value)}
              required
            />
            <Input
              placeholder="Referral code (optional)"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              maxLength={10}
            />
          </>
        )}
        <Button className="w-full" disabled={busy}>
          {signup ? "Create account" : "Entrar"}
        </Button>
      </form>
      <button className="mt-4 text-sm text-muted-foreground" onClick={() => setSignup(!signup)}>
        {signup ? "Already have an account? Sign in" : "Need an account? Create one"}
      </button>
    </main>
  );
}
