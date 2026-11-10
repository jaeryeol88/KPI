-- PLK KPI 본부 분류 공개 뷰어 연동
-- Supabase SQL Editor에서 실행: 기존 데이터는 보존하며 division 필드만 공개 조회 payload에 추가.
BEGIN;
CREATE OR REPLACE FUNCTION public.kpi_public_payload(raw jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = ''
AS $payload$
  SELECT jsonb_build_object(
    'id',raw->'id','name',raw->'name','branch',raw->'branch','division',raw->'division',
    'date',raw->'date','type',raw->'type','place',raw->'place',
    'attendees',raw->'attendees','members',raw->'members',
    'nonMembers',raw->'nonMembers','cost',raw->'cost',
    'promoPoints',raw->'promoPoints','headOfficeSupport',raw->'headOfficeSupport',
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
WHERE p.id = e.id::text;
COMMIT;
