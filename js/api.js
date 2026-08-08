// ============================================================
// API 연동 모듈 (api.js)  v3.0
// ★ Firebase 403 자동 폴백 → LocalDB (IndexedDB) 사용
// ★ Firebase 규칙이 열리면 자동으로 Firebase로 복구
// ============================================================

// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyDrJwD2FfDr_PJbc54pvUDQcCRPGl6ICpQ",
    authDomain: "bid-tok.firebaseapp.com",
    projectId: "bid-tok",
    storageBucket: "bid-tok.firebasestorage.app",
    messagingSenderId: "216327695326",
    appId: "1:216327695326:web:68b22814881ab4f3314b4f",
    measurementId: "G-GD3DDTB9BY"
};

let _db = null;
let _storage = null;
let _fsBlocked = null;  // null=미확인, true=차단됨, false=열려있음

function getDB() {
    if (_db) return _db;
    try {
        if (typeof firebase === 'undefined') return null;
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        else firebase.app();
        _db = firebase.firestore();
        return _db;
    } catch (e) {
        console.error('Firebase 초기화 오류:', e);
        return null;
    }
}

function getStorage() {
    if (_storage) return _storage;
    try {
        if (typeof firebase === 'undefined') return null;
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        else firebase.app();
        _storage = firebase.storage();
        return _storage;
    } catch (e) {
        return null;
    }
}

// ============================================================
// 공통 유틸
// ============================================================
function docToObj(doc) {
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
}
function snapToArr(snap) {
    const arr = [];
    snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
    return arr;
}

function sortByCreatedAt(arr) {
    return arr.sort((a, b) => {
        const ta = a.createdAt || a.created_at || '';
        const tb = b.createdAt || b.created_at || '';
        return tb.localeCompare(ta);
    });
}

// ============================================================
// Firestore REST API 헬퍼
// ============================================================
const _FS_PROJECT = 'bid-tok';
const _FS_APIKEY  = 'AIzaSyDrJwD2FfDr_PJbc54pvUDQcCRPGl6ICpQ';
const _FS_BASE    = `https://firestore.googleapis.com/v1/projects/${_FS_PROJECT}/databases/(default)/documents`;

function _fsFieldsToObj(fields) {
    if (!fields) return {};
    const obj = {};
    for (const [k, v] of Object.entries(fields)) {
        if      ('stringValue'    in v) obj[k] = v.stringValue;
        else if ('integerValue'   in v) obj[k] = parseInt(v.integerValue, 10);
        else if ('doubleValue'    in v) obj[k] = v.doubleValue;
        else if ('booleanValue'   in v) obj[k] = v.booleanValue;
        else if ('nullValue'      in v) obj[k] = null;
        else if ('timestampValue' in v) obj[k] = v.timestampValue;
        else if ('arrayValue'     in v) {
            obj[k] = (v.arrayValue.values || []).map(av => {
                if ('stringValue'  in av) return av.stringValue;
                if ('integerValue' in av) return parseInt(av.integerValue, 10);
                if ('booleanValue' in av) return av.booleanValue;
                if ('mapValue'     in av) return _fsFieldsToObj(av.mapValue.fields);
                return null;
            });
        }
        else if ('mapValue' in v) obj[k] = _fsFieldsToObj(v.mapValue.fields);
        else obj[k] = Object.values(v)[0];
    }
    return obj;
}

function _objToFsFields(obj) {
    const fields = {};
    for (const [k, v] of Object.entries(obj)) {
        if      (v === null || v === undefined) fields[k] = { nullValue: null };
        else if (typeof v === 'boolean')        fields[k] = { booleanValue: v };
        else if (typeof v === 'number')         fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
        else if (Array.isArray(v))              fields[k] = { arrayValue: { values: v.map(i => typeof i === 'string' ? { stringValue: i } : { stringValue: String(i) }) } };
        else if (typeof v === 'object')         fields[k] = { mapValue: { fields: _objToFsFields(v) } };
        else                                    fields[k] = { stringValue: String(v) };
    }
    return fields;
}

// Firebase 접근 가능 여부 캐시 (5분 TTL)
let _fsBlockedTs = 0;
async function _isFirestoreAvailable() {
    const now = Date.now();
    if (_fsBlocked !== null && (now - _fsBlockedTs) < 5 * 60 * 1000) {
        return !_fsBlocked;
    }
    try {
        const res = await fetch(`${_FS_BASE}/admins?key=${_FS_APIKEY}&pageSize=1`, { signal: AbortSignal.timeout(5000) });
        _fsBlocked = !res.ok;
        _fsBlockedTs = now;
        if (!_fsBlocked) console.log('[API] Firestore 접근 가능 ✅');
        else console.warn('[API] Firestore 차단됨 (403) → LocalDB 모드');
    } catch(e) {
        _fsBlocked = true;
        _fsBlockedTs = now;
        console.warn('[API] Firestore 연결 불가 → LocalDB 모드');
    }
    return !_fsBlocked;
}

// Firestore REST 컬렉션 전체 조회
async function _fsGetCollection(collection) {
    let items = [], pageToken = null;
    for (let p = 0; p < 20; p++) {
        let url = `${_FS_BASE}/${collection}?key=${_FS_APIKEY}&pageSize=300`;
        if (pageToken) url += `&pageToken=${pageToken}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`Firestore REST ${collection} 조회 실패 (${res.status}): ${err?.error?.message || ''}`);
        }
        const json = await res.json();
        (json.documents || []).forEach(doc => {
            const id = doc.name.split('/').pop();
            items.push({ id, ...(_fsFieldsToObj(doc.fields)) });
        });
        pageToken = json.nextPageToken;
        if (!pageToken) break;
    }
    return items;
}

// Firestore REST 단건 조회
async function _fsGetDoc(collection, docId) {
    const url = `${_FS_BASE}/${collection}/${encodeURIComponent(docId)}?key=${_FS_APIKEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore REST 단건 조회 실패 (${res.status})`);
    const json = await res.json();
    const id   = json.name.split('/').pop();
    return { id, ...(_fsFieldsToObj(json.fields)) };
}

async function _fsAddDoc(collection, data) {
    const url = `${_FS_BASE}/${collection}?key=${_FS_APIKEY}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: _objToFsFields(data) }),
        signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`Firestore REST 생성 실패 (${res.status})`);
    const json = await res.json();
    const id   = json.name.split('/').pop();
    return { id, ...data };
}

async function _fsUpdateDoc(collection, docId, data) {
    const fields  = _objToFsFields(data);
    const mask    = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const url     = `${_FS_BASE}/${collection}/${encodeURIComponent(docId)}?key=${_FS_APIKEY}&${mask}`;
    const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
        signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`Firestore REST 업데이트 실패 (${res.status})`);
    return true;
}

async function _fsDeleteDoc(collection, docId) {
    const url = `${_FS_BASE}/${collection}/${encodeURIComponent(docId)}?key=${_FS_APIKEY}`;
    const res = await fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Firestore REST 삭제 실패 (${res.status})`);
    return true;
}

// ============================================================
// 스마트 컬렉션 조회: Firebase 먼저 시도 → 실패 시 LocalDB
// ★ LocalDB가 비어있으면 Firebase를 다시 시도
// ============================================================
async function _smartGetCollection(collection) {
    // ★ 보안모드: 개인정보 명단(회원·신청) 조회는 서버(워커) 경유 — 권한 확인 후 반환
    if (_useAuthServer() && (collection === 'applications' || collection === 'users')) {
        try {
            const ep = (collection === 'applications') ? '/list-applications' : '/list-users';
            const r = await _authPost(ep, { session: _session() });
            if (r && r.success) return r.data || [];
            console.warn(`[API] 서버 ${collection} 조회 거부: ${r && r.message}`);
            return [];
        } catch (e) {
            console.warn(`[API] 서버 ${collection} 조회 실패:`, e.message);
            return [];
        }
    }
    // 1) Firebase REST 시도
    try {
        const items = await _fsGetCollection(collection);
        // 성공 시 LocalDB 백업
        _fsBlocked = false;
        _fsBlockedTs = Date.now();
        if (window.LocalDB) {
            items.forEach(item => {
                window.LocalDB.update(collection, item.id, { ...item, _localOnly: false }).catch(() => {});
            });
        }
        console.log(`[API] ${collection} Firebase 조회 성공: ${items.length}건`);
        return items;
    } catch(e) {
        console.warn(`[API] ${collection} Firebase 실패 → LocalDB 시도:`, e.message);
        _fsBlocked = true;
        _fsBlockedTs = Date.now();
    }

    // 2) LocalDB 폴백
    if (window.LocalDB) {
        const localItems = await window.LocalDB.getAll(collection);
        console.log(`[API] ${collection} LocalDB 데이터: ${localItems.length}건`);
        return localItems;
    }

    return [];
}

async function _smartGetDoc(collection, docId) {
    // 1) Firebase REST 시도
    try {
        const item = await _fsGetDoc(collection, docId);
        _fsBlocked = false;
        // 백업
        if (item && window.LocalDB) {
            window.LocalDB.update(collection, item.id, { ...item, _localOnly: false }).catch(() => {});
        }
        return item;
    } catch(e) {
        console.warn(`[API] ${collection}/${docId} Firebase 실패 → LocalDB:`, e.message);
        _fsBlocked = true;
    }

    // 2) LocalDB 폴백
    if (window.LocalDB) {
        return await window.LocalDB.getById(collection, docId);
    }
    return null;
}

async function _smartAddDoc(collection, data) {
    // 1) Firebase REST 시도
    try {
        const result = await _fsAddDoc(collection, data);
        _fsBlocked = false;
        // LocalDB에도 저장
        if (window.LocalDB) {
            window.LocalDB.update(collection, result.id, { ...result, _localOnly: false }).catch(() => {});
        }
        return result;
    } catch(e) {
        console.warn(`[API] ${collection} Firebase 추가 실패 → LocalDB:`, e.message);
        _fsBlocked = true;
    }

    // 2) LocalDB 폴백
    if (window.LocalDB) {
        const result = await window.LocalDB.add(collection, data);
        console.log(`[API] ${collection} LocalDB 저장: ${result.id}`);
        return result;
    }
    throw new Error('저장 불가: Firebase 차단 + LocalDB 없음');
}

async function _smartUpdateDoc(collection, docId, data) {
    // 1) Firebase REST 시도
    try {
        await _fsUpdateDoc(collection, docId, data);
        _fsBlocked = false;
        // LocalDB도 업데이트
        if (window.LocalDB) {
            window.LocalDB.update(collection, docId, data).catch(() => {});
        }
        return true;
    } catch(e) {
        console.warn(`[API] ${collection}/${docId} Firebase 업데이트 실패 → LocalDB:`, e.message);
        _fsBlocked = true;
    }

    // 2) LocalDB 폴백
    if (window.LocalDB) {
        await window.LocalDB.update(collection, docId, data);
        return true;
    }
    throw new Error('업데이트 불가: Firebase 차단 + LocalDB 없음');
}

async function _smartDeleteDoc(collection, docId) {
    // ★ 보안모드: 삭제는 서버(워커) 경유 — 관리자 권한 확인
    if (_useAuthServer()) {
        const r = await _authPost('/delete-doc', { session: _session(), collection, id: docId });
        if (r && r.success) { if (window.LocalDB) window.LocalDB.remove(collection, docId).catch(() => {}); return true; }
        throw new Error((r && r.message) || '삭제 권한이 없습니다.');
    }
    // 1) Firebase REST 시도
    try {
        await _fsDeleteDoc(collection, docId);
        _fsBlocked = false;
        if (window.LocalDB) window.LocalDB.remove(collection, docId).catch(() => {});
        return true;
    } catch(e) {
        console.warn(`[API] ${collection}/${docId} Firebase 삭제 실패 → LocalDB:`, e.message);
        _fsBlocked = true;
    }

    // 2) LocalDB 폴백
    if (window.LocalDB) {
        await window.LocalDB.remove(collection, docId);
        return true;
    }
    throw new Error('삭제 불가: Firebase 차단 + LocalDB 없음');
}

// ============================================================
// 인증 서버(auth-proxy) 연동 헬퍼
// ★ AUTH_CONFIG.workerUrl 이 설정돼 있으면 서버 방식, 아니면 레거시
// ============================================================
// 보안모드 기본값: payment-config.js 를 로드하지 않는 페이지(login/admin/expert-mypage 등)에서도
// auth-proxy 를 사용하도록 api.js 자체에 기본 워커 주소를 주입한다.
(function _ensureAuthConfig() {
    window.AUTH_CONFIG = window.AUTH_CONFIG || {};
    if (!window.AUTH_CONFIG.workerUrl) {
        window.AUTH_CONFIG.workerUrl = 'https://bidtok-auth-proxy.qkqk5342.workers.dev';
    }
})();
function _authWorkerUrl() {
    return (window.AUTH_CONFIG && window.AUTH_CONFIG.workerUrl) ? window.AUTH_CONFIG.workerUrl.replace(/\/+$/, '') : '';
}
function _useAuthServer() {
    return !!_authWorkerUrl();
}
function _session() {
    try { return localStorage.getItem('bidtok_session') || ''; } catch (e) { return ''; }
}
async function _authPost(path, payload) {
    const base = _authWorkerUrl();
    const res = await fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
        signal: AbortSignal.timeout(12000),
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok && data.success === undefined) {
        throw new Error(data.message || `서버 오류(${res.status})`);
    }
    return data;
}

// ============================================================
// API 객체
// ============================================================
const API = {

    // ── USERS ─────────────────────────────────────────────
    users: {
        async getAll(params = '') {
            const items = await _smartGetCollection('users');
            return { data: sortByCreatedAt(items) };
        },

        async getById(id) {
            return await _smartGetDoc('users', id);
        },

        async findByUserId(userId) {
            const all = await _smartGetCollection('users');
            return all.find(u => u.userId === userId) || null;
        },

        async findByEmail(email) {
            const all = await _smartGetCollection('users');
            return all.find(u => u.email === email) || null;
        },

        async isUserIdTaken(userId) {
            if (_useAuthServer()) {
                const r = await _authPost('/check-id', { userId });
                return r.available === false;
            }
            const user = await API.users.findByUserId(userId);
            return user !== null;
        },

        async isEmailTaken(email) {
            if (_useAuthServer()) {
                const r = await _authPost('/check-email', { email });
                return r.available === false;
            }
            const user = await API.users.findByEmail(email);
            return user !== null;
        },

        async findBySetupToken(token) {
            const all = await _smartGetCollection('users');
            return all.find(u => u.setupToken === token) || null;
        },

        async create(userData) {
            // 비밀번호가 포함된 신규 회원 생성은 서버에서 해싱 저장
            if (_useAuthServer() && userData && userData.password) {
                const r = await _authPost('/signup', { userData });
                if (!r.success) throw new Error(r.message || '회원가입에 실패했습니다.');
                return r.user;
            }
            const data = {
                ...userData,
                createdAt: new Date().toISOString(),
                status: userData.status || (userData.userType === 'expert' ? 'pending' : 'active')
            };
            return await _smartAddDoc('users', data);
        },

        // 현재 비밀번호를 알고 변경 (마이페이지 등)
        async changePassword(userId, currentPassword, newPassword) {
            if (_useAuthServer()) {
                const r = await _authPost('/change-password', { userId, currentPassword, newPassword });
                if (!r.success) throw new Error(r.message || '비밀번호 변경에 실패했습니다.');
                return true;
            }
            const user = await API.users.findByUserId(userId);
            if (!user) throw new Error('사용자를 찾을 수 없습니다.');
            await _smartUpdateDoc('users', user.id, { password: newPassword, updatedAt: new Date().toISOString() });
            return true;
        },

        // 휴대폰 본인인증 후 비밀번호 재설정 (비번찾기·전문가 초기설정)
        async resetPassword(userId, phone, newPassword, extra) {
            if (_useAuthServer()) {
                const r = await _authPost('/reset-password', { userId, phone, newPassword, extra: extra || {} });
                if (!r.success) throw new Error(r.message || '비밀번호 재설정에 실패했습니다.');
                return true;
            }
            const user = await API.users.findByUserId(userId);
            if (!user) throw new Error('사용자를 찾을 수 없습니다.');
            await _smartUpdateDoc('users', user.id, { password: newPassword, tempPassword: false, ...(extra || {}), updatedAt: new Date().toISOString() });
            return true;
        },

        async update(id, updates) {
            const data = { ...updates, updatedAt: new Date().toISOString() };
            await _smartUpdateDoc('users', id, data);
            return data;
        },

        async delete(id) {
            return await _smartDeleteDoc('users', id);
        },

        async authenticate(userId, password, userType) {
            try {
                if (_useAuthServer()) {
                    const r = await _authPost('/login', { userId, password, userType });
                    if (r.success && r.session) { try { localStorage.setItem('bidtok_session', r.session); } catch(e){} }
                    return r.success ? { success: true, user: r.user } : { success: false, message: r.message };
                }
                const user = await API.users.findByUserId(userId);
                if (!user) return { success: false, message: '존재하지 않는 아이디입니다.' };
                if (user.userType !== userType) return { success: false, message: '회원 유형이 일치하지 않습니다.' };
                if (user.password !== password) return { success: false, message: '비밀번호가 올바르지 않습니다.' };
                // 승인 대기(pending)·재승인 대기(re_review) 전문가도 로그인은 허용하고,
                // 마이페이지에서 "승인 대기" 화면만 보여준다.
                if (user.status === 'setup_pending') return { success: false, message: '계정 설정이 완료되지 않았습니다.' };
                if (user.status === 'blocked') return { success: false, message: '이용이 제한된 계정입니다.' };
                if (user.status === 'withdrawn') return { success: false, message: '탈퇴한 계정입니다.' };
                return { success: true, user };
            } catch (err) {
                console.error('인증 오류:', err);
                return { success: false, message: 'API 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' };
            }
        }
    },

    // ── APPLICATIONS ──────────────────────────────────────
    applications: {
        async getAll(params = '') {
            const items = await _smartGetCollection('applications');
            return { data: sortByCreatedAt(items) };
        },

        async getById(id) {
            return await _smartGetDoc('applications', id);
        },

        async getByUserId(userId) {
            const all = await _smartGetCollection('applications');
            return sortByCreatedAt(all.filter(a => a.userId === userId));
        },

        async getByExpertId(expertId, status = '') {
            const all = await _smartGetCollection('applications');
            return sortByCreatedAt(all.filter(a => {
                if (a.assigned_expert_id !== expertId) return false;
                return status ? a.status === status : true;
            }));
        },

        async create(appData) {
            const data = {
                status: '접수',          // 기본값 (appData.status 가 있으면 아래에서 덮어씀)
                ...appData,              // 호출측 status(예: '결제대기')를 그대로 유지
                createdAt: new Date().toISOString()
            };
            return await _smartAddDoc('applications', data);
        },

        async updateStatus(id, status, extra = {}) {
            const data = { status, updatedAt: new Date().toISOString(), ...extra };
            await _smartUpdateDoc('applications', id, data);
            return data;
        },

        async delete(id) {
            return await _smartDeleteDoc('applications', id);
        },

        async assignExpert(id, expertId, expertName) {
            const data = {
                assigned_expert_id: expertId,
                expert_name: expertName,
                status: '매칭완료',
                assigned_at: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await _smartUpdateDoc('applications', id, data);
            return data;
        }
    },

    // ── EXPERTS ───────────────────────────────────────────
    experts: {
        async getAll(params = '') {
            const items = await _smartGetCollection('experts');
            return { data: sortByCreatedAt(items) };
        },

        async getById(id) {
            return await _smartGetDoc('experts', id);
        },

        async getByRegion(region) {
            const items = await _smartGetCollection('experts');
            return items.filter(e => {
                const regions = Array.isArray(e.serviceRegions) ? e.serviceRegions : [e.serviceRegions || ''];
                return e.status === 'active' && regions.some(r => r && r.includes(region));
            });
        },

        async create(data) {
            const d = { ...data, createdAt: new Date().toISOString() };
            return await _smartAddDoc('experts', d);
        },

        async update(id, updates) {
            const data = { ...updates, updatedAt: new Date().toISOString() };
            await _smartUpdateDoc('experts', id, data);
            return data;
        }
    }
};

window.API = API;
console.log('[API] 모듈 로드 ✅ (Firebase + LocalDB 이중화)');

// ============================================================
// STORAGE — 파일 업로드
// ============================================================
const StorageAPI = {
    upload: async function(file, folder, prefix) {
        folder = folder || 'expert_docs';
        prefix = prefix || '';
        var storage = getStorage();
        if (!storage) throw new Error('Firebase Storage를 초기화할 수 없습니다.');
        var ext      = file.name.split('.').pop();
        var safeName = (prefix ? prefix + '_' : '') + Date.now() + '.' + ext;
        var path     = folder + '/' + safeName;
        var ref      = storage.ref(path);
        var snapshot = await ref.put(file);
        var url      = await snapshot.ref.getDownloadURL();
        return { url: url, path: path, name: file.name };
    },
    uploadMultiple: async function(items) {
        return Promise.all(items.map(function(item) {
            return item.file
                ? StorageAPI.upload(item.file, item.folder, item.prefix)
                : Promise.resolve(null);
        }));
    }
};

window.StorageAPI = StorageAPI;
console.log('[StorageAPI] 모듈 로드 ✅');

// ============================================================
// 전역 노출 (admin.html에서 직접 호출용)
// ============================================================
window._fsGetCollection = _fsGetCollection;
window._fsGetDoc        = _fsGetDoc;
window._fsAddDoc        = _fsAddDoc;
window._fsUpdateDoc     = _fsUpdateDoc;
window._fsDeleteDoc     = _fsDeleteDoc;
window._smartGetCollection = _smartGetCollection;
window._smartGetDoc     = _smartGetDoc;
window._smartAddDoc     = _smartAddDoc;
window._smartUpdateDoc  = _smartUpdateDoc;
window._smartDeleteDoc  = _smartDeleteDoc;
