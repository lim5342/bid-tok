# bidtok-codef-proxy

CODEF 법원경매정보 **경매사건검색** API 프록시 Cloudflare Worker.
프론트엔드(apply.html)에서 사건번호를 입력하면 이 워커를 통해 경매 물건의
사진/감정가/최저매각가/매각기일/입찰보증금 등을 자동 조회합니다.

CODEF 클라이언트 키(clientId/clientSecret)는 **이 워커에만** 보관하고
프론트엔드에는 절대 노출하지 않습니다.

## 배포

```bash
cd workers/codef-proxy

# 1) 시크릿 설정 (CODEF https://codef.io 계정의 키)
wrangler secret put CODEF_CLIENT_ID
wrangler secret put CODEF_CLIENT_SECRET

# 2) (선택) 환경 전환: 무료/체험은 sandbox 또는 development
#    wrangler.toml [vars] CODEF_ENV 수정: sandbox | development | production

# 3) 배포
wrangler deploy
```

배포 후 헬스체크:
```bash
curl https://bidtok-codef-proxy.<your-subdomain>.workers.dev
# { ok:true, client_configured:true, ... }
```

## 엔드포인트

### `POST /search`
요청(JSON):
```json
{
  "court": "서울중앙지방법원",
  "courtCode": "B000210",
  "caseNumber": "2023타경6216",
  "itemNo": "2"
}
```
- `caseNumber` 대신 `caseYear`+`caseNo`로 분리 전송 가능
- `courtCode`(법원사무소코드) 또는 `court`(법원명) 중 하나 필요

응답(JSON):
```json
{
  "success": true,
  "normalized": {
    "court": "...", "caseNo": "...", "itemNo": "...",
    "address": "...", "propertyType": "...",
    "appraisalPrice": "...", "minBidPrice": "...",
    "bidDeposit": "...", "bidDate": "...",
    "failedCount": "...", "status": "...",
    "photos": ["https://..."],
    "raw": { /* CODEF 원본 data */ }
  },
  "data": { /* CODEF 원본 data */ },
  "result": { "code": "CF-00000", "message": "성공" }
}
```

## 주의 / 튜닝 포인트

- **API 경로**: CODEF 명세에 따라 `CODEF_AUCTION_PATH`가 다를 수 있습니다.
  실제 명세(https://developer.codef.io/products/public/each/ck/auction-events)
  의 엔드포인트로 `wrangler.toml`을 맞춰주세요.
- **응답 필드명**: 경매사건검색 응답 필드명(`resAppraisalAmt` 등)은
  케이스에 따라 다를 수 있어 `worker.js`의 `normalize()`에서 다중 키로
  방어적으로 추출합니다. 실제 응답을 보고 키를 보강하세요.
- **무료(체험) 사용**: CODEF 개인 가입 후 sandbox/development 환경으로
  먼저 연동하고, 운영 전환 시 `CODEF_ENV=production` + 운영 키로 교체합니다.
- access_token은 1주일 유효하며 워커 메모리에 캐시됩니다.
