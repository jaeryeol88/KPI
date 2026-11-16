-- PLK manager viewer: remove 15-minute account lock only for enabled manager accounts.
-- Execute once in Supabase SQL Editor. Admin, branch, and all-viewer policies remain unchanged.
-- Warning: manager PINs are 4 digits; use unique credentials and monitor abuse.
BEGIN;

CREATE OR REPLACE FUNCTION public.kpi_viewer_login(p_username text,p_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_user public.kpi_viewer_accounts%ROWTYPE;
  v_attempt public.kpi_viewer_login_attempts%ROWTYPE;
  v_token text;
  v_name text;
  v_is_manager boolean;
BEGIN
  v_name=lower(trim(coalesce(p_username,'')));
  IF v_name !~ '^[a-z][a-z0-9_-]{3,31}$' OR coalesce(p_password,'') !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('error','아이디 또는 비밀번호를 확인하세요');
  END IF;

  SELECT * INTO v_user FROM public.kpi_viewer_accounts
  WHERE username=v_name AND enabled=true;
  v_is_manager=FOUND AND v_user.role='manager';

  INSERT INTO public.kpi_viewer_login_attempts(username) VALUES(v_name)
  ON CONFLICT(username) DO NOTHING;
  SELECT * INTO v_attempt FROM public.kpi_viewer_login_attempts
  WHERE username=v_name FOR UPDATE;

  -- Manager viewers are not locked out because multiple staff share this account.
  -- Existing locks on manager accounts are cleared at the next login attempt.
  IF v_is_manager THEN
    IF v_attempt.failed_count<>0 OR v_attempt.locked_until IS NOT NULL THEN
      UPDATE public.kpi_viewer_login_attempts
      SET failed_count=0,locked_until=NULL,updated_at=now()
      WHERE username=v_name;
    END IF;
  ELSIF v_attempt.locked_until>now() THEN
    RETURN jsonb_build_object('error','로그인 시도 제한: 15분 후 다시 시도하세요');
  END IF;

  IF v_user.id IS NULL OR v_user.password_hash IS DISTINCT FROM extensions.crypt(p_password,v_user.password_hash) THEN
    IF NOT v_is_manager THEN
      UPDATE public.kpi_viewer_login_attempts
      SET failed_count=CASE WHEN failed_count>=4 THEN 0 ELSE failed_count+1 END,
          locked_until=CASE WHEN failed_count>=4 THEN now()+interval '15 minutes' ELSE NULL END,
          updated_at=now() WHERE username=v_name;
    END IF;
    RETURN jsonb_build_object('error','아이디 또는 비밀번호를 확인하세요');
  END IF;

  UPDATE public.kpi_viewer_login_attempts
  SET failed_count=0,locked_until=NULL,updated_at=now() WHERE username=v_name;
  v_token=encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO public.kpi_viewer_sessions(token_hash,account_id,expires_at)
  VALUES(encode(extensions.digest(v_token,'sha256'),'hex'),v_user.id,now()+interval '12 hours');
  RETURN jsonb_build_object('token',v_token,'role',v_user.role,'branch',v_user.branch,'username',v_user.username);
END;$$;

-- Clear any existing manager lockouts immediately.
UPDATE public.kpi_viewer_login_attempts AS attempts
SET failed_count=0,locked_until=NULL,updated_at=now()
FROM public.kpi_viewer_accounts AS account
WHERE attempts.username=account.username
  AND account.role='manager' AND account.enabled=true;

COMMIT;
