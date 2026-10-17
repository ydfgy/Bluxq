-- Defense in depth: enforce financial invariants at the database boundary.
-- NOT VALID preserves legacy rows while enforcing all future writes.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'positions_symbol_allowed') then
    alter table public.positions
      add constraint positions_symbol_allowed
      check (symbol in ('BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','TONUSDT'))
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'positions_financial_values_valid') then
    alter table public.positions
      add constraint positions_financial_values_valid
      check (
        margin > 0 and leverage between 1 and 50 and borrowed >= 0 and reserved > 0
        and qty > 0 and entry_price > 0 and liq_price > 0
      )
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pool_financial_values_valid') then
    alter table public.pool
      add constraint pool_financial_values_valid
      check (total_assets >= 0 and total_shares >= 0 and total_reserved >= 0 and platform_revenue >= 0 and fees_to_stakers >= 0)
      not valid;
  end if;
end $$;
