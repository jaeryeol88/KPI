-- Replaces viewer read function to fix branch organization and staff status.
CREATE OR REPLACE FUNCTION public.kpi_viewer_read(p_token text,p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.kpi_viewer_accounts%ROWTYPE;v_rows jsonb;v_branch text;
BEGIN
 SELECT x.* INTO a FROM public.kpi_viewer_accounts x
 JOIN public.kpi_viewer_sessions s ON s.account_id=x.id
 WHERE s.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
 AND s.expires_at>now() AND x.enabled=true;
 IF NOT FOUND THEN RAISE EXCEPTION '로그인이 만료되었습니다. 다시 로그인하세요'; END IF;
 v_branch=CASE WHEN a.role='branch' THEN a.branch ELSE NULL END;
 IF p_source='kpi_public_events' AND a.role IN ('all','branch') THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'event_data',
     CASE WHEN v_branch IS NULL THEN e.event_data ELSE
       jsonb_set(
         jsonb_set(e.event_data,'{branches}',jsonb_build_array(v_branch),true),
         '{signupEntries}',
         coalesce((SELECT jsonb_agg(entry)
           FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e.event_data->'signupEntries')='array'
             THEN e.event_data->'signupEntries' ELSE '[]'::jsonb END) entry
           WHERE coalesce(nullif(entry->>'branch',''),e.event_data->>'branch')=v_branch),'[]'::jsonb),
         true)
     END) ORDER BY e.id),'[]'::jsonb)
   INTO v_rows FROM public.kpi_public_events e
   WHERE v_branch IS NULL
      OR e.event_data->>'branch'=v_branch
      OR (jsonb_typeof(e.event_data->'branches')='array'
          AND e.event_data->'branches' ? v_branch)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(e.event_data->'signupEntries')='array'
          THEN e.event_data->'signupEntries' ELSE '[]'::jsonb END) entry
          WHERE entry->>'branch'=v_branch);
 ELSIF p_source='kpi_manager_performance_signups' AND a.role='manager' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_rows
   FROM public.kpi_manager_performance_signups() x;
 ELSIF p_source='kpi_monthly_targets' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_rows FROM public.kpi_monthly_targets x
   WHERE v_branch IS NULL OR x.branch=v_branch;
 ELSIF p_source='kpi_monthly_division_targets' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_rows FROM public.kpi_monthly_division_targets x
   WHERE v_branch IS NULL OR x.branch=v_branch;
 ELSIF p_source='kpi_competition_signups' AND a.role IN ('all','branch') THEN
   -- Only seat counts and attribution: no member name, product, fees or revenue.
   SELECT coalesce(jsonb_agg(jsonb_build_object(
     'id',e.id,
     'event_data',jsonb_build_object(
       'branch',e.event_data->>'branch',
       'division',e.event_data->>'division',
       'date',e.event_data->>'date',
       'signupEntries',coalesce((
         SELECT jsonb_agg(jsonb_build_object(
           'branch',coalesce(nullif(x->>'branch',''),e.event_data->>'branch'),
           'division',coalesce(nullif(x->>'division',''),e.event_data->>'division'),
           'manager',x->>'manager',
           'signupDate',x->>'signupDate',
           'seats',x->'seats',
           'group',x->>'group',
           'withdrawn',coalesce(x->'withdrawn','false'::jsonb)
         ))
         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e.event_data->'signupEntries')='array'
           THEN e.event_data->'signupEntries' ELSE '[]'::jsonb END) x
       ),'[]'::jsonb)
     ))) ,'[]'::jsonb)
   INTO v_rows FROM public.kpi_public_events e;
 ELSIF p_source='kpi_competition_history' AND a.role IN ('all','branch') THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object(
      'branch',x.branch,'division',x.division,'manager',x.manager,
      'goal_year',x.goal_year,'goal_month',x.goal_month,
      'actual_seats',x.actual_seats,'employment_status',x.employment_status
   )),'[]'::jsonb) INTO v_rows FROM public.kpi_historical_seats x;
 ELSIF p_source='kpi_historical_seats' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_rows FROM public.kpi_historical_seats x
   WHERE v_branch IS NULL OR x.branch=v_branch;
 ELSIF p_source='kpi_historical_cancellations' AND a.role='all' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_rows FROM public.kpi_historical_cancellations x;
 ELSIF p_source='kpi_org_chart' THEN
   IF v_branch IS NULL THEN
     SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_rows
     FROM public.kpi_org_chart x WHERE x.id=1;
   ELSE
     WITH RECURSIVE
       all_nodes AS (
         SELECT n.node,n.ord,n.node->>'id' AS node_id,n.node->>'parent' AS parent_id
         FROM public.kpi_org_chart c,
              jsonb_array_elements(c.nodes) WITH ORDINALITY AS n(node,ord)
         WHERE c.id=1
       ),
       descendants AS (
         SELECT node_id,parent_id FROM all_nodes WHERE node->>'label'=v_branch OR node->>'branchName'=v_branch
         UNION
         SELECT n.node_id,n.parent_id FROM all_nodes n
         JOIN descendants d ON n.parent_id=d.node_id
       ),
       ancestors AS (
         SELECT n.node_id,n.parent_id FROM all_nodes n JOIN descendants d ON n.node_id=d.node_id
         UNION
         SELECT n.node_id,n.parent_id FROM all_nodes n JOIN ancestors a ON a.parent_id=n.node_id
       )
     SELECT jsonb_build_array(jsonb_build_object('id',1,'nodes',
       coalesce(jsonb_agg(n.node ORDER BY n.ord),'[]'::jsonb)))
     INTO v_rows FROM all_nodes n WHERE n.node_id IN (SELECT node_id FROM ancestors);
   END IF;
 ELSIF p_source='kpi_org_staff_public_status' AND a.role IN ('all','branch','manager') THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('node_id',x.node_id,'employment_status',x.employment_status)),'[]'::jsonb)
   INTO v_rows FROM public.kpi_org_staff_public_status x
   WHERE v_branch IS NULL OR x.node_id IN (
     WITH RECURSIVE descendants AS (
       SELECT n.node->>'id' AS node_id FROM public.kpi_org_chart c,
       jsonb_array_elements(c.nodes) n(node)
       WHERE c.id=1 AND (n.node->>'label'=v_branch OR n.node->>'branchName'=v_branch)
       UNION
       SELECT n.node->>'id' FROM public.kpi_org_chart c,
       jsonb_array_elements(c.nodes) n(node)
       JOIN descendants d ON n.node->>'parent'=d.node_id
       WHERE c.id=1
     ) SELECT node_id FROM descendants
   );
 ELSE
   RAISE EXCEPTION '이 계정에 허용되지 않은 조회입니다';
 END IF;
 RETURN coalesce(v_rows,'[]'::jsonb);
END;$$;
