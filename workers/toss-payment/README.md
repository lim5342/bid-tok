# 토스페이먼츠 결제 워커 (bidtok-toss-payment)

대리입찰 톡의 **132,000원 결제 승인/취소**를 처리하는 Cloudflare Worker입니다.
토스 시크릿 키는 프론트엔드에 절대 노출하지 않고 이 워커에만 보관합니다.

## 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/` | 헬스체크 (배포 확인 / 시크릿 설정 여부) |
| POST | `/confirm` | 결제 승인 `{ paymentKey, orderId, amount }` |
| POST | `/cancel` | 결제 취소/환불 `{ paymentKey, cancelReason, cancelAmount? }` |

## 배포 방법 (사장님 Cloudflare 계정)

기존 `bidtok-sms-proxy`, `bidtok-kakao-proxy` 워커와 **같은 계정·같은 방식**으로 배포합니다.

### 1) Cloudflare API 토큰 발급
- Cloudflare 대시보드 → 우상단 프로필 → **My Profile → API Tokens**
- **Create Token → "Edit Cloudflare Workers" 템플릿** 선택 → 생성
- 토큰 문자열 복사 (한 번만 보임)

### 2) 토스 시크릿 키 준비
- 토스페이먼츠 개발자센터 → 내 상점 → **API 키**
- 테스트: `test_sk_...` / 운영(라이브): `live_sk_...`

### 3) 배포 실행
```bash
cd workers/toss-payment

CLOUDFLARE_API_TOKEN="발급받은_CF토큰" \
TOSS_SECRET_KEY="test_sk_또는_live_sk_..." \
bash deploy.sh
```

또는 수동으로:
```bash
export CLOUDFLARE_API_TOKEN="..."
npx wrangler deploy
echo "test_sk_..." | npx wrangler secret put TOSS_SECRET_KEY
```

### 4) 배포 확인
```bash
curl https://bidtok-toss-payment.<계정>.workers.dev
# → { "ok": true, "secret_configured": true, ... }
```

### 5) 프론트엔드 연결
`js/payment-config.js` 의 `workerUrl` 을 위 워커 주소로 맞춥니다.
```js
workerUrl: 'https://bidtok-toss-payment.<계정>.workers.dev',
```

## 테스트 → 운영(라이브) 전환 체크리스트
1. `js/payment-config.js` `clientKey` 를 `live_ck_...` 로 교체
2. 워커 시크릿을 라이브 키로 갱신: `echo "live_sk_..." | npx wrangler secret put TOSS_SECRET_KEY`
3. 토스 개발자센터에서 결제수단/도메인 등록 확인
4. 소액 실결제 → 즉시 취소(`/cancel`)로 환불 동작 검증

## 보안 주의
- 시크릿 키(`*_sk_*`)는 **절대** 코드/깃에 커밋하지 않습니다 (wrangler secret만 사용).
- 채팅 등에 노출된 테스트 키는 운영 전 반드시 재발급/교체하세요.
