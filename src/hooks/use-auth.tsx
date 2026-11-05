import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Ctx = { session: Session | null; ready: boolean };
const AuthCtx = createContext<Ctx>({ session: null, ready: false });
const PROFILE_COLUMNS =
  "id,roblox_username,roblox_user_id,roblox_display_name,avatar_url,is_anonymous,verified,balance,created_at,is_banned,banned_until,ban_reason";
const LEGACY_PROFILE_COLUMNS =
  "id,roblox_username,roblox_user_id,roblox_display_name,avatar_url,is_anonymous,verified,balance,created_at";

function isProfileSchemaError(error: { message?: string } | null) {
  return Boolean(
    error?.message &&
    /schema cache|column .* does not exist|could not find the .* column|does not exist/i.test(
      error.message,
    ),
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();
  useEffect(() => {
    let mounted = true;
    let authEventReceived = false;
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived = true;
      if (!mounted) return;
      // Supabase owns token refresh and session invalidation; access-token expiry
      // alone must not sign the user out while a refresh token is still valid.
      setSession(nextSession);
      setReady(true);
      qc.invalidateQueries();
    });
    supabase.auth
      .getSession()
      .then(({ data }) => {
        // The auth event is newer than this initial snapshot. Never let a slow
        // getSession() response overwrite a session established by a login.
        if (!mounted || authEventReceived) return;
        setSession(data.session);
        setReady(true);
      })
      .catch((error: unknown) => {
        if (!mounted || authEventReceived) return;
        console.error("[Auth] Unable to restore saved session", error);
        setSession(null);
        setReady(true);
      });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [qc]);
  return <AuthCtx.Provider value={{ session, ready }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export function useProfile() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session,
    retry: false,
    refetchInterval: 5000,
    queryFn: async () => {
      const primary = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", session!.user.id)
        .single();
      if (!primary.error) return primary.data;
      if (!isProfileSchemaError(primary.error)) throw primary.error;

      const legacy = await supabase
        .from("profiles")
        .select(LEGACY_PROFILE_COLUMNS)
        .eq("id", session!.user.id)
        .single();
      if (legacy.error) throw legacy.error;
      return {
        ...legacy.data,
        is_banned: false,
        banned_until: null,
        ban_reason: null,
      };
    },
  });
}

export function useIsAdmin() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["is-admin", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: session!.user.id,
        _role: "admin",
      });
      if (error) throw error;
      return !!data;
    },
  });
}
