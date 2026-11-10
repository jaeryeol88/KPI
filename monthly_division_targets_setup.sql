-- PLK KPI 회사 배정 본부별 월 구좌 목표 (지사 전체 목표와 별도 관리)
-- 먼저 monthly_targets_setup.sql을 실행한 뒤 이 SQL을 한 번 실행하세요.
-- 기존 행사 또는 지사별 목표 데이터를 변경하지 않습니다.
BEGIN;
CREATE TABLE IF NOT EXISTS public.kpi_monthly_division_targets (
  branch text NOT NULL CHECK (branch IN ('부산 1지사','부산 2지사','부산 3지사','부산 4지사','부산권역')),
  division text NOT NULL CHECK (division IN ('1본부','2본부','3본부','지사장','기타')),
  goal_year integer NOT NULL CHECK (goal_year BETWEEN 2020 AND 2100),
  goal_month integer NOT NULL CHECK (goal_month BETWEEN 1 AND 12),
  target_seats integer NOT NULL CHECK (target_seats BETWEEN 0 AND 1000000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (branch,division,goal_year,goal_month)
);
ALTER TABLE public.kpi_monthly_division_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kpi_monthly_division_targets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kpi_monthly_division_targets TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE ON public.kpi_monthly_division_targets TO authenticated;
DROP POLICY IF EXISTS kpi_month_div_read ON public.kpi_monthly_division_targets;
DROP POLICY IF EXISTS kpi_month_div_insert ON public.kpi_monthly_division_targets;
DROP POLICY IF EXISTS kpi_month_div_update ON public.kpi_monthly_division_targets;
DROP POLICY IF EXISTS kpi_month_div_delete ON public.kpi_monthly_division_targets;
CREATE POLICY kpi_month_div_read ON public.kpi_monthly_division_targets
 FOR SELECT TO anon,authenticated USING (true);
CREATE POLICY kpi_month_div_insert ON public.kpi_monthly_division_targets
 FOR INSERT TO authenticated WITH CHECK (
  (public.kpi_my_access()->>'role') IN ('owner','shared')
 );
CREATE POLICY kpi_month_div_update ON public.kpi_monthly_division_targets
 FOR UPDATE TO authenticated
 USING ((public.kpi_my_access()->>'role') IN ('owner','shared'))
 WITH CHECK ((public.kpi_my_access()->>'role') IN ('owner','shared'));
CREATE POLICY kpi_month_div_delete ON public.kpi_monthly_division_targets
 FOR DELETE TO authenticated USING ((public.kpi_my_access()->>'role') IN ('owner','shared'));
COMMIT;
-- 지사 전체 목표와 본부 목표는 각각 독립적으로 표시하며 합산하지 않습니다.
