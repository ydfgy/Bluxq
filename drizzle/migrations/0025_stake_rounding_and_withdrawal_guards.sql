BEGIN;

CREATE OR REPLACE FUNCTION public.fn_market_stake(_user uuid, _symbol text, _amount numeric, _lock_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; pool public.market_pools; cfg public.operation_settings; v_amount numeric; v_nav numeric; v_shares numeric; v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND (_user IS NULL OR auth.uid() <> _user) THEN RAISE EXCEPTION 'User mismatch'; END IF;
  IF _user IS NULL OR _symbol IS NULL OR _amount IS NULL OR _lock_days IS NULL THEN RAISE EXCEPTION 'Invalid Stake request'; END IF;
  SELECT * INTO cfg FROM public.operation_settings WHERE id = true;
  v_amount := round(_amount, 2);
  IF v_amount < cfg.stake_min_amount THEN RAISE EXCEPTION 'Minimum stake is $BX%', cfg.stake_min_amount; END IF;
  IF _lock_days < cfg.stake_min_lock_days OR _lock_days > cfg.stake_max_lock_days THEN RAISE EXCEPTION 'Lock period must be between % and % days', cfg.stake_min_lock_days, cfg.stake_max_lock_days; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = _user FOR UPDATE;
  IF NOT FOUND OR NOT p.verified THEN RAISE EXCEPTION 'Verified profile required'; END IF;
  IF p.is_banned AND (p.banned_until IS NULL OR p.banned_until > now()) THEN RAISE EXCEPTION 'Sua conta está banida e não pode fazer stake'; END IF;
  IF p.balance < v_amount THEN RAISE EXCEPTION 'Insufficient balance. Add funds in Wallet first.'; END IF;
  SELECT * INTO pool FROM public.market_pools WHERE symbol = _symbol FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pool not found for this market'; END IF;
  v_nav := CASE WHEN pool.total_shares > 0 AND pool.total_assets > 0 THEN pool.total_assets / pool.total_shares ELSE 1 END;
  v_shares := round(v_amount / v_nav, 12);
  IF v_shares <= 0 THEN RAISE EXCEPTION 'Stake amount is too small'; END IF;
  UPDATE public.profiles SET balance = balance - v_amount WHERE id = _user;
  UPDATE public.market_pools SET total_assets = total_assets + v_amount, total_shares = total_shares + v_shares, updated_at = now() WHERE symbol = _symbol;
  INSERT INTO public.market_stakes(user_id, symbol, shares, deposited) VALUES (_user, _symbol, v_shares, v_amount)
    ON CONFLICT (user_id, symbol) DO UPDATE SET shares = market_stakes.shares + excluded.shares, deposited = market_stakes.deposited + excluded.deposited, last_reward_at = now();
  INSERT INTO public.market_stake_positions(user_id, symbol, shares, principal, lock_days, started_at, unlocks_at) VALUES (_user, _symbol, v_shares, v_amount, _lock_days, now(), now() + make_interval(days => _lock_days)) RETURNING id INTO v_id;
  INSERT INTO public.market_stake_events(user_id, symbol, action, amount, shares, nav) VALUES (_user, _symbol, 'stake', v_amount, v_shares, v_nav);
  PERFORM public.fn_snapshot_market_pool(_symbol);
  RETURN jsonb_build_object('id', v_id, 'symbol', _symbol, 'action', 'stake', 'amount', v_amount, 'shares', v_shares, 'nav', v_nav, 'lock_days', _lock_days);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_market_stake(_user uuid, _symbol text, _amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_days integer;
BEGIN SELECT stake_default_lock_days INTO v_days FROM public.operation_settings WHERE id = true; RETURN public.fn_market_stake(_user, _symbol, _amount, v_days); END;
$$;

CREATE OR REPLACE FUNCTION public.fn_market_unstake(_user uuid, _position uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pos public.market_stake_positions; pool public.market_pools; cfg public.operation_settings; agg public.market_stakes; v_nav numeric; v_value numeric; v_pnl numeric; v_pnl_percent numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND (_user IS NULL OR auth.uid() <> _user) THEN RAISE EXCEPTION 'User mismatch'; END IF;
  SELECT * INTO cfg FROM public.operation_settings WHERE id = true;
  SELECT * INTO pos FROM public.market_stake_positions WHERE id = _position AND user_id = _user AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stake position not found'; END IF;
  IF NOT cfg.stake_allow_early_withdrawal AND now() < pos.unlocks_at THEN RAISE EXCEPTION 'This stake is still locked'; END IF;
  SELECT * INTO pool FROM public.market_pools WHERE symbol = pos.symbol FOR UPDATE;
  SELECT * INTO agg FROM public.market_stakes WHERE user_id = _user AND symbol = pos.symbol FOR UPDATE;
  IF NOT FOUND OR agg.shares + 0.00000001 < pos.shares THEN RAISE EXCEPTION 'Stake share ledger mismatch'; END IF;
  IF pool.total_shares + 0.00000001 < pos.shares OR pool.total_shares <= 0 THEN RAISE EXCEPTION 'Pool share ledger mismatch'; END IF;
  v_nav := pool.total_assets / pool.total_shares; v_value := trunc(pos.shares * v_nav, 2);
  IF v_value <= 0 OR v_value > greatest(pool.total_assets - pool.total_reserved, 0) THEN RAISE EXCEPTION 'Insufficient free pool liquidity'; END IF;
  v_pnl := v_value - pos.principal; v_pnl_percent := CASE WHEN pos.principal > 0 THEN (v_pnl / pos.principal) * 100 ELSE 0 END;
  UPDATE public.market_stake_positions SET status = 'closed', closed_at = now(), close_value = v_value, close_pnl = v_pnl, close_pnl_percent = v_pnl_percent WHERE id = pos.id AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'Stake position already closed'; END IF;
  UPDATE public.market_stakes SET shares = shares - pos.shares, deposited = greatest(deposited - pos.principal, 0), last_reward_at = now() WHERE user_id = _user AND symbol = pos.symbol;
  UPDATE public.market_pools SET total_assets = total_assets - v_value, total_shares = total_shares - pos.shares, updated_at = now() WHERE symbol = pos.symbol;
  UPDATE public.profiles SET balance = balance + v_value WHERE id = _user;
  INSERT INTO public.market_stake_events(user_id, symbol, action, amount, shares, nav) VALUES (_user, pos.symbol, 'unstake', v_value, pos.shares, v_nav);
  PERFORM public.fn_snapshot_market_pool(pos.symbol);
  RETURN jsonb_build_object('id', pos.id, 'symbol', pos.symbol, 'action', 'unstake', 'amount', v_value, 'pnl', v_pnl, 'pnl_percent', v_pnl_percent, 'nav', v_nav);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_market_stake(uuid,text,numeric) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_market_stake(uuid,text,numeric,integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_market_unstake(uuid,uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_market_stake(uuid,text,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_market_stake(uuid,text,numeric,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_market_unstake(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_request_withdraw_v2(_user uuid, _amount numeric, _payout_method text, _asset text DEFAULT NULL, _network text DEFAULT NULL, _destination text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; v_amount numeric; v_asset text; v_network text; v_destination text;
BEGIN
  IF auth.uid() IS NOT NULL AND (_user IS NULL OR auth.uid() <> _user) THEN RAISE EXCEPTION 'User mismatch'; END IF;
  IF _payout_method NOT IN ('roblox', 'crypto') THEN RAISE EXCEPTION 'Método de saque inválido'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Valor de saque inválido'; END IF;
  v_amount := round(_amount, 2);
  IF v_amount < 60 THEN RAISE EXCEPTION 'Saque mínimo $BX60'; END IF;
  v_asset := nullif(trim(_asset), ''); v_network := nullif(trim(_network), ''); v_destination := nullif(trim(_destination), '');
  IF _payout_method = 'crypto' AND (v_asset IS NULL OR v_network IS NULL OR v_destination IS NULL) THEN RAISE EXCEPTION 'Informe moeda, rede e endereço de destino'; END IF;
  IF v_asset IS NOT NULL AND (length(v_asset) > 24 OR v_asset !~ '^[A-Za-z0-9._-]+$') THEN RAISE EXCEPTION 'Moeda inválida'; END IF;
  IF v_network IS NOT NULL AND (length(v_network) > 32 OR v_network !~ '^[A-Za-z0-9._ -]+$') THEN RAISE EXCEPTION 'Rede inválida'; END IF;
  IF v_destination IS NOT NULL AND (length(v_destination) > 256 OR v_destination ~ '[[:space:]]') THEN RAISE EXCEPTION 'Destino inválido'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = _user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;
  IF NOT p.verified THEN RAISE EXCEPTION 'Verifique sua conta Roblox primeiro'; END IF;
  IF p.balance < v_amount THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;
  UPDATE public.profiles SET balance = balance - v_amount WHERE id = _user;
  INSERT INTO public.withdrawals(user_id, amount, payout_method, asset, network, destination) VALUES (_user, v_amount, _payout_method, v_asset, v_network, v_destination);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_request_withdraw_v2(uuid,numeric,text,text,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_request_withdraw_v2(uuid,numeric,text,text,text,text) TO service_role;

COMMIT;
