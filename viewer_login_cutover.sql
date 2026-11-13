-- PLK viewer authentication cutover.
-- Execute this only AFTER viewer_gate.js and both viewer pages are deployed.
-- Existing admin email login remains unchanged.
BEGIN;
CREATE TABLE IF NOT EXISTS public.kpi_viewer_sessions(
 token_hash text PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES public.kpi_viewer_accounts(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.kpi_viewer_login_attempts(
 username text PRIMARY KEY,
 failed_count integer NOT NULL DEFAULT 0,
 locked_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.kpi_viewer_sessions,public.kpi_viewer_login_attempts FROM PUBLIC,anon,authenticated;
ALTER TABLE public.kpi_viewer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_viewer_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.kpi_viewer_login(p_username text,p_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user public.kpi_viewer_accounts%ROWTYPE;v_attempt public.kpi_viewer_login_attempts%ROWTYPE;v_token text;v_name text;
BEGIN
 v_name=lower(trim(coalesce(p_username,'')));
 IF v_name !~ '^[a-z][a-z0-9_-]{3,31}$' OR coalesce(p_password,'') !~ '^[0-9]{4}$' THEN
   RETURN jsonb_build_object('error','아이디 또는 비밀번호를 확인하세요');
 END IF;
 INSERT INTO public.kpi_viewer_login_attempts(username) VALUES(v_name)
 ON CONFLICT(username) DO NOTHING;
 SELECT * INTO v_attempt FROM public.kpi_viewer_login_attempts WHERE username=v_name FOR UPDATE;
 IF v_attempt.locked_until>now() THEN RETURN jsonb_build_object('error','로그인 시도 제한: 15분 후 다시 시도하세요'); END IF;
 SELECT * INTO v_user FROM public.kpi_viewer_accounts WHERE username=v_name AND enabled=true;
 IF NOT FOUND OR v_user.password_hash IS DISTINCT FROM extensions.crypt(p_password,v_user.password_hash) THEN
   UPDATE public.kpi_viewer_login_attempts
   SET failed_count=CASE WHEN failed_count>=4 THEN 0 ELSE failed_count+1 END,
       locked_until=CASE WHEN failed_count>=4 THEN now()+interval '15 minutes' ELSE NULL END,
       updated_at=now() WHERE username=v_name;
   RETURN jsonb_build_object('error','아이디 또는 비밀번호를 확인하세요');
 END IF;
 UPDATE public.kpi_viewer_login_attempts SET failed_count=0,locked_until=NULL,updated_at=now() WHERE username=v_name;
 v_token=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.kpi_viewer_sessions(token_hash,account_id,expires_at)
 VALUES(encode(extensions.digest(v_token,'sha256'),'hex'),v_user.id,now()+interval '12 hours');
 RETURN jsonb_build_object('token',v_token,'role',v_user.role,'branch',v_user.branch,'username',v_user.username);
END;$$;

CREATE OR REPLACE FUNCTION public.kpi_viewer_whoami(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.kpi_viewer_accounts%ROWTYPE;
BEGIN
 SELECT x.* INTO a FROM public.kpi_viewer_accounts x
 JOIN public.kpi_viewer_sessions s ON s.account_id=x.id
 WHERE s.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
 AND s.expires_at>now() AND x.enabled=true;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('role',a.role,'branch',a.branch,'username',a.username);
END;$$;

CREATE OR REPLACE FUNCTION public.kpi_viewer_logout(p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 DELETE FROM public.kpi_viewer_sessions
 WHERE token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex');
END;$$;

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
       jsonb_set(e.event_data,'{signupEntries}',
         coalesce((SELECT jsonb_agg(entry) FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(e.event_data->'signupEntries')='array' THEN e.event_data->'signupEntries' ELSE '[]'::jsonb END
         ) entry WHERE coalesce(entry->>'branch',e.event_data->>'branch')=v_branch),'[]'::jsonb),true)
     END) ORDER BY e.id),'[]'::jsonb)
   INTO v_rows FROM public.kpi_public_events e
   WHERE v_branch IS NULL OR e.event_data->>'branch'=v_branch;
 ELSIF p_source='kpi_manager_performance_signups' AND a.role='manager' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_rows
   FROM public.kpi_manager_performance_signups() x;
 ELSIF p_source='kpi_monthly_targets' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_rows FROM public.kpi_monthly_targets x
   WHERE v_branch IS NULL OR x.branch=v_branch;
 ELSIF p_source='kpi_monthly_division_targets' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_rows FROM public.kpi_monthly_division_targets x
   WHERE v_branch IS NULL OR x.branch=v_branch;
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
         SELECT node_id,parent_id FROM all_nodes WHERE node->>'label'=v_branch
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
 ELSIF p_source='kpi_org_staff_public_status' AND a.role='manager' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_rows FROM public.kpi_org_staff_public_status x;
 ELSE
   RAISE EXCEPTION '이 계정에 허용되지 않은 조회입니다';
 END IF;
 RETURN coalesce(v_rows,'[]'::jsonb);
END;$$;

REVOKE ALL ON FUNCTION public.kpi_viewer_login(text,text),public.kpi_viewer_whoami(text),
 public.kpi_viewer_logout(text),public.kpi_viewer_read(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kpi_viewer_login(text,text),
 public.kpi_viewer_whoami(text),public.kpi_viewer_logout(text),public.kpi_viewer_read(text,text) TO anon,authenticated;
-- Prevent direct anonymous table reads; admin authenticated access policies remain intact.
REVOKE SELECT ON public.kpi_public_events,public.kpi_monthly_targets,
 public.kpi_monthly_division_targets,public.kpi_historical_seats,
 public.kpi_historical_cancellations,public.kpi_org_chart,
 public.kpi_org_staff_public_status FROM PUBLIC,anon;
-- Keep existing authenticated administrator RLS policies intact; anonymous SELECT is revoked above.
-- Block the old manager performance RPC and the public branch phone RPC.
REVOKE EXECUTE ON FUNCTION public.kpi_manager_performance_signups() FROM PUBLIC,anon;
DO $revoke$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='kpi_public_branch_staff_phones'
 LOOP
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon',f.signature);
 END LOOP;
END $revoke$;
COMMIT;
