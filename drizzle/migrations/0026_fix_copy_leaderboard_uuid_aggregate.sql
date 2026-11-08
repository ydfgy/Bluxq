BEGIN;

-- PostgreSQL does not provide max(uuid). public_id is stable per trader, so
-- aggregate its text representation and cast the deterministic value back.
CREATE OR REPLACE FUNCTION public.fn_copy_leaderboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg public.operation_settings;
BEGIN
  SELECT * INTO cfg FROM public.operation_settings WHERE id = true;
  RETURN (
    WITH opted AS (
      SELECT i.trader_id, i.public_id, i.show_public_name, p.roblox_display_name, p.roblox_username
      FROM public.copy_trader_opt_ins i
      JOIN public.profiles p ON p.id = i.trader_id
      WHERE p.verified = true
        AND i.is_active = true
        AND (p.is_banned = false OR p.banned_until <= now())
    ), closed AS (
      SELECT o.trader_id, o.public_id, o.show_public_name, o.roblox_display_name, o.roblox_username,
             pos.id, pos.symbol, pos.pnl, pos.closed_at
      FROM opted o
      JOIN public.positions pos ON pos.user_id = o.trader_id
      WHERE pos.status IN ('closed','liquidated')
        AND pos.pnl IS NOT NULL
        AND pos.closed_at IS NOT NULL
    ), summary AS (
      SELECT trader_id,
        min(public_id::text)::uuid public_id,
        bool_or(show_public_name) show_public_name,
        max(roblox_display_name) roblox_display_name,
        max(roblox_username) roblox_username,
        sum(pnl) total_pnl,
        count(*) trades,
        count(*) FILTER (WHERE pnl > 0) wins
      FROM closed
      GROUP BY trader_id
      HAVING count(*) >= cfg.ranking_min_trades
         AND sum(pnl) >= cfg.ranking_min_pnl
    ), rows AS (
      SELECT s.*, round(s.total_pnl, 2) pnl,
        round(100.0 * s.wins / nullif(s.trades, 0), 1) win_rate,
        (SELECT x.symbol FROM closed x WHERE x.trader_id = s.trader_id
         GROUP BY x.symbol ORDER BY sum(x.pnl) DESC, count(*) DESC, x.symbol LIMIT 1) best_symbol,
        (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'symbol', z.symbol, 'pnl', round(z.pnl, 2), 'trades', z.trades
        ) ORDER BY z.pnl DESC), '[]'::jsonb)
         FROM (SELECT x.symbol, sum(x.pnl) pnl, count(*) trades
               FROM closed x WHERE x.trader_id = s.trader_id GROUP BY x.symbol) z) symbols,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('value', q.running_pnl)
          ORDER BY q.closed_at, q.id), '[]'::jsonb)
         FROM (SELECT y.id, y.closed_at, y.running_pnl FROM
           (SELECT x.id, x.closed_at,
              round(sum(x.pnl) OVER (ORDER BY x.closed_at, x.id ROWS UNBOUNDED PRECEDING), 2) running_pnl
            FROM closed x WHERE x.trader_id = s.trader_id) y
           ORDER BY y.closed_at DESC, y.id DESC LIMIT 30) q) curve
      FROM summary s
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', public_id,
      'displayName', CASE WHEN show_public_name
        THEN coalesce(nullif(roblox_display_name, ''), nullif(roblox_username, ''), 'Trader')
        ELSE 'Trader ' || upper(substr(md5(trader_id::text), 1, 6)) END,
      'pnl', pnl, 'trades', trades, 'winRate', win_rate,
      'bestSymbol', best_symbol, 'symbols', symbols, 'curve', curve
    ) ORDER BY pnl DESC, trades DESC, trader_id), '[]'::jsonb)
    FROM (SELECT * FROM rows ORDER BY pnl DESC, trades DESC, trader_id LIMIT cfg.ranking_limit) ranked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_copy_leaderboard() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_copy_leaderboard() TO service_role;

COMMIT;
