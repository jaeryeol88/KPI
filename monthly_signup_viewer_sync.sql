-- PLK 월별 입회 현황: 공개 뷰어 가입 건별 등록 동기화
-- Supabase SQL Editor에서 관리자 권한으로 1회 실행
-- 기존 공개 이벤트 필드는 보존하며 가입 상세 정보의 허용 필드만 추가합니다.
BEGIN;

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
     'seats', r->'seats',
     'annualFee', r->'annualFee',
     'revenue', r->'revenue',
     'paymentType', r->'paymentType',
     'installmentAmounts', r->'installmentAmounts',
     'installmentMonths', r->'installmentMonths',
     'withdrawn', r->'withdrawn'
   ))
   FROM jsonb_array_elements(CASE WHEN jsonb_typeof(raw->'signupEntries')='array' THEN raw->'signupEntries' ELSE '[]'::jsonb END) AS r
 ), '[]'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.kpi_viewer_payload_with_signups(raw jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
 SELECT public.kpi_public_payload(raw) ||
   jsonb_build_object('signupEntries', public.kpi_viewer_signup_payload(raw));
$$;

CREATE OR REPLACE FUNCTION public.kpi_sync_viewer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE admin_user uuid;
BEGIN
 SELECT admin_id INTO admin_user FROM public.kpi_owner_settings LIMIT 1;
 IF TG_OP = 'DELETE' THEN
   IF OLD.user_id = admin_user THEN
     DELETE FROM public.kpi_public_events WHERE id = OLD.id::text;
   END IF;
   RETURN OLD;
 END IF;
 IF TG_OP = 'UPDATE' AND OLD.id::text IS DISTINCT FROM NEW.id::text THEN
   DELETE FROM public.kpi_public_events WHERE id = OLD.id::text;
 END IF;
 IF NEW.user_id = admin_user THEN
   INSERT INTO public.kpi_public_events(id,event_data)
   VALUES (NEW.id::text, public.kpi_viewer_payload_with_signups(NEW.event_data))
   ON CONFLICT (id) DO UPDATE SET event_data=EXCLUDED.event_data;
 END IF;
 RETURN NEW;
END;
$$;

-- 기존 등록 건도 즉시 공개 뷰어에 반영
UPDATE public.kpi_public_events AS p
SET event_data=public.kpi_viewer_payload_with_signups(e.event_data)
FROM public.kpi_events AS e
JOIN public.kpi_owner_settings AS owner ON owner.admin_id=e.user_id
WHERE p.id=e.id::text;

-- 누락된 신규 공개 이벤트도 동기화
INSERT INTO public.kpi_public_events(id,event_data)
SELECT e.id::text,public.kpi_viewer_payload_with_signups(e.event_data)
FROM public.kpi_events AS e
JOIN public.kpi_owner_settings AS owner ON owner.admin_id=e.user_id
ON CONFLICT (id) DO UPDATE SET event_data=EXCLUDED.event_data;

COMMIT;

-- 확인용: 각 공개 행사에 포함된 가입 건 수
SELECT id, jsonb_array_length(CASE WHEN jsonb_typeof(event_data->'signupEntries')='array' THEN event_data->'signupEntries' ELSE '[]'::jsonb END) AS signup_count
FROM public.kpi_public_events ORDER BY id;
