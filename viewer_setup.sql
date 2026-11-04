-- PLK KPI: 공개 뷰어용 읽기 전용 데이터 분리 / 관리자만 원본 변경
-- 주의: 실행 후 뷰어 링크를 가진 누구나 행사비용/매출/메모까지 볼 수 있습니다.
-- Supabase SQL Editor에서 한 번 실행하세요. 전체 작업은 트랜잭션으로 처리됩니다.
BEGIN;

CREATE TABLE IF NOT EXISTS public.kpi_owner_settings (
  admin_id uuid PRIMARY KEY
);
REVOKE ALL ON public.kpi_owner_settings FROM PUBLIC, anon, authenticated;

DO $setup$
DECLARE
  user_count integer;
  only_user uuid;
BEGIN
  SELECT count(*) INTO user_count FROM auth.users;
  SELECT id INTO only_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF user_count <> 1 THEN
    RAISE EXCEPTION '관리자 안전 확인 중단: Supabase Authentication 사용자가 정확히 1명이어야 합니다. 현재 %명. 관리자 UUID를 확인해 별도 설정이 필요합니다.', user_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.kpi_owner_settings WHERE admin_id <> only_user) THEN
    RAISE EXCEPTION '기존 관리자와 현재 인증 사용자 정보가 다릅니다. 관리자 설정을 확인하세요.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.kpi_events WHERE user_id <> only_user) THEN
    RAISE EXCEPTION '다른 계정 소유의 행사가 존재합니다. 공개 범위를 검토한 뒤 진행하세요.';
  END IF;
  INSERT INTO public.kpi_owner_settings(admin_id) VALUES (only_user)
  ON CONFLICT (admin_id) DO NOTHING;
END
$setup$;

CREATE OR REPLACE FUNCTION public.kpi_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.kpi_owner_settings
    WHERE admin_id = (SELECT auth.uid())
  );
$function$;
REVOKE ALL ON FUNCTION public.kpi_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_is_admin() TO authenticated;

-- 원본 kpi_events는 인증한 관리자 한 명만 조회/생성/수정/삭제할 수 있게 강제.
ALTER TABLE public.kpi_events ENABLE ROW LEVEL SECURITY;
DO $policies$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='kpi_events'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.kpi_events', p.policyname);
  END LOOP;
END
$policies$;
REVOKE ALL ON public.kpi_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_events TO authenticated;
CREATE POLICY kpi_admin_only ON public.kpi_events
  FOR ALL TO authenticated
  USING (public.kpi_is_admin() AND user_id = (SELECT auth.uid()))
  WITH CHECK (public.kpi_is_admin() AND user_id = (SELECT auth.uid()));

-- 공개용 테이블은 user_id / 비밀번호 / 로그인 세션을 복제하지 않음.
CREATE TABLE IF NOT EXISTS public.kpi_public_events (
  id text PRIMARY KEY,
  event_data jsonb NOT NULL
);
ALTER TABLE public.kpi_public_events ENABLE ROW LEVEL SECURITY;
DO $public_policies$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='kpi_public_events'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.kpi_public_events', p.policyname);
  END LOOP;
END
$public_policies$;
REVOKE ALL ON public.kpi_public_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kpi_public_events TO anon, authenticated;
CREATE POLICY kpi_viewer_select ON public.kpi_public_events
  FOR SELECT TO anon, authenticated USING (true);

-- 노출할 필드만 허용 목록 방식으로 선택해서 공개.
CREATE OR REPLACE FUNCTION public.kpi_public_payload(raw jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $payload$
  SELECT jsonb_build_object(
    'id',raw->'id','name',raw->'name','branch',raw->'branch',
    'date',raw->'date','type',raw->'type','place',raw->'place',
    'attendees',raw->'attendees','members',raw->'members',
    'nonMembers',raw->'nonMembers','cost',raw->'cost',
    'venueCost',raw->'venueCost','foodCost',raw->'foodCost',
    'prizeCost',raw->'prizeCost','otherCost',raw->'otherCost',
    'eventIncome',raw->'eventIncome','goal',raw->'goal',
    'done',raw->'done','corporate',raw->'corporate',
    'individual',raw->'individual',
    'corporateRevenue',raw->'corporateRevenue',
    'individualRevenue',raw->'individualRevenue','memo',raw->'memo'
  );
$payload$;

-- 관리자가 원본을 저장/수정/삭제하면 공개용 데이터도 자동 동기화.
CREATE OR REPLACE FUNCTION public.kpi_sync_viewer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $trigger$
DECLARE admin_user uuid;
BEGIN
  SELECT admin_id INTO admin_user FROM public.kpi_owner_settings LIMIT 1;
  IF TG_OP = 'DELETE' THEN
    IF OLD.user_id = admin_user THEN
      DELETE FROM public.kpi_public_events WHERE id=OLD.id::text;
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.id::text IS DISTINCT FROM NEW.id::text THEN
    DELETE FROM public.kpi_public_events WHERE id=OLD.id::text;
  END IF;
  IF NEW.user_id = admin_user THEN
    INSERT INTO public.kpi_public_events(id,event_data)
    VALUES (NEW.id::text, public.kpi_public_payload(NEW.event_data))
    ON CONFLICT (id) DO UPDATE SET event_data = EXCLUDED.event_data;
  END IF;
  RETURN NEW;
END
$trigger$;
DROP TRIGGER IF EXISTS kpi_public_sync ON public.kpi_events;
CREATE TRIGGER kpi_public_sync
AFTER INSERT OR UPDATE OR DELETE ON public.kpi_events
FOR EACH ROW EXECUTE FUNCTION public.kpi_sync_viewer();

-- 기존 행사 기록도 즉시 공개용 테이블로 복사 (원본 내용은 변경하지 않음).
INSERT INTO public.kpi_public_events(id,event_data)
SELECT e.id::text,public.kpi_public_payload(e.event_data)
FROM public.kpi_events e
JOIN public.kpi_owner_settings o ON e.user_id=o.admin_id
ON CONFLICT (id) DO UPDATE SET event_data=EXCLUDED.event_data;

COMMIT;
