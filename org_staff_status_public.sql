-- PLK KPI: viewer-safe employment status projection.
-- Execute ONCE in Supabase SQL Editor after org_staff_setup.sql.
-- Only node_id and employment_status are publicly readable.
-- Phone numbers and underlying private-table privileges remain unchanged.
BEGIN;
CREATE OR REPLACE VIEW public.kpi_org_staff_public_status
WITH (security_barrier = true)
AS
SELECT
  node_id,
  employment_status
FROM public.kpi_org_staff_contacts;
REVOKE ALL ON public.kpi_org_staff_public_status FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kpi_org_staff_public_status TO anon, authenticated;
COMMIT;
