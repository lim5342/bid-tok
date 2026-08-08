// ============================================================
//  대리입찰톡 인증 중계 Worker (auth-proxy)
//  ------------------------------------------------------------
//  목적: 로그인/회원가입 등 "비밀번호가 오가는" 처리를 서버(Worker)
//        에서만 수행한다. 브라우저는 더 이상 users/admins 컬렉션을
//        직접 읽지 않는다 → Firestore 규칙을 잠글 수 있게 된다.
//
//  Firestore 접근은 Firebase '서비스 계정'으로 발급한 액세스 토큰을
//  사용하므로 보안 규칙(잠금)을 우회한다(서버 권한).
//
//  필요한 시크릿(Cloudflare):
//    FIREBASE_SA        서비스 계정 JSON 전체 (문자열)
//    ADMIN_MIGRATE_KEY  일괄 마이그레이션 보호용 임의 문자열
//
//  엔드포인트(POST):
//    /login            {userId, password, userType}
//    /signup           {userData}
//    /change-password  {userId, currentPassword, newPassword}
//    /check-id         {userId}
//    /check-email      {email}
//    /migrate-passwords {key}   (관리자용: 평문→해시 일괄 변환)
// ============================================================

const FS_PROJECT = 'bid-tok';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FS_PROJECT}/databases/(default)/documents`;

// 허용 출처(Origin) — 인증 엔드포인트이므로 명시적 허용만
const ALLOWED_ORIGINS = [
  'https://bid-tok.kr',
  'https://www.bid-tok.kr',
  'https://lim5342.github.io',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:5500',
];

function corsHeadersFor(request) {
  const origin = request.headers.get('Origin') || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ── base64url 유틸 ─────────────────────────────────────────
function b64urlFromBytes(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlFromStr(str) {
  return b64urlFromBytes(new TextEncoder().encode(str));
}
function bytesFromB64(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ============================================================
//  서비스 계정 → 액세스 토큰 (RS256 JWT 교환), 메모리 캐시
// ============================================================
let _tokenCache = { token: null, exp: 0 };

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (_tokenCache.token && _tokenCache.exp - 60 > now) return _tokenCache.token;

  const sa = JSON.parse(env.FIREBASE_SA);
  const scope = 'https://www.googleapis.com/auth/datastore';
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope,
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64urlFromStr(JSON.stringify(header))}.${b64urlFromStr(JSON.stringify(claim))}`;

  // PEM(private_key) → CryptoKey (PKCS8)
  const pem = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const keyData = bytesFromB64(pem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${b64urlFromBytes(new Uint8Array(sigBuf))}`;

  const res = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('토큰 발급 실패: ' + t);
  }
  const data = await res.json();
  _tokenCache = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return _tokenCache.token;
}

// ============================================================
//  Firestore REST 헬퍼 (서버 토큰 사용 → 규칙 우회)
// ============================================================
function fieldsToObj(fields) {
  if (!fields) return {};
  const obj = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('stringValue' in v) obj[k] = v.stringValue;
    else if ('integerValue' in v) obj[k] = parseInt(v.integerValue, 10);
    else if ('doubleValue' in v) obj[k] = v.doubleValue;
    else if ('booleanValue' in v) obj[k] = v.booleanValue;
    else if ('nullValue' in v) obj[k] = null;
    else if ('timestampValue' in v) obj[k] = v.timestampValue;
    else if ('arrayValue' in v) {
      obj[k] = (v.arrayValue.values || []).map(av => {
        if ('stringValue' in av) return av.stringValue;
        if ('integerValue' in av) return parseInt(av.integerValue, 10);
        if ('booleanValue' in av) return av.booleanValue;
        if ('mapValue' in av) return fieldsToObj(av.mapValue.fields);
        return null;
      });
    } else if ('mapValue' in v) obj[k] = fieldsToObj(v.mapValue.fields);
    else obj[k] = Object.values(v)[0];
  }
  return obj;
}
function objToFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) fields[k] = { nullValue: null };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (typeof v === 'number') fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else if (Array.isArray(v)) fields[k] = { arrayValue: { values: v.map(i => ({ stringValue: String(i) })) } };
    else if (typeof v === 'object') fields[k] = { mapValue: { fields: objToFields(v) } };
    else fields[k] = { stringValue: String(v) };
  }
  return fields;
}

async function fsQueryByField(token, collection, field, value) {
  const res = await fetch(`${FS_BASE}:runQuery`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: 'EQUAL',
            value: { stringValue: String(value) },
          },
        },
        limit: 5,
      },
    }),
  });
  if (!res.ok) throw new Error(`쿼리 실패(${res.status}): ${await res.text()}`);
  const rows = await res.json();
  const out = [];
  for (const r of rows) {
    if (!r.document) continue;
    out.push({ id: r.document.name.split('/').pop(), ...fieldsToObj(r.document.fields) });
  }
  return out;
}

async function fsCreate(token, collection, data) {
  const res = await fetch(`${FS_BASE}/${collection}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: objToFields(data) }),
  });
  if (!res.ok) throw new Error(`생성 실패(${res.status}): ${await res.text()}`);
  const j = await res.json();
  return { id: j.name.split('/').pop(), ...data };
}

async function fsPatch(token, collection, id, data) {
  const mask = Object.keys(objToFields(data)).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const res = await fetch(`${FS_BASE}/${collection}/${encodeURIComponent(id)}?${mask}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: objToFields(data) }),
  });
  if (!res.ok) throw new Error(`수정 실패(${res.status}): ${await res.text()}`);
  return true;
}

async function fsListAll(token, collection) {
  let items = [], pageToken = null;
  for (let p = 0; p < 20; p++) {
    let url = `${FS_BASE}/${collection}?pageSize=300`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) throw new Error(`목록 실패(${res.status})`);
    const j = await res.json();
    (j.documents || []).forEach(d => items.push({ id: d.name.split('/').pop(), ...fieldsToObj(d.fields) }));
    pageToken = j.nextPageToken;
    if (!pageToken) break;
  }
  return items;
}

// ============================================================
//  비밀번호 해싱 (PBKDF2-SHA256)
//  저장형식:  pbkdf2$<iterations>$<saltB64url>$<hashB64url>
// ============================================================
const PBKDF2_ITER = 100000; // Cloudflare Workers 최대 지원치(10만). 초과 시 Web Crypto 오류.

async function fsGetDoc(token, collection, id) {
  const res = await fetch(`${FS_BASE}/${collection}/${encodeURIComponent(id)}`, { headers: { 'Authorization': `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`단건조회 실패(${res.status})`);
  const j = await res.json();
  return { id: j.name.split('/').pop(), ...fieldsToObj(j.fields) };
}
async function fsSetDoc(token, collection, id, data) {
  const res = await fetch(`${FS_BASE}/${collection}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: objToFields(data) }),
  });
  if (!res.ok) throw new Error(`저장 실패(${res.status}): ${await res.text()}`);
  return true;
}
async function fsDelete(token, collection, id) {
  const res = await fetch(`${FS_BASE}/${collection}/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`삭제 실패(${res.status})`);
  return true;
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    baseKey, 256
  );
  return `pbkdf2$${PBKDF2_ITER}$${b64urlFromBytes(salt)}$${b64urlFromBytes(new Uint8Array(bits))}`;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// stored 가 해시형식이면 검증, 아니면(레거시 평문) 평문 비교
async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return { ok: false, legacy: false };
  if (stored.startsWith('pbkdf2$')) {
    const [, iterStr, saltB64, hashB64] = stored.split('$');
    const salt = bytesFromB64(saltB64);
    const baseKey = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: parseInt(iterStr, 10), hash: 'SHA-256' },
      baseKey, 256
    );
    const got = b64urlFromBytes(new Uint8Array(bits));
    return { ok: timingSafeEqual(got, hashB64), legacy: false };
  }
  // 레거시 평문 저장분
  return { ok: timingSafeEqual(String(password), stored), legacy: true };
}

function sanitizeUser(u) {
  const { password, tempPassword, ...safe } = u;
  return safe;
}

// ============================================================
//  세션 토큰 (HMAC-SHA256) — 로그인 시 발급, 명단 조회 시 권한 확인
// ============================================================
function b64urlToStr(b64) { return new TextDecoder().decode(bytesFromB64(b64)); }

async function hmacSign(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return b64urlFromBytes(new Uint8Array(sig));
}
async function makeSession(env, payload) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12 }; // 12시간
  const p = b64urlFromStr(JSON.stringify(body));
  const sig = await hmacSign(env.WORKER_SECRET || 'dev-secret', p);
  return p + '.' + sig;
}
async function verifySession(env, tokenStr) {
  if (!tokenStr || tokenStr.indexOf('.') < 0) return null;
  const [p, sig] = tokenStr.split('.');
  const expect = await hmacSign(env.WORKER_SECRET || 'dev-secret', p);
  if (!timingSafeEqual(sig, expect)) return null;
  let payload;
  try { payload = JSON.parse(b64urlToStr(p)); } catch { return null; }
  if (!payload || (payload.exp && payload.exp < Math.floor(Date.now() / 1000))) return null;
  return payload;
}
// 신청 법원명 정규화 (지방법원 ↔ 지법)
function normCourt(v) { return String(v || '').replace(/지방법원/g, '지법').replace(/\s+/g, ' ').trim(); }
function normType(v) {
  const s = String(v || '').toLowerCase().trim();
  if (s === 'realtor' || s.includes('공인중개') || s.includes('매수신청') || s.includes('중개')) return 'realtor';
  if (s === 'lawyer' || s.includes('법무')) return 'lawyer';
  return '';
}

// ============================================================
//  라우팅
// ============================================================
export default {
  async fetch(request, env) {
    const cors = corsHeadersFor(request);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'GET' && path === '/') {
      return json({ ok: true, service: 'bidtok-auth-proxy', sa_configured: !!env.FIREBASE_SA }, 200, cors);
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: cors });
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ success: false, message: '잘못된 요청 형식입니다.' }, 400, cors); }

    try {
      const token = await getAccessToken(env);

      // ── 로그인 ─────────────────────────────────────────
      if (path === '/login') {
        const { userId, password, userType } = body;
        if (!userId || !password) return json({ success: false, message: '아이디와 비밀번호를 입력해주세요.' }, 200, cors);

        const found = await fsQueryByField(token, 'users', 'userId', userId);
        const user = found[0];
        if (!user) return json({ success: false, message: '존재하지 않는 아이디입니다.' }, 200, cors);
        if (userType && user.userType !== userType) return json({ success: false, message: '회원 유형이 일치하지 않습니다.' }, 200, cors);

        const chk = await verifyPassword(password, user.password);
        if (!chk.ok) return json({ success: false, message: '비밀번호가 올바르지 않습니다.' }, 200, cors);

        // 승인대기(pending)·재승인(re_review) 전문가도 로그인 허용 (마이페이지에서 승인대기 화면)
        if (user.status === 'setup_pending') return json({ success: false, message: '계정 설정이 완료되지 않았습니다.' }, 200, cors);
        if (user.status === 'blocked') return json({ success: false, message: '이용이 제한된 계정입니다.' }, 200, cors);
        if (user.status === 'withdrawn') return json({ success: false, message: '탈퇴한 계정입니다.' }, 200, cors);

        // 레거시 평문 → 로그인 성공 시 해시로 자동 업그레이드
        if (chk.legacy) {
          try {
            const newHash = await hashPassword(password);
            await fsPatch(token, 'users', user.id, { password: newHash, pwUpgradedAt: new Date().toISOString() });
          } catch (e) { /* 업그레이드 실패해도 로그인은 진행 */ }
        }

        const session = await makeSession(env, { uid: user.id, userId: user.userId, role: user.userType });
        return json({ success: true, user: sanitizeUser(user), session }, 200, cors);
      }

      // ── 관리자 로그인 ──────────────────────────────────
      if (path === '/admin-login') {
        const { adminId, password } = body;
        const MASTERS = {
          bootv1:   { pw: 'Admin@2026!', name: '대표 (마스터)', role: 'master' },
          dajangtv: { pw: 'Admin@2026!', name: '대장TV 관리자', role: 'master' }
        };
        // 관리자 문서ID(=로그인 아이디)로 조회, 없으면 userId 필드로 폴백
        let admin = await fsGetDoc(token, 'admins', adminId);
        if (!admin) { const f = await fsQueryByField(token, 'admins', 'userId', adminId); admin = f[0]; }
        // 문서가 없고 마스터 계정 최초 로그인 → 생성 후 로그인
        if (!admin) {
          if (MASTERS[adminId] && MASTERS[adminId].pw === password) {
            const m = MASTERS[adminId];
            await fsSetDoc(token, 'admins', adminId, { name: m.name, role: m.role, pw: await hashPassword(m.pw), createdAt: new Date().toISOString() });
            const session = await makeSession(env, { uid: adminId, adminId, role: 'admin' });
            return json({ success: true, admin: { name: m.name, role: m.role }, session }, 200, cors);
          }
          return json({ success: false, message: '존재하지 않는 관리자입니다.' }, 200, cors);
        }
        // pw 비어있는 초기 상태 + 마스터 하드코딩 일치 → 허용
        if (!admin.pw && MASTERS[adminId] && MASTERS[adminId].pw === password) {
          const session = await makeSession(env, { uid: admin.id, adminId, role: 'admin' });
          const { pw: _p, ...safeM } = admin;
          return json({ success: true, admin: safeM, session }, 200, cors);
        }
        const chk = await verifyPassword(password, admin.pw);
        if (!chk.ok) return json({ success: false, message: '비밀번호가 올바르지 않습니다.' }, 200, cors);
        if (chk.legacy) {
          try {
            const newHash = await hashPassword(password);
            await fsPatch(token, 'admins', admin.id, { pw: newHash, pwUpgradedAt: new Date().toISOString() });
          } catch (e) {}
        }
        const { pw, ...safe } = admin;
        const session = await makeSession(env, { uid: admin.id, adminId: admin.name || admin.id, role: 'admin' });
        return json({ success: true, admin: safe, session }, 200, cors);
      }

      // ── 회원가입 ───────────────────────────────────────
      if (path === '/signup') {
        const userData = body.userData || body;
        if (!userData.userId || !userData.password) return json({ success: false, message: '필수 정보가 누락되었습니다.' }, 200, cors);

        const dupId = await fsQueryByField(token, 'users', 'userId', userData.userId);
        if (dupId.length) return json({ success: false, message: '이미 사용 중인 아이디입니다.' }, 200, cors);
        if (userData.email) {
          const dupEmail = await fsQueryByField(token, 'users', 'email', userData.email);
          if (dupEmail.length) return json({ success: false, message: '이미 사용 중인 이메일입니다.' }, 200, cors);
        }

        const data = {
          ...userData,
          password: await hashPassword(userData.password),
          createdAt: new Date().toISOString(),
          status: userData.status || (userData.userType === 'expert' ? 'pending' : 'active'),
        };
        const created = await fsCreate(token, 'users', data);
        return json({ success: true, message: '회원가입이 완료되었습니다.', user: sanitizeUser(created) }, 200, cors);
      }

      // ── 아이디 중복확인 ────────────────────────────────
      if (path === '/check-id') {
        const dup = await fsQueryByField(token, 'users', 'userId', body.userId);
        return json({ available: dup.length === 0 }, 200, cors);
      }

      // ── 이메일 중복확인 ────────────────────────────────
      if (path === '/check-email') {
        const dup = await fsQueryByField(token, 'users', 'email', body.email);
        return json({ available: dup.length === 0 }, 200, cors);
      }

      // ── 비밀번호 변경 ──────────────────────────────────
      if (path === '/change-password') {
        const { userId, currentPassword, newPassword } = body;
        if (!userId || !newPassword) return json({ success: false, message: '필수 정보가 누락되었습니다.' }, 200, cors);
        const found = await fsQueryByField(token, 'users', 'userId', userId);
        const user = found[0];
        if (!user) return json({ success: false, message: '사용자를 찾을 수 없습니다.' }, 200, cors);
        const chk = await verifyPassword(currentPassword, user.password);
        if (!chk.ok) return json({ success: false, message: '현재 비밀번호가 올바르지 않습니다.' }, 200, cors);
        await fsPatch(token, 'users', user.id, { password: await hashPassword(newPassword), updatedAt: new Date().toISOString() });
        return json({ success: true, message: '비밀번호가 변경되었습니다.' }, 200, cors);
      }

      // ── 전문가 초기설정: 토큰으로 계정 조회 ────────────
      if (path === '/setup-lookup') {
        const found = await fsQueryByField(token, 'users', 'setupToken', body.token);
        const user = found[0];
        if (!user) return json({ success: false, message: '초대 링크를 찾을 수 없습니다.' }, 200, cors);
        return json({ success: true, user: sanitizeUser(user) }, 200, cors);
      }

      // ── 전문가 초기설정: 아이디+비밀번호+프로필 저장 ────
      if (path === '/complete-setup') {
        const { token: setupToken, userId, password, profile } = body;
        if (!setupToken || !userId || !password) return json({ success: false, message: '필수 정보가 누락되었습니다.' }, 200, cors);
        const found = await fsQueryByField(token, 'users', 'setupToken', setupToken);
        const user = found[0];
        if (!user) return json({ success: false, message: '유효하지 않은 초대 링크입니다.' }, 200, cors);
        // 아이디 중복 확인(본인 제외)
        const dup = await fsQueryByField(token, 'users', 'userId', userId);
        if (dup.some(u => u.id !== user.id)) return json({ success: false, message: '이미 사용 중인 아이디입니다.' }, 200, cors);
        const patch = { userId, password: await hashPassword(password), updatedAt: new Date().toISOString() };
        if (profile && typeof profile === 'object') {
          for (const [k, v] of Object.entries(profile)) {
            if (k === 'password' || k === 'pw') continue;
            patch[k] = v;
          }
        }
        await fsPatch(token, 'users', user.id, patch);
        return json({ success: true, message: '설정이 완료되었습니다.' }, 200, cors);
      }

      // ── 계정 찾기 (이메일+휴대폰 일치 확인) ────────────
      //    비번찾기 1단계: 매칭되면 userId/이름(마스킹)만 반환.
      if (path === '/find-account') {
        const { email, phone } = body;
        const norm = s => String(s || '').replace(/[^0-9]/g, '');
        let candidates = [];
        if (email) candidates = await fsQueryByField(token, 'users', 'email', email);
        else if (phone) candidates = await fsQueryByField(token, 'users', 'phone', phone);
        const match = candidates.find(u => u.userType !== 'admin' && (!phone || norm(u.phone) === norm(phone)) && (!email || u.email === email));
        if (!match) return json({ success: false, message: '일치하는 계정이 없습니다.' }, 200, cors);
        const maskName = n => (n && n.length > 1) ? n[0] + '*'.repeat(n.length - 1) : (n || '');
        const maskId = id => (id && id.length > 3) ? id.slice(0, 3) + '*'.repeat(id.length - 3) : (id || '');
        return json({ success: true, userId: match.userId, name: maskName(match.name), maskedUserId: maskId(match.userId), userType: match.userType }, 200, cors);
      }

      // ── 비밀번호 재설정 (휴대폰 본인인증 후) ───────────
      //    현재 비밀번호를 모르는 흐름(비번찾기·전문가 초기설정).
      //    저장된 phone 과 일치할 때만 재설정 허용(최소 방어).
      if (path === '/reset-password') {
        const { userId, phone, newPassword, extra } = body;
        if (!userId || !newPassword) return json({ success: false, message: '필수 정보가 누락되었습니다.' }, 200, cors);
        const found = await fsQueryByField(token, 'users', 'userId', userId);
        const user = found[0];
        if (!user) return json({ success: false, message: '사용자를 찾을 수 없습니다.' }, 200, cors);
        const norm = s => String(s || '').replace(/[^0-9]/g, '');
        if (phone && user.phone && norm(phone) !== norm(user.phone)) {
          return json({ success: false, message: '본인 정보가 일치하지 않습니다.' }, 200, cors);
        }
        const patch = { password: await hashPassword(newPassword), tempPassword: false, updatedAt: new Date().toISOString() };
        if (extra && typeof extra === 'object') {
          for (const [k, v] of Object.entries(extra)) {
            if (k === 'password' || k === 'pw') continue; // 비번은 위에서 해시로만
            patch[k] = v;
          }
        }
        await fsPatch(token, 'users', user.id, patch);
        return json({ success: true, message: '비밀번호가 재설정되었습니다.' }, 200, cors);
      }

      // ── 관리자: 평문 비밀번호 일괄 해시 마이그레이션 ────
      if (path === '/migrate-passwords') {
        if (!env.ADMIN_MIGRATE_KEY || body.key !== env.ADMIN_MIGRATE_KEY) {
          return json({ success: false, message: '권한이 없습니다.' }, 403, cors);
        }
        const users = await fsListAll(token, 'users');
        let migrated = 0, skipped = 0;
        for (const u of users) {
          if (typeof u.password === 'string' && u.password && !u.password.startsWith('pbkdf2$')) {
            await fsPatch(token, 'users', u.id, { password: await hashPassword(u.password), pwMigratedAt: new Date().toISOString() });
            migrated++;
          } else skipped++;
        }
        // admins 컬렉션(pw)도 처리
        const admins = await fsListAll(token, 'admins');
        let adminMigrated = 0;
        for (const a of admins) {
          if (typeof a.pw === 'string' && a.pw && !a.pw.startsWith('pbkdf2$')) {
            await fsPatch(token, 'admins', a.id, { pw: await hashPassword(a.pw), pwMigratedAt: new Date().toISOString() });
            adminMigrated++;
          }
        }
        return json({ success: true, users_migrated: migrated, users_skipped: skipped, admins_migrated: adminMigrated }, 200, cors);
      }

      // ── 신청 목록 조회 (권한별) ───────────────────────────
      //    admin: 전체 / expert: 내 배정 + 미배정 공개풀 / client: 내 신청
      if (path === '/list-applications') {
        const sess = await verifySession(env, body.session);
        if (!sess) return json({ success: false, message: '로그인이 필요합니다.' }, 401, cors);
        const all = await fsListAll(token, 'applications');
        let list = [];
        if (sess.role === 'admin') {
          list = all;
        } else if (sess.role === 'expert') {
          const myId = sess.userId || sess.uid;
          list = all.filter(a => {
            if (a.assigned_expert_id === myId) return true;               // 내 배정건
            if (a.assigned_expert_id) return false;                        // 남이 가져간 건 제외
            const isPaid = a.payment_status === '결제완료' || a.payment_status === '무료매칭' || !!a.paid_at;
            return isPaid || a.status === '매칭중';                         // 미배정 결제완료 공개풀
          });
        } else { // client
          const myId = sess.userId || sess.uid;
          list = all.filter(a => a.userId === myId || a.user_id === myId);
        }
        return json({ success: true, data: list }, 200, cors);
      }

      // ── 회원 목록 조회 (관리자 전용) ──────────────────────
      if (path === '/list-users') {
        const sess = await verifySession(env, body.session);
        if (!sess || sess.role !== 'admin') return json({ success: false, message: '관리자 권한이 필요합니다.' }, 403, cors);
        const users = (await fsListAll(token, 'users')).map(sanitizeUser);
        return json({ success: true, data: users }, 200, cors);
      }

      // ── 문서 삭제 (관리자 전용) ───────────────────────────
      if (path === '/delete-doc') {
        const sess = await verifySession(env, body.session);
        if (!sess || sess.role !== 'admin') return json({ success: false, message: '관리자 권한이 필요합니다.' }, 403, cors);
        const { collection, id } = body;
        if (!collection || !id) return json({ success: false, message: '필수 정보가 누락되었습니다.' }, 200, cors);
        if (!['users', 'applications', 'experts', 'adminNotifications'].includes(collection)) {
          return json({ success: false, message: '허용되지 않은 컬렉션입니다.' }, 403, cors);
        }
        await fsDelete(token, collection, id);
        return json({ success: true }, 200, cors);
      }

      // ── 직원 관리자 지정 (관리자 전용) ────────────────────
      if (path === '/grant-admin') {
        const sess = await verifySession(env, body.session);
        if (!sess || sess.role !== 'admin') return json({ success: false, message: '관리자 권한이 필요합니다.' }, 403, cors);
        const { targetUserId } = body;
        const found = await fsQueryByField(token, 'users', 'userId', targetUserId);
        const u = found[0];
        if (!u) return json({ success: false, message: '사용자를 찾을 수 없습니다.' }, 200, cors);
        await fsSetDoc(token, 'admins', u.userId, {
          name: u.name || u.userId, userId: u.userId, pw: u.password || '', role: 'staff', grantedAt: new Date().toISOString()
        });
        return json({ success: true, name: u.name }, 200, cors);
      }

      // ── 관리자 권한 해제 (관리자 전용) ────────────────────
      if (path === '/revoke-admin') {
        const sess = await verifySession(env, body.session);
        if (!sess || sess.role !== 'admin') return json({ success: false, message: '관리자 권한이 필요합니다.' }, 403, cors);
        const { targetUserId } = body;
        if (targetUserId === 'bootv1' || targetUserId === 'dajangtv') return json({ success: false, message: '기본 마스터 계정은 해제할 수 없습니다.' }, 200, cors);
        await fsDelete(token, 'admins', targetUserId);
        return json({ success: true }, 200, cors);
      }

      // ── 새 의뢰 → 자격 전문가에게 문자 알림 (결제완료 후 호출) ──
      if (path === '/notify-new-order') {
        const app = await fsGetDoc(token, 'applications', body.applicationId);
        if (!app) return json({ success: false, message: '신청 정보를 찾을 수 없습니다.' }, 200, cors);
        const wantType = normType(app.expert_type || app.expertType);
        const appCourt = normCourt(app.court);
        const users = await fsListAll(token, 'users');
        const eligible = users.filter(u => {
          if (u.userType !== 'expert' || u.status !== 'active') return false;
          const ut = normType(u.expertType || u.expertTypeLabel);
          if (wantType && ut !== wantType) return false;
          const courts = [...(Array.isArray(u.selectedCourts) ? u.selectedCourts : []),
                          ...(Array.isArray(u.serviceRegions) ? u.serviceRegions : (u.serviceRegions ? [u.serviceRegions] : []))].map(normCourt);
          return courts.some(c => c && (c === appCourt || c.includes(appCourt) || appCourt.includes(c)));
        });
        const SMS_URL = 'https://bidtok-sms-proxy.qkqk5342.workers.dev';
        const targets = eligible.length ? eligible.map(e => ({ name: e.name, phone: e.phone }))
                                        : [{ name: '관리자', phone: '01083445342' }];
        await Promise.all(targets.map(t => t.phone ? fetch(SMS_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'expert_new_request', to: t.phone,
            data: { name: t.name, court: app.court, caseNumber: app.case_number, bidDate: app.bid_date } })
        }).catch(() => {}) : Promise.resolve()));
        return json({ success: true, notified: eligible.length }, 200, cors);
      }

      // ── 관리자 목록 조회 (관리자 전용) ─────────────────────
      if (path === '/list-admins') {
        const sess = await verifySession(env, body.session);
        if (!sess || sess.role !== 'admin') return json({ success: false, message: '관리자 권한이 필요합니다.' }, 403, cors);
        const admins = (await fsListAll(token, 'admins')).map(a => { const { pw, ...safe } = a; return safe; });
        return json({ success: true, data: admins }, 200, cors);
      }

      // ── 관리자 본인 비밀번호 변경 (관리자 전용) ─────────────
      if (path === '/change-admin-password') {
        const sess = await verifySession(env, body.session);
        if (!sess || sess.role !== 'admin') return json({ success: false, message: '관리자 권한이 필요합니다.' }, 403, cors);
        const { currentPassword, newPassword } = body;
        if (!newPassword) return json({ success: false, message: '새 비밀번호가 필요합니다.' }, 200, cors);
        const adminId = sess.uid;
        const admin = await fsGetDoc(token, 'admins', adminId);
        if (!admin) return json({ success: false, message: '관리자 정보를 찾을 수 없습니다.' }, 200, cors);
        const chk = await verifyPassword(currentPassword, admin.pw);
        if (!chk.ok) return json({ success: false, message: '현재 비밀번호가 올바르지 않습니다.' }, 200, cors);
        await fsPatch(token, 'admins', adminId, { pw: await hashPassword(newPassword), pwChangedAt: new Date().toISOString() });
        return json({ success: true, message: '비밀번호가 변경되었습니다.' }, 200, cors);
      }

      // ── 단건 조회 (로그인 필요) users/applications ────────
      if (path === '/db-get') {
        const sess = await verifySession(env, body.session);
        if (!sess) return json({ success: false, message: '로그인이 필요합니다.' }, 401, cors);
        const { collection, id } = body;
        if (!['users', 'applications'].includes(collection)) return json({ success: false, message: '허용되지 않은 컬렉션입니다.' }, 403, cors);
        const doc = await fsGetDoc(token, collection, id);
        if (!doc) return json({ success: true, data: null }, 200, cors);
        return json({ success: true, data: collection === 'users' ? sanitizeUser(doc) : doc }, 200, cors);
      }

      // ── 문서 생성 (로그인 필요) ────────────────────────────
      if (path === '/db-create') {
        const sess = await verifySession(env, body.session);
        if (!sess) return json({ success: false, message: '로그인이 필요합니다.' }, 401, cors);
        const { collection, data } = body;
        if (collection === 'applications') {
          const d = { ...(data || {}) };
          if (sess.role !== 'admin') { d.userId = sess.userId || sess.uid; }  // 소유자 강제
          const created = await fsCreate(token, 'applications', d);
          return json({ success: true, data: created }, 200, cors);
        }
        if (collection === 'adminNotifications') {
          const created = await fsCreate(token, 'adminNotifications', data || {});
          return json({ success: true, data: created }, 200, cors);
        }
        return json({ success: false, message: '허용되지 않은 생성입니다.' }, 403, cors);
      }

      // ── 문서 수정 (로그인 필요, 컬렉션별 권한) ──────────────
      if (path === '/db-update') {
        const sess = await verifySession(env, body.session);
        if (!sess) return json({ success: false, message: '로그인이 필요합니다.' }, 401, cors);
        const { collection, id, data } = body;
        const upd = { ...(data || {}) };
        if (collection === 'users') {
          const isSelf = (sess.uid === id) || (sess.userId && String(sess.userId) === String(id));
          if (sess.role !== 'admin' && !isSelf) return json({ success: false, message: '수정 권한이 없습니다.' }, 403, cors);
          if (sess.role !== 'admin') { delete upd.password; delete upd.pw; delete upd.userType; delete upd.status; delete upd.role; }
          await fsPatch(token, 'users', id, upd);
          return json({ success: true }, 200, cors);
        }
        if (collection === 'applications') {
          // 유효 세션(관리자/의뢰인/전문가)이면 허용 — 익명 변조 차단이 목적
          await fsPatch(token, 'applications', id, upd);
          return json({ success: true }, 200, cors);
        }
        return json({ success: false, message: '허용되지 않은 수정입니다.' }, 403, cors);
      }

      // ── 문서 삭제 (로그인 필요, 소유자/관리자) ──────────────
      if (path === '/db-delete') {
        const sess = await verifySession(env, body.session);
        if (!sess) return json({ success: false, message: '로그인이 필요합니다.' }, 401, cors);
        const { collection, id } = body;
        if (collection === 'applications') {
          if (sess.role === 'admin') { await fsDelete(token, 'applications', id); return json({ success: true }, 200, cors); }
          const app = await fsGetDoc(token, 'applications', id);
          if (!app) return json({ success: true }, 200, cors);
          const myId = sess.userId || sess.uid;
          const owner = app.userId === myId || app.user_id === myId;
          const deletable = ['결제대기', '매칭중', '접수', '신청접수'].includes(app.status) || !app.paid_at;
          if (owner && deletable) { await fsDelete(token, 'applications', id); return json({ success: true }, 200, cors); }
          return json({ success: false, message: '삭제 권한이 없습니다.' }, 403, cors);
        }
        // users/experts/adminNotifications 삭제는 관리자만
        if (sess.role !== 'admin') return json({ success: false, message: '삭제 권한이 없습니다.' }, 403, cors);
        if (!['users', 'experts', 'adminNotifications'].includes(collection)) return json({ success: false, message: '허용되지 않은 컬렉션입니다.' }, 403, cors);
        await fsDelete(token, collection, id);
        return json({ success: true }, 200, cors);
      }

      return json({ success: false, message: '알 수 없는 요청 경로입니다: ' + path }, 404, cors);

    } catch (err) {
      console.error('auth-proxy 오류:', err);
      return json({ success: false, message: '서버 오류가 발생했습니다.', detail: String(err.message || err) }, 500, cors);
    }
  },
};
