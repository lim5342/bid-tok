// ─────────────────────────────────────────────
// 토스페이먼츠 결제 승인 Cloudflare Worker
// 환경변수(secret): TOSS_SECRET_KEY  (예: test_sk_... / live_sk_...)
//
// 엔드포인트:
//   POST /confirm   { paymentKey, orderId, amount }  → 결제 승인
//   POST /cancel    { paymentKey, cancelReason, cancelAmount? } → 결제 취소(환불)
//
// 시크릿 키는 절대 프론트엔드에 노출하지 않고 이 워커에만 보관합니다.
// ─────────────────────────────────────────────

const TOSS_API = 'https://api.tosspayments.com/v1/payments';

// 허용 Origin (운영 도메인 + 로컬/샌드박스 개발용)
function corsHeaders(origin) {
  const allowed = [
    'https://bid-tok.kr',
    'https://www.bid-tok.kr',
    'https://lim5342.github.io',
  ];
  // 샌드박스/로컬 개발 환경도 허용 (sandbox.novita.ai, localhost, *.pages.dev, github.io)
  let allowOrigin = 'https://bid-tok.kr';
  if (origin && (allowed.includes(origin) || /localhost|127\.0\.0\.1|sandbox\.novita\.ai|\.pages\.dev$|github\.io$/.test(origin))) {
    allowOrigin = origin;
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }
    // 헬스체크 (배포 확인용)
    if (request.method === 'GET') {
      return json({
        ok: true,
        service: 'bidtok-toss-payment',
        secret_configured: !!env.TOSS_SECRET_KEY,
        endpoints: ['POST /confirm', 'POST /cancel'],
      }, 200, cors);
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method Not Allowed' }, 405, cors);
    }

    const secretKey = env.TOSS_SECRET_KEY;
    if (!secretKey) {
      return json({ error: '서버 결제 키가 설정되지 않았습니다.' }, 500, cors);
    }
    // Basic 인증: "시크릿키:" 를 base64 인코딩 (콜론 뒤는 비움)
    const authHeader = 'Basic ' + btoa(secretKey + ':');

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, ''); // 끝 슬래시 제거

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, 400, cors);
    }

    // ── 결제 승인 ──────────────────────────────
    if (path.endsWith('/confirm') || path === '' || path === '/') {
      const { paymentKey, orderId, amount } = body;
      if (!paymentKey || !orderId || !amount) {
        return json({ error: 'paymentKey, orderId, amount는 필수입니다.' }, 400, cors);
      }

      const res = await fetch(`${TOSS_API}/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
      });

      const result = await res.json();
      if (!res.ok) {
        // 토스 에러 그대로 전달 (code, message 포함)
        return json({ success: false, ...result }, res.status, cors);
      }
      return json({ success: true, ...result }, 200, cors);
    }

    // ── 결제 취소(환불) ─────────────────────────
    if (path.endsWith('/cancel')) {
      const { paymentKey, cancelReason, cancelAmount } = body;
      if (!paymentKey || !cancelReason) {
        return json({ error: 'paymentKey, cancelReason은 필수입니다.' }, 400, cors);
      }
      const payload = { cancelReason };
      if (cancelAmount) payload.cancelAmount = Number(cancelAmount);

      const res = await fetch(`${TOSS_API}/${paymentKey}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) {
        return json({ success: false, ...result }, res.status, cors);
      }
      return json({ success: true, ...result }, 200, cors);
    }

    return json({ error: '알 수 없는 경로입니다.' }, 404, cors);
  },
};
