-- 009_drop_no_arg_kpi_signatures.sql
-- Drop the zero-arg KPI function signatures left over from migration 005.
-- Migration 008 replaced their behaviour with two-arg signatures
-- (kpi_overview(p_filter, p_since)) but Postgres function overloading kept
-- the zero-arg versions alive in parallel. The two-arg signatures with their
-- defaults cover everything the zero-arg versions did
-- (kpi_overview('all', null) is equivalent to the original kpi_overview()),
-- so the zero-arg ones are dead code and just add advisor noise.

drop function if exists public.kpi_overview();
drop function if exists public.kpi_drop_off_by_tier();
drop function if exists public.kpi_retention();

notify pgrst, 'reload schema';
