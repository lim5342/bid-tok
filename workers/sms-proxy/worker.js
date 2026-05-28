// ─────────────────────────────────────────────
// 솔라피 SMS 중계 Cloudflare Worker
// 환경변수: SOLAPI_KEY, SOLAPI_SECRET, SENDER
// ─────────────────────────────────────────────

export default {
  async fetch(request, env) {
    // CORS 허용
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    try {
      const body = await request.json();
      const { to, code, type, data } = body;

      // 전화번호 필수
      if (!to) {
        return new Response(JSON.stringify({ error: '수신번호가 필요합니다.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 메시지 타입별 텍스트 생성
      let text = '';
      if (type === 'partner_approved') {
        // 파트너 승인 알림
        const name = (data && data.name) ? data.name : '파트너';
        text = `[대리입찰톡] ${name}님, 파트너 심사가 완료되었습니다! 🎉\n이제 로그인 후 매칭 서비스를 이용하실 수 있습니다.\n▶ https://bid-tok.kr/login.html`;
      } else if (type === 'partner_rejected') {
        // 파트너 거부 알림
        const name = (data && data.name) ? data.name : '파트너';
        const reason = (data && data.reason) ? data.reason : '';
        text = `[대리입찰톡] ${name}님, 파트너 신청 심사 결과를 안내드립니다.\n아쉽게도 이번 심사에서는 승인이 어렵습니다.${reason ? '\n사유: ' + reason : ''}\n문의: 02-853-5875`;
      } else if (code) {
        // 기본 인증번호 발송
        text = `[대리입찰톡] 인증번호 [${code}]를 입력해주세요. (5분 이내 입력)`;
      } else {
        return new Response(JSON.stringify({ error: '올바른 요청 형식이 아닙니다.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 전화번호 정리 (숫자만)
      const toClean = to.replace(/[^0-9]/g, '');

      // 솔라피 HMAC 인증 생성
      const apiKey    = env.SOLAPI_KEY;
      const apiSecret = env.SOLAPI_SECRET;
      const sender    = env.SENDER || '028535875';

      const date      = new Date().toISOString();
      const salt      = crypto.randomUUID().replace(/-/g, '');
      const sigString = date + salt;

      // HMAC-SHA256 서명
      const encoder = new TextEncoder();
      const keyData = encoder.encode(apiSecret);
      const msgData = encoder.encode(sigString);
      const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
      const signature = Array.from(new Uint8Array(sigBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      const authHeader = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;

      // 솔라피 API 호출
      const solapiRes = await fetch('https://api.solapi.com/messages/v4/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({
          message: {
            to: toClean,
            from: sender,
            text
          }
        })
      });

      const result = await solapiRes.json();

      if (solapiRes.ok) {
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        console.error('솔라피 오류:', JSON.stringify(result));
        return new Response(JSON.stringify({ error: result.errorMessage || 'SMS 발송 실패' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

    } catch (err) {
      console.error('Worker 오류:', err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
