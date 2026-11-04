-- PLK KPI 지사별 관리자 권한 변경 (기존 행사 데이터 보존)
-- Supabase SQL Editor에서 전체 실행. 기존 viewer_setup.sql은 다시 실행하지 마세요.
-- 사전 조건: viewer_setup.sql을 실행해 최고관리자(kpi_owner_settings)가 지정된 상태.
BEGIN;

DO $guard$
BEGIN
  IF (SELECT count(*) FROM public.kpi_owner_settings) <> 1 THEN
    RAISE EXCEPTION '최고관리자 정보가 하나가 아닙니다. kpi_owner_settings를 먼저 확인하세요.';
  END IF;
  IF to_regclass('public.kpi_events') IS NULL OR to_regclass('public.kpi_public_events') IS NULL THEN
    RAISE EXCEPTION '기존 KPI 테이블이 없습니다. viewer_setup.sql 적용 여부를 확인하세요.';
  END IF;
END $guard$;

CREATE TABLE IF NOT EXISTS public.kpi_branch_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  branch text NOT NULL CHECK (branch IN ('부산 1지사','부산 2지사','부산 3지사','부산 4지사','부산권역')),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.kpi_branch_admins FROM PUBLIC, anon, authenticated;
ALTER TABLE public.kpi_branch_admins ENABLE ROW LEVEL SECURITY;

-- 로그인한 계정이 실제로 접근할 수 있는 권한을 서버에서 판별.
CREATE OR REPLACE FUNCTION public.kpi_my_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $body$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.kpi_owner_settings o WHERE o.admin_id = (SELECT auth.uid()))
      THEN jsonb_build_object('role','owner','branch',null)
    WHEN EXISTS (SELECT 1 FROM public.kpi_branch_admins b WHERE b.user_id = (SELECT auth.uid()))
      THEN (SELECT jsonb_build_object('role','branch','branch',b.branch) FROM public.kpi_branch_admins b WHERE b.user_id = (SELECT auth.uid()))
    ELSE jsonb_build_object('role','none','branch',null)
  END;
$body$;
REVOKE ALL ON FUNCTION public.kpi_my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_my_access() TO authenticated;

CREATE OR REPLACE FUNCTION public.kpi_my_branch()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $body$
  SELECT b.branch FROM public.kpi_branch_admins b WHERE b.user_id = (SELECT auth.uid())
  AND NOT EXISTS (SELECT 1 FROM public.kpi_owner_settings o WHERE o.admin_id = (SELECT auth.uid()));
$body$;
REVOKE ALL ON FUNCTION public.kpi_my_branch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_my_branch() TO authenticated;

-- 사용자 생성/초대는 Supabase Authentication > Users에서만 수행.
-- 최고관리자는 로그인한 홈페이지에서 기존 사용자에게 담당 지사 권한을 지정/회수할 수 있음.
CREATE OR REPLACE FUNCTION public.kpi_manage_branch_admin(p_email text,p_branch text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $body$
DECLARE target_id uuid; owner_id uuid; normalized_email text := lower(trim(p_email));
BEGIN
  IF NOT public.kpi_is_admin() THEN RAISE EXCEPTION '최고관리자만 권한을 변경할 수 있습니다.'; END IF;
  IF normalized_email IS NULL OR length(normalized_email) = 0 THEN RAISE EXCEPTION '이메일 주소를 입력하세요.'; END IF;
  SELECT id INTO target_id FROM auth.users WHERE lower(email)=normalized_email LIMIT 1;
  IF target_id IS NULL THEN RAISE EXCEPTION '등록된 로그인 계정이 없습니다. Supabase Authentication에서 먼저 사용자를 초대하거나 생성하세요.'; END IF;
  SELECT admin_id INTO owner_id FROM public.kpi_owner_settings LIMIT 1;
  IF target_id=owner_id THEN RAISE EXCEPTION '최고관리자 계정은 지사 관리자로 변경할 수 없습니다.'; END IF;
  IF p_branch IS NULL THEN
    DELETE FROM public.kpi_branch_admins WHERE user_id=target_id;
    RETURN jsonb_build_object('email',normalized_email,'removed',true);
  END IF;
  IF p_branch NOT IN ('부산 1지사','부산 2지사','부산 3지사','부산 4지사','부산권역')
     OR p_branch IS NULL THEN RAISE EXCEPTION '허용된 지사를 선택하세요.'; END IF;
  INSERT INTO public.kpi_branch_admins(user_id,branch)
    VALUES(target_id,p_branch)
    ON CONFLICT(user_id) DO UPDATE SET branch=EXCLUDED.branch;
  RETURN jsonb_build_object('email',normalized_email,'branch',p_branch);
END;
$body$;
REVOKE ALL ON FUNCTION public.kpi_manage_branch_admin(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_manage_branch_admin(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.kpi_list_branch_admins()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $body$
DECLARE result jsonb;
BEGIN
  IF NOT public.kpi_is_admin() THEN RAISE EXCEPTION '최고관리자만 계정 목록을 조회할 수 있습니다.'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('email',u.email,'branch',b.branch) ORDER BY b.branch,u.email),'[]'::jsonb)
    INTO result FROM public.kpi_branch_admins b JOIN auth.users u ON u.id=b.user_id;
  RETURN result;
END;
$body$;
REVOKE ALL ON FUNCTION public.kpi_list_branch_admins() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_list_branch_admins() TO authenticated;

-- 행 보안: 최고관리자 전체 / 지사 관리자는 branch가 일치하는 행사만.
ALTER TABLE public.kpi_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kpi_admin_only ON public.kpi_events;
DROP POLICY IF EXISTS kpi_role_select ON public.kpi_events;
DROP POLICY IF EXISTS kpi_role_insert ON public.kpi_events;
DROP POLICY IF EXISTS kpi_role_update ON public.kpi_events;
DROP POLICY IF EXISTS kpi_role_delete ON public.kpi_events;
REVOKE ALL ON public.kpi_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_events TO authenticated;
CREATE POLICY kpi_role_select ON public.kpi_events FOR SELECT TO authenticated
  USING (public.kpi_is_admin() OR (public.kpi_my_branch() IS NOT NULL AND event_data->>'branch'=public.kpi_my_branch()));
CREATE POLICY kpi_role_insert ON public.kpi_events FOR INSERT TO authenticated
  WITH CHECK (
    (public.kpi_is_admin() AND user_id=(SELECT auth.uid()))
    OR (public.kpi_my_branch() IS NOT NULL AND user_id=(SELECT auth.uid()) AND event_data->>'branch'=public.kpi_my_branch())
  );
CREATE POLICY kpi_role_update ON public.kpi_events FOR UPDATE TO authenticated
  USING (public.kpi_is_admin() OR (public.kpi_my_branch() IS NOT NULL AND event_data->>'branch'=public.kpi_my_branch()))
  WITH CHECK (public.kpi_is_admin() OR (public.kpi_my_branch() IS NOT NULL AND event_data->>'branch'=public.kpi_my_branch()));
CREATE POLICY kpi_role_delete ON public.kpi_events FOR DELETE TO authenticated
  USING (public.kpi_is_admin() OR (public.kpi_my_branch() IS NOT NULL AND event_data->>'branch'=public.kpi_my_branch()));

-- 지사 관리자는 다른 계정 소유의 기존 행사를 수정할 때 소유자/식별자를 변경할 수 없음.
CREATE OR REPLACE FUNCTION public.kpi_protect_event_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $body$
BEGIN
  IF NOT public.kpi_is_admin() AND (OLD.id IS DISTINCT FROM NEW.id OR OLD.user_id IS DISTINCT FROM NEW.user_id) THEN
    RAISE EXCEPTION '지사 관리자는 기존 행사의 소유자와 식별자를 변경할 수 없습니다.';
  END IF;
  RETURN NEW;
END;
$body$;
DROP TRIGGER IF EXISTS kpi_identity_guard ON public.kpi_events;
CREATE TRIGGER kpi_identity_guard BEFORE UPDATE ON public.kpi_events
FOR EACH ROW EXECUTE FUNCTION public.kpi_protect_event_identity();

-- 종전 공개 뷰어 동기화는 최고관리자 행사만 반영하므로 지사 관리자 행사까지 확대.
-- viewer_setup.sql에서 만든 공개 항목 허용목록(kpi_public_payload)을 그대로 재사용.
CREATE OR REPLACE FUNCTION public.kpi_sync_viewer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $body$
BEGIN
  IF TG_OP='DELETE' THEN
    DELETE FROM public.kpi_public_events WHERE id=OLD.id::text;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND OLD.id::text IS DISTINCT FROM NEW.id::text THEN
    DELETE FROM public.kpi_public_events WHERE id=OLD.id::text;
  END IF;
  INSERT INTO public.kpi_public_events(id,event_data)
    VALUES(NEW.id::text, public.kpi_public_payload(NEW.event_data))
    ON CONFLICT(id) DO UPDATE SET event_data=EXCLUDED.event_data;
  RETURN NEW;
END;
$body$;
-- 기존 kpi_public_sync 트리거는 유지하며 함수만 업데이트.
-- 기존 이벤트도 새 공개용 함수 기준으로 다시 동기화하되 원본은 변경하지 않음.
INSERT INTO public.kpi_public_events(id,event_data)
  SELECT e.id::text,public.kpi_public_payload(e.event_data) FROM public.kpi_events e
  ON CONFLICT(id) DO UPDATE SET event_data=EXCLUDED.event_data;
COMMIT;

-- 사용 순서:
-- 1. 이 SQL 전체 실행
-- 2. Supabase > Authentication > Users에서 새 관리자 계정 초대/생성
-- 3. 기존 최고관리자 계정으로 PLK KPI 로그인
-- 4. 화면의 [지사 관리자 권한]에서 이메일 + 담당 지사 등록
-- 5. 추가 관리자는 자기 계정으로 로그인해 지사 행사만 관리
