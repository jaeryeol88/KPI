-- PLK KPI 월별 지사 구좌목표 설정
-- Supabase SQL Editor에서 1회 실행 (기존 행사 및 공개 뷰어 데이터는 수정하지 않습니다.)
BEGIN;
CREATE TABLE IF NOT EXISTS public.kpi_monthly_targets (
  branch text NOT NULL CHECK (branch IN ('부산 1지사','부산 2지사','부산 3지사','부산 4지사','부산권역')),
  goal_year integer NOT NULL CHECK (goal_year BETWEEN 2020 AND 2100),
  goal_month integer NOT NULL CHECK (goal_month BETWEEN 1 AND 12),
  target_seats integer NOT NULL CHECK (target_seats BETWEEN 0 AND 1000000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (branch,goal_year,goal_month)
);
ALTER TABLE public.kpi_monthly_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kpi_monthly_targets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kpi_monthly_targets TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE ON public.kpi_monthly_targets TO authenticated;
DROP POLICY IF EXISTS kpi_monthly_target_read ON public.kpi_monthly_targets;
DROP POLICY IF EXISTS kpi_monthly_target_insert ON public.kpi_monthly_targets;
DROP POLICY IF EXISTS kpi_monthly_target_update ON public.kpi_monthly_targets;
DROP POLICY IF EXISTS kpi_monthly_target_delete ON public.kpi_monthly_targets;
CREATE POLICY kpi_monthly_target_read ON public.kpi_monthly_targets
FOR SELECT TO anon,authenticated USING (true);
CREATE POLICY kpi_monthly_target_insert ON public.kpi_monthly_targets
FOR INSERT TO authenticated WITH CHECK (
  public.kpi_my_access()->>'role' IN ('owner','shared')
  OR (public.kpi_my_access()->>'role'='branch' AND branch=public.kpi_my_access()->>'branch')
);
CREATE POLICY kpi_monthly_target_update ON public.kpi_monthly_targets
FOR UPDATE TO authenticated
USING (public.kpi_my_access()->>'role' IN ('owner','shared')
  OR (public.kpi_my_access()->>'role'='branch' AND branch=public.kpi_my_access()->>'branch'))
WITH CHECK (public.kpi_my_access()->>'role' IN ('owner','shared')
  OR (public.kpi_my_access()->>'role'='branch' AND branch=public.kpi_my_access()->>'branch'));
CREATE POLICY kpi_monthly_target_delete ON public.kpi_monthly_targets
FOR DELETE TO authenticated USING (
 public.kpi_my_access()->>'role' IN ('owner','shared')
 OR (public.kpi_my_access()->>'role'='branch' AND branch=public.kpi_my_access()->>'branch')
);
COMMIT;
-- 참고: 목표는 로그인 사용자만 쓰고, 공개 뷰어는 조회만 할 수 있습니다.
