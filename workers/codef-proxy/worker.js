// ─────────────────────────────────────────────
// CODEF 법원경매정보 경매사건검색 프록시 Cloudflare Worker
//
// 환경변수(secret):
//   CODEF_CLIENT_ID       CODEF 클라이언트 아이디
//   CODEF_CLIENT_SECRET   CODEF 시크릿 키
// 환경변수(var, 선택):
//   CODEF_ENV             'sandbox' | 'development' | 'production' (기본: development)
//   CODEF_AUCTION_PATH    경매사건검색 API 경로(기본: /v1/kr/public/ck/auction-events/search)
//   CODEF_ORG             기관코드(기본: 0004 - 대법원 법원경매정보)
//
// CODEF 명세(KR_PB_CK_013 · 대법원 법원경매정보 경매사건검색) 확인 결과:
//   요청부(JSON): organization(0004 고정) / courtName(법원명) /
//                 caseNumberYear(YYYY) / caseNumberNumber(사건일련번호)
//   응답부(data): resCaseNumber, resCaseName, resClaimAmt, resFinalResult,
//                 resProductList[]{resUseType(용도/물건종류), resValuationAmt(감정가),
//                   resState(진행상태), resDetailList[]{resAddress(소재지), resType}},
//                 resDateList[]{resKind(기일종류), resDate(YYYYMMDD(HHMM)),
//                   resAmount(최저매각가격), resResultDesc(결과: 변경/유찰/매각...)}
//   ※ 이 API에는 물건 사진 필드가 없습니다(사건 진행정보 위주).
//
// 동작:
//   1) OAuth2 토큰 발급(Basic clientId:clientSecret) → access_token (1주일 유효, 메모리 캐시)
//   2) 경매사건검색 API 호출 (Authorization: Bearer)
//   3) CODEF 응답은 URL-encoded JSON이므로 디코딩하여 반환
//
// 엔드포인트:
//   GET  /            헬스체크
//   POST /search      { court, caseNumber }  또는  { court, caseYear, caseNo }
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
  // CODEF 본문은 URL-encoded JSON(공백이 +로 인코딩됨)이므로
  // '+'→공백 치환 후 디코딩을 최우선으로 시도합니다.
  try { return JSON.parse(decodeURIComponent(text.replace(/\+/g, ' '))); } catch (_) {}
  try { return JSON.parse(decodeURIComponent(text)); } catch (_) {}
  try { return JSON.parse(text); } catch (_) {}
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

// "20240820(1000)" → "2024-08-20 10:00"
function fmtDateTime(raw) {
  if (!raw) return '';
  const m = String(raw).match(/(\d{4})(\d{2})(\d{2})(?:\((\d{2})(\d{2})\))?/);
  if (!m) return String(raw);
  const ymd = `${m[1]}-${m[2]}-${m[3]}`;
  return m[4] ? `${ymd} ${m[4]}:${m[5]}` : ymd;
}

function toNum(v) {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^\d]/g, ''));
  return isNaN(n) ? 0 : n;
}

// CODEF 경매사건검색(KR_PB_CK_013) 응답 → 프론트 사용 형태로 정규화
function normalize(data) {
  if (!data || typeof data !== 'object') return null;
  const d = Array.isArray(data) ? (data[0] || {}) : data;

  // 물건(상품) 리스트 — 대표 물건 1건 기준
  const productList = Array.isArray(d.resProductList) ? d.resProductList : [];
  const product = productList[0] || {};

  // 소재지: 대표 물건의 상세내역 주소들을 합침
  const detailList = Array.isArray(product.resDetailList) ? product.resDetailList : [];
  const addresses = detailList.map(x => pick(x, ['resAddress'])).filter(Boolean);
  // 상세가 없으면 배당리스트 주소로 대체
  if (!addresses.length && Array.isArray(d.resDistributionList)) {
    d.resDistributionList.forEach(x => { const a = pick(x, ['resAddress']); if (a) addresses.push(a); });
  }
  const address = addresses[0] || '';

  // 물건종류: 용도 + 상세 구분(토지/건물)
  const detailTypes = [...new Set(detailList.map(x => pick(x, ['resType'])).filter(Boolean))];
  const propertyType = pick(product, ['resUseType']) ||
    (detailTypes.length ? detailTypes.join('·') : '');

  // 감정가(평가금액)
  const appraisalPrice = pick(product, ['resValuationAmt']);

  // 기일 리스트(매각기일 위주). 최신(미래/최근) 매각기일 1건과 전체 정규화
  const rawDates = Array.isArray(d.resDateList) ? d.resDateList : [];
  const dateList = rawDates.map(x => ({
    kind: pick(x, ['resKind']),
    date: fmtDateTime(pick(x, ['resDate'])),
    dateRaw: pick(x, ['resDate']),
    place: pick(x, ['resPlace']),
    minBidPrice: pick(x, ['resAmount']),
    result: pick(x, ['resResultDesc']),
  }));

  // 매각기일 중 대표 1건: 결과가 비어있는(예정) 매각기일 우선, 없으면 마지막 매각기일
  const saleDates = dateList.filter(x => /매각기일/.test(x.kind));
  let mainSale = saleDates.find(x => !x.result || /^(\s|기일변경)*$/.test(x.result)) ||
                 saleDates[saleDates.length - 1] || dateList[dateList.length - 1] || {};

  // 최저매각가격: 대표 매각기일의 금액(없으면 감정가)
  const minBidPrice = mainSale.minBidPrice || '';

  // 입찰보증금: 대법원 API에는 별도 필드가 없음 → 최저가의 10% 추정(참고용)
  const minNum = toNum(minBidPrice) || toNum(appraisalPrice);
  const bidDeposit = minNum ? String(Math.round(minNum * 0.1)) : '';

  // 유찰 횟수: 기일 결과에 '유찰' 포함 건수
  const failedCount = saleDates.filter(x => /유찰/.test(x.result || '')).length;

  // 관련사건 리스트에서 법원명을 보조 추출(상위 data에 법원 필드가 없을 수 있음)
  const involved = Array.isArray(d.resInvolvedCaseList) ? d.resInvolvedCaseList : [];
  const courtFromInvolved = involved.length ? pick(involved[0], ['commCourt']) : '';

  return {
    court: pick(d, ['commCourt', 'resCourtName', 'courtName']) || courtFromInvolved,
    caseNo: pick(d, ['resCaseNumber']),
    caseName: pick(d, ['resCaseName']),
    itemNo: pick(product, ['resNumber']),
    address,
    addresses,
    propertyType,
    appraisalPrice,
    minBidPrice,
    bidDeposit,
    bidDepositEstimated: !!bidDeposit,   // 추정값임을 표시
    bidDate: mainSale.date || '',
    bidDateRaw: mainSale.dateRaw || '',
    bidPlace: mainSale.place || '',
    failedCount,
    status: pick(product, ['resState']) || pick(d, ['resFinalResult']),
    finalResult: pick(d, ['resFinalResult']),
    claimAmount: pick(d, ['resClaimAmt']),
    receiptDate: fmtDateTime(pick(d, ['resReceiptDate'])),
    dateList,
    productList,
    photos: [],          // 본 API에는 물건 사진 필드가 없음
    hasPhoto: false,
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
    if (!courtName) {
      return json({ error: '법원명(court)이 필요합니다. 예) 서울중앙지방법원' }, 400, cors);
    }

    let token;
    try { token = await getAccessToken(env); }
    catch (e) { return json({ error: String(e.message || e) }, 500, cors); }

    const domain = API_DOMAINS[env.CODEF_ENV] || API_DOMAINS.development;
    const apiPath = env.CODEF_AUCTION_PATH || '/v1/kr/public/ck/auction-events/search';

    // CODEF 경매사건검색(KR_PB_CK_013) 요청 파라미터 — 명세 확인 완료
    //   organization: '0004' 고정(대법원 법원경매정보)
    //   courtName: 법원명 / caseNumberYear: 사건 연도(YYYY) / caseNumberNumber: 사건 일련번호
    const reqBody = {
      organization: env.CODEF_ORG || '0004',
      courtName: String(courtName),
      caseNumberYear: String(caseYear),
      caseNumberNumber: String(caseNo),
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
