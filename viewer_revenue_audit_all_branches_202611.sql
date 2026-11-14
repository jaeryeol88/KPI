-- 2026년 11월 / 전체·부산1~4지사 입회매출 점검 (조회 전용, 데이터 변경 없음)
-- 관리자 원본과 뷰어 공개 데이터의 가입건별 회차 금액과 과거 직접입력 매출을 지사별로 비교합니다.
-- 개인정보(입회자명/메모)는 출력하지 않습니다.
-- 수정: PostgreSQL 정규식에서 이중 백슬래시가 가입일을 모두 제외하던 문제 제거.
WITH sources AS (
 SELECT '관리자원본' AS origin, id::text AS record_id, event_data AS payload FROM public.kpi_events
 UNION ALL
 SELECT '뷰어공개' AS origin, id::text AS record_id, event_data AS payload FROM public.kpi_public_events
), contracts AS (
 SELECT s.origin,s.record_id,
        COALESCE(NULLIF(x.entry->>'branch',''),s.payload->>'branch') AS branch,
        x.entry->>'signupDate' AS signup_date,
        x.entry->>'paymentType' AS pay_type,
        x.entry->'installmentAmounts' AS installments,
        x.entry->>'revenue' AS contract_revenue,
        CASE WHEN x.entry->>'paymentType'='installment'
          AND (jsonb_typeof(x.entry->'installmentAmounts') IS DISTINCT FROM 'array'
            OR jsonb_array_length(CASE WHEN jsonb_typeof(x.entry->'installmentAmounts')='array' THEN x.entry->'installmentAmounts' ELSE '[]'::jsonb END)=0)
          THEN 1 ELSE 0 END AS missing_schedule
 FROM sources s
 CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(s.payload->'signupEntries')='array'
     THEN s.payload->'signupEntries' ELSE '[]'::jsonb END
 ) AS x(entry)
 WHERE x.entry->>'group' IN ('corporate','individual')
   AND COALESCE(x.entry->>'withdrawn','false') <> 'true'
   AND x.entry->>'signupDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}
), installments AS (
 SELECT c.*,
        (c.signup_date::date + (idx.n || ' months')::interval)::date AS due_date,
        idx.n,
        CASE WHEN c.pay_type='installment'
          AND jsonb_typeof(c.installments)='array'
          AND jsonb_array_length(c.installments)>0
          THEN COALESCE((c.installments->>idx.n)::numeric,0)
          ELSE COALESCE(NULLIF(c.contract_revenue,'')::numeric,0)
        END AS amount
 FROM contracts c
 CROSS JOIN LATERAL generate_series(0,
   CASE WHEN c.pay_type='installment'
     AND jsonb_typeof(c.installments)='array'
     AND jsonb_array_length(c.installments)>0
     THEN jsonb_array_length(c.installments)-1 ELSE 0 END
 ) AS idx(n)
), monthly AS (
 SELECT origin,branch,
        SUM(amount) FILTER(WHERE due_date >= DATE '2026-11-01' AND due_date < DATE '2026-12-01' AND n=0) AS first_installment,
        SUM(amount) FILTER(WHERE due_date >= DATE '2026-11-01' AND due_date < DATE '2026-12-01' AND n>0) AS carried_installment
 FROM installments GROUP BY origin,branch
), missing AS (
 SELECT origin,branch,SUM(missing_schedule) AS missing_schedule_count
 FROM contracts WHERE signup_date >= '2026-11-01' AND signup_date < '2026-12-01'
 GROUP BY origin,branch
), legacy AS (
 SELECT origin, payload->>'branch' AS branch,
        SUM(COALESCE(NULLIF(payload->>'corporateRevenue','')::numeric,0)
          + COALESCE(NULLIF(payload->>'individualRevenue','')::numeric,0)) AS direct_revenue
 FROM sources s
 WHERE payload->>'date' >= '2026-11-01' AND payload->>'date' < '2026-12-01'
   AND NOT EXISTS(
     SELECT 1 FROM jsonb_array_elements(
       CASE WHEN jsonb_typeof(s.payload->'signupEntries')='array'
         THEN s.payload->'signupEntries' ELSE '[]'::jsonb END
     ) AS t(entry) WHERE entry->>'group' IN ('corporate','individual')
   )
 GROUP BY origin,payload->>'branch'
), offices AS (
 SELECT * FROM (VALUES ('부산 1지사'),('부산 2지사'),('부산 3지사'),('부산 4지사'),('부산권역')) AS b(branch)
), summaries AS (
 SELECT s.origin,b.branch,
        COALESCE(m.first_installment,0) AS new_money,
        COALESCE(m.carried_installment,0) AS carry_money,
        COALESCE(l.direct_revenue,0) AS legacy_money,
        COALESCE(x.missing_schedule_count,0) AS missing_schedule
 FROM (VALUES ('관리자원본'),('뷰어공개')) AS s(origin)
 CROSS JOIN offices b
 LEFT JOIN monthly m ON m.origin=s.origin AND m.branch=b.branch
 LEFT JOIN legacy l ON l.origin=s.origin AND l.branch=b.branch
 LEFT JOIN missing x ON x.origin=s.origin AND x.branch=b.branch
)
SELECT branch AS "지사",
       MAX(new_money) FILTER(WHERE origin='관리자원본') AS "원본_신규가입1회차",
       MAX(new_money) FILTER(WHERE origin='뷰어공개') AS "뷰어_신규가입1회차",
       MAX(carry_money) FILTER(WHERE origin='뷰어공개') AS "뷰어_이전가입분납",
       MAX(legacy_money) FILTER(WHERE origin='뷰어공개') AS "뷰어_과거직접입력",
       MAX(new_money+carry_money+legacy_money) FILTER(WHERE origin='뷰어공개') AS "뷰어_대시보드예상매출",
       MAX(missing_schedule) FILTER(WHERE origin='뷰어공개') AS "회차금액누락건수"
FROM summaries
GROUP BY branch
ORDER BY branch;

), installments AS (
 SELECT c.*,
        (c.signup_date::date + (idx.n || ' months')::interval)::date AS due_date,
        idx.n,
        CASE WHEN c.pay_type='installment'
          AND jsonb_typeof(c.installments)='array'
          AND jsonb_array_length(c.installments)>0
          THEN COALESCE((c.installments->>idx.n)::numeric,0)
          ELSE COALESCE(NULLIF(c.contract_revenue,'')::numeric,0)
        END AS amount
 FROM contracts c
 CROSS JOIN LATERAL generate_series(0,
   CASE WHEN c.pay_type='installment'
     AND jsonb_typeof(c.installments)='array'
     AND jsonb_array_length(c.installments)>0
     THEN jsonb_array_length(c.installments)-1 ELSE 0 END
 ) AS idx(n)
), monthly AS (
 SELECT origin,branch,
        SUM(amount) FILTER(WHERE due_date >= DATE '2026-11-01' AND due_date < DATE '2026-12-01' AND n=0) AS first_installment,
        SUM(amount) FILTER(WHERE due_date >= DATE '2026-11-01' AND due_date < DATE '2026-12-01' AND n>0) AS carried_installment
 FROM installments GROUP BY origin,branch
), missing AS (
 SELECT origin,branch,SUM(missing_schedule) AS missing_schedule_count
 FROM contracts WHERE signup_date >= '2026-11-01' AND signup_date < '2026-12-01'
 GROUP BY origin,branch
), legacy AS (
 SELECT origin, payload->>'branch' AS branch,
        SUM(COALESCE(NULLIF(payload->>'corporateRevenue','')::numeric,0)
          + COALESCE(NULLIF(payload->>'individualRevenue','')::numeric,0)) AS direct_revenue
 FROM sources s
 WHERE payload->>'date' >= '2026-11-01' AND payload->>'date' < '2026-12-01'
   AND NOT EXISTS(
     SELECT 1 FROM jsonb_array_elements(
       CASE WHEN jsonb_typeof(s.payload->'signupEntries')='array'
         THEN s.payload->'signupEntries' ELSE '[]'::jsonb END
     ) AS t(entry) WHERE entry->>'group' IN ('corporate','individual')
   )
 GROUP BY origin,payload->>'branch'
), offices AS (
 SELECT * FROM (VALUES ('부산 1지사'),('부산 2지사'),('부산 3지사'),('부산 4지사'),('부산권역')) AS b(branch)
), summaries AS (
 SELECT s.origin,b.branch,
        COALESCE(m.first_installment,0) AS new_money,
        COALESCE(m.carried_installment,0) AS carry_money,
        COALESCE(l.direct_revenue,0) AS legacy_money,
        COALESCE(x.missing_schedule_count,0) AS missing_schedule
 FROM (VALUES ('관리자원본'),('뷰어공개')) AS s(origin)
 CROSS JOIN offices b
 LEFT JOIN monthly m ON m.origin=s.origin AND m.branch=b.branch
 LEFT JOIN legacy l ON l.origin=s.origin AND l.branch=b.branch
 LEFT JOIN missing x ON x.origin=s.origin AND x.branch=b.branch
)
SELECT branch AS "지사",
       MAX(new_money) FILTER(WHERE origin='관리자원본') AS "원본_신규가입1회차",
       MAX(new_money) FILTER(WHERE origin='뷰어공개') AS "뷰어_신규가입1회차",
       MAX(carry_money) FILTER(WHERE origin='뷰어공개') AS "뷰어_이전가입분납",
       MAX(legacy_money) FILTER(WHERE origin='뷰어공개') AS "뷰어_과거직접입력",
       MAX(new_money+carry_money+legacy_money) FILTER(WHERE origin='뷰어공개') AS "뷰어_대시보드예상매출",
       MAX(missing_schedule) FILTER(WHERE origin='뷰어공개') AS "회차금액누락건수"
FROM summaries
GROUP BY branch
ORDER BY branch;
