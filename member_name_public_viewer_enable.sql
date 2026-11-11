-- PLK KPI 공개 뷰어 입회자 성함 포함 설정 (사용자 요청 시에만 실행)
-- 주의: 이 SQL 실행 후 공개 뷰어 링크를 아는 사람은 입회자 성함을 열람할 수 있습니다.
-- 정보주체 동의와 공개 범위를 확인한 경우에만 Supabase SQL Editor에서 실행하세요.
-- 기존 이벤트는 삭제하지 않고 공개용 복제본만 다시 동기화합니다.
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
