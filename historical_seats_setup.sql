-- Past-month seat-only reporting. Run once in Supabase SQL Editor.
-- Does not edit events, signups, live goal tables, or revenue.
BEGIN;
CREATE TABLE IF NOT EXISTS public.kpi_historical_seats (
 branch text NOT NULL CHECK (branch IN ('부산 1지사','부산 2지사','부산 3지사','부산 4지사','부산권역')),
 division text NOT NULL DEFAULT '',
 manager text NOT NULL DEFAULT '',
 goal_year integer NOT NULL CHECK (goal_year BETWEEN 2020 AND 2100),
 goal_month integer NOT NULL CHECK (goal_month BETWEEN 1 AND 12),
 target_seats integer CHECK (target_seats BETWEEN 0 AND 1000000),
 actual_seats numeric(12,1) CHECK (actual_seats BETWEEN 0 AND 1000000),
 employment_status text NOT NULL DEFAULT '재직' CHECK (employment_status IN ('재직','계약해지')),

 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (branch,division,manager,goal_year,goal_month),
 CONSTRAINT historical_hierarchy CHECK ((division='' AND manager='') OR (division<>'' AND length(trim(division))>0)),
 CONSTRAINT historical_not_empty CHECK (target_seats IS NOT NULL OR actual_seats IS NOT NULL)
);
ALTER TABLE public.kpi_historical_seats ALTER COLUMN actual_seats TYPE numeric(12,1) USING actual_seats::numeric(12,1);
ALTER TABLE public.kpi_historical_seats ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT '재직';

ALTER TABLE public.kpi_historical_seats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kpi_historical_seats FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.kpi_historical_seats TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE ON public.kpi_historical_seats TO authenticated;
DROP POLICY IF EXISTS historical_seats_read ON public.kpi_historical_seats;
DROP POLICY IF EXISTS historical_seats_insert ON public.kpi_historical_seats;
DROP POLICY IF EXISTS historical_seats_update ON public.kpi_historical_seats;
DROP POLICY IF EXISTS historical_seats_delete ON public.kpi_historical_seats;
CREATE POLICY historical_seats_read ON public.kpi_historical_seats FOR SELECT TO anon,authenticated USING (true);
CREATE POLICY historical_seats_insert ON public.kpi_historical_seats FOR INSERT TO authenticated WITH CHECK ((public.kpi_my_access()->>'role') IN ('owner','shared'));
CREATE POLICY historical_seats_update ON public.kpi_historical_seats FOR UPDATE TO authenticated USING ((public.kpi_my_access()->>'role') IN ('owner','shared')) WITH CHECK ((public.kpi_my_access()->>'role') IN ('owner','shared'));
CREATE POLICY historical_seats_delete ON public.kpi_historical_seats FOR DELETE TO authenticated USING ((public.kpi_my_access()->>'role') IN ('owner','shared'));

-- Contract cancellations are an independent category and NEVER count as active seats.
-- Excel does not include affiliations, so cancellation rows are kept separately by name/month.
CREATE TABLE IF NOT EXISTS public.kpi_historical_cancellations (
 manager text NOT NULL,
 goal_year integer NOT NULL CHECK (goal_year BETWEEN 2020 AND 2100),
 goal_month integer NOT NULL CHECK (goal_month BETWEEN 1 AND 12),
 cancelled_seats numeric(12,1) NOT NULL CHECK (cancelled_seats BETWEEN 0 AND 1000000),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (manager,goal_year,goal_month)
);
ALTER TABLE public.kpi_historical_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kpi_historical_cancellations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.kpi_historical_cancellations TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE ON public.kpi_historical_cancellations TO authenticated;
DROP POLICY IF EXISTS historical_cancellations_read ON public.kpi_historical_cancellations;
DROP POLICY IF EXISTS historical_cancellations_insert ON public.kpi_historical_cancellations;
DROP POLICY IF EXISTS historical_cancellations_update ON public.kpi_historical_cancellations;
DROP POLICY IF EXISTS historical_cancellations_delete ON public.kpi_historical_cancellations;
CREATE POLICY historical_cancellations_read ON public.kpi_historical_cancellations FOR SELECT TO anon,authenticated USING (true);
CREATE POLICY historical_cancellations_insert ON public.kpi_historical_cancellations FOR INSERT TO authenticated WITH CHECK ((public.kpi_my_access()->>'role') IN ('owner','shared'));
CREATE POLICY historical_cancellations_update ON public.kpi_historical_cancellations FOR UPDATE TO authenticated USING ((public.kpi_my_access()->>'role') IN ('owner','shared')) WITH CHECK ((public.kpi_my_access()->>'role') IN ('owner','shared'));
CREATE POLICY historical_cancellations_delete ON public.kpi_historical_cancellations FOR DELETE TO authenticated USING ((public.kpi_my_access()->>'role') IN ('owner','shared'));
COMMIT;
