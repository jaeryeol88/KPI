-- PLK KPI 조직원 연락처/재직상태 (비공개).
-- 조직도와 분리: 공개뷰어에는 연락처가 노출되지 않으며, 관리자만 조회/수정.
-- org_chart_setup.sql, team_admin_setup.sql 설치 후 SQL Editor에서 한 번 실행.
BEGIN;
CREATE TABLE IF NOT EXISTS public.kpi_org_staff_contacts (
 node_id text PRIMARY KEY,
 phone text NOT NULL DEFAULT '',
 employment_status text NOT NULL DEFAULT '재직' CHECK (employment_status IN ('재직','휴직','퇴사')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kpi_org_staff_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kpi_org_staff_contacts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_org_staff_contacts TO authenticated;
DROP POLICY IF EXISTS kpi_org_staff_select ON public.kpi_org_staff_contacts;
DROP POLICY IF EXISTS kpi_org_staff_insert ON public.kpi_org_staff_contacts;
DROP POLICY IF EXISTS kpi_org_staff_update ON public.kpi_org_staff_contacts;
DROP POLICY IF EXISTS kpi_org_staff_delete ON public.kpi_org_staff_contacts;
CREATE POLICY kpi_org_staff_select ON public.kpi_org_staff_contacts FOR SELECT TO authenticated
 USING ((public.kpi_my_access()->>'role') IN ('owner','shared'));
CREATE POLICY kpi_org_staff_insert ON public.kpi_org_staff_contacts FOR INSERT TO authenticated
 WITH CHECK ((public.kpi_my_access()->>'role') IN ('owner','shared'));
CREATE POLICY kpi_org_staff_update ON public.kpi_org_staff_contacts FOR UPDATE TO authenticated
 USING ((public.kpi_my_access()->>'role') IN ('owner','shared'))
 WITH CHECK ((public.kpi_my_access()->>'role') IN ('owner','shared'));
CREATE POLICY kpi_org_staff_delete ON public.kpi_org_staff_contacts FOR DELETE TO authenticated
 USING ((public.kpi_my_access()->>'role') IN ('owner','shared'));
COMMIT;
