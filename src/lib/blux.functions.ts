import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { SYMBOLS } from "./markets";
import { getBinancePrices } from "./market-data";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function rpcError(error: { message: string; code?: string } | null) {
  if (!error) return;
  const clean = error.message.replace(/^.*?ERROR:\s*/, "").trim();
  console.error("[BluxTrade] Supabase operation failed", { code: error.code, message: clean });
  const internal =
    /permission denied|relation .* does not exist|column .* does not exist|syntax error/i.test(
      clean,
    );
  throw new Error(
    !clean || clean.length > 240 || internal ? "Unable to complete the operation." : clean,
  );
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

const verificationWords = [
  "amber",
  "anchor",
  "apex",
  "apple",
  "arrow",
  "atlas",
  "aurora",
  "badge",
  "beacon",
  "blue",
  "brave",
  "bridge",
  "canyon",
  "cinder",
  "cobalt",
  "comet",
  "coral",
  "cosmic",
  "crystal",
  "daring",
  "delta",
  "ember",
  "falcon",
  "feather",
  "flare",
  "forest",
  "galaxy",
  "golden",
  "harbor",
  "honest",
  "jade",
  "jupiter",
  "lunar",
  "maple",
  "marble",
  "meadow",
  "meteor",
  "midnight",
  "mint",
  "nebula",
  "ocean",
  "orbit",
  "pearl",
  "phoenix",
  "pilot",
  "planet",
  "raven",
  "rocket",
  "sapphire",
  "shadow",
  "silver",
  "solar",
  "spark",
  "summit",
  "thunder",
  "tiger",
  "velvet",
  "vertex",
  "violet",
  "wave",
  "whisper",
  "willow",
  "winter",
  "zenith",
] as const;

function createVerificationPhrase() {
  const random = new Uint32Array(4);
  crypto.getRandomValues(random);
  return Array.from(random, (value) => verificationWords[value % verificationWords.length]).join(
    " ",
  );
}

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  rpcError(error);
  if (!data) throw new Error("Apenas administradores");
}

/** Liquida todas as posições abertas cujo preço atual cruzou a liquidação. */
async function runLiquidations() {
  const sb = await admin();
  const { data: open, error } = await sb
    .from("positions")
    .select("id, symbol, side, liq_price")
    .eq("status", "open")
    .limit(500);
  rpcError(error);
  if (!open?.length) return;
  const prices = await getBinancePrices([...new Set(open.map((p) => p.symbol))]);
  for (const p of open) {
    const px = prices[p.symbol];
    if (!px) continue;
    const hit = p.side === "long" ? px <= Number(p.liq_price) : px >= Number(p.liq_price);
    if (hit) {
      await sb.rpc("fn_close_position", {
        _user: null as never,
        _id: p.id,
        _price: px,
        _force_liq: true,
      });
    }
  }
}

export const syncPositions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    await runLiquidations();
    return { ok: true };
  });

/** Returns sanitized open positions so the platform order book reflects real internal activity. */
export const getPlatformOpenPositions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await (
      await admin()
    )
      .from("positions")
      .select("id, symbol, side, margin, leverage, qty, entry_price, liq_price, opened_at")
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(200);
    rpcError(error);
    return data ?? [];
  });

export const openPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        symbol: z.string().refine((s) => SYMBOLS.includes(s)),
        side: z.enum(["long", "short"]),
        margin: z.number().finite().min(10).max(10_000_000),
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
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: pos, error: positionError } = await context.supabase
      .from("positions")
      .select("symbol")
      .eq("id", data.id)
      .eq("status", "open")
      .maybeSingle();
    rpcError(positionError);
    if (!pos) throw new Error("Position not found");
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

const amount = z.object({ amount: z.number().finite().positive().max(100_000_000) });

export const stake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => amount.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (
      await admin()
    ).rpc("fn_stake", { _user: context.userId, _amount: data.amount });
    rpcError(error);
    return { ok: true };
  });

export const unstake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => amount.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (
      await admin()
    ).rpc("fn_unstake", { _user: context.userId, _amount: data.amount });
    rpcError(error);
    return { ok: true };
  });

export const claimAffiliate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: value, error } = await (
      await admin()
    ).rpc("fn_claim_affiliate", {
      _user: context.userId,
    });
    rpcError(error);
    return { amount: Number(value ?? 0) };
  });

export const getAffiliateSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await admin();
    const [profile, invited, earnings] = await Promise.all([
      sb.from("profiles").select("referral_code").eq("id", context.userId).single(),
      sb
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("referred_by", context.userId),
      sb
        .from("affiliate_earnings")
        .select("amount, claimed_at")
        .eq("affiliate_id", context.userId)
        .limit(1000),
    ]);
    rpcError(profile.error);
    rpcError(invited.error);
    rpcError(earnings.error);
    const rows = earnings.data ?? [];
    const pending = rows
      .filter((row) => !row.claimed_at)
      .reduce((sum, row) => sum + Number(row.amount), 0);
    const claimed = rows
      .filter((row) => row.claimed_at)
      .reduce((sum, row) => sum + Number(row.amount), 0);
    return {
      referralCode: profile.data?.referral_code ?? null,
      invitedCount: invited.count ?? 0,
      pending,
      claimed,
      total: pending + claimed,
    };
  });

export const requestDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        amount: z.number().int().min(10).max(10_000_000),
        paymentMethod: z.enum(["roblox", "crypto"]),
        asset: z.string().trim().max(20).optional(),
        network: z.string().trim().max(30).optional(),
        transactionHash: z.string().trim().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (
      await admin()
    ).rpc("fn_request_deposit_v2", {
      _user: context.userId,
      _amount: data.amount,
      _payment_method: data.paymentMethod,
      _asset: data.asset ?? null,
      _network: data.network ?? null,
      _transaction_hash: data.transactionHash ?? null,
    });
    rpcError(error);
    return { ok: true };
  });

export const requestWithdraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        amount: amount.shape.amount,
        payoutMethod: z.enum(["roblox", "crypto"]),
        asset: z.string().trim().max(20).optional(),
        network: z.string().trim().max(30).optional(),
        destination: z.string().trim().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (
      await admin()
    ).rpc("fn_request_withdraw_v2", {
      _user: context.userId,
      _amount: data.amount,
      _payout_method: data.payoutMethod,
      _asset: data.asset ?? null,
      _network: data.network ?? null,
      _destination: data.destination ?? null,
    });
    rpcError(error);
    return { ok: true };
  });

/* ---------- Roblox verification ---------- */
export const getVerificationChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await admin();
    const [{ data: profile, error: profileError }, { data: challenge, error: challengeError }] =
      await Promise.all([
        sb.from("profiles").select("verified").eq("id", context.userId).single(),
        sb
          .from("profile_challenges")
          .select("verify_phrase")
          .eq("user_id", context.userId)
          .maybeSingle(),
      ]);
    rpcError(profileError);
    if (profile?.verified) return { phrase: null, verified: true };
    rpcError(challengeError);
    if (challenge) return { phrase: challenge.verify_phrase, verified: false };

    const phrase = createVerificationPhrase();
    const { error: insertError } = await sb
      .from("profile_challenges")
      .upsert({ user_id: context.userId, verify_phrase: phrase }, { onConflict: "user_id" });
    rpcError(insertError);
    return { phrase, verified: false };
  });

export const setRobloxUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        username: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9_]{3,20}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const { data: p, error: profileError } = await sb
      .from("profiles")
      .select("verified")
      .eq("id", context.userId)
      .single();
    rpcError(profileError);
    if (p?.verified) throw new Error("Account already verified");
    const { error } = await sb
      .from("profiles")
      .update({ roblox_username: data.username })
      .eq("id", context.userId);
    rpcError(error);
    return { ok: true };
  });

export const verifyRoblox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await admin();
    const { data: p, error: profileError } = await sb
      .from("profiles")
      .select("id, roblox_username, verified")
      .eq("id", context.userId)
      .single();
    rpcError(profileError);
    if (!p) throw new Error("Profile not found");
    if (p.verified) return { verified: true };

    const { data: challenge, error: challengeError } = await sb
      .from("profile_challenges")
      .select("verify_phrase")
      .eq("user_id", context.userId)
      .single();
    rpcError(challengeError);
    if (!challenge) throw new Error("Verification challenge not found");

    const r1 = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ usernames: [p.roblox_username], excludeBannedUsers: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r1.ok) throw new Error("Roblox did not respond. Try again in a few seconds.");
    const j1 = (await r1.json()) as { data?: { id: number; name: string; displayName: string }[] };
    const user = j1.data?.[0];
    if (!user) throw new Error("Roblox user not found");

    const r2 = await fetch(`https://users.roblox.com/v1/users/${user.id}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r2.ok)
      throw new Error("Unable to read the Roblox profile right now. Try again in a few seconds.");
    const j2 = (await r2.json()) as { description?: string; created?: string };
    if (!j2.created) throw new Error("Unable to verify the Roblox account age right now.");
    const accountCreatedAt = new Date(j2.created);
    const oneYearAgo = new Date();
    oneYearAgo.setUTCDate(oneYearAgo.getUTCDate() - 365);
    if (Number.isNaN(accountCreatedAt.getTime()) || accountCreatedAt > oneYearAgo) {
      throw new Error("Sua conta Roblox precisa ter pelo menos 1 ano para ser verificada.");
    }
    const bio = (j2.description ?? "").toLowerCase();
    if (!bio.includes(challenge.verify_phrase.toLowerCase())) {
      throw new Error(
        "Phrase not found in your Roblox bio. Save the bio and try again in a few seconds.",
      );
    }

    const { data: taken, error: takenError } = await sb
      .from("profiles")
      .select("id")
      .eq("roblox_user_id", user.id)
      .neq("id", context.userId)
      .maybeSingle();
    rpcError(takenError);
    if (taken) throw new Error("This Roblox account is already linked to another user");

    const { error } = await sb
      .from("profiles")
      .update({
        verified: true,
        roblox_user_id: user.id,
        roblox_username: user.name,
        roblox_display_name: user.displayName,
        roblox_created_at: accountCreatedAt.toISOString(),
      })
      .eq("id", context.userId);
    rpcError(error);
    return { verified: true };
  });

/* ---------- Admin ---------- */
export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ bootstrapSecret: z.string().min(32).max(256) }).parse(d))
  .handler(async ({ data, context }) => {
    const expected = process.env["ADMIN_BOOTSTRAP_SECRET"] ?? "";
    if (!expected || !constantTimeEqual(data.bootstrapSecret, expected)) {
      throw new Error("Invalid bootstrap key");
    }
    const { error } = await (await admin()).rpc("fn_claim_admin", { _user: context.userId });
    rpcError(error);
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
    rpcError(d.error);
    rpcError(w.error);
    rpcError(pool.error);
    const ids = [...new Set([...(d.data ?? []), ...(w.data ?? [])].map((x) => x.user_id))];
    const { data: profs, error: profileError } = ids.length
      ? await sb.from("profiles").select("id, roblox_username, roblox_user_id").in("id", ids)
      : {
          data: [] as { id: string; roblox_username: string; roblox_user_id: number | null }[],
          error: null,
        };
    rpcError(profileError);
    const map = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
    return {
      deposits: (d.data ?? []).map((x) => ({ ...x, profile: map[x.user_id] })),
      withdrawals: (w.data ?? []).map((x) => ({ ...x, profile: map[x.user_id] })),
      pool: pool.data,
    };
  });

export const reviewDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (
      await admin()
    ).rpc("fn_review_deposit", { _id: data.id, _approve: data.approve });
    rpcError(error);
    return { ok: true };
  });

export const reviewWithdraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), paid: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (
      await admin()
    ).rpc("fn_review_withdraw", { _id: data.id, _paid: data.paid });
    rpcError(error);
    return { ok: true };
  });
