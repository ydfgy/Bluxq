BEGIN;

CREATE TABLE IF NOT EXISTS public.market_operation_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL UNIQUE REFERENCES public.positions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  symbol text NOT NULL REFERENCES public.market_pools(symbol) ON DELETE CASCADE,
  borrowed numeric(30,12) NOT NULL CHECK (borrowed >= 0),
  profit_reserve numeric(30,12) NOT NULL CHECK (profit_reserve >= 0),
  total_reserved numeric(30,12) GENERATED ALWAYS AS (borrowed + profit_reserve) STORED,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);
CREATE INDEX IF NOT EXISTS market_operation_reservations_open_idx ON public.market_operation_reservations (symbol, status);
GRANT SELECT ON public.market_operation_reservations TO authenticated;
GRANT ALL ON public.market_operation_reservations TO service_role;
ALTER TABLE public.market_operation_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own operation reservations" ON public.market_operation_reservations;
CREATE POLICY "own operation reservations" ON public.market_operation_reservations FOR SELECT TO authenticated USING (user_id = auth.uid());

INSERT INTO public.market_operation_reservations (position_id, user_id, symbol, borrowed, profit_reserve)
SELECT p.id, p.user_id, p.symbol, p.borrowed, p.reserved FROM public.positions p WHERE p.status = 'open' ON CONFLICT (position_id) DO NOTHING;
DO $$ DECLARE r record; expected numeric; BEGIN FOR r IN SELECT symbol, total_reserved FROM public.market_pools LOOP SELECT coalesce(sum(m.total_reserved) FILTER (WHERE m.status = 'open'), 0) INTO expected FROM public.market_operation_reservations m WHERE m.symbol = r.symbol; IF abs(r.total_reserved - expected) > 0.00000001 THEN RAISE EXCEPTION 'Pool reserve drift for %: pool=% ledger=%', r.symbol, r.total_reserved, expected; END IF; END LOOP; END $$;

CREATE OR REPLACE FUNCTION public.fn_open_position(_user uuid, _symbol text, _side text, _margin numeric, _lev int, _price numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; mp public.market_pools; v_borrowed numeric; v_reserved numeric; v_qty numeric; v_liq numeric; v_id uuid; v_opening_fee numeric; v_staker_fee numeric; v_affiliate_fee numeric; v_platform_fee numeric; v_affiliate uuid; v_ledger_reserved numeric; v_after_assets numeric; v_after_reserved numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND (_user IS NULL OR auth.uid() <> _user) THEN RAISE EXCEPTION 'User mismatch'; END IF;
  IF _side NOT IN ('long','short') THEN RAISE EXCEPTION 'Invalid side'; END IF;
  IF _lev < 1 OR _lev > 50 THEN RAISE EXCEPTION 'Leverage must be between 1x and 50x'; END IF;
  IF _margin IS NULL OR _margin < 10 THEN RAISE EXCEPTION 'Minimum margin is $BX10'; END IF;
  IF _price IS NULL OR _price <= 0 THEN RAISE EXCEPTION 'Price unavailable'; END IF;
  _margin := round(_margin, 2); v_opening_fee := round(_margin * 0.10, 2);
  SELECT * INTO p FROM public.profiles WHERE id = _user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF p.is_banned AND (p.banned_until IS NULL OR p.banned_until > now()) THEN RAISE EXCEPTION 'Sua conta está banida e não pode abrir novas posições'; END IF;
  IF NOT p.verified THEN RAISE EXCEPTION 'Verify your Roblox account first'; END IF;
  IF p.balance < _margin + v_opening_fee THEN RAISE EXCEPTION 'Insufficient balance for margin and opening fee'; END IF;
  SELECT * INTO mp FROM public.market_pools WHERE symbol = _symbol FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pool not found for this market'; END IF;
  SELECT coalesce(sum(r.total_reserved), 0) INTO v_ledger_reserved FROM public.market_operation_reservations r WHERE r.symbol = _symbol AND r.status = 'open';
  IF abs(mp.total_reserved - v_ledger_reserved) > 0.00000001 THEN RAISE EXCEPTION 'Pool reserve ledger mismatch'; END IF;
  v_borrowed := _margin * (_lev - 1); v_reserved := _margin * 5;
  IF v_borrowed + v_reserved > greatest(mp.total_assets - v_ledger_reserved, 0) THEN RAISE EXCEPTION 'Insufficient pool liquidity'; END IF;
  v_qty := (_margin * _lev) / _price;
  IF _side = 'long' THEN v_liq := _price * (1 - 0.75 / _lev); ELSE v_liq := _price * (1 + 0.75 / _lev); END IF;
  v_staker_fee := round(v_opening_fee * 0.40, 2); v_affiliate_fee := round(v_opening_fee * 0.10, 2); v_platform_fee := round(v_opening_fee * 0.50, 2);
  SELECT referred_by INTO v_affiliate FROM public.profiles WHERE id = _user;
  IF v_affiliate IS NULL THEN v_platform_fee := v_platform_fee + v_affiliate_fee; v_affiliate_fee := 0; END IF;
  UPDATE public.profiles SET balance = balance - _margin - v_opening_fee WHERE id = _user;
  v_after_assets := mp.total_assets + CASE WHEN mp.total_shares > 0 THEN v_staker_fee ELSE 0 END;
  v_after_reserved := v_ledger_reserved + v_borrowed + v_reserved;
  IF v_after_reserved > v_after_assets THEN RAISE EXCEPTION 'Pool reserve would exceed assets'; END IF;
  UPDATE public.market_pools SET total_assets = v_after_assets, fees_to_stakers = fees_to_stakers + CASE WHEN total_shares > 0 THEN v_staker_fee ELSE 0 END, total_reserved = v_after_reserved, platform_revenue = platform_revenue + v_platform_fee, updated_at = now() WHERE symbol = _symbol;
  INSERT INTO public.positions (user_id, symbol, side, margin, leverage, borrowed, reserved, qty, entry_price, liq_price, opening_fee) VALUES (_user, _symbol, _side, _margin, _lev, v_borrowed, v_reserved, v_qty, _price, v_liq, v_opening_fee) RETURNING id INTO v_id;
  INSERT INTO public.market_operation_reservations (position_id, user_id, symbol, borrowed, profit_reserve) VALUES (v_id, _user, _symbol, v_borrowed, v_reserved);
  IF v_affiliate IS NOT NULL AND v_affiliate_fee > 0 THEN INSERT INTO public.affiliate_earnings(affiliate_id, referred_user_id, position_id, amount) VALUES (v_affiliate, _user, v_id, v_affiliate_fee); END IF;
  PERFORM public.fn_snapshot_market_pool(_symbol); RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.fn_open_position(uuid,text,text,numeric,int,numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_open_position(uuid,text,text,numeric,int,numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_close_position(_user uuid, _id uuid, _price numeric, _force_liq boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pos public.positions; res public.market_operation_reservations; mp public.market_pools; v_pnl numeric; v_fee numeric := 0; v_payout numeric := 0; v_liq boolean; v_status text; v_stakers numeric; v_platform numeric; v_current_reserved numeric; v_after_reserved numeric; v_after_assets numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND _user IS NOT NULL AND auth.uid() <> _user THEN RAISE EXCEPTION 'User mismatch'; END IF;
  SELECT * INTO pos FROM public.positions WHERE id = _id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Position not found'; END IF;
  IF _user IS NOT NULL AND pos.user_id <> _user THEN RAISE EXCEPTION 'Position not found'; END IF;
  IF _price IS NULL OR _price <= 0 THEN RAISE EXCEPTION 'Price unavailable'; END IF;
  SELECT * INTO res FROM public.market_operation_reservations WHERE position_id = _id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing operation reservation'; END IF;
  SELECT * INTO mp FROM public.market_pools WHERE symbol = pos.symbol FOR UPDATE;
  SELECT coalesce(sum(r.total_reserved), 0) INTO v_current_reserved FROM public.market_operation_reservations r WHERE r.symbol = pos.symbol AND r.status = 'open';
  IF abs(mp.total_reserved - v_current_reserved) > 0.00000001 THEN RAISE EXCEPTION 'Pool reserve ledger mismatch'; END IF;
  IF v_current_reserved < res.total_reserved THEN RAISE EXCEPTION 'Pool reserve underflow'; END IF;
  v_liq := _force_liq OR (pos.side = 'long' AND _price <= pos.liq_price) OR (pos.side = 'short' AND _price >= pos.liq_price);
  IF pos.side = 'long' THEN v_pnl := pos.qty * (_price - pos.entry_price); ELSE v_pnl := pos.qty * (pos.entry_price - _price); END IF;
  IF v_liq THEN v_pnl := trunc(greatest(least(v_pnl, 0), -pos.margin), 2); v_payout := greatest(pos.margin + v_pnl, 0); v_status := 'liquidated'; v_stakers := 0; v_platform := 0;
  ELSE v_pnl := trunc(greatest(least(v_pnl, pos.reserved), -pos.margin), 2); IF v_pnl > 0 THEN v_fee := trunc(v_pnl * 0.10, 2); END IF; v_payout := greatest(pos.margin + v_pnl - v_fee, 0); v_status := 'closed'; v_stakers := CASE WHEN mp.total_shares > 0 THEN trunc(v_fee * 0.7, 2) ELSE 0 END; v_platform := v_fee - v_stakers; END IF;
  v_after_reserved := v_current_reserved - res.total_reserved; v_after_assets := mp.total_assets - v_pnl + v_stakers;
  IF v_after_reserved < 0 OR v_after_reserved > v_after_assets THEN RAISE EXCEPTION 'Pool invariant would be violated'; END IF;
  UPDATE public.market_operation_reservations SET status = 'released', released_at = now() WHERE id = res.id AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation already released'; END IF;
  UPDATE public.market_pools SET total_assets = v_after_assets, total_reserved = v_after_reserved, platform_revenue = platform_revenue + v_platform, fees_to_stakers = fees_to_stakers + v_stakers, updated_at = now() WHERE symbol = pos.symbol;
  UPDATE public.profiles SET balance = balance + v_payout WHERE id = pos.user_id;
  UPDATE public.positions SET status = v_status, exit_price = _price, pnl = v_pnl, fee = v_fee, payout = v_payout, closed_at = now() WHERE id = _id;
  PERFORM public.fn_snapshot_market_pool(pos.symbol); RETURN jsonb_build_object('status', v_status, 'pnl', v_pnl, 'fee', v_fee, 'payout', v_payout);
END; $$;
REVOKE ALL ON FUNCTION public.fn_close_position(uuid,uuid,numeric,boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_close_position(uuid,uuid,numeric,boolean) TO service_role;

DO $$ BEGIN
  IF to_regprocedure('public.fn_stake(uuid,numeric)') IS NOT NULL THEN REVOKE ALL ON FUNCTION public.fn_stake(uuid,numeric) FROM public, anon, authenticated, service_role; END IF;
  IF to_regprocedure('public.fn_unstake(uuid,numeric)') IS NOT NULL THEN REVOKE ALL ON FUNCTION public.fn_unstake(uuid,numeric) FROM public, anon, authenticated, service_role; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_copy_mirror_close_position()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record;
BEGIN
  IF old.status = 'open' AND new.status <> 'open' AND new.exit_price IS NOT NULL AND coalesce(current_setting('app.copy_mirroring', true), 'off') <> 'on' THEN
    FOR l IN SELECT p.id FROM public.copy_position_links c JOIN public.positions p ON p.id = c.copied_position_id WHERE c.leader_position_id = new.id AND p.status = 'open' LOOP
      PERFORM set_config('app.copy_mirroring', 'on', true);
      PERFORM public.fn_close_position(NULL, l.id, new.exit_price, new.status = 'liquidated');
      PERFORM set_config('app.copy_mirroring', 'off', true);
      UPDATE public.copy_trade_events SET status = 'closed' WHERE copied_position_id = l.id AND status = 'copied';
    END LOOP;
  END IF;
  RETURN new;
END; $$;
REVOKE ALL ON FUNCTION public.fn_copy_mirror_close_position() FROM public, anon, authenticated;

COMMIT;
