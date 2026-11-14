-- Run once in Supabase SQL Editor after deploying the viewer code.
-- Fixes "permission denied for function kpi_public_branch_staff_phones"
-- without granting anonymous callers unrestricted access to staff phone numbers.
BEGIN;
CREATE OR REPLACE FUNCTION public.kpi_viewer_branch_staff_phones(
  p_token text,
  p_branch text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user jsonb;
  v_rows jsonb;
BEGIN
  IF p_token IS NULL OR length(btrim(p_token))=0 THEN
    RAISE EXCEPTION '뷰어 로그인이 필요합니다.';
  END IF;
  v_user := to_jsonb(public.kpi_viewer_whoami(p_token));
  IF v_user IS NULL
     OR v_user->>'role' IS DISTINCT FROM 'branch'
     OR v_user->>'branch' IS DISTINCT FROM p_branch
     OR p_branch NOT IN ('부산 1지사','부산 2지사','부산 3지사','부산 4지사') THEN
    RAISE EXCEPTION '해당 지사 연락처 조회 권한이 없습니다.';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
  INTO v_rows
  FROM public.kpi_public_branch_staff_phones(p_branch) AS row_data;
  RETURN v_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.kpi_viewer_branch_staff_phones(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kpi_viewer_branch_staff_phones(text,text) TO anon, authenticated;
COMMIT;
