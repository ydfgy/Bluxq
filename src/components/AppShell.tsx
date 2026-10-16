import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useIsAdmin, useProfile } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/markets";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
      <img src="/bluxq-logo.png" alt="Bluxq" className="h-12 w-auto object-contain" />
    </Link>
  );
}

export function Navbar() {
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const { data: isAdmin } = useIsAdmin();
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
              <div className="hidden sm:flex items-center gap-2">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full bg-muted" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted" />
                )}
                <span className="text-sm">{profile.roblox_username}</span>
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
