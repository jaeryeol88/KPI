-- PLK KPI · 실제 가입일자 기준 실적 집계용 뷰어 동기화
-- Run once in Supabase SQL Editor after viewer_setup.sql.
-- Keeps event date unchanged; exposes only signup-related allowlisted fields.
BEGIN;

CREATE OR REPLACE FUNCTION public.kpi_public_signup_entries(raw jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'group', item.value->'group',
    'product', item.value->'product',
    'seats', item.value->'seats',
    'revenue', item.value->'revenue',
    'annualFee', item.value->'annualFee',
    'branch', item.value->'branch',
    'division', item.value->'division',
    'manager', item.value->'manager',
    'memberName', item.value->'memberName',
    'signupDate', item.value->'signupDate',
    'paymentType', item.value->'paymentType',
    'installmentMonths', item.value->'installmentMonths',
    'note', item.value->'note'
 ) ORDER BY item.ordinality), '[]'::jsonb)
 FROM jsonb_array_elements(
  CASE WHEN jsonb_typeof(raw->'signupEntries')='array' THEN raw->'signupEntries' ELSE '[]'::jsonb END
 ) WITH ORDINALITY AS item(value, ordinality);
$$;
REVOKE ALL ON FUNCTION public.kpi_public_signup_entries(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kpi_public_signup_entries(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.kpi_sync_signup_dates_to_viewer()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 UPDATE public.kpi_public_events
 SET event_data=jsonb_set(
   COALESCE(event_data,'{}'::jsonb),
   '{signupEntries}',
   public.kpi_public_signup_entries(NEW.event_data),
   true
 )
 WHERE id=NEW.id::text;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.kpi_sync_signup_dates_to_viewer() FROM PUBLIC;

DROP TRIGGER IF EXISTS zzz_kpi_signup_dates_to_viewer ON public.kpi_events;
-- The existing kpi_public_sync trigger runs first (alphabetical trigger ordering).
CREATE TRIGGER zzz_kpi_signup_dates_to_viewer
AFTER INSERT OR UPDATE ON public.kpi_events
FOR EACH ROW EXECUTE FUNCTION public.kpi_sync_signup_dates_to_viewer();

-- Backfill publicly readable signup entries for already saved events.
UPDATE public.kpi_public_events AS pub
SET event_data=jsonb_set(
  COALESCE(pub.event_data,'{}'::jsonb),
  '{signupEntries}',
  public.kpi_public_signup_entries(e.event_data),
  true
)
FROM public.kpi_events AS e
WHERE pub.id=e.id::text;

COMMIT;
