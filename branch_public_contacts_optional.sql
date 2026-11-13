-- Replace the earlier branch phone function. Run the entire file in Supabase SQL Editor.
-- PUBLIC DISCLOSURE: anyone who knows a branch viewer URL may query its listed phone numbers.
CREATE OR REPLACE FUNCTION public.kpi_public_branch_staff_phones(p_branch text)
RETURNS TABLE(node_id text, phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 WITH RECURSIVE org AS (
  SELECT n.value AS node,n.value->>'id' AS id,n.value->>'parent' AS parent,
         COALESCE(NULLIF(n.value->>'order','')::numeric,0) AS sort_order
  FROM public.kpi_org_chart c CROSS JOIN LATERAL jsonb_array_elements(c.nodes) n(value)
  WHERE c.id=1
 ), groups AS (
  SELECT o.id,
    COALESCE(
      NULLIF(substring(COALESCE(NULLIF(o.node->>'branchName',''),o.node->>'label','') from '부산[[:space:]]*[1-4][[:space:]]*지사'),''),
      '부산 '||row_number() OVER (PARTITION BY o.parent ORDER BY o.sort_order,o.id)::text||'지사'
    ) AS branch_name
  FROM org o WHERE o.node->>'type'='group'
 ), ancestry AS (
  SELECT o.id AS person_id,o.node AS person_node,o.parent AS ancestor_parent,
         o.id AS ancestor_id,0 AS depth
  FROM org o WHERE o.node->>'type' IN ('person','group')
  UNION ALL
  SELECT a.person_id,a.person_node,p.parent,p.id,a.depth+1
  FROM ancestry a JOIN org p ON p.id=a.ancestor_parent WHERE a.depth<16
 ), matching AS (
  SELECT DISTINCT a.person_id,a.person_node
  FROM ancestry a JOIN groups g ON g.id=a.ancestor_id
  WHERE regexp_replace(g.branch_name,'[[:space:]]','','g')
      = regexp_replace(p_branch,'[[:space:]]','','g')
 ), contacts AS (
  SELECT m.person_id,m.person_node->>'type' AS node_type,c.phone
  FROM matching m
  JOIN public.kpi_org_staff_contacts c
   ON c.node_id=COALESCE(NULLIF(m.person_node->>'staffContactId',''),m.person_id)
  WHERE m.person_node->>'staffHidden' IS DISTINCT FROM 'true'
    AND NULLIF(btrim(c.phone),'') IS NOT NULL
 )
 SELECT c.person_id,c.phone FROM contacts c
 WHERE p_branch IN ('부산 1지사','부산 2지사','부산 3지사','부산 4지사')
 UNION ALL
 SELECT 'viewer-group-person-'||c.person_id,c.phone FROM contacts c
 WHERE c.node_type='group'
   AND p_branch IN ('부산 1지사','부산 2지사','부산 3지사','부산 4지사');
$$;
REVOKE ALL ON FUNCTION public.kpi_public_branch_staff_phones(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kpi_public_branch_staff_phones(text) TO anon, authenticated;
