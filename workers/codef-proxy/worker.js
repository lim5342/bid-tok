// ─────────────────────────────────────────────
// CODEF 법원경매정보 경매사건검색 프록시 Cloudflare Worker
//
// 환경변수(secret):
//   CODEF_CLIENT_ID       CODEF 클라이언트 아이디
//   CODEF_CLIENT_SECRET   CODEF 시크릿 키
// 환경변수(var, 선택):
//   CODEF_ENV             'sandbox' | 'development' | 'production' (기본: production)
//   CODEF_AUCTION_PATH    경매사건검색 API 경로(기본: /v1/kr/public/ck/auction/auction-events)
//
// 동작:
//   1) OAuth2 토큰 발급(Basic clientId:clientSecret) → access_token (1주일 유효, 메모리 캐시)
//   2) 경매사건검색 API 호출 (Authorization: Bearer)
//   3) CODEF 응답은 URL-encoded JSON이므로 디코딩하여 반환
//
// 엔드포인트:
//   GET  /            헬스체크
//   POST /search      { court, courtCode, caseYear, caseNo, caseNumber, itemNo }
//                     → 경매사건 정보(원본 data + 정규화된 normalized)
//
// 시크릿은 프론트엔드에 절대 노출하지 않고 이 워커에만 보관합니다.
// ─────────────────────────────────────────────

const OAUTH_URL = 'https://oauth.codef.io/oauth/token';

const API_DOMAINS = {
  sandbox: 'https://sandbox.codef.io',
  development: 'https://development.codef.io',
  production: 'https://api.codef.io',
};

// access_token 메모리 캐시(워커 인스턴스 수명 동안 재사용)
let _tokenCache = { token: null, expiresAt: 0 };

function corsHeaders(origin) {
  const allowed = [
    'https://bid-tok.kr',
    'https://www.bid-tok.kr',
    'https://lim5342.github.io',
  ];
  let allowOrigin = 'https://bid-tok.kr';
  if (origin && (allowed.includes(origin) || /localhost|127\.0\.0\.1|sandbox\.novita\.ai|\.pages\.dev$|github\.io$|\.e2b\.dev$/.test(origin))) {
    allowOrigin = origin;
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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

// OAuth2 access_token 발급(+캐시)
async function getAccessToken(env) {
  const now = Date.now();
  if (_tokenCache.token && _tokenCache.expiresAt > now + 60_000) {
    return _tokenCache.token;
  }
  const id = env.CODEF_CLIENT_ID;
  const secret = env.CODEF_CLIENT_SECRET;
  if (!id || !secret) throw new Error('CODEF 클라이언트 키가 설정되지 않았습니다.');

  const basic = 'Basic ' + btoa(`${id}:${secret}`);
  const res = await fetch(`${OAUTH_URL}?grant_type=client_credentials&scope=read`, {
    method: 'POST',
    headers: {
      'Authorization': basic,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = {}; }
  if (!res.ok || !data.access_token) {
    throw new Error('CODEF 토큰 발급 실패: ' + (data.error_description || data.error || text.slice(0, 200)));
  }
  const ttl = (data.expires_in ? Number(data.expires_in) : 604799) * 1000;
  _tokenCache = { token: data.access_token, expiresAt: now + ttl };
  return data.access_token;
}

// CODEF 응답 파싱: 본문이 URL-encoded JSON일 수 있어 decodeURIComponent 시도
function parseCodefBody(text) {
  // 1) 그대로 JSON 파싱 시도
  try { return JSON.parse(text); } catch (_) {}
  // 2) URL 디코딩 후 파싱 시도
  try { return JSON.parse(decodeURIComponent(text)); } catch (_) {}
  // 3) + 를 공백 처리 후 디코딩
  try { return JSON.parse(decodeURIComponent(text.replace(/\+/g, ' '))); } catch (_) {}
  return null;
}

// 사건번호 정규화: "2023타경6216" → { year:'2023', no:'6216' }
function parseCaseNo(raw) {
  if (!raw) return { year: '', no: '' };
  const m = String(raw).replace(/\s/g, '').match(/(\d{4})\s*타?경?\s*(\d+)/);
  if (m) return { year: m[1], no: m[2] };
  return { year: '', no: '' };
}

// 다양한 응답 필드명에서 값을 안전하게 추출
function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== '') return obj[k];
  }
  return '';
}

// CODEF 경매 응답을 프론트가 쓰기 쉬운 형태로 정규화(필드명이 케이스마다 다를 수 있어 방어적으로 처리)
function normalize(data) {
  if (!data || typeof data !== 'object') return null;
  // data가 배열이면 첫 항목 사용
  const d = Array.isArray(data) ? (data[0] || {}) : data;

  const photos = [];
  // 사진/이미지 리스트 후보
  const photoList = d.resPictureList || d.resImageList || d.resPhotoList || d.pictureList || [];
  if (Array.isArray(photoList)) {
    photoList.forEach(p => {
      const u = (typeof p === 'string') ? p : pick(p, ['resPictureUrl', 'resImageUrl', 'url', 'imageUrl', 'picUrl']);
      if (u) photos.push(u);
    });
  }
  const singlePhoto = pick(d, ['resPictureUrl', 'resImage', 'resPhoto', 'imageUrl']);
  if (singlePhoto && !photos.includes(singlePhoto)) photos.push(singlePhoto);

  return {
    court: pick(d, ['resCourtName', 'commCourtName', 'resCourt', 'courtName']),
    caseNo: pick(d, ['resCaseNo', 'commCaseNo', 'resCaseNumber', 'caseNo']),
    itemNo: pick(d, ['resItemNo', 'commObjectNo', 'resObjectNo', 'itemNo']),
    address: pick(d, ['resAddress', 'resLocation', 'commAddr', 'address', 'resRoadAddress']),
    propertyType: pick(d, ['resUsage', 'resKind', 'resType', 'propertyType', 'commUsage']),
    appraisalPrice: pick(d, ['resAppraisalAmt', 'resAppraisedValue', 'resEvaluationAmt', 'appraisalPrice']),
    minBidPrice: pick(d, ['resLowestSellingAmt', 'resMinBidAmt', 'resMinimumPrice', 'minBidPrice']),
    bidDeposit: pick(d, ['resBidDeposit', 'resDepositAmt', 'resBiddingDeposit', 'bidDeposit']),
    bidDate: pick(d, ['resAuctionDate', 'resSellingDate', 'resBidDate', 'bidDate', 'commSellingDate']),
    failedCount: pick(d, ['resFailedCount', 'resBidFailCnt', 'failedCount']),
    status: pick(d, ['resAuctionStatus', 'resStatus', 'status']),
    photos,
    raw: d,
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (request.method === 'GET') {
      return json({
        ok: true,
        service: 'bidtok-codef-proxy',
        env: env.CODEF_ENV || 'production',
        client_configured: !!(env.CODEF_CLIENT_ID && env.CODEF_CLIENT_SECRET),
        endpoints: ['POST /search'],
      }, 200, cors);
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method Not Allowed' }, 405, cors);
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, 400, cors); }

    // 입력 정규화
    const parsed = parseCaseNo(body.caseNumber || `${body.caseYear || ''}타경${body.caseNo || ''}`);
    const caseYear = body.caseYear || parsed.year;
    const caseNo = body.caseNo || parsed.no;
    const courtCode = body.courtCode || '';
    const courtName = body.court || '';
    const itemNo = body.itemNo || body.itemNumber || '';

    if (!caseYear || !caseNo) {
      return json({ error: '사건번호(연도/일련번호)가 올바르지 않습니다. 예) 2023타경6216' }, 400, cors);
    }
    if (!courtCode && !courtName) {
      return json({ error: '법원(court 또는 courtCode)이 필요합니다.' }, 400, cors);
    }

    let token;
    try { token = await getAccessToken(env); }
    catch (e) { return json({ error: String(e.message || e) }, 500, cors); }

    const domain = API_DOMAINS[env.CODEF_ENV] || API_DOMAINS.production;
    const apiPath = env.CODEF_AUCTION_PATH || '/v1/kr/public/ck/auction/auction-events';

    // CODEF 경매사건검색 요청 파라미터
    // (필드명은 CODEF 명세 기준. 환경/버전에 따라 다를 수 있어 다중 키로 전송)
    const reqBody = {
      organization: '0009',           // 대법원 법원경매정보
      caseYear: String(caseYear),
      caseNo: String(caseNo),
      commCaseNo: `${caseYear}타경${caseNo}`,
      ...(courtCode ? { courtCode, commCourtCode: courtCode } : {}),
      ...(courtName ? { courtName, commCourtName: courtName } : {}),
      ...(itemNo ? { objectNo: String(itemNo), commObjectNo: String(itemNo) } : {}),
    };

    let res, text;
    try {
      res = await fetch(`${domain}${apiPath}`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reqBody),
      });
      text = await res.text();
    } catch (e) {
      return json({ error: 'CODEF API 호출 실패: ' + String(e.message || e) }, 502, cors);
    }

    const parsedResp = parseCodefBody(text);
    if (!parsedResp) {
      return json({ error: 'CODEF 응답 파싱 실패', rawText: text.slice(0, 500) }, 502, cors);
    }

    const code = parsedResp.result && parsedResp.result.code;
    if (code && code !== 'CF-00000') {
      // CODEF 비즈니스 오류(사건 없음 등)
      return json({
        success: false,
        code,
        message: (parsedResp.result && parsedResp.result.message) || '조회 결과가 없습니다.',
      }, 200, cors);
    }

    const normalized = normalize(parsedResp.data);
    return json({
      success: true,
      normalized,
      data: parsedResp.data,
      result: parsedResp.result,
    }, 200, cors);
  },
};
