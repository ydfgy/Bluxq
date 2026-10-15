import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SYMBOLS } from "./markets";
import { getBinancePrices } from "./market-data";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function rpcError(error: { message: string } | null) {
  if (error) throw new Error(error.message.replace(/^.*?ERROR:\s*/, ""));
}

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Apenas administradores");
}

/** Liquida todas as posições abertas cujo preço atual cruzou a liquidação. */
async function runLiquidations() {
  const sb = await admin();
  const { data: open } = await sb
    .from("positions")
    .select("id, symbol, side, liq_price")
    .eq("status", "open")
    .limit(500);
  if (!open?.length) return;
  const prices = await getBinancePrices([...new Set(open.map((p) => p.symbol))]);
  for (const p of open) {
    const px = prices[p.symbol];
    if (!px) continue;
    const hit = p.side === "long" ? px <= Number(p.liq_price) : px >= Number(p.liq_price);
    if (hit) await sb.rpc("fn_close_position", { _user: null as any, _id: p.id, _price: px, _force_liq: true });
  }
}

export const syncPositions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    await runLiquidations();
    return { ok: true };
  });

export const openPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        symbol: z.string().refine((s) => SYMBOLS.includes(s)),
        side: z.enum(["long", "short"]),
        margin: z.number().min(10).max(10_000_000),
        leverage: z.number().int().min(1).max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await runLiquidations();
    const prices = await getBinancePrices([data.symbol]);
    const sb = await admin();
    const { data: id, error } = await sb.rpc("fn_open_position", {
      _user: context.userId,
      _symbol: data.symbol,
      _side: data.side,
      _margin: data.margin,
      _lev: data.leverage,
      _price: prices[data.symbol] ?? 0,
    });
    rpcError(error);
    return { id, price: prices[data.symbol] };
  });

export const closePosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: pos } = await context.supabase
      .from("positions")
      .select("symbol")
      .eq("id", data.id)
      .eq("status", "open")
      .maybeSingle();
    if (!pos) throw new Error("Posição não encontrada");
    const prices = await getBinancePrices([pos.symbol]);
    const sb = await admin();
    const { data: res, error } = await sb.rpc("fn_close_position", {
      _user: context.userId,
      _id: data.id,
      _price: prices[pos.symbol] ?? 0,
      _force_liq: false,
    });
    rpcError(error);
    return res as { status: string; pnl: number; fee: number; payout: number };
  });

const amount = z.object({ amount: z.number().positive().max(100_000_000) });

export const stake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => amount.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (await admin()).rpc("fn_stake", { _user: context.userId, _amount: data.amount });
    rpcError(error);
    return { ok: true };
  });

export const unstake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => amount.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (await admin()).rpc("fn_unstake", { _user: context.userId, _amount: data.amount });
    rpcError(error);
    return { ok: true };
  });

export const requestDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ amount: z.number().int().min(10).max(10_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const { data: p } = await sb.from("profiles").select("verified").eq("id", context.userId).single();
    if (!p?.verified) throw new Error("Verifique sua conta Roblox primeiro");
    const { count } = await sb
      .from("deposits")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("status", "pending");
    if ((count ?? 0) >= 3) throw new Error("Você já tem 3 depósitos aguardando confirmação");
    const { error } = await sb.from("deposits").insert({ user_id: context.userId, amount: data.amount });
    rpcError(error);
    return { ok: true };
  });

export const requestWithdraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => amount.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (await admin()).rpc("fn_request_withdraw", { _user: context.userId, _amount: data.amount });
    rpcError(error);
    return { ok: true };
  });

/* ---------- Roblox verification ---------- */

export const setRobloxUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ username: z.string().trim().regex(/^[A-Za-z0-9_]{3,20}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const { data: p } = await sb.from("profiles").select("verified").eq("id", context.userId).single();
    if (p?.verified) throw new Error("Conta já verificada");
    await sb.from("profiles").update({ roblox_username: data.username }).eq("id", context.userId);
    return { ok: true };
  });

export const verifyRoblox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await admin();
    const { data: p } = await sb.from("profiles").select("*").eq("id", context.userId).single();
    if (!p) throw new Error("Perfil não encontrado");
    if (p.verified) return { verified: true };

    const r1 = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [p.roblox_username], excludeBannedUsers: true }),
    });
    const j1 = (await r1.json()) as { data?: { id: number; name: string; displayName: string }[] };
    const user = j1.data?.[0];
    if (!user) throw new Error(`Usuário Roblox "${p.roblox_username}" não encontrado`);

    const r2 = await fetch(`https://users.roblox.com/v1/users/${user.id}`);
    const j2 = (await r2.json()) as { description?: string };
    const bio = (j2.description ?? "").toLowerCase();
    if (!bio.includes(p.verify_phrase.toLowerCase())) {
      throw new Error("Frase não encontrada na sua bio do Roblox. Salve a bio e tente de novo em alguns segundos.");
    }

    const { data: taken } = await sb
      .from("profiles")
      .select("id")
      .eq("roblox_user_id", user.id)
      .neq("id", context.userId)
      .maybeSingle();
    if (taken) throw new Error("Essa conta Roblox já está ligada a outro usuário");

    let avatar: string | null = null;
    try {
      const r3 = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png`,
      );
      const j3 = (await r3.json()) as { data?: { imageUrl?: string }[] };
      avatar = j3.data?.[0]?.imageUrl ?? null;
    } catch {}

    await sb
      .from("profiles")
      .update({
        verified: true,
        roblox_user_id: user.id,
        roblox_username: user.name,
        roblox_display_name: user.displayName,
        avatar_url: avatar,
      })
      .eq("id", context.userId);
    return { verified: true };
  });

/* ---------- Admin ---------- */

export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await admin();
    const { count } = await sb.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) > 0) throw new Error("Já existe um administrador");
    await sb.from("user_roles").insert({ user_id: context.userId, role: "admin" });
    return { ok: true };
  });

export const adminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const [d, w, pool] = await Promise.all([
      sb.from("deposits").select("*").eq("status", "pending").order("created_at"),
      sb.from("withdrawals").select("*").eq("status", "pending").order("created_at"),
      sb.from("pool").select("*").single(),
    ]);
    const ids = [...new Set([...(d.data ?? []), ...(w.data ?? [])].map((x) => x.user_id))];
    const { data: profs } = ids.length
      ? await sb.from("profiles").select("id, roblox_username, roblox_user_id").in("id", ids)
      : { data: [] as any[] };
    const map = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
    return {
      deposits: (d.data ?? []).map((x) => ({ ...x, profile: map[x.user_id] })),
      withdrawals: (w.data ?? []).map((x) => ({ ...x, profile: map[x.user_id] })),
      pool: pool.data,
    };
  });

export const reviewDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (await admin()).rpc("fn_review_deposit", { _id: data.id, _approve: data.approve });
    rpcError(error);
    return { ok: true };
  });

export const reviewWithdraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), paid: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (await admin()).rpc("fn_review_withdraw", { _id: data.id, _paid: data.paid });
    rpcError(error);
    return { ok: true };
  });
