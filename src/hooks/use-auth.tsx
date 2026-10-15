import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Ctx = { session: Session | null; ready: boolean };
const AuthCtx = createContext<Ctx>({ session: null, ready: false });
const PROFILE_COLUMNS =
  "id,roblox_username,roblox_user_id,roblox_display_name,avatar_url,verified,balance,created_at";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setReady(true);
      qc.invalidateQueries();
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);
  return <AuthCtx.Provider value={{ session, ready }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export function useProfile() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", session!.user.id)
        .single();
      if (error) throw error;
      return data;
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
