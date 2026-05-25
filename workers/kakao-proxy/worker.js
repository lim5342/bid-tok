// ─────────────────────────────────────────────────────────────────
// 비드톡 카카오 알림톡 중계 Cloudflare Worker
// 환경변수: SOLAPI_KEY, SOLAPI_SECRET, SENDER, KAKAO_CHANNEL_ID
// 배포: npx wrangler deploy (workers/kakao-proxy/)
//
// 지원 알림 유형 (type):
//   apply_complete   - 신청완료 (고객)
//   expert_assigned  - 법무사 배정완료 (고객)
//   expert_notify    - 새 사건 배정 (법무사)
//   bid_proceeding   - 입찰 진행중 (고객)
//   bid_won          - 낙찰 (고객)
//   bid_lost         - 유찰/패찰 (고객)
// ─────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
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
      const { type, to, data } = body;

      if (!type || !to) {
        return new Response(JSON.stringify({ error: 'type과 to(전화번호)가 필요합니다.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 전화번호 정리
      const toClean = to.replace(/[^0-9]/g, '');
      if (toClean.length < 10) {
        return new Response(JSON.stringify({ error: '올바른 전화번호를 입력해주세요.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ── 알림 메시지 템플릿 ──────────────────────────────────────
      const msg = buildMessage(type, data, toClean, env);
      if (!msg) {
        return new Response(JSON.stringify({ error: `알 수 없는 알림 유형: ${type}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ── 솔라피 HMAC 인증 ────────────────────────────────────────
      const apiKey    = env.SOLAPI_KEY;
      const apiSecret = env.SOLAPI_SECRET;
      const sender    = env.SENDER || '01083445342';
      const kakaoChannelId = env.KAKAO_CHANNEL_ID || '';

      const date   = new Date().toISOString();
      const salt   = crypto.randomUUID().replace(/-/g, '');
      const encoder = new TextEncoder();
      const cryptoKey = await crypto.subtle.importKey(
        'raw', encoder.encode(apiSecret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const sigBuffer  = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(date + salt));
      const signature  = Array.from(new Uint8Array(sigBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      const authHeader = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;

      // ── 솔라피 발송 요청 ────────────────────────────────────────
      // 카카오 채널 ID가 없으면 SMS로 폴백
      const messagePayload = kakaoChannelId
        ? {
            to: toClean,
            from: sender,
            text: msg.smsText,             // SMS 폴백용
            type: 'ATA',                   // 알림톡
            kakaoOptions: {
              pfId: kakaoChannelId,
              templateCode: msg.templateCode,
              variables: msg.variables,
            }
          }
        : {
            to: toClean,
            from: sender,
            text: msg.smsText,
          };

      const solapiRes = await fetch('https://api.solapi.com/messages/v4/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({ message: messagePayload })
      });

      const result = await solapiRes.json();

      if (solapiRes.ok) {
        return new Response(JSON.stringify({ success: true, type, channel: kakaoChannelId ? 'kakao' : 'sms' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        // 알림톡 실패 시 SMS 폴백
        if (kakaoChannelId && result.errorCode) {
          console.warn('알림톡 실패, SMS 폴백 시도:', result.errorMessage);
          const smsFallback = await fetch('https://api.solapi.com/messages/v4/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
            body: JSON.stringify({ message: { to: toClean, from: sender, text: msg.smsText } })
          });
          if (smsFallback.ok) {
            return new Response(JSON.stringify({ success: true, type, channel: 'sms_fallback' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }
        console.error('발송 실패:', JSON.stringify(result));
        return new Response(JSON.stringify({ error: result.errorMessage || '발송 실패', detail: result }), {
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

// ─────────────────────────────────────────────────────────────────
// 알림 메시지 빌더
// data: { appId, name, court, caseNumber, bidDate, address,
//         bidAmount, expertName, expertPhone, result }
// ─────────────────────────────────────────────────────────────────
function buildMessage(type, d = {}, to, env) {
  const appId    = d.appId    || '-';
  const name     = d.name     || '고객';
  const court    = d.court    || '-';
  const caseNum  = d.caseNumber || '-';
  const bidDate  = d.bidDate  || '-';
  const address  = d.address  || '-';
  const bidAmt   = d.bidAmount ? Number(d.bidAmount).toLocaleString('ko-KR') + '원' : '-';
  const expertNm = d.expertName  || '-';
  const expertPh = d.expertPhone || '-';
  const result   = d.result   || '-';
  const mypageUrl = 'https://bid-tok.kr/mypage.html';
  const applyUrl  = 'https://bid-tok.kr/apply.html';

  const templates = {
    // ① 신청완료 - 고객 수신
    apply_complete: {
      templateCode: 'bidtok_apply_complete',
      variables: { name, court, caseNum, bidDate, appId, mypageUrl },
      smsText:
`[비드톡] 대리입찰 신청완료

안녕하세요, ${name}님!
대리입찰 신청이 접수되었습니다.

▪ 사건번호: ${caseNum}
▪ 법원: ${court}
▪ 입찰일: ${bidDate}

담당 법무사 배정 후 다시 안내드립니다.
마이페이지: ${mypageUrl}

문의: 카카오톡 채널 @비드톡`,
    },

    // ② 법무사 배정완료 - 고객 수신
    expert_assigned: {
      templateCode: 'bidtok_expert_assigned',
      variables: { name, court, caseNum, bidDate, expertNm, expertPh, mypageUrl },
      smsText:
`[비드톡] 법무사 배정완료

${name}님, 담당 법무사가 배정되었습니다!

▪ 담당: ${expertNm} 법무사
▪ 연락처: ${expertPh}
▪ 사건번호: ${caseNum}
▪ 법원: ${court}
▪ 입찰일: ${bidDate}

법무사님께 직접 연락하시거나
마이페이지에서 확인하세요.
→ ${mypageUrl}`,
    },

    // ③ 새 사건 배정 - 법무사 수신
    expert_notify: {
      templateCode: 'bidtok_expert_notify',
      variables: { expertNm, court, caseNum, bidDate, address, bidAmt },
      smsText:
`[비드톡] 새 사건 배정

${expertNm} 법무사님,
새로운 대리입찰 사건이 배정되었습니다.

▪ 법원: ${court}
▪ 사건번호: ${caseNum}
▪ 입찰일: ${bidDate}
▪ 소재지: ${address}
▪ 입찰금액: ${bidAmt}

마이페이지에서 의뢰인 정보를 확인하세요.
빠른 연락 부탁드립니다.`,
    },

    // ④ 입찰 진행중 - 고객 수신
    bid_proceeding: {
      templateCode: 'bidtok_bid_proceeding',
      variables: { name, court, caseNum, bidDate, expertNm },
      smsText:
`[비드톡] 입찰 진행중

${name}님, 오늘 입찰이 진행 중입니다.

▪ 법원: ${court}
▪ 사건번호: ${caseNum}
▪ 입찰일: ${bidDate}
▪ 담당: ${expertNm} 법무사

결과는 입찰 완료 후 즉시 안내드립니다.
마이페이지: ${mypageUrl}`,
    },

    // ⑤ 낙찰 - 고객 수신
    bid_won: {
      templateCode: 'bidtok_bid_won',
      variables: { name, court, caseNum, bidDate, bidAmt, expertNm, expertPh, mypageUrl },
      smsText:
`[비드톡] 🎉 낙찰되었습니다!

${name}님, 축하드립니다!
입찰에 낙찰되셨습니다.

▪ 법원: ${court}
▪ 사건번호: ${caseNum}
▪ 낙찰금액: ${bidAmt}
▪ 담당: ${expertNm} 법무사 (${expertPh})

이후 잔금 납부 등 진행 절차는
담당 법무사님께 안내받으세요.
마이페이지: ${mypageUrl}`,
    },

    // ⑥ 유찰/패찰 - 고객 수신
    bid_lost: {
      templateCode: 'bidtok_bid_lost',
      variables: { name, court, caseNum, bidDate, result, applyUrl },
      smsText:
`[비드톡] 입찰 결과 안내

${name}님, 입찰 결과를 안내드립니다.

▪ 법원: ${court}
▪ 사건번호: ${caseNum}
▪ 결과: ${result}

다음 기일에 다시 도전해보세요!
신규 신청: ${applyUrl}

비드톡을 이용해주셔서 감사합니다.`,
    },
  };

  return templates[type] || null;
}
