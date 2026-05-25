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
      const { to, code } = await request.json();

      if (!to || !code) {
        return new Response(JSON.stringify({ error: '수신번호와 코드가 필요합니다.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 전화번호 정리 (숫자만)
      const toClean = to.replace(/[^0-9]/g, '');

      // 솔라피 HMAC 인증 생성
      const apiKey    = env.SOLAPI_KEY;
      const apiSecret = env.SOLAPI_SECRET;
      const sender    = env.SENDER || '0285355875';

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
            text: `[대리입찰 톡] 인증번호 [${code}]를 입력해주세요. (5분 이내 입력)`
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
