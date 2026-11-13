-- Run this in Supabase SQL Editor because the original foundation SQL was already applied.
-- Only changes the admin account PIN validation; does not change existing passwords.
CREATE OR REPLACE FUNCTION public.kpi_admin_save_viewer_account(
 p_id uuid,p_username text,p_password text,p_role text,p_branch text,p_enabled boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;v_username text;
BEGIN
 IF NOT public.kpi_is_admin() THEN RAISE EXCEPTION '관리자만 접근할 수 있습니다'; END IF;
 v_username=lower(trim(p_username));
 IF v_username !~ '^[a-z][a-z0-9_-]{3,31}$' THEN RAISE EXCEPTION '아이디는 영문 소문자로 시작하는 4~32자여야 합니다'; END IF;
 IF p_role NOT IN ('all','branch','manager') THEN RAISE EXCEPTION '잘못된 권한'; END IF;
 IF (p_role='branch' AND coalesce(p_branch,'') NOT IN ('부산 1지사','부산 2지사','부산 3지사','부산 4지사')) OR
    (p_role<>'branch' AND p_branch IS NOT NULL) THEN RAISE EXCEPTION '잘못된 지사 권한'; END IF;
 IF p_id IS NULL THEN
  IF coalesce(p_password,'') !~ '^[0-9]{4} THEN RAISE EXCEPTION '비밀번호는 숫자 4자리여야 합니다'; END IF;
  INSERT INTO public.kpi_viewer_accounts(username,password_hash,role,branch,enabled)
  VALUES(v_username,extensions.crypt(p_password,extensions.gen_salt('bf',12)),p_role,p_branch,p_enabled) RETURNING id INTO v_id;
 ELSE
  UPDATE public.kpi_viewer_accounts
  SET username=v_username,role=p_role,branch=p_branch,enabled=p_enabled,
      password_hash=CASE WHEN p_password IS NULL OR p_password='' THEN password_hash
        ELSE extensions.crypt(p_password,extensions.gen_salt('bf',12)) END,
      updated_at=now()
  WHERE id=p_id RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION '계정이 없습니다'; END IF;
  IF p_password IS NOT NULL AND p_password<>'' AND p_password !~ '^[0-9]{4} THEN
    RAISE EXCEPTION '비밀번호는 숫자 4자리여야 합니다';
  END IF;
 END IF;
 RETURN v_id;
END;$$;
