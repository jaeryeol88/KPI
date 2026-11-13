-- OPTIONAL: explicitly publish staff phone numbers to anonymous visitors of branch viewers.
-- WARNING: once enabled, all four branch rosters are publicly queryable by anyone.
-- Do not run until public disclosure is approved for every staff member.
CREATE OR REPLACE FUNCTION public.kpi_public_branch_staff_phones(p_branch text)
RETURNS TABLE(node_id text, phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 WITH RECURSIVE org AS (
   SELECT n.value AS node, n.value->>'id' AS id, n.value->>'parent' AS parent
   FROM public.kpi_org_chart c CROSS JOIN LATERAL jsonb_array_elements(c.nodes) n(value)
   WHERE c.id=1
 ), ancestors AS (
   SELECT o.id AS person_id,o.node,o.parent,0 AS depth
   FROM org o WHERE o.node->>'type' IN ('person','group','division','root')
   UNION ALL
   SELECT a.person_id,p.node,p.parent,a.depth+1 FROM ancestors a
   JOIN org p ON p.id=a.parent WHERE a.depth<12
 ), matching AS (
   SELECT DISTINCT a.person_id FROM ancestors a
   WHERE a.node->>'type'='group'
     AND COALESCE(NULLIF(a.node->>'branchName',''),a.node->>'label')=p_branch
 )
 SELECT o.id, c.phone FROM matching m JOIN org o ON o.id=m.person_id
 JOIN public.kpi_org_staff_contacts c ON c.node_id=COALESCE(NULLIF(o.node->>'staffContactId',''),o.id)
 WHERE o.node->>'type'='person' AND o.node->>'staffHidden' IS DISTINCT FROM 'true'
   AND p_branch IN ('부산 1지사','부산 2지사','부산 3지사','부산 4지사');
$$;
REVOKE ALL ON FUNCTION public.kpi_public_branch_staff_phones(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kpi_public_branch_staff_phones(text) TO anon, authenticated;
