// ============================================================
// 토스페이먼츠 결제 설정 (payment-config.js)
// ★ 라이브 전환 시 이 파일의 값만 교체하면 됩니다.
// ★ 시크릿 키는 절대 여기에 넣지 않습니다 (Cloudflare Worker에만 보관).
// ============================================================
window.PAYMENT_CONFIG = {
    // 토스페이먼츠 클라이언트 키 (공개 가능)
    // 테스트: test_ck_... / 운영: live_ck_...
    clientKey: 'test_ck_E92LAa5PVb5pDRdZzPb937YmpXyJ',

    // 결제 승인/취소 처리 Cloudflare Worker URL (배포 완료)
    workerUrl: 'https://bidtok-toss-payment.qkqk5342.workers.dev',

    // 대리입찰 기본 금액 (VAT 포함)
    amount: 132000,

    // 결제 결과 리다이렉트 경로
    successUrl: location.origin + '/payment-success.html',
    failUrl: location.origin + '/payment-fail.html',
};

// ============================================================
// CODEF 경매사건 조회 설정 (codef-proxy 워커)
// ★ 배포 후 workerUrl 값을 실제 워커 주소로 교체하세요.
//   배포: workers/codef-proxy (wrangler deploy)
//   클라이언트 키(clientId/secret)는 워커 secret에만 보관합니다.
//   workerUrl이 비어 있으면 사건 조회는 형식 검증 + 대법원 링크로 폴백됩니다.
// ============================================================
window.CODEF_CONFIG = {
    workerUrl: 'https://bidtok-codef-proxy.qkqk5342.workers.dev',
};
