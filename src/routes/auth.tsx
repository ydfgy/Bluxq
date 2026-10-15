import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => z.object({ mode: z.enum(["login", "signup"]).optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Entrar — BluxTrade" },
      { name: "description", content: "Entre ou crie sua conta BluxTrade" },
      { property: "og:title", content: "Entrar — BluxTrade" },
      { property: "og:description", content: "Entre ou crie sua conta" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const [signup, setSignup] = useState(mode === "signup");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [rbx, setRbx] = useState("");
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
          options: { data: { roblox_username: rbx } },
        });
        if (error) throw error;
        if (!data.session) {
          const { error: loginError } = await supabase.auth.signInWithPassword({
            email,
            password: pw,
          });
          if (loginError) throw loginError;
        }
        toast.success("Conta criada com sucesso!");
        nav({ to: "/verify" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        nav({ to: "/verify" });
      }
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível concluir a autenticação.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">{signup ? "Criar conta" : "Entrar"}</h1>
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
          placeholder="Senha"
          minLength={6}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
        />
        {signup && (
          <Input
            placeholder="Nome de usuário do Roblox"
            value={rbx}
            onChange={(e) => setRbx(e.target.value)}
            required
          />
        )}
        <Button className="w-full" disabled={busy}>
          {signup ? "Criar conta" : "Entrar"}
        </Button>
      </form>
      <button className="mt-4 text-sm text-muted-foreground" onClick={() => setSignup(!signup)}>
        {signup ? "Já tem conta? Entrar" : "Não tem conta? Criar"}
      </button>
    </main>
  );
}
