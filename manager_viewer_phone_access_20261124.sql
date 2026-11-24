-- PLK manager viewer contact reveal (2026-11-24).
-- Execute in the existing Supabase project's SQL Editor.
-- A valid, enabled manager viewer login is required for every contact lookup.
-- No anonymous bulk contact listing or changes to existing staff data.
BEGIN;
CREATE OR REPLACE FUNCTION public.kpi_viewer_manager_staff_phone(
 p_token text,
 p_node_id text
)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $manager_contact$
DECLARE
 v_who jsonb;
 v_contact_id text;
 v_phone text;
BEGIN
 IF p_token IS NULL OR length(btrim(p_token))=0 THEN
  RAISE EXCEPTION '매니저 뷰어 로그인이 필요합니다.';
 END IF;
 v_who := public.kpi_viewer_whoami(p_token);
 IF v_who IS NULL OR v_who->>'role' IS DISTINCT FROM 'manager' THEN
  RAISE EXCEPTION '매니저 뷰어 연락처 조회 권한이 없습니다.';
 END IF;
 IF p_node_id IS NULL OR length(p_node_id)=0 OR length(p_node_id)>256 THEN
  RAISE EXCEPTION '잘못된 조직원 정보입니다.';
 END IF;
 SELECT coalesce(nullif(n.node->>'staffContactId',''),p_node_id)
 INTO v_contact_id
 FROM public.kpi_org_chart AS org
 CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(org.nodes::jsonb)='array' THEN org.nodes::jsonb ELSE '[]'::jsonb END
 ) AS n(node)
 WHERE org.id=1
  AND n.node->>'id'=p_node_id
  AND n.node->>'staffHidden' IS DISTINCT FROM 'true'
 LIMIT 1;
 IF v_contact_id IS NULL THEN
  RAISE EXCEPTION '조회할 수 없는 조직원입니다.';
 END IF;
 SELECT c.phone INTO v_phone
 FROM public.kpi_org_staff_contacts c
 WHERE c.node_id=v_contact_id;
 RETURN coalesce(v_phone,'');
END;
$manager_contact$;
REVOKE ALL ON FUNCTION public.kpi_viewer_manager_staff_phone(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_viewer_manager_staff_phone(text,text) TO anon,authenticated;
COMMIT;
