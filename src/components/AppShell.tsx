import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/markets";
import { Check, Copy } from "lucide-react";

export const BRAND_ICON_SRC = "/bluxq-favicon.png";
export const BRAND_LOGO_SRC = "/bluxq-logo-trim.png";
const SUPPORT_WALLET = "C5HcRUsESoQ1RKWKz2NNdN2RkdJ7fcSQCxUCZnHk8hNw";

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

export function PlatformNoticeBar() {
  const [copied, setCopied] = useState(false);

  async function copyWallet() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(SUPPORT_WALLET);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = SUPPORT_WALLET;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border-y border-gold/20 bg-gold/[0.06] px-4 py-2 text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center sm:justify-between sm:text-left">
        <p>
          A Bluxq é uma plataforma independente e não é afiliada, patrocinada, endossada ou
          administrada pela Roblox Corporation.
        </p>
        <button
          type="button"
          onClick={copyWallet}
          className="inline-flex max-w-full items-center gap-2 rounded-md px-2 py-1 font-mono text-[10px] text-gold transition-colors hover:bg-gold/10 hover:text-gold-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Clique para copiar o endereço da carteira Solana"
          aria-label={`Copiar endereço da carteira Solana ${SUPPORT_WALLET}`}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Copy className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">Apoie o projeto · Solana: {SUPPORT_WALLET}</span>
          <span className="sr-only">{copied ? "Endereço copiado" : "Clique para copiar"}</span>
        </button>
      </div>
    </div>
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
          {session ? (
            <>
              {profile && (
                <Link
                  to="/wallet"
                  className="flex items-center gap-1.5 font-mono text-sm text-gold"
                  aria-label={`Saldo $BX ${fmt(profile.balance)}`}
                >
                  <img src="/bluxq-icon.png" alt="Saldo $BX" className="h-5 w-5 object-contain" />
                  <span>{fmt(profile.balance)}</span>
                </Link>
              )}
              <div
                className="max-w-[280px] break-all font-mono text-[9px] leading-tight text-muted-foreground"
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
      <PlatformNoticeBar />
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
  const { data: profile, isError } = useProfile();
  const nav = useNavigate();
  useEffect(() => {
    if (ready && !session) nav({ to: "/auth", search: { mode: "signup" }, replace: true });
    else if (requireVerified && profile && !profile.verified) nav({ to: "/verify", replace: true });
  }, [ready, session, profile, requireVerified, nav]);
  if (!ready || !session) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-muted-foreground">Loading…</div>
    );
  }
  // A transient profile/RLS/schema error must not make the whole tab inaccessible.
  // Server functions still validate the session and account status before mutations.
  if (isError || !profile) return <>{children}</>;
  if (requireVerified && !profile.verified) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-muted-foreground">Loading…</div>
    );
  }
  return <>{children}</>;
}

export function CoinRain({ show }: { show: number }) {
  void show;
  return null;
}
