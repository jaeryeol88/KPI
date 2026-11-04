-- PLK KPI 행사비용 재원 2종 공개 뷰어 연동 업데이트
-- Supabase SQL Editor에서 실행하세요. 기존 행사 원본 데이터는 수정하거나 삭제하지 않습니다.
BEGIN;
CREATE OR REPLACE FUNCTION public.kpi_public_payload(raw jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $payload$
  SELECT jsonb_build_object(
    'id',raw->'id','name',raw->'name','branch',raw->'branch',
    'date',raw->'date','type',raw->'type','place',raw->'place',
    'attendees',raw->'attendees','members',raw->'members',
    'nonMembers',raw->'nonMembers','cost',raw->'cost',
    'promoPoints',raw->'promoPoints',
    'headOfficeSupport',raw->'headOfficeSupport',
    'venueCost',raw->'venueCost','foodCost',raw->'foodCost',
    'prizeCost',raw->'prizeCost','otherCost',raw->'otherCost',
    'eventIncome',raw->'eventIncome','goal',raw->'goal',
    'done',raw->'done','corporate',raw->'corporate',
    'individual',raw->'individual',
    'corporateRevenue',raw->'corporateRevenue',
    'individualRevenue',raw->'individualRevenue','memo',raw->'memo'
  );
$payload$;
UPDATE public.kpi_public_events p
SET event_data = public.kpi_public_payload(e.event_data)
FROM public.kpi_events e
JOIN public.kpi_owner_settings o ON e.user_id = o.admin_id
WHERE p.id = e.id::text;
COMMIT;
