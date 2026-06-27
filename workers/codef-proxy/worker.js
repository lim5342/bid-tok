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
function normalize(data, itemNo) {
  if (!data || typeof data !== 'object') return null;
  const d = Array.isArray(data) ? (data[0] || {}) : data;

  // 물건(상품) 리스트 — 물건번호(itemNo)가 주어지면 해당 물건, 없으면 첫 물건
  const productList = Array.isArray(d.resProductList) ? d.resProductList : [];
  let product = productList[0] || {};
  if (itemNo != null && String(itemNo).trim() !== '') {
    const want = String(itemNo).trim().replace(/[^\d]/g, '');
    const matched = productList.find(p => {
      const num = String(pick(p, ['resNumber']) || '').replace(/[^\d]/g, '');
      return num && num === want;
    });
    if (matched) product = matched;
  }

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
  const apprNum = toNum(appraisalPrice);

  // 기일 리스트 정규화
  // ⚠️ CODEF resDateList 는 사건 내 '모든 물건(호실)'의 기일을 한꺼번에 담는다.
  //    각 물건의 (1차 유찰 + 다음 예정) 기일이 물건 순서대로 나열되며,
  //    각 물건의 '1차 매각가격 = 그 물건의 감정가' 다.
  //    → 선택한 물건(itemNo)의 감정가를 앵커로, 그 직후 저감되는 기일만 골라야
  //      유찰 횟수/최저가가 정확하다.
  const rawDates = Array.isArray(d.resDateList) ? d.resDateList : [];
  const dateListAll = rawDates.map(x => ({
    kind: pick(x, ['resKind']),
    date: fmtDateTime(pick(x, ['resDate'])),
    dateRaw: pick(x, ['resDate']),
    place: pick(x, ['resPlace']),
    minBidPrice: pick(x, ['resAmount']),
    result: pick(x, ['resResultDesc']),
  }));

  // (1) 대표 물건의 매각기일만 추출:
  //     앵커 = 금액이 감정가와 (오차 0.5%) 일치하는 첫 1차 매각기일.
  //     앵커 다음부터 '직전의 60~86%(14~40% 저감)'로 이어지면 같은 물건의 다음 기일.
  //     저감 패턴을 벗어나면 다음 물건의 1차이므로 종료.
  const allSale = dateListAll.filter(x => /매각기일/.test(x.kind));
  let saleDates;
  if (apprNum > 0) {
    const anchorIdx = allSale.findIndex(x => {
      const amt = toNum(x.minBidPrice);
      return amt > 0 && Math.abs(amt - apprNum) <= apprNum * 0.005;
    });
    const chain = [];
    if (anchorIdx >= 0) {
      chain.push(allSale[anchorIdx]);
      let prevAmt = toNum(allSale[anchorIdx].minBidPrice);
      for (let i = anchorIdx + 1; i < allSale.length; i++) {
        const amt = toNum(allSale[i].minBidPrice);
        if (!amt) continue;
        const ratio = amt / prevAmt;
        if (ratio >= 0.98 && ratio <= 1.001) {
          // 동일 금액(변경/연기 후 재지정된 같은 회차 기일) → 같은 물건, prevAmt 유지
          chain.push(allSale[i]);
        } else if (ratio >= 0.6 && ratio <= 0.86) {
          // 14~40% 저감(다음 회차) → 같은 물건, prevAmt 갱신
          chain.push(allSale[i]); prevAmt = amt;
        } else {
          break; // 그 외(다른 감정가 = 다른 물건의 1차) → 종료
        }
      }
    }
    saleDates = chain.length ? chain : allSale;
  } else {
    saleDates = allSale;
  }

  // (2) 같은 날짜+금액 중복 제거
  const seen = new Set();
  saleDates = saleDates.filter(x => {
    const key = (x.dateRaw || '') + '|' + (x.minBidPrice || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 화면 표시용 dateList: 위에서 고른 매각기일 + 비매각기일(매각결정기일 등) 함께
  const seen2 = new Set();
  const dateList = dateListAll.filter(x => {
    if (/매각기일/.test(x.kind)) {
      const inChain = saleDates.some(s => s.dateRaw === x.dateRaw && s.minBidPrice === x.minBidPrice);
      if (!inChain) return false;
    }
    const key = (x.kind || '') + '|' + (x.dateRaw || '') + '|' + (x.minBidPrice || '');
    if (seen2.has(key)) return false;
    seen2.add(key);
    return true;
  });

  // 대표(다음) 매각기일 선정:
  //   '변경/취소/연기/기일변경/추후지정' 등 입찰이 진행되지 않은 기일은 제외하고,
  //   결과가 비어있는(아직 진행 전인 = 예정) 매각기일 중 가장 가까운 미래를 대표로 삼는다.
  const CANCELLED = /(변경|취소|연기|추후|정정|취하|기각|각하)/;
  const scheduled = saleDates.filter(x => !x.result || /^\s*$/.test(x.result));  // 결과 미정 = 예정
  // 예정 기일 중 미래(오늘 이후) 우선, 없으면 첫 예정 기일
  const todayRaw = (() => { const n = new Date(); return `${n.getFullYear()}${String(n.getMonth()+1).padStart(2,'0')}${String(n.getDate()).padStart(2,'0')}`; })();
  const futureScheduled = scheduled
    .filter(x => (String(x.dateRaw).slice(0, 8) || '0') >= todayRaw)
    .sort((a, b) => String(a.dateRaw).localeCompare(String(b.dateRaw)));
  let mainSale =
    futureScheduled[0] ||
    scheduled[scheduled.length - 1] ||
    // 예정 기일이 전혀 없으면, 변경/취소가 아닌 마지막 매각기일
    [...saleDates].reverse().find(x => !CANCELLED.test(x.result || '')) ||
    saleDates[saleDates.length - 1] || {};

  // 최저매각가격: 대표 매각기일의 금액(없으면 감정가)
  const minBidPrice = mainSale.minBidPrice || '';

  // 입찰보증금: 대법원 API에는 별도 필드가 없음 → 최저가의 10% 추정(참고용)
  const minNum = toNum(minBidPrice) || toNum(appraisalPrice);
  const bidDeposit = minNum ? String(Math.round(minNum * 0.1)) : '';

  // 유찰 횟수: 대표 물건 매각기일 결과에 '유찰' 포함 건수(변경/취소는 제외됨)
  const failedCount = saleDates.filter(x => /유찰/.test(x.result || '')).length;

  // 진행상태 판정: 매각(낙찰)/매각허가 등 완료 여부 → 입찰 가능/불가 표시용
  const hasSold = saleDates.some(x => /매각|낙찰/.test(x.result || '')) ||
                  /매각허가|매각결정|배당/.test(pick(product, ['resState']) || '');
  const hasFuture = !!futureScheduled.length;
  // saleStatus: 'biddable'(입찰가능) | 'sold'(매각완료) | 'closed'(종결/기타)
  let saleStatus = 'biddable';
  if (hasFuture) saleStatus = 'biddable';
  else if (hasSold) saleStatus = 'sold';
  else saleStatus = 'closed';
  const biddable = saleStatus === 'biddable';

  // 관련사건 리스트에서 법원명을 보조 추출(상위 data에 법원 필드가 없을 수 있음)
  const involved = Array.isArray(d.resInvolvedCaseList) ? d.resInvolvedCaseList : [];
  const courtFromInvolved = involved.length ? pick(involved[0], ['commCourt']) : '';

  // 사건 내 전체 물건 목록(물건번호 선택용 요약)
  const items = productList.map(p => {
    const dl = Array.isArray(p.resDetailList) ? p.resDetailList : [];
    return {
      itemNo: pick(p, ['resNumber']),
      propertyType: pick(p, ['resUseType']),
      appraisalPrice: pick(p, ['resValuationAmt']),
      address: (dl.map(x => pick(x, ['resAddress'])).filter(Boolean)[0]) || '',
      status: pick(p, ['resState']),
    };
  });

  return {
    court: pick(d, ['commCourt', 'resCourtName', 'courtName']) || courtFromInvolved,
    caseNo: pick(d, ['resCaseNumber']),
    caseName: pick(d, ['resCaseName']),
    itemNo: pick(product, ['resNumber']),
    items,                                // 사건 내 전체 물건 목록
    itemCount: items.length,
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
    saleStatus,                          // 'biddable' | 'sold' | 'closed'
    biddable,                            // 입찰 참여 가능 여부(예정 매각기일 존재)
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

    const normalized = normalize(parsedResp.data, itemNo);
    return json({
      success: true,
      normalized,
      data: parsedResp.data,
      result: parsedResp.result,
    }, 200, cors);
  },
};
