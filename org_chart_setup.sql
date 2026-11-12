-- PLK KPI 조직관리용 단일 조직도 문서.
-- Supabase SQL Editor에서 한 번 실행합니다. 기존 KPI 데이터에는 영향을 주지 않습니다.
BEGIN;
CREATE TABLE IF NOT EXISTS public.kpi_org_chart (
 id integer PRIMARY KEY CHECK (id = 1),
 nodes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(nodes) = 'array'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kpi_org_chart ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kpi_org_chart FROM PUBLIC, anon, authenticated;
-- Login-free viewers may read the saved organization. Only owner/shared admins can write.
GRANT SELECT ON public.kpi_org_chart TO anon;
GRANT SELECT, INSERT, UPDATE ON public.kpi_org_chart TO authenticated;
DROP POLICY IF EXISTS kpi_org_select ON public.kpi_org_chart;
DROP POLICY IF EXISTS kpi_org_insert ON public.kpi_org_chart;
DROP POLICY IF EXISTS kpi_org_update ON public.kpi_org_chart;
CREATE POLICY kpi_org_select ON public.kpi_org_chart FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY kpi_org_insert ON public.kpi_org_chart FOR INSERT TO authenticated
 WITH CHECK ((public.kpi_my_access()->>'role') IN ('owner','shared'));
CREATE POLICY kpi_org_update ON public.kpi_org_chart FOR UPDATE TO authenticated
 USING ((public.kpi_my_access()->>'role') IN ('owner','shared'))
 WITH CHECK ((public.kpi_my_access()->>'role') IN ('owner','shared'));
COMMIT;
