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
const PBKDF2_ITER = 120000;

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

        if (user.status === 'pending') return json({ success: false, message: '관리자 승인 대기 중입니다.' }, 200, cors);
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

        return json({ success: true, user: sanitizeUser(user) }, 200, cors);
      }

      // ── 관리자 로그인 ──────────────────────────────────
      if (path === '/admin-login') {
        const { adminId, password } = body;
        const found = await fsQueryByField(token, 'admins', 'name', adminId);
        const admin = found[0];
        if (!admin) return json({ success: false, message: '존재하지 않는 관리자입니다.' }, 200, cors);
        const chk = await verifyPassword(password, admin.pw);
        if (!chk.ok) return json({ success: false, message: '비밀번호가 올바르지 않습니다.' }, 200, cors);
        if (chk.legacy) {
          try {
            const newHash = await hashPassword(password);
            await fsPatch(token, 'admins', admin.id, { pw: newHash, pwUpgradedAt: new Date().toISOString() });
          } catch (e) {}
        }
        const { pw, ...safe } = admin;
        return json({ success: true, admin: safe }, 200, cors);
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

      return json({ success: false, message: '알 수 없는 요청 경로입니다: ' + path }, 404, cors);

    } catch (err) {
      console.error('auth-proxy 오류:', err);
      return json({ success: false, message: '서버 오류가 발생했습니다.', detail: String(err.message || err) }, 500, cors);
    }
  },
};
