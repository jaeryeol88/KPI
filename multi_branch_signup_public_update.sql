-- PLK KPI 행사별 복수 참여 지사·본부 및 가입 건별 담당 지사·본부 공개 뷰어 연동
-- Supabase SQL Editor에서 1회 실행. 기존 데이터를 삭제하지 않고 공개 필드 및 기존 공개 기록을 갱신합니다.
BEGIN;
CREATE OR REPLACE FUNCTION public.kpi_public_payload(raw jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = ''
AS $payload$
  SELECT jsonb_build_object(
    'id',raw->'id','name',raw->'name','branch',raw->'branch','division',raw->'division',
    'branches',raw->'branches','divisions',raw->'divisions',
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
    'individualRevenue',raw->'individualRevenue',
    'annualFee',raw->'annualFee',
    'corporateProducts',raw->'corporateProducts',
    'individualProducts',raw->'individualProducts',
    'productSeatCounts',raw->'productSeatCounts',
    'signupEntries',raw->'signupEntries',
    'memo',raw->'memo'
  );
$payload$;
UPDATE public.kpi_public_events p
SET event_data = public.kpi_public_payload(e.event_data)
FROM public.kpi_events e
WHERE p.id = e.id::text;
COMMIT;
