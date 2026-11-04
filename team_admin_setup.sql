-- PLK KPI 전체 공동 관리자 + 지사별 관리자 (기존 행사 데이터 보존)
-- Supabase SQL Editor에서 전체 실행. 기존 viewer_setup.sql은 다시 실행하지 마세요.
-- branch_admin_setup.sql 실행 여부와 관계없이 적용 가능. 계정/행사 원본 삭제 없음.
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

-- 공동 관리자는 최고관리자가 지정한 로그인 사용자만 허용.
CREATE TABLE IF NOT EXISTS public.kpi_shared_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.kpi_shared_admins FROM PUBLIC, anon, authenticated;
ALTER TABLE public.kpi_shared_admins ENABLE ROW LEVEL SECURITY;

-- 로그인한 계정이 실제로 접근할 수 있는 권한을 서버에서 판별.
CREATE OR REPLACE FUNCTION public.kpi_my_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $body$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.kpi_owner_settings o WHERE o.admin_id = (SELECT auth.uid()))
      THEN jsonb_build_object('role','owner','branch',null)
    WHEN EXISTS (SELECT 1 FROM public.kpi_shared_admins s WHERE s.user_id = (SELECT auth.uid()))
      THEN jsonb_build_object('role','shared','branch',null)
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

-- 계정은 Supabase Authentication > Users에서 만든 후 최고관리자만 역할을 부여함.
-- p_role: shared(전체 공동), branch(지사), revoke(권한 회수)
CREATE OR REPLACE FUNCTION public.kpi_manage_team_admin(p_email text,p_role text,p_branch text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $body$
DECLARE target_id uuid; owner_id uuid; normalized_email text := lower(trim(p_email));
BEGIN
  IF NOT public.kpi_is_admin() THEN RAISE EXCEPTION '최고관리자만 권한을 변경할 수 있습니다.'; END IF;
  IF normalized_email IS NULL OR length(normalized_email)=0 THEN RAISE EXCEPTION '이메일 주소를 입력하세요.'; END IF;
  IF p_role NOT IN ('shared','branch','revoke') OR p_role IS NULL THEN RAISE EXCEPTION '유효하지 않은 관리자 역할입니다.'; END IF;
  SELECT id INTO target_id FROM auth.users WHERE lower(email)=normalized_email LIMIT 1;
  IF target_id IS NULL THEN RAISE EXCEPTION '등록된 계정이 없습니다. Supabase Authentication에서 먼저 사용자를 초대하거나 생성하세요.'; END IF;
  SELECT admin_id INTO owner_id FROM public.kpi_owner_settings LIMIT 1;
  IF target_id=owner_id THEN RAISE EXCEPTION '최고관리자 계정은 변경할 수 없습니다.'; END IF;
  IF p_role='branch' AND (p_branch IS NULL OR p_branch NOT IN ('부산 1지사','부산 2지사','부산 3지사','부산 4지사','부산권역'))
  THEN RAISE EXCEPTION '유효한 담당 지사를 선택하세요.'; END IF;
  IF p_role='shared' THEN
    DELETE FROM public.kpi_branch_admins WHERE user_id=target_id;
    INSERT INTO public.kpi_shared_admins(user_id) VALUES(target_id) ON CONFLICT(user_id) DO NOTHING;
  ELSIF p_role='branch' THEN
    DELETE FROM public.kpi_shared_admins WHERE user_id=target_id;
    INSERT INTO public.kpi_branch_admins(user_id,branch) VALUES(target_id,p_branch)
      ON CONFLICT(user_id) DO UPDATE SET branch=EXCLUDED.branch;
  ELSE
    DELETE FROM public.kpi_shared_admins WHERE user_id=target_id;
    DELETE FROM public.kpi_branch_admins WHERE user_id=target_id;
  END IF;
  RETURN jsonb_build_object('email',normalized_email,'role',p_role,'branch',CASE WHEN p_role='branch' THEN p_branch ELSE NULL END);
END;
$body$;
REVOKE ALL ON FUNCTION public.kpi_manage_team_admin(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_manage_team_admin(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.kpi_list_team_admins()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $body$
DECLARE result jsonb;
BEGIN
  IF NOT public.kpi_is_admin() THEN RAISE EXCEPTION '최고관리자만 계정 목록을 조회할 수 있습니다.'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('email',x.email,'role',x.role,'branch',x.branch) ORDER BY x.role,x.email),'[]'::jsonb)
  INTO result FROM (
    SELECT u.email,'shared'::text role,NULL::text branch FROM public.kpi_shared_admins a JOIN auth.users u ON a.user_id=u.id
    UNION ALL
    SELECT u.email,'branch'::text role,b.branch FROM public.kpi_branch_admins b JOIN auth.users u ON b.user_id=u.id
  ) x;
  RETURN result;
END;
$body$;
REVOKE ALL ON FUNCTION public.kpi_list_team_admins() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_list_team_admins() TO authenticated;

-- 이전 지사 관리자 전용 RPC를 남겨두면 역할 전환에 혼선을 줄 수 있어 실행 권한 철회.
DO $remove_old$
BEGIN
  IF to_regprocedure('public.kpi_manage_branch_admin(text,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.kpi_manage_branch_admin(text,text) FROM PUBLIC, anon, authenticated';
  END IF;
END $remove_old$;

-- 행 보안: 최고관리자 및 공동관리자 전체 / 지사 관리자는 branch가 일치하는 행사만.
ALTER TABLE public.kpi_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kpi_admin_only ON public.kpi_events;
DROP POLICY IF EXISTS kpi_role_select ON public.kpi_events;
DROP POLICY IF EXISTS kpi_role_insert ON public.kpi_events;
DROP POLICY IF EXISTS kpi_role_update ON public.kpi_events;
DROP POLICY IF EXISTS kpi_role_delete ON public.kpi_events;
REVOKE ALL ON public.kpi_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_events TO authenticated;
CREATE POLICY kpi_role_select ON public.kpi_events FOR SELECT TO authenticated
  USING ((public.kpi_my_access()->>'role') IN ('owner','shared') OR (public.kpi_my_branch() IS NOT NULL AND event_data->>'branch'=public.kpi_my_branch()));
CREATE POLICY kpi_role_insert ON public.kpi_events FOR INSERT TO authenticated
  WITH CHECK (
    ((public.kpi_my_access()->>'role') IN ('owner','shared') AND user_id=(SELECT auth.uid()))
    OR (public.kpi_my_branch() IS NOT NULL AND user_id=(SELECT auth.uid()) AND event_data->>'branch'=public.kpi_my_branch())
  );
CREATE POLICY kpi_role_update ON public.kpi_events FOR UPDATE TO authenticated
  USING ((public.kpi_my_access()->>'role') IN ('owner','shared') OR (public.kpi_my_branch() IS NOT NULL AND event_data->>'branch'=public.kpi_my_branch()))
  WITH CHECK ((public.kpi_my_access()->>'role') IN ('owner','shared') OR (public.kpi_my_branch() IS NOT NULL AND event_data->>'branch'=public.kpi_my_branch()));
CREATE POLICY kpi_role_delete ON public.kpi_events FOR DELETE TO authenticated
  USING ((public.kpi_my_access()->>'role') IN ('owner','shared') OR (public.kpi_my_branch() IS NOT NULL AND event_data->>'branch'=public.kpi_my_branch()));

-- 지사 관리자는 다른 계정 소유의 기존 행사를 수정할 때 소유자/식별자를 변경할 수 없음.
CREATE OR REPLACE FUNCTION public.kpi_protect_event_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $body$
BEGIN
  IF (public.kpi_my_access()->>'role') <> 'owner' AND (OLD.id IS DISTINCT FROM NEW.id OR OLD.user_id IS DISTINCT FROM NEW.user_id) THEN
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
-- 1. 이 SQL 전체 실행 (기존 행사는 보존)
-- 2. Supabase > Authentication > Users에서 공동 관리자 이메일 계정을 초대/생성
-- 3. 최고관리자 로그인 후 [관리자 권한]에서 [전체 공동 관리자]를 선택하고 등록
-- 4. 공동 관리자는 자신의 계정으로 로그인하여 모든 행사 등록/수정/삭제 가능
