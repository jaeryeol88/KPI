-- PLK KPI 월별 입회 현황 동기화 복구
-- 최고관리자뿐 아니라 지사/공동관리자가 등록한 데이터까지 공개 뷰어에 반영
-- 실행: Supabase SQL Editor (관리자) / 기존 원본 kpi_events 데이터 수정 없음
-- 경고: 가입자명과 메모는 뷰어 계정 권한이 있는 사람에게 노출됩니다.
BEGIN;

-- 가입건별 허용 필드에 입회자 성함과 메모 포함
CREATE OR REPLACE FUNCTION public.kpi_viewer_signup_payload(raw jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
 SELECT COALESCE((
   SELECT jsonb_agg(jsonb_build_object(
     'group', r->'group',
     'signupDate', r->'signupDate',
     'branch', r->'branch',
     'division', r->'division',
     'manager', r->'manager',
     'product', r->'product',
     'memberName', r->'memberName',
     'note', r->'note',
     'seats', r->'seats',
     'annualFee', r->'annualFee',
     'revenue', r->'revenue',
     'paymentType', r->'paymentType',
     'installmentAmounts', r->'installmentAmounts',
     'installmentMonths', r->'installmentMonths',
     'withdrawn', r->'withdrawn'
   ) ORDER BY rownum)
   FROM jsonb_array_elements(
     CASE WHEN jsonb_typeof(raw->'signupEntries')='array'
       THEN raw->'signupEntries' ELSE '[]'::jsonb END
   ) WITH ORDINALITY AS items(r,rownum)
 ), '[]'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.kpi_viewer_payload_with_signups(raw jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
 SELECT public.kpi_public_payload(raw) ||
        jsonb_build_object('signupEntries',public.kpi_viewer_signup_payload(raw));
$$;

-- 과거 team_admin_setup.sql 에 설정한 '모든 허가된 관리자' 동기화 복원
-- kpi_events RLS를 통과해 저장된 행만 동기화하므로 권한 확대 작업은 하지 않음
CREATE OR REPLACE FUNCTION public.kpi_sync_viewer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   DELETE FROM public.kpi_public_events WHERE id=OLD.id::text;
   RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.id::text IS DISTINCT FROM NEW.id::text THEN
   DELETE FROM public.kpi_public_events WHERE id=OLD.id::text;
 END IF;
 INSERT INTO public.kpi_public_events(id,event_data)
 VALUES (NEW.id::text,public.kpi_viewer_payload_with_signups(NEW.event_data))
 ON CONFLICT (id) DO UPDATE SET event_data=EXCLUDED.event_data;
 RETURN NEW;
END;
$$;

-- 최고관리자/지사관리자/공동관리자 구분 없이 모든 기존 기록 백필
INSERT INTO public.kpi_public_events(id,event_data)
SELECT e.id::text,public.kpi_viewer_payload_with_signups(e.event_data)
FROM public.kpi_events e
ON CONFLICT (id) DO UPDATE SET event_data=EXCLUDED.event_data;

COMMIT;

-- 민감한 실제 이름/메모를 노출하지 않고 11월 11~12일 부산 1지사 건의 동기화 상태만 확인
WITH original AS (
 SELECT e.id::text AS id, ord,
        r->>'signupDate' AS signup_date,
        COALESCE(NULLIF(r->>'branch',''), e.event_data->>'branch') AS branch,
        NULLIF(TRIM(r->>'memberName'),'') IS NOT NULL AS has_member,
        NULLIF(TRIM(r->>'note'),'') IS NOT NULL AS has_note
 FROM public.kpi_events e
 CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(e.event_data->'signupEntries')='array' THEN e.event_data->'signupEntries' ELSE '[]'::jsonb END
 ) WITH ORDINALITY AS s(r,ord)
), published AS (
 SELECT p.id, ord,
        NULLIF(TRIM(r->>'memberName'),'') IS NOT NULL AS has_member,
        NULLIF(TRIM(r->>'note'),'') IS NOT NULL AS has_note
 FROM public.kpi_public_events p
 CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(p.event_data->'signupEntries')='array' THEN p.event_data->'signupEntries' ELSE '[]'::jsonb END
 ) WITH ORDINALITY AS s(r,ord)
)
SELECT o.signup_date AS "가입일",
       o.branch AS "지사",
       o.has_member AS "원본_입회자명_존재",
       COALESCE(p.has_member,false) AS "뷰어_입회자명_존재",
       o.has_note AS "원본_비고_존재",
       COALESCE(p.has_note,false) AS "뷰어_비고_존재"
FROM original o
LEFT JOIN published p ON p.id=o.id AND p.ord=o.ord
WHERE o.branch='부산 1지사' AND o.signup_date IN ('2026-11-11','2026-11-12')
ORDER BY o.signup_date DESC,o.id,o.ord;
