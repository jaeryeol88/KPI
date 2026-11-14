-- Read-only consistency audit. No personal information or amounts are printed.
-- Compare the original saved signup entries against viewer copy for every branch.
BEGIN TRANSACTION READ ONLY;

DO $audit$
DECLARE
 missing_events integer;
 mismatched_entries integer;
 invalid_installments integer;
BEGIN
 SELECT count(*) INTO missing_events
 FROM public.kpi_events e
 LEFT JOIN public.kpi_public_events p ON p.id=e.id::text
 WHERE p.id IS NULL;

 WITH original_rows AS (
   SELECT e.id::text AS id, n.ord,
          jsonb_build_object(
            'group',n.entry->'group','signupDate',n.entry->'signupDate',
            'branch',n.entry->'branch','division',n.entry->'division',
            'manager',n.entry->'manager','product',n.entry->'product',
            'memberName',n.entry->'memberName','note',n.entry->'note',
            'seats',n.entry->'seats','annualFee',n.entry->'annualFee',
            'revenue',n.entry->'revenue','paymentType',n.entry->'paymentType',
            'installmentAmounts',n.entry->'installmentAmounts',
            'installmentMonths',n.entry->'installmentMonths',
            'withdrawn',n.entry->'withdrawn'
          ) AS entry
   FROM public.kpi_events e
   CROSS JOIN LATERAL jsonb_array_elements(
     CASE WHEN jsonb_typeof(e.event_data->'signupEntries')='array'
       THEN e.event_data->'signupEntries' ELSE '[]'::jsonb END
   ) WITH ORDINALITY AS n(entry,ord)
 ), viewer_rows AS (
   SELECT p.id,n.ord,
          jsonb_build_object(
            'group',n.entry->'group','signupDate',n.entry->'signupDate',
            'branch',n.entry->'branch','division',n.entry->'division',
            'manager',n.entry->'manager','product',n.entry->'product',
            'memberName',n.entry->'memberName','note',n.entry->'note',
            'seats',n.entry->'seats','annualFee',n.entry->'annualFee',
            'revenue',n.entry->'revenue','paymentType',n.entry->'paymentType',
            'installmentAmounts',n.entry->'installmentAmounts',
            'installmentMonths',n.entry->'installmentMonths',
            'withdrawn',n.entry->'withdrawn'
          ) AS entry
   FROM public.kpi_public_events p
   CROSS JOIN LATERAL jsonb_array_elements(
     CASE WHEN jsonb_typeof(p.event_data->'signupEntries')='array'
       THEN p.event_data->'signupEntries' ELSE '[]'::jsonb END
   ) WITH ORDINALITY AS n(entry,ord)
 )
 SELECT count(*) INTO mismatched_entries
 FROM (
   SELECT o.id,o.ord
   FROM original_rows o
   LEFT JOIN viewer_rows v ON v.id=o.id AND v.ord=o.ord
   WHERE v.id IS NULL OR o.entry IS DISTINCT FROM v.entry
   UNION ALL
   SELECT v.id,v.ord
   FROM viewer_rows v
   LEFT JOIN original_rows o ON o.id=v.id AND o.ord=v.ord
   WHERE o.id IS NULL
 ) differences;

 SELECT count(*) INTO invalid_installments
 FROM public.kpi_events e
 CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(e.event_data->'signupEntries')='array'
     THEN e.event_data->'signupEntries' ELSE '[]'::jsonb END
 ) AS n(entry)
 WHERE n.entry->>'paymentType'='installment'
   AND COALESCE(n.entry->>'withdrawn','false')<>'true'
   AND (
    jsonb_typeof(n.entry->'installmentAmounts') IS DISTINCT FROM 'array'
    OR jsonb_array_length(CASE WHEN jsonb_typeof(n.entry->'installmentAmounts')='array'
      THEN n.entry->'installmentAmounts' ELSE '[]'::jsonb END)
       IS DISTINCT FROM NULLIF(n.entry->>'installmentMonths','')::integer
   );

 IF missing_events>0 OR mismatched_entries>0 OR invalid_installments>0 THEN
   RAISE EXCEPTION 'KPI data audit failed: unpublished events %, mismatched signup rows %, incomplete installment schedules %',
     missing_events,mismatched_entries,invalid_installments;
 END IF;
 RAISE NOTICE 'KPI data audit passed: all saved signup entries agree with viewer copies';
END $audit$;

COMMIT;
