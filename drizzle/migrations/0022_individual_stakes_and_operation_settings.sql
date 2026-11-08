BEGIN;

CREATE TABLE IF NOT EXISTS public.operation_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  stake_min_amount numeric(20,2) NOT NULL DEFAULT 1 CHECK (stake_min_amount > 0),
  stake_min_lock_days integer NOT NULL DEFAULT 1 CHECK (stake_min_lock_days >= 0),
  stake_max_lock_days integer NOT NULL DEFAULT 365 CHECK (stake_max_lock_days >= stake_min_lock_days),
  stake_default_lock_days integer NOT NULL DEFAULT 30 CHECK (stake_default_lock_days between stake_min_lock_days and stake_max_lock_days),
  stake_allow_early_withdrawal boolean NOT NULL DEFAULT false,
  ranking_min_trades integer NOT NULL DEFAULT 1 CHECK (ranking_min_trades >= 1),
  ranking_min_pnl numeric(20,2) NOT NULL DEFAULT 0,
  ranking_limit integer NOT NULL DEFAULT 10 CHECK (ranking_limit between 3 and 50),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.operation_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.operation_settings TO authenticated;
GRANT ALL ON public.operation_settings TO service_role;
ALTER TABLE public.operation_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated read operation settings" ON public.operation_settings;
CREATE POLICY "authenticated read operation settings"
  ON public.operation_settings FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.market_stake_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  symbol text NOT NULL REFERENCES public.market_pools(symbol) ON DELETE CASCADE,
  shares numeric(30,12) NOT NULL CHECK (shares > 0),
  principal numeric(20,2) NOT NULL CHECK (principal > 0),
  lock_days integer NOT NULL CHECK (lock_days >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  unlocks_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at timestamptz,
  close_value numeric(20,2),
  close_pnl numeric(20,2),
  close_pnl_percent numeric(20,8)
);

CREATE INDEX IF NOT EXISTS market_stake_positions_user_idx
  ON public.market_stake_positions (user_id, symbol, status, started_at DESC);
CREATE INDEX IF NOT EXISTS market_stake_positions_unlock_idx
  ON public.market_stake_positions (unlocks_at) WHERE status = 'open';
GRANT SELECT ON public.market_stake_positions TO authenticated;
GRANT ALL ON public.market_stake_positions TO service_role;
ALTER TABLE public.market_stake_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own market stake positions" ON public.market_stake_positions;
CREATE POLICY "own market stake positions"
  ON public.market_stake_positions FOR SELECT TO authenticated using (user_id = auth.uid());

-- Preserve existing aggregate stakes as immediately available legacy positions.
INSERT INTO public.market_stake_positions
  (user_id, symbol, shares, principal, lock_days, started_at, unlocks_at)
SELECT s.user_id, s.symbol, s.shares, s.deposited, 0,
       coalesce(s.started_at, now()), coalesce(s.started_at, now())
FROM public.market_stakes s
WHERE s.shares > 0
  AND s.deposited > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.market_stake_positions p
    WHERE p.user_id = s.user_id AND p.symbol = s.symbol AND p.status = 'open'
  );

CREATE OR REPLACE FUNCTION public.fn_get_operation_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'stake_min_amount', stake_min_amount,
    'stake_min_lock_days', stake_min_lock_days,
    'stake_max_lock_days', stake_max_lock_days,
    'stake_default_lock_days', stake_default_lock_days,
    'stake_allow_early_withdrawal', stake_allow_early_withdrawal,
    'ranking_min_trades', ranking_min_trades,
    'ranking_min_pnl', ranking_min_pnl,
    'ranking_limit', ranking_limit
  )
  FROM public.operation_settings WHERE id = true;
$$;
REVOKE ALL ON FUNCTION public.fn_get_operation_settings() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_operation_settings() TO service_role;

DROP FUNCTION IF EXISTS public.fn_market_stake(uuid, text, numeric);
DROP FUNCTION IF EXISTS public.fn_market_stake(uuid, text, numeric, integer);
CREATE FUNCTION public.fn_market_stake(_user uuid, _symbol text, _amount numeric, _lock_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.profiles;
  pool public.market_pools;
  cfg public.operation_settings;
  v_amount numeric;
  v_nav numeric;
  v_shares numeric;
  v_id uuid;
BEGIN
  IF _user IS NULL OR _symbol IS NULL OR _amount IS NULL OR _lock_days IS NULL THEN
    RAISE EXCEPTION 'Invalid Stake request';
  END IF;
  SELECT * INTO cfg FROM public.operation_settings WHERE id = true;
  v_amount := round(_amount, 2);
  IF v_amount < cfg.stake_min_amount THEN
    RAISE EXCEPTION 'Minimum stake is $BX%', cfg.stake_min_amount;
  END IF;
  IF _lock_days < cfg.stake_min_lock_days OR _lock_days > cfg.stake_max_lock_days THEN
    RAISE EXCEPTION 'Lock period must be between % and % days', cfg.stake_min_lock_days, cfg.stake_max_lock_days;
  END IF;
  SELECT * INTO p FROM public.profiles WHERE id = _user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF p.is_banned AND (p.banned_until IS NULL OR p.banned_until > now()) THEN
    RAISE EXCEPTION 'Sua conta está banida e não pode fazer stake';
  END IF;
  IF NOT p.verified THEN RAISE EXCEPTION 'Verify your Roblox account first'; END IF;
  IF p.balance < v_amount THEN RAISE EXCEPTION 'Insufficient balance. Add funds in Wallet first.'; END IF;
  SELECT * INTO pool FROM public.market_pools WHERE symbol = _symbol FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pool not found for this market'; END IF;
  v_nav := CASE WHEN pool.total_shares > 0 AND pool.total_assets > 0
    THEN pool.total_assets / pool.total_shares ELSE 1 END;
  v_shares := v_amount / v_nav;
  UPDATE public.profiles SET balance = balance - v_amount WHERE id = _user;
  UPDATE public.market_pools
    SET total_assets = total_assets + v_amount,
        total_shares = total_shares + v_shares,
        updated_at = now()
    WHERE symbol = _symbol;
  INSERT INTO public.market_stakes (user_id, symbol, shares, deposited)
  VALUES (_user, _symbol, v_shares, v_amount)
  ON CONFLICT (user_id, symbol) DO UPDATE SET
    shares = market_stakes.shares + excluded.shares,
    deposited = market_stakes.deposited + excluded.deposited,
    last_reward_at = now();
  INSERT INTO public.market_stake_positions
    (user_id, symbol, shares, principal, lock_days, started_at, unlocks_at)
  VALUES (_user, _symbol, v_shares, v_amount, _lock_days, now(), now() + make_interval(days => _lock_days))
  RETURNING id INTO v_id;
  INSERT INTO public.market_stake_events (user_id, symbol, action, amount, shares, nav)
    VALUES (_user, _symbol, 'stake', v_amount, v_shares, v_nav);
  PERFORM public.fn_snapshot_market_pool(_symbol);
  RETURN jsonb_build_object('id', v_id, 'symbol', _symbol, 'action', 'stake', 'amount', v_amount,
    'shares', v_shares, 'nav', v_nav, 'lock_days', _lock_days);
END;
$$;

CREATE FUNCTION public.fn_market_stake(_user uuid, _symbol text, _amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_days integer;
BEGIN
  SELECT stake_default_lock_days INTO v_days FROM public.operation_settings WHERE id = true;
  RETURN public.fn_market_stake(_user, _symbol, _amount, v_days);
END;
$$;

DROP FUNCTION IF EXISTS public.fn_market_unstake(uuid, text, numeric);
DROP FUNCTION IF EXISTS public.fn_market_unstake(uuid, uuid);
CREATE FUNCTION public.fn_market_unstake(_user uuid, _position uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pos public.market_stake_positions;
  pool public.market_pools;
  cfg public.operation_settings;
  v_nav numeric;
  v_value numeric;
  v_pnl numeric;
  v_pnl_percent numeric;
BEGIN
  SELECT * INTO cfg FROM public.operation_settings WHERE id = true;
  SELECT * INTO pos FROM public.market_stake_positions
    WHERE id = _position AND user_id = _user AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stake position not found'; END IF;
  IF NOT cfg.stake_allow_early_withdrawal AND now() < pos.unlocks_at THEN
    RAISE EXCEPTION 'This stake is locked until %', to_char(pos.unlocks_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI UTC');
  END IF;
  SELECT * INTO pool FROM public.market_pools WHERE symbol = pos.symbol FOR UPDATE;
  IF pool.total_shares <= 0 THEN RAISE EXCEPTION 'Pool has no shares'; END IF;
  v_nav := pool.total_assets / pool.total_shares;
  v_value := trunc(pos.shares * v_nav, 2);
  IF v_value <= 0 THEN RAISE EXCEPTION 'Stake value is unavailable'; END IF;
  IF v_value > greatest(pool.total_assets - pool.total_reserved, 0) THEN
    RAISE EXCEPTION 'Liquidity is reserved by open positions. Available now: $BX%',
      trunc(greatest(pool.total_assets - pool.total_reserved, 0), 2);
  END IF;
  v_pnl := v_value - pos.principal;
  v_pnl_percent := CASE WHEN pos.principal > 0 THEN (v_pnl / pos.principal) * 100 ELSE 0 END;
  UPDATE public.market_stake_positions
    SET status = 'closed', closed_at = now(), close_value = v_value,
        close_pnl = v_pnl, close_pnl_percent = v_pnl_percent
    WHERE id = pos.id;
  UPDATE public.market_stakes
    SET shares = greatest(shares - pos.shares, 0),
        deposited = greatest(deposited - pos.principal, 0), last_reward_at = now()
    WHERE user_id = _user AND symbol = pos.symbol;
  UPDATE public.market_pools
    SET total_assets = total_assets - v_value,
        total_shares = greatest(total_shares - pos.shares, 0), updated_at = now()
    WHERE symbol = pos.symbol;
  UPDATE public.profiles SET balance = balance + v_value WHERE id = _user;
  INSERT INTO public.market_stake_events (user_id, symbol, action, amount, shares, nav)
    VALUES (_user, pos.symbol, 'unstake', v_value, pos.shares, v_nav);
  PERFORM public.fn_snapshot_market_pool(pos.symbol);
  RETURN jsonb_build_object('id', pos.id, 'symbol', pos.symbol, 'action', 'unstake',
    'amount', v_value, 'pnl', v_pnl, 'pnl_percent', v_pnl_percent, 'nav', v_nav);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_market_stake(uuid,text,numeric) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_market_stake(uuid,text,numeric,integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_market_unstake(uuid,uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_market_stake(uuid,text,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_market_stake(uuid,text,numeric,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_market_unstake(uuid,uuid) TO service_role;

-- Configurable ranking: only eligible verified traders, with stable Top 10 ordering.
CREATE OR REPLACE FUNCTION public.fn_copy_leaderboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg public.operation_settings;
BEGIN
  SELECT * INTO cfg FROM public.operation_settings WHERE id = true;
  INSERT INTO public.copy_trader_opt_ins(trader_id, show_public_name, is_active)
  SELECT DISTINCT pos.user_id, true, true
  FROM public.positions pos JOIN public.profiles prof ON prof.id = pos.user_id
  WHERE prof.verified = true AND (prof.is_banned = false OR prof.banned_until <= now())
    AND pos.status IN ('closed','liquidated') AND pos.pnl IS NOT NULL AND pos.closed_at IS NOT NULL
  ON CONFLICT (trader_id) DO UPDATE SET is_active = true, show_public_name = true;
  RETURN (
    WITH closed AS (
      SELECT i.trader_id, i.public_id, i.show_public_name, p.roblox_display_name, p.roblox_username,
             pos.id, pos.symbol, pos.pnl, pos.closed_at
      FROM public.copy_trader_opt_ins i JOIN public.profiles p ON p.id = i.trader_id
      JOIN public.positions pos ON pos.user_id = i.trader_id
      WHERE p.verified = true AND i.is_active = true
        AND (p.is_banned = false OR p.banned_until <= now())
        AND pos.status IN ('closed','liquidated') AND pos.pnl IS NOT NULL AND pos.closed_at IS NOT NULL
    ), summary AS (
      SELECT trader_id, max(public_id) public_id, bool_or(show_public_name) show_public_name,
             max(roblox_display_name) roblox_display_name, max(roblox_username) roblox_username,
             sum(pnl) total_pnl, count(*) trades, count(*) FILTER (WHERE pnl > 0) wins
      FROM closed GROUP BY trader_id HAVING count(*) >= cfg.ranking_min_trades AND sum(pnl) >= cfg.ranking_min_pnl
    ), rows AS (
      SELECT s.*, round(s.total_pnl,2) pnl,
        round(100.0 * s.wins / nullif(s.trades,0),1) win_rate,
        (SELECT x.symbol FROM closed x WHERE x.trader_id=s.trader_id GROUP BY x.symbol ORDER BY sum(x.pnl) DESC, count(*) DESC, x.symbol LIMIT 1) best_symbol,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('symbol', z.symbol, 'pnl', round(z.pnl,2), 'trades', z.trades) ORDER BY z.pnl DESC), '[]'::jsonb) FROM (SELECT x.symbol, sum(x.pnl) pnl, count(*) trades FROM closed x WHERE x.trader_id=s.trader_id GROUP BY x.symbol) z) symbols,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('value', q.running_pnl) ORDER BY q.closed_at,q.id), '[]'::jsonb) FROM (SELECT y.id,y.closed_at,y.running_pnl FROM (SELECT x.id,x.closed_at,round(sum(x.pnl) over(order by x.closed_at,x.id rows unbounded preceding),2) running_pnl FROM closed x WHERE x.trader_id=s.trader_id) y ORDER BY y.closed_at DESC,y.id DESC LIMIT 30) q)
        curve
      FROM summary s
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', public_id, 'displayName', CASE WHEN show_public_name THEN coalesce(nullif(roblox_display_name,''), nullif(roblox_username,''), 'Trader') ELSE 'Trader ' || upper(substr(md5(trader_id::text),1,6)) END, 'pnl', pnl, 'trades', trades, 'winRate', win_rate, 'bestSymbol', best_symbol, 'symbols', symbols, 'curve', curve) ORDER BY pnl DESC, trades DESC, trader_id) , '[]'::jsonb)
    FROM (SELECT * FROM rows ORDER BY pnl DESC, trades DESC, trader_id LIMIT cfg.ranking_limit) ranked
  );
END;
$$;
REVOKE ALL ON FUNCTION public.fn_copy_leaderboard() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_copy_leaderboard() TO service_role;

COMMIT;
