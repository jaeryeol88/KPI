-- Execute once in Supabase SQL Editor for existing installations.
-- Makes org chart visible in all public/branch viewers, without granting edits.
BEGIN;
GRANT SELECT ON public.kpi_org_chart TO anon;
DROP POLICY IF EXISTS kpi_org_select ON public.kpi_org_chart;
CREATE POLICY kpi_org_select ON public.kpi_org_chart FOR SELECT TO anon, authenticated USING (true);
COMMIT;
