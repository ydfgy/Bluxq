BEGIN;

-- Account moderation state. A NULL banned_until with is_banned=true means permanent ban.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_until timestamptz,
  ADD COLUMN IF NOT EXISTS ban_reason text;

CREATE INDEX IF NOT EXISTS profiles_ban_lookup_idx
  ON public.profiles (is_banned, banned_until);

-- The standalone admin panel is the only caller allowed to change moderation state.
CREATE OR REPLACE FUNCTION public.fn_set_user_ban(
  _user uuid,
  _is_banned boolean,
  _banned_until timestamptz,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user IS NULL THEN
    RAISE EXCEPTION 'Usuário inválido';
  END IF;

  UPDATE public.profiles
  SET is_banned = COALESCE(_is_banned, false),
      banned_until = CASE WHEN COALESCE(_is_banned, false) THEN _banned_until ELSE NULL END,
      ban_reason = CASE
        WHEN COALESCE(_is_banned, false) THEN NULLIF(left(trim(COALESCE(_reason, '')), 300), '')
        ELSE NULL
      END
  WHERE id = _user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  IF COALESCE(_is_banned, false) THEN
    -- Stop new copy allocations from following a moderated account immediately.
    UPDATE public.copy_allocations
    SET is_active = false, updated_at = now()
    WHERE trader_id = _user OR copier_id = _user;
    UPDATE public.copy_trader_opt_ins
    SET is_active = false
    WHERE trader_id = _user;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_set_user_ban(uuid, boolean, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_user_ban(uuid, boolean, timestamptz, text)
  TO service_role;

-- A moderated account cannot create new positions or stakes through a stale session.
CREATE OR REPLACE FUNCTION public.fn_open_position(
  _user uuid, _symbol text, _side text, _margin numeric, _lev int, _price numeric
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.profiles;
  mp public.market_pools;
  v_borrowed numeric;
  v_reserved numeric;
  v_qty numeric;
  v_liq numeric;
  v_id uuid;
  v_opening_fee numeric;
  v_staker_fee numeric;
  v_affiliate_fee numeric;
  v_platform_fee numeric;
  v_affiliate uuid;
BEGIN
  IF _side NOT IN ('long','short') THEN RAISE EXCEPTION 'Invalid side'; END IF;
  IF _lev < 1 OR _lev > 50 THEN RAISE EXCEPTION 'Leverage must be between 1x and 50x'; END IF;
  IF _margin < 10 THEN RAISE EXCEPTION 'Minimum margin is $BX10'; END IF;
  IF _price IS NULL OR _price <= 0 THEN RAISE EXCEPTION 'Price unavailable'; END IF;
  _margin := round(_margin, 2);
  v_opening_fee := round(_margin * 0.10, 2);

  SELECT * INTO p FROM public.profiles WHERE id = _user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF p.is_banned AND (p.banned_until IS NULL OR p.banned_until > now()) THEN
    RAISE EXCEPTION 'Sua conta está banida e não pode abrir novas posições';
  END IF;
  IF NOT p.verified THEN RAISE EXCEPTION 'Verify your Roblox account first'; END IF;
  IF p.balance < _margin + v_opening_fee THEN
    RAISE EXCEPTION 'Insufficient balance for margin and opening fee';
  END IF;
  SELECT * INTO mp FROM public.market_pools WHERE symbol = _symbol FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pool not found for this market'; END IF;

  v_borrowed := _margin * (_lev - 1);
  v_reserved := _margin * 5;
  IF v_borrowed + v_reserved > greatest(mp.total_assets - mp.total_reserved, 0) THEN
    RAISE EXCEPTION 'Insufficient pool liquidity';
  END IF;
  v_qty := (_margin * _lev) / _price;
  IF _side = 'long' THEN v_liq := _price * (1 - 0.9 / _lev);
  ELSE v_liq := _price * (1 + 0.9 / _lev); END IF;

  v_staker_fee := round(v_opening_fee * 0.40, 2);
  v_affiliate_fee := round(v_opening_fee * 0.10, 2);
  v_platform_fee := round(v_opening_fee * 0.50, 2);
  SELECT referred_by INTO v_affiliate FROM public.profiles WHERE id = _user;
  IF v_affiliate IS NULL THEN
    v_platform_fee := v_platform_fee + v_affiliate_fee;
    v_affiliate_fee := 0;
  END IF;

  UPDATE public.profiles SET balance = balance - _margin - v_opening_fee WHERE id = _user;
  UPDATE public.market_pools
    SET total_assets = total_assets + CASE WHEN total_shares > 0 THEN v_staker_fee ELSE 0 END,
        fees_to_stakers = fees_to_stakers + CASE WHEN total_shares > 0 THEN v_staker_fee ELSE 0 END,
        total_reserved = total_reserved + v_borrowed + v_reserved,
        platform_revenue = platform_revenue + v_platform_fee,
        updated_at = now()
    WHERE symbol = _symbol;
  INSERT INTO public.positions (
    user_id, symbol, side, margin, leverage, borrowed, reserved,
    qty, entry_price, liq_price, opening_fee
  ) VALUES (
    _user, _symbol, _side, _margin, _lev, v_borrowed, v_reserved,
    v_qty, _price, v_liq, v_opening_fee
  ) RETURNING id INTO v_id;

  IF v_affiliate IS NOT NULL AND v_affiliate_fee > 0 THEN
    INSERT INTO public.affiliate_earnings(affiliate_id, referred_user_id, position_id, amount)
    VALUES (v_affiliate, _user, v_id, v_affiliate_fee);
  END IF;
  PERFORM public.fn_snapshot_market_pool(_symbol);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_open_position(uuid,text,text,numeric,int,numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_open_position(uuid,text,text,numeric,int,numeric)
  TO service_role;

-- Ranking is automatic: verified users with closed trades are eligible without a toggle.
CREATE OR REPLACE FUNCTION public.fn_copy_leaderboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.copy_trader_opt_ins(trader_id, show_public_name, is_active)
  SELECT DISTINCT pos.user_id, true, true
  FROM public.positions pos
  JOIN public.profiles prof ON prof.id = pos.user_id
  WHERE prof.verified = true
    AND (prof.is_banned = false OR (prof.is_banned = true AND prof.banned_until IS NOT NULL AND prof.banned_until <= now()))
    AND pos.status IN ('closed', 'liquidated')
    AND pos.pnl IS NOT NULL
    AND pos.closed_at IS NOT NULL
  ON CONFLICT (trader_id) DO UPDATE
    SET is_active = true, show_public_name = true;

  RETURN (
    WITH opted AS (
      SELECT i.trader_id, i.public_id, p.roblox_username, p.roblox_display_name
      FROM public.copy_trader_opt_ins i
      JOIN public.profiles p ON p.id = i.trader_id
      WHERE p.verified = true
        AND i.is_active = true
        AND (p.is_banned = false OR (p.is_banned = true AND p.banned_until IS NOT NULL AND p.banned_until <= now()))
    ), closed AS (
      SELECT o.trader_id, pos.id, pos.symbol, pos.pnl, pos.closed_at
      FROM opted o
      JOIN public.positions pos ON pos.user_id = o.trader_id
      WHERE pos.status IN ('closed','liquidated')
        AND pos.pnl IS NOT NULL
        AND pos.closed_at IS NOT NULL
    ), summary AS (
      SELECT trader_id, sum(pnl) AS total_pnl, count(*) AS trades,
             count(*) FILTER (WHERE pnl > 0) AS wins
      FROM closed
      GROUP BY trader_id
      HAVING count(*) > 0
    ), rows AS (
      SELECT s.trader_id, o.public_id,
        coalesce(nullif(o.roblox_username, ''), nullif(o.roblox_display_name, ''), 'Trader') AS display_name,
        round(s.total_pnl, 2) AS pnl, s.trades,
        round(100.0 * s.wins / nullif(s.trades, 0), 1) AS win_rate,
        (SELECT x.symbol FROM closed x WHERE x.trader_id = s.trader_id
         GROUP BY x.symbol ORDER BY sum(x.pnl) DESC, count(*) DESC, x.symbol LIMIT 1) AS best_symbol,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('symbol', z.symbol, 'pnl', round(z.pnl, 2), 'trades', z.trades) ORDER BY z.pnl DESC), '[]'::jsonb)
         FROM (SELECT x.symbol, sum(x.pnl) pnl, count(*) trades FROM closed x
               WHERE x.trader_id = s.trader_id GROUP BY x.symbol) z) AS symbols,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('value', q.running_pnl) ORDER BY q.closed_at, q.id), '[]'::jsonb)
         FROM (SELECT y.id, y.closed_at, y.running_pnl FROM
               (SELECT x.id, x.closed_at, round(sum(x.pnl) OVER (ORDER BY x.closed_at, x.id ROWS UNBOUNDED PRECEDING), 2) running_pnl
                FROM closed x WHERE x.trader_id = s.trader_id) y
               ORDER BY y.closed_at DESC, y.id DESC LIMIT 30) q) AS curve
      FROM summary s JOIN opted o ON o.trader_id = s.trader_id
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', public_id, 'displayName', display_name, 'pnl', pnl, 'trades', trades,
      'winRate', win_rate, 'bestSymbol', best_symbol, 'symbols', symbols, 'curve', curve
    ) ORDER BY pnl DESC, trades DESC), '[]'::jsonb)
    FROM (SELECT * FROM rows ORDER BY pnl DESC, trades DESC LIMIT 5) top_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_copy_leaderboard() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_copy_leaderboard() TO service_role;

COMMIT;
