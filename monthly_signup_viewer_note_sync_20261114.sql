-- 월별 입회 현황 뷰어: 가입 건별 메모(비고) 공개 동기화
-- Supabase SQL Editor에서 관리자 권한으로 1회 실행
-- 관리자/뷰어 공통 표시를 위한 허용 필드 추가. 다른 이벤트 필드는 유지합니다.
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
     'note', r->'note',
     'seats', r->'seats',
     'annualFee', r->'annualFee',
     'revenue', r->'revenue',
     'paymentType', r->'paymentType',
     'installmentAmounts', r->'installmentAmounts',
     'installmentMonths', r->'installmentMonths',
     'withdrawn', r->'withdrawn'
   ))
   FROM jsonb_array_elements(
     CASE WHEN jsonb_typeof(raw->'signupEntries')='array'
       THEN raw->'signupEntries' ELSE '[]'::jsonb END
   ) AS r
 ), '[]'::jsonb);
$$;

-- 기존 공개 이벤트도 즉시 다시 생성하여 입회자명 및 메모 반영
UPDATE public.kpi_public_events AS p
SET event_data=public.kpi_viewer_payload_with_signups(e.event_data)
FROM public.kpi_events AS e
JOIN public.kpi_owner_settings AS owner ON owner.admin_id=e.user_id
WHERE p.id=e.id::text;

INSERT INTO public.kpi_public_events(id,event_data)
SELECT e.id::text, public.kpi_viewer_payload_with_signups(e.event_data)
FROM public.kpi_events AS e
JOIN public.kpi_owner_settings AS owner ON owner.admin_id=e.user_id
ON CONFLICT (id) DO UPDATE SET event_data=EXCLUDED.event_data;

COMMIT;

-- 공개 필드 동기화 확인 (가입자명/메모 포함 여부만)
SELECT p.id,
       jsonb_array_length(CASE WHEN jsonb_typeof(p.event_data->'signupEntries')='array' THEN p.event_data->'signupEntries' ELSE '[]'::jsonb END) AS signup_count,
       p.event_data->'signupEntries'->0->>'memberName' AS first_member,
       p.event_data->'signupEntries'->0->>'note' AS first_note
FROM public.kpi_public_events p
ORDER BY p.id LIMIT 10;
