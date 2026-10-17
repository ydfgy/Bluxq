import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Eye, EyeOff, LoaderCircle, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useIsAdmin, useProfile } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/markets";

export const BRAND_ICON_SRC = "/bluxq-favicon.png";

export function BrandIcon({ alt = "Bluxq", className }: { alt?: string; className?: string }) {
  return (
    <img src={BRAND_ICON_SRC} alt={alt} className={className ?? "h-full w-full object-contain"} />
  );
}

export function Logo() {
  return (
    <Link
      to="/"
      aria-label="Bluxq — início"
      className="flex items-center gap-2 font-bold text-lg tracking-tight"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gold/10 p-1 ring-1 ring-gold/30">
        <BrandIcon alt="" />
      </span>
      <span>Bluxq</span>
    </Link>
  );
}

export function Navbar() {
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const { data: isAdmin } = useIsAdmin();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const link = "text-sm text-muted-foreground hover:text-foreground transition-colors";
  const active = { className: "text-sm text-foreground font-semibold" };

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  async function togglePrivacy() {
    if (!session || !profile) return;
    const next = !profile.is_anonymous;
    const { error } = await supabase
      .from("profiles")
      .update({ is_anonymous: next })
      .eq("id", session.user.id);
    if (error) {
      toast.error("Não foi possível alterar a privacidade do perfil.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["profile", session.user.id] });
    toast.success(next ? "Perfil anônimo ativado" : "Nome e foto restaurados");
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !session) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      toast.error("Escolha uma imagem de até 5 MB.");
      return;
    }
    setUploadingAvatar(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${session.user.id}/avatar-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: `${data.publicUrl}?v=${Date.now()}` })
        .eq("id", session.user.id);
      if (profileError) throw profileError;
      await qc.invalidateQueries({ queryKey: ["profile", session.user.id] });
      toast.success("Foto de perfil atualizada");
    } catch {
      toast.error("Não foi possível enviar a foto de perfil.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4">
        <Logo />
        {session && (
          <nav className="hidden md:flex items-center gap-5">
            <Link to="/trade" className={link} activeProps={active}>
              Trade
            </Link>
            <Link to="/wallet" className={link} activeProps={active}>
              Wallet
            </Link>
            <Link to="/convert" className={link} activeProps={active}>
              Converter
            </Link>
            <Link to="/stake" className={link} activeProps={active}>
              Stake
            </Link>
            <Link to="/referrals" className={link} activeProps={active}>
              Referrals
            </Link>
            {isAdmin && (
              <Link to="/admin" className={link} activeProps={active}>
                Admin
              </Link>
            )}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-3">
          {session && profile ? (
            <>
              <Link
                to="/wallet"
                className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 font-mono text-sm text-gold"
              >
                $BX {fmt(profile.balance)}
              </Link>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void togglePrivacy()}
                  title={profile.is_anonymous ? "Mostrar nome e foto" : "Ocultar nome e foto"}
                  aria-label={profile.is_anonymous ? "Mostrar nome e foto" : "Ocultar nome e foto"}
                  className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-muted text-muted-foreground hover:text-foreground"
                >
                  {profile.is_anonymous ? (
                    <UserRound className="h-4 w-4" />
                  ) : profile.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="h-4 w-4" />
                  )}
                </button>
                <label
                  title="Enviar foto de perfil"
                  className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {uploadingAvatar ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => void uploadAvatar(event)}
                    disabled={uploadingAvatar}
                  />
                </label>
                <span className="hidden text-sm sm:inline">
                  {profile.is_anonymous ? "Anônimo" : profile.roblox_username}
                </span>
                {profile.is_anonymous ? (
                  <EyeOff className="hidden h-3.5 w-3.5 text-muted-foreground sm:inline" />
                ) : (
                  <Eye className="hidden h-3.5 w-3.5 text-muted-foreground sm:inline" />
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Create account
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
      {session && (
        <nav className="flex md:hidden items-center justify-around border-t py-2">
          <Link to="/trade" className={link} activeProps={active}>
            Trade
          </Link>
          <Link to="/wallet" className={link} activeProps={active}>
            Wallet
          </Link>
          <Link to="/convert" className={link} activeProps={active}>
            Converter
          </Link>
          <Link to="/stake" className={link} activeProps={active}>
            Stake
          </Link>
          <Link to="/referrals" className={link} activeProps={active}>
            Referrals
          </Link>
          {isAdmin && (
            <Link to="/admin" className={link} activeProps={active}>
              Admin
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}

/** Protects the page: login and optional Roblox verification are required. */
export function Protected({
  children,
  requireVerified = true,
}: {
  children: ReactNode;
  requireVerified?: boolean;
}) {
  const { session, ready } = useAuth();
  const { data: profile, isLoading, isError } = useProfile();
  const nav = useNavigate();
  useEffect(() => {
    if (ready && !session) nav({ to: "/auth", replace: true });
    else if (requireVerified && profile && !profile.verified) nav({ to: "/verify", replace: true });
  }, [ready, session, profile, requireVerified, nav]);
  if (!ready || !session || isLoading || !profile || (requireVerified && !profile.verified)) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-muted-foreground">
        {isError ? "Unable to load your account. Retrying…" : "Loading…"}
      </div>
    );
  }
  return <>{children}</>;
}

export function CoinRain({ show }: { show: number }) {
  void show;
  return null;
}
