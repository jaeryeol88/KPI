# PLK KPI 운영 안전장치

## 적용 상태 (2026-11-14)

- `signup_date_utils.js`: 입회금/분납 회차 공통 계산 모듈
- `tests/revenue-regression.test.mjs`: 금액·지사 분리·취소·비균등분납·JavaScript 구문 자동 검사
- `.github/workflows/kpi-regression.yml`: push 및 PR 시 검사
- `.github/workflows/kpi-pages-validated.yml`: 검사 성공 후에만 Actions 배포
- `audits/viewer-consistency.sql`: 관리자 원본과 공개 뷰어 저장본을 읽기 전용으로 비교
- `.github/workflows/kpi-data-audit.yml`: 매일 03:30(한국) 및 수동 실행

## 최초 1회 GitHub Pages 설정 (관리자 권한 필요)

Settings → Pages → Build and deployment → Source를 **GitHub Actions**로 변경합니다.
현재 `pages build and deployment`라는 기존 브랜치 배포가 별도로 실행되고 있으므로,
이 설정 전까지는 테스트 실패 시 배포 차단이 보장되지 않습니다.
연결 후 Actions에서 `PLK validated Pages deployment`가 성공해야 게시됩니다.

필요하면 Settings → Rules → Rulesets에서 main 변경 시 Pull Request와
`Verify website before deployment` 검사 성공을 요구하도록 설정할 수 있습니다.
다만 GitHub 계정/요금제 및 저장소 권한에 따라 설정 기능이 달라질 수 있습니다.

## 매일 데이터 대조

Settings → Secrets and variables → Actions에 `SUPABASE_DB_URL`이 있어야 합니다.
기존 백업 워크플로도 같은 이름을 사용합니다.
비밀키 값이나 접속 문자열을 코드/이슈/스크린샷/채팅에 공개하지 마세요.

Actions → KPI live database consistency audit → Run workflow로 1회 테스트합니다.
비밀키가 없거나 관리 원본과 뷰어의 가입 건이 다르면 검사에 실패합니다.
검사 결과에는 이름·메모·실제 금액을 출력하지 않고 누락 건수만 표시합니다.

## 변경/복구 절차

1. 변경 전 변경 대상과 회귀 테스트를 확인합니다.
2. PR에서 자동 검사 성공 후 반영합니다.
3. 배포 성공 확인 후 관리자 및 전체/지사 뷰어 화면을 점검합니다.
4. 데이터 누락 시 SQL로 원본을 곧바로 덮어쓰지 말고,
   원본/뷰어 공개본을 읽기 전용 비교하여 원인을 파악합니다.
5. 데이터베이스 스키마/트리거를 바꾸기 전 암호화 백업 성공을 확인합니다.

**주의:** 자동 테스트는 준비된 사례의 계산 오류를 줄이지만,
라이브 데이터의 모든 특수 사례 또는 사람의 입력 오류까지 막는 보증은 아닙니다.
