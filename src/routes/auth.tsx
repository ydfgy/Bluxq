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
      { title: "Sign in — BluxTrade" },
      { name: "description", content: "Sign in or create your BluxTrade account" },
      { property: "og:title", content: "Sign in — BluxTrade" },
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
          const { error: loginError } = await supabase.auth.signInWithPassword({
            email,
            password: pw,
          });
          if (loginError) throw loginError;
        }
        toast.success("Account created successfully!");
        nav({ to: "/verify" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        nav({ to: "/verify" });
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Unable to complete authentication.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">{signup ? "Create account" : "Entrar"}</h1>
      <form onSubmit={submit} className="mt-6 space-y-3">
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
