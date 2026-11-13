-- PLK: ALL-MANAGER READ-ONLY KPI / ORGANIZATION VIEW
-- Execute once in the existing Supabase project, SQL Editor.
-- Public functions return ONLY signup seats and display-only organization fields.
-- Re-run this SQL in Supabase SQL Editor to enable the same custom organization card colors, order, and joining dates as admin. The functions are replaced in place; existing data is unchanged.
-- No event revenue, attendance, expenses, private contacts, or notes are returned.
-- Phone reveal RPC below requires an authenticated account with owner/shared/branch role.
BEGIN;

CREATE OR REPLACE FUNCTION public.kpi_manager_performance_signups()
RETURNS TABLE(branch text, division text, manager text, goal_year integer, goal_month integer, seats numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
 SELECT
  COALESCE(NULLIF(e.signup->>'branch',''),NULLIF(ev.event_data->>'branch',''),'') AS branch,
  COALESCE(NULLIF(e.signup->>'division',''),NULLIF(ev.event_data->>'division',''),'') AS division,
  COALESCE(NULLIF(e.signup->>'manager',''),'담당자 미지정') AS manager,
  substring(e.signup->>'signupDate' FROM 1 FOR 4)::integer AS goal_year,
  substring(e.signup->>'signupDate' FROM 6 FOR 2)::integer AS goal_month,
  (e.signup->>'seats')::numeric AS seats
 FROM public.kpi_events ev
 CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(ev.event_data->'signupEntries')='array'
    THEN ev.event_data->'signupEntries' ELSE '[]'::jsonb END
 ) AS e(signup)
 WHERE e.signup->>'group' IN ('corporate','individual')
  AND (e.signup->>'seats') ~ '^[0-9]{1,6}$'
  AND (e.signup->>'signupDate') ~ '^(20[2-9][0-9]|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$';
$$;
REVOKE ALL ON FUNCTION public.kpi_manager_performance_signups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kpi_manager_performance_signups() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.kpi_manager_org_nodes()
RETURNS TABLE(nodes jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
 SELECT COALESCE(
   (SELECT jsonb_agg(jsonb_build_object(
     'id',n.node->'id',
     'parent',n.node->'parent',
     'type',n.node->'type',
     'label',n.node->'label',
     'subtitle',n.node->'subtitle',
     'headcountRole',n.node->'headcountRole',
     'branchName',n.node->'branchName',
     'color',n.node->'color',
     'order',n.node->'order',
     'joinDate',n.node->'joinDate',
     'staffHidden',n.node->'staffHidden'
   ) ORDER BY n.ord)
   FROM public.kpi_org_chart org,
    LATERAL jsonb_array_elements(
     CASE WHEN jsonb_typeof(org.nodes::jsonb)='array' THEN org.nodes::jsonb ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS n(node,ord)
   WHERE org.id=1 AND COALESCE(n.node->>'staffHidden','false')<>'true'), '[]'::jsonb
 ) AS nodes;
$$;
REVOKE ALL ON FUNCTION public.kpi_manager_org_nodes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kpi_manager_org_nodes() TO anon, authenticated;


-- Contact details remain private. Only an authenticated owner, shared admin,
-- or branch manager with an explicitly granted account may request one number.
-- A public/anonymous page cannot call this function or read the phone table.
CREATE OR REPLACE FUNCTION public.kpi_manager_staff_phone(p_node_id text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $private$
DECLARE
  contact_id text;
  result_phone text;
  role_name text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION '연락처는 로그인 후 확인할 수 있습니다.';
  END IF;
  role_name := public.kpi_my_access()->>'role';
  IF role_name IS NULL OR role_name NOT IN ('owner','shared','branch') THEN
    RAISE EXCEPTION '연락처 열람 권한이 없습니다.';
  END IF;
  IF p_node_id IS NULL OR length(p_node_id) > 256 THEN
    RAISE EXCEPTION '잘못된 조직원입니다.';
  END IF;
  SELECT COALESCE(NULLIF(n.node->>'staffContactId',''),p_node_id)
  INTO contact_id
  FROM public.kpi_org_chart org
  CROSS JOIN LATERAL jsonb_array_elements(org.nodes) n(node)
  WHERE org.id = 1
    AND n.node->>'id'=p_node_id
    AND n.node->>'staffHidden' IS DISTINCT FROM 'true'
  LIMIT 1;
  IF contact_id IS NULL THEN
    RAISE EXCEPTION '조회할 수 없는 조직원입니다.';
  END IF;
  SELECT c.phone INTO result_phone
  FROM public.kpi_org_staff_contacts c
  WHERE c.node_id=contact_id;
  RETURN COALESCE(result_phone,'');
END;
$private$;
REVOKE ALL ON FUNCTION public.kpi_manager_staff_phone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_manager_staff_phone(text) TO authenticated;

COMMIT;
