-- PLK KPI 입회자 성함 공개 뷰어 노출 방지 (관리자 원본 데이터는 그대로 보존)
-- Supabase SQL Editor에서 1회 실행. 기존 데이터는 삭제하지 않고 공개 뷰어 JSON에서 memberName만 제외합니다.
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
    'signupEntries',
    CASE WHEN jsonb_typeof(raw->'signupEntries') = 'array' THEN
      (SELECT coalesce(jsonb_agg(entry - 'memberName' ORDER BY ord),'[]'::jsonb)
       FROM jsonb_array_elements(raw->'signupEntries') WITH ORDINALITY AS rows(entry,ord))
    ELSE raw->'signupEntries' END,
    'memo',raw->'memo'
  );
$payload$;
UPDATE public.kpi_public_events p
SET event_data = public.kpi_public_payload(e.event_data)
FROM public.kpi_events e
WHERE p.id = e.id::text;
COMMIT;
