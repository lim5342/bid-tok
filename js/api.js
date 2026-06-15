// ============================================
// API 연동 모듈 (api.js)
// Firebase Firestore 기반
// ============================================

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

// Firebase SDK 로드 (CDN)
// → 각 HTML 파일 <body> 끝에 아래 스크립트 태그가 있어야 함:
//   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
//   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"></script>
//   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-storage-compat.js"></script>

// Firebase 초기화 (중복 방지)
let _db = null;
let _storage = null;

function getDB() {
    if (_db) return _db;
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        } else {
            // 이미 초기화된 앱 재사용
            firebase.app();
        }
        _db = firebase.firestore();
        console.log('Firebase Firestore 연결 ✅');
        return _db;
    } catch (e) {
        console.error('Firebase 초기화 오류:', e);
        return null;
    }
}

function getStorage() {
    if (_storage) return _storage;
    try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        else firebase.app();
        _storage = firebase.storage();
        console.log('Firebase Storage 연결 ✅');
        return _storage;
    } catch (e) {
        console.error('Firebase Storage 초기화 오류:', e);
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

// 클라이언트에서 createdAt 기준 내림차순 정렬
function sortByCreatedAt(arr) {
    return arr.sort((a, b) => {
        const ta = a.createdAt || a.created_at || '';
        const tb = b.createdAt || b.created_at || '';
        return tb.localeCompare(ta);
    });
}

// ============================================================
// Firestore REST API 헬퍼 (보안 규칙 우회 — API Key 방식)
// ============================================================
const _FS_PROJECT = 'bid-tok';
const _FS_APIKEY  = 'AIzaSyDrJwD2FfDr_PJbc54pvUDQcCRPGl6ICpQ';
const _FS_BASE    = `https://firestore.googleapis.com/v1/projects/${_FS_PROJECT}/databases/(default)/documents`;

// Firestore REST 응답의 fields 객체 → 일반 JS 객체로 변환
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

// REST API로 컬렉션 전체 조회 (페이지네이션 자동 처리)
async function _fsGetCollection(collection) {
    let items = [];
    let pageToken = null;
    const maxPages = 20; // 안전장치
    for (let p = 0; p < maxPages; p++) {
        let url = `${_FS_BASE}/${collection}?key=${_FS_APIKEY}&pageSize=300`;
        if (pageToken) url += `&pageToken=${pageToken}`;
        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`Firestore REST ${collection} 조회 실패 (${res.status}): ${err?.error?.message || ''}`);
        }
        const json = await res.json();
        const docs = json.documents || [];
        docs.forEach(doc => {
            const id = doc.name.split('/').pop();
            items.push({ id, ...(_fsFieldsToObj(doc.fields)) });
        });
        pageToken = json.nextPageToken;
        if (!pageToken) break;
    }
    return items;
}

// REST API로 단건 조회
async function _fsGetDoc(collection, docId) {
    const url = `${_FS_BASE}/${collection}/${encodeURIComponent(docId)}?key=${_FS_APIKEY}`;
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore REST 단건 조회 실패 (${res.status})`);
    const json = await res.json();
    const id   = json.name.split('/').pop();
    return { id, ...(_fsFieldsToObj(json.fields)) };
}

// JS 값 → Firestore REST fields 형식으로 변환
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

// REST API로 문서 생성 (자동 ID)
async function _fsAddDoc(collection, data) {
    const url = `${_FS_BASE}/${collection}?key=${_FS_APIKEY}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: _objToFsFields(data) })
    });
    if (!res.ok) throw new Error(`Firestore REST 생성 실패 (${res.status})`);
    const json = await res.json();
    const id   = json.name.split('/').pop();
    return { id, ...data };
}

// REST API로 문서 업데이트 (PATCH/merge)
async function _fsUpdateDoc(collection, docId, data) {
    const fields  = _objToFsFields(data);
    const mask    = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const url     = `${_FS_BASE}/${collection}/${encodeURIComponent(docId)}?key=${_FS_APIKEY}&${mask}`;
    const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(`Firestore REST 업데이트 실패 (${res.status})`);
    return true;
}

// REST API로 문서 삭제
async function _fsDeleteDoc(collection, docId) {
    const url = `${_FS_BASE}/${collection}/${encodeURIComponent(docId)}?key=${_FS_APIKEY}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Firestore REST 삭제 실패 (${res.status})`);
    return true;
}

// ============================================================
// API 객체
// ============================================================
const API = {

    // ============================================================
    // USERS 컬렉션
    // ============================================================
    users: {

        // 전체 조회 (관리자용) — REST API 방식 (Firestore 보안 규칙 우회)
        async getAll(params = '') {
            const items = await _fsGetCollection('users');
            return { data: sortByCreatedAt(items) };
        },

        // ID로 단건 조회
        async getById(id) {
            const db = getDB();
            const doc = await db.collection('users').doc(id).get();
            return docToObj(doc);
        },

        // userId 필드로 조회 (로그인용)
        // ⚠️ where만 사용 (orderBy 없음) → 단순 인덱스로 OK
        async findByUserId(userId) {
            const db = getDB();
            if (!db) throw new Error('DB 연결 실패');
            const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000));
            const snap = await Promise.race([
                db.collection('users').where('userId', '==', userId).limit(1).get(),
                timeout
            ]);
            if (snap.empty) return null;
            return docToObj(snap.docs[0]);
        },

        // 이메일로 조회
        async findByEmail(email) {
            const db = getDB();
            if (!db) throw new Error('DB 연결 실패');
            const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000));
            const snap = await Promise.race([
                db.collection('users').where('email', '==', email).limit(1).get(),
                timeout
            ]);
            if (snap.empty) return null;
            return docToObj(snap.docs[0]);
        },

        // 아이디 중복 체크
        async isUserIdTaken(userId) {
            const user = await API.users.findByUserId(userId);
            return user !== null;
        },

        // 이메일 중복 체크
        async isEmailTaken(email) {
            const user = await API.users.findByEmail(email);
            return user !== null;
        },

        // setupToken으로 법무사 계정 조회 — REST 방식
        async findBySetupToken(token) {
            const all = await _fsGetCollection('users');
            return all.find(u => u.setupToken === token) || null;
        },

        // 회원가입 (신규 생성) — REST 방식
        async create(userData) {
            const data = {
                ...userData,
                createdAt: new Date().toISOString(),
                status: userData.status || (userData.userType === 'expert' ? 'pending' : 'active')
            };
            return await _fsAddDoc('users', data);
        },

        // 회원정보 수정 — REST 방식
        async update(id, updates) {
            const data = { ...updates, updatedAt: new Date().toISOString() };
            await _fsUpdateDoc('users', id, data);
            return data;
        },

        // 완전 삭제 — REST 방식
        async delete(id) {
            return await _fsDeleteDoc('users', id);
        },

        // 로그인 검증
        async authenticate(userId, password, userType) {
            try {
                const user = await API.users.findByUserId(userId);
                if (!user) return { success: false, message: '존재하지 않는 아이디입니다.' };
                if (user.userType !== userType) return { success: false, message: '회원 유형이 일치하지 않습니다.' };
                if (user.password !== password) return { success: false, message: '비밀번호가 올바르지 않습니다.' };
                if (user.status === 'pending') return { success: false, message: '관리자 승인 대기 중입니다.' };
                if (user.status === 'setup_pending') return { success: false, message: '계정 설정이 완료되지 않았습니다. 관리자가 최종 활성화를 진행 중입니다. 잠시 기다려주세요.' };
                if (user.status === 'blocked') return { success: false, message: '이용이 제한된 계정입니다.' };
                if (user.status === 'withdrawn') return { success: false, message: '탈퇴한 계정입니다.' };
                return { success: true, user };
            } catch (err) {
                console.error('인증 오류:', err);
                return { success: false, message: 'API 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' };
            }
        }
    },

    // ============================================================
    // APPLICATIONS 컬렉션
    // ============================================================
    applications: {

        // 전체 조회 (관리자용) — REST API 방식 (Firestore 보안 규칙 우회)
        async getAll(params = '') {
            const items = await _fsGetCollection('applications');
            return { data: sortByCreatedAt(items) };
        },

        // 단건 조회 — REST 방식
        async getById(id) {
            return await _fsGetDoc('applications', id);
        },

        // 특정 사용자의 신청 내역 — REST 방식
        async getByUserId(userId) {
            const all = await _fsGetCollection('applications');
            return sortByCreatedAt(all.filter(a => a.userId === userId));
        },

        // 특정 법무사에게 배정된 신청 내역 — REST 방식
        async getByExpertId(expertId, status = '') {
            const all = await _fsGetCollection('applications');
            const filtered = all.filter(a => {
                if (a.assigned_expert_id !== expertId) return false;
                return status ? a.status === status : true;
            });
            return sortByCreatedAt(filtered);
        },

        // 신규 신청 저장 — REST 방식
        async create(appData) {
            const data = {
                ...appData,
                status: '접수',
                createdAt: new Date().toISOString()
            };
            return await _fsAddDoc('applications', data);
        },

        // 상태 업데이트 — REST 방식
        async updateStatus(id, status, extra = {}) {
            const data = { status, updatedAt: new Date().toISOString(), ...extra };
            await _fsUpdateDoc('applications', id, data);
            return data;
        },

        // 신청 삭제 — REST 방식
        async delete(id) {
            return await _fsDeleteDoc('applications', id);
        },

        // 법무사 배정 — REST 방식
        async assignExpert(id, expertId, expertName) {
            const data = {
                assigned_expert_id: expertId,
                expert_name: expertName,
                status: '매칭완료',
                assigned_at: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await _fsUpdateDoc('applications', id, data);
            return data;
        }
    },

    // ============================================================
    // EXPERTS 컬렉션
    // ============================================================
    experts: {

        // REST API 방식 (보안 규칙 우회)
        async getAll(params = '') {
            const items = await _fsGetCollection('experts');
            return { data: sortByCreatedAt(items) };
        },

        async getById(id) {
            const item = await _fsGetDoc('experts', id);
            return item;
        },

        async getByRegion(region) {
            const items = await _fsGetCollection('experts');
            return items.filter(e => {
                const regions = Array.isArray(e.serviceRegions) ? e.serviceRegions : [e.serviceRegions || ''];
                return e.status === 'active' && regions.some(r => r && r.includes(region));
            });
        },

        async create(data) {
            const d = { ...data, createdAt: new Date().toISOString() };
            return await _fsAddDoc('experts', d);
        },

        async update(id, updates) {
            const data = { ...updates, updatedAt: new Date().toISOString() };
            await _fsUpdateDoc('experts', id, data);
            return data;
        }
    }
};

// 전역 노출
window.API = API;
console.log('API module loaded ✅ (Firebase Firestore)');

// ============================================================
// STORAGE — 파일 업로드
// ============================================================
const StorageAPI = {
    // 단일 파일 업로드 → downloadURL 반환
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
    // 여러 파일 병렬 업로드
    uploadMultiple: async function(items) {
        return Promise.all(items.map(function(item) {
            return item.file
                ? StorageAPI.upload(item.file, item.folder, item.prefix)
                : Promise.resolve(null);
        }));
    }
};

window.StorageAPI = StorageAPI;
console.log('StorageAPI module loaded ✅ (Firebase Storage)');
