import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/markets";

export const BRAND_ICON_SRC = "/bluxq-favicon.png";
export const BRAND_LOGO_SRC = "/bluxq-logo-trim.png";

function hasActiveBan(
  profile: { is_banned?: boolean; banned_until?: string | null } | null | undefined,
) {
  return Boolean(
    profile?.is_banned &&
    (!profile.banned_until || new Date(profile.banned_until).getTime() > Date.now()),
  );
}

export function BrandIcon({ alt = "Bluxq", className }: { alt?: string; className?: string }) {
  return (
    <img src={BRAND_ICON_SRC} alt={alt} className={className ?? "h-full w-full object-contain"} />
  );
}

export function Logo() {
  return (
    <Link to="/" aria-label="Bluxq — início" className="-ml-2 flex h-10 w-32 shrink-0 items-center">
      <img src={BRAND_LOGO_SRC} alt="Bluxq" className="h-full w-full object-contain object-left" />
    </Link>
  );
}

export function Navbar() {
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const nav = useNavigate();
  const qc = useQueryClient();
  const link = "text-sm text-muted-foreground hover:text-foreground transition-colors";
  const active = { className: "text-sm text-foreground font-semibold" };

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4">
        <Logo />
        <nav className="hidden md:flex items-center gap-5">
          <Link to="/trade" className={link} activeProps={active}>
            Trade
          </Link>
          {session && (
            <Link to="/wallet" className={link} activeProps={active}>
              Wallet
            </Link>
          )}
          {session && (
            <Link to="/copy" className={link} activeProps={active}>
              Copy
            </Link>
          )}
          <Link to="/stake" className={link} activeProps={active}>
            Stake
          </Link>
          <Link to="/referrals" className={link} activeProps={active}>
            Referrals
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {session && profile ? (
            <>
              <Link
                to="/wallet"
                className="flex items-center gap-1.5 font-mono text-sm text-gold"
                aria-label={`Saldo $BX ${fmt(profile.balance)}`}
              >
                <img src="/bluxq-icon.png" alt="Saldo $BX" className="h-5 w-5 object-contain" />
                <span>{fmt(profile.balance)}</span>
              </Link>
              <div
                className="hidden max-w-40 truncate font-mono text-xs text-muted-foreground sm:block"
                title={session.user.id}
              >
                {session.user.id}
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
      <nav className="flex md:hidden items-center justify-around border-t py-2">
        <Link to="/trade" className={link} activeProps={active}>
          Trade
        </Link>
        {session && (
          <Link to="/wallet" className={link} activeProps={active}>
            Wallet
          </Link>
        )}
        {session && (
          <Link to="/copy" className={link} activeProps={active}>
            Copy
          </Link>
        )}
        <Link to="/stake" className={link} activeProps={active}>
          Stake
        </Link>
        <Link to="/referrals" className={link} activeProps={active}>
          Referrals
        </Link>
      </nav>
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
    if (ready && !session) nav({ to: "/auth", search: { mode: "signup" }, replace: true });
    else if (hasActiveBan(profile)) return;
    else if (requireVerified && profile && !profile.verified) nav({ to: "/verify", replace: true });
  }, [ready, session, profile, requireVerified, nav]);
  if (!ready || !session || isLoading || !profile || (requireVerified && !profile.verified)) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-muted-foreground">
        {isError ? "Unable to load your account. Retrying…" : "Loading…"}
      </div>
    );
  }
  if (hasActiveBan(profile)) {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center px-6 text-center">
        <div>
          <h1 className="text-xl font-bold">Conta banida</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta conta não pode usar a plataforma enquanto o banimento estiver ativo.
          </p>
          {profile.ban_reason && (
            <p className="mt-3 text-sm text-muted-foreground">Motivo: {profile.ban_reason}</p>
          )}
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function CoinRain({ show }: { show: number }) {
  void show;
  return null;
}
