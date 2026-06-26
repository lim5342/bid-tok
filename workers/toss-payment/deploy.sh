#!/usr/bin/env bash
# ============================================================
# 토스페이먼츠 결제 워커 배포 스크립트
# ------------------------------------------------------------
# 사용법:
#   1) Cloudflare API 토큰 준비 (대시보드 → My Profile → API Tokens →
#      "Edit Cloudflare Workers" 템플릿으로 생성)
#   2) 토스 시크릿 키 준비 (토스 개발자센터 → 내 상점 → API 키)
#      - 테스트: test_sk_...  /  운영: live_sk_...
#   3) 아래처럼 환경변수로 키를 넘겨 실행:
#
#      CLOUDFLARE_API_TOKEN="cf토큰" \
#      TOSS_SECRET_KEY="test_sk_..." \
#      bash deploy.sh
#
# 이미 wrangler 로그인이 돼 있으면 CLOUDFLARE_API_TOKEN 은 생략 가능.
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

echo "▶ 1/4 wrangler 인증 확인..."
npx wrangler whoami

echo "▶ 2/4 워커 배포 (bidtok-toss-payment)..."
npx wrangler deploy

if [ -n "${TOSS_SECRET_KEY:-}" ]; then
  echo "▶ 3/4 TOSS_SECRET_KEY 시크릿 설정..."
  echo "$TOSS_SECRET_KEY" | npx wrangler secret put TOSS_SECRET_KEY
else
  echo "▶ 3/4 (건너뜀) TOSS_SECRET_KEY 환경변수가 없습니다."
  echo "   배포 후 아래 명령으로 직접 설정하세요:"
  echo "   npx wrangler secret put TOSS_SECRET_KEY"
fi

echo "▶ 4/4 헬스체크..."
WORKER_URL=$(npx wrangler deployments list 2>/dev/null | grep -o 'https://[a-zA-Z0-9.-]*workers.dev' | head -1 || true)
if [ -n "$WORKER_URL" ]; then
  echo "   워커 URL: $WORKER_URL"
  echo "   → curl $WORKER_URL 로 secret_configured:true 확인"
fi

echo "✅ 완료! payment-config.js 의 workerUrl 을 위 워커 URL 로 맞춰주세요."
