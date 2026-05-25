#!/bin/bash
# ============================================================
# 대리입찰 톡 — HTML/JS 연동 검증 스크립트
# 사용법: bash check.sh
# index.html 디자인 수정 후 반드시 실행하세요.
# ============================================================

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

PASS=0; FAIL=0; WARN=0

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   대리입찰 톡  HTML ↔ JS 연동 검증              ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. JS가 요구하는 모든 id → index.html 존재 여부 ─────────
echo -e "${CYAN}${BOLD}[ 1 ] JS 필수 ID 존재 확인 (index.html)${NC}"
echo -e "      JS파일: main.js / admin.js / auth.js"
echo ""

JS_IDS=$(grep -h "getElementById" js/main.js js/admin.js js/auth.js 2>/dev/null \
  | grep -oP "getElementById\(['\"]([^'\"]+)['\"]\)" \
  | grep -oP "['\"][^'\"]+['\"]" \
  | tr -d "'\"" | sort -u)

# betaExpertApply 는 옵셔널(?. 처리)이므로 무시 목록
OPTIONAL_IDS="betaExpertApply"

while IFS= read -r id; do
  if echo "$OPTIONAL_IDS" | grep -qw "$id"; then
    echo -e "  ${YELLOW}⚡  $id${NC}  (옵셔널 — 없어도 무방)"
    ((WARN++))
  elif grep -q "id=\"$id\"" index.html; then
    echo -e "  ${GREEN}✅  $id${NC}"
    ((PASS++))
  else
    echo -e "  ${RED}❌  $id  ← index.html에서 삭제됨! 버튼 먹통 원인${NC}"
    ((FAIL++))
  fi
done <<< "$JS_IDS"

# ── 2. JS querySelector 클래스 체크 ──────────────────────────
echo ""
echo -e "${CYAN}${BOLD}[ 2 ] JS 필수 클래스 존재 확인 (index.html)${NC}"
echo ""

REQUIRED_CLASSES=("nav-logo" "footer" "faq-question" "faq-item" "region-checkbox" "admin-tab" "payment-amount" "summary-row")

for cls in "${REQUIRED_CLASSES[@]}"; do
  if grep -q "class=\".*$cls\|class='.*$cls" index.html; then
    echo -e "  ${GREEN}✅  .$cls${NC}"
    ((PASS++))
  else
    echo -e "  ${RED}❌  .$cls  ← index.html에 없음!${NC}"
    ((FAIL++))
  fi
done

# ── 3. 필수 page div 존재 확인 ────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}[ 3 ] 페이지 div 존재 확인${NC}"
echo ""

PAGES=("mainPage" "applicationPage" "expertPage" "adminPage")
for pg in "${PAGES[@]}"; do
  if grep -q "id=\"$pg\"" index.html; then
    echo -e "  ${GREEN}✅  #$pg${NC}"
    ((PASS++))
  else
    echo -e "  ${RED}❌  #$pg  ← 페이지 전환 불가!${NC}"
    ((FAIL++))
  fi
done

# ── 4. Firebase SDK 스크립트 로드 확인 ────────────────────────
echo ""
echo -e "${CYAN}${BOLD}[ 4 ] Firebase SDK 로드 확인${NC}"
echo ""

FB_SCRIPTS=("firebase-app-compat" "firebase-firestore-compat" "firebase-storage-compat")
for s in "${FB_SCRIPTS[@]}"; do
  if grep -q "$s" index.html; then
    echo -e "  ${GREEN}✅  $s${NC}"
    ((PASS++))
  else
    echo -e "  ${RED}❌  $s  ← 스크립트 누락! Firestore/Storage 불가${NC}"
    ((FAIL++))
  fi
done

# ── 5. JS 파일 로드 순서 확인 ─────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}[ 5 ] JS 파일 로드 순서 확인${NC}"
echo ""

JS_ORDER=("api.js" "auth.js" "main.js" "admin.js")
PREV_LINE=0
ORDER_OK=true
for jsf in "${JS_ORDER[@]}"; do
  LINE=$(grep -n "$jsf" index.html | tail -1 | cut -d: -f1)
  if [ -z "$LINE" ]; then
    echo -e "  ${RED}❌  $jsf  ← 로드 안 됨!${NC}"
    ((FAIL++)); ORDER_OK=false
  elif [ "$LINE" -gt "$PREV_LINE" ]; then
    echo -e "  ${GREEN}✅  $jsf  (line $LINE)${NC}"
    ((PASS++)); PREV_LINE=$LINE
  else
    echo -e "  ${RED}❌  $jsf  (line $LINE) ← 순서 잘못됨! api.js보다 먼저 로드되면 안 됨${NC}"
    ((FAIL++)); ORDER_OK=false
  fi
done

# ── 6. 네비 안전장치 링크 확인 ────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}[ 6 ] 주요 링크 확인${NC}"
echo ""

LINKS=("safety.html" "login.html" "signup.html")
for l in "${LINKS[@]}"; do
  if [ -f "$l" ]; then
    echo -e "  ${GREEN}✅  $l  (파일 존재)${NC}"
    ((PASS++))
  else
    echo -e "  ${RED}❌  $l  ← 파일 없음!${NC}"
    ((FAIL++))
  fi
done

# ── 결과 요약 ─────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                   검증 결과                     ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║  ${GREEN}✅ 통과: $PASS개${NC}${BOLD}                                   ║${NC}"
echo -e "${BOLD}║  ${YELLOW}⚡ 경고: $WARN개${NC}${BOLD}  (옵셔널, 무시 가능)             ║${NC}"
echo -e "${BOLD}║  ${RED}❌ 실패: $FAIL개${NC}${BOLD}                                   ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}🎉 모든 검증 통과! 안전하게 배포 가능합니다.${NC}"
else
  echo -e "${RED}${BOLD}🚨 $FAIL개 오류 발견! 위의 ❌ 항목을 수정 후 재배포하세요.${NC}"
fi
echo ""
