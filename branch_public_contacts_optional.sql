-- Re-run this complete SQL in Supabase SQL Editor to replace the earlier function.
-- Public branch viewers may reveal staff phone numbers without login.
-- WARNING: the phone numbers of included employees are publicly accessible.
CREATE OR REPLACE FUNCTION public.kpi_public_branch_staff_phones(p_branch text)
RETURNS TABLE(node_id text, phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 WITH RECURSIVE org AS (
   SELECT n.value AS node, n.value->>'id' AS id, n.value->>'parent' AS parent
   FROM public.kpi_org_chart c
   CROSS JOIN LATERAL jsonb_array_elements(c.nodes) n(value)
   WHERE c.id=1
 ), ancestors AS (
   SELECT o.id AS person_id, o.node AS person_node, o.id AS ancestor_id,
          o.node AS ancestor_node, o.parent AS ancestor_parent, 0 AS depth
   FROM org o
   WHERE o.node->>'type' IN ('person','group','division','root')
   UNION ALL
   SELECT a.person_id,a.person_node,p.id,p.node,p.parent,a.depth+1
   FROM ancestors a JOIN org p ON p.id=a.ancestor_parent
   WHERE a.depth<12
 ), matching AS (
   SELECT DISTINCT a.person_id,a.person_node FROM ancestors a
   WHERE a.ancestor_node->>'type'='group'
     AND regexp_replace(
       COALESCE(NULLIF(a.ancestor_node->>'branchName',''),a.ancestor_node->>'label',''),
       '[[:space:]]','','g'
     )=regexp_replace(p_branch,'[[:space:]]','','g')
 ), contacts AS (
   SELECT m.person_id,
     c.phone,
     m.person_node->>'type' AS node_type
   FROM matching m
   JOIN public.kpi_org_staff_contacts c
     ON c.node_id=COALESCE(NULLIF(m.person_node->>'staffContactId',''),m.person_id)
   WHERE m.person_node->>'staffHidden' IS DISTINCT FROM 'true'
     AND m.person_node->>'type' IN ('person','group')
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
