-- 뷰어 분납 회차 동기화: 부산1~4지사 공통
-- 원본 kpi_events 데이터는 변경하지 않습니다.
-- 개인정보(입회자 성명·연락처 등)는 공개 테이블로 복제하지 않습니다.
CREATE OR REPLACE FUNCTION public.kpi_viewer_signup_safe_entries(raw jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
  'group',e->'group','branch',e->'branch','division',e->'division',
  'manager',e->'manager','product',e->'product','seats',e->'seats',
  'revenue',e->'revenue','annualFee',e->'annualFee',
  'signupDate',e->'signupDate','paymentType',e->'paymentType',
  'installmentMonths',e->'installmentMonths','installmentAmounts',e->'installmentAmounts',
  'withdrawn',e->'withdrawn'
 ))),'[]'::jsonb)
 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(raw->'signupEntries')='array' THEN raw->'signupEntries' ELSE '[]'::jsonb END) AS e;
$$;
CREATE OR REPLACE FUNCTION public.kpi_viewer_installment_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 UPDATE public.kpi_public_events p
 SET event_data=jsonb_set(p.event_data,'{signupEntries}',public.kpi_viewer_signup_safe_entries(NEW.event_data),true)
 WHERE p.id=NEW.id::text;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS kpi_zz_viewer_installment_sync ON public.kpi_events;
CREATE TRIGGER kpi_zz_viewer_installment_sync
AFTER INSERT OR UPDATE ON public.kpi_events
FOR EACH ROW EXECUTE FUNCTION public.kpi_viewer_installment_sync();
-- 기존 모든 지사 기록 즉시 재동기화
UPDATE public.kpi_public_events p
SET event_data=jsonb_set(p.event_data,'{signupEntries}',public.kpi_viewer_signup_safe_entries(e.event_data),true)
FROM public.kpi_events e WHERE p.id=e.id::text;
-- 지사별 동기화 건수 확인 (금액 정보는 출력하지 않음)
SELECT COALESCE(e.event_data->>'branch','미지정') AS branch,
 count(*) FILTER (WHERE jsonb_array_length(CASE WHEN jsonb_typeof(e.event_data->'signupEntries')='array' THEN e.event_data->'signupEntries' ELSE '[]'::jsonb END)>0) AS contracts,
 count(*) FILTER (WHERE jsonb_array_length(CASE WHEN jsonb_typeof(p.event_data->'signupEntries')='array' THEN p.event_data->'signupEntries' ELSE '[]'::jsonb END)>0) AS viewer_synced
FROM public.kpi_events e JOIN public.kpi_public_events p ON p.id=e.id::text
GROUP BY 1 ORDER BY 1;
