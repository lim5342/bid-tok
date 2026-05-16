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
// API 객체
// ============================================================
const API = {

    // ============================================================
    // USERS 컬렉션
    // ============================================================
    users: {

        // 전체 조회 (관리자용)
        // ⚠️ orderBy 제거 → 복합 인덱스 불필요, 클라이언트 정렬
        async getAll(params = '') {
            const db = getDB();
            const snap = await db.collection('users').get();
            return { data: sortByCreatedAt(snapToArr(snap)) };
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

        // 회원가입 (신규 생성)
        async create(userData) {
            const db = getDB();
            if (!db) throw new Error('데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
            const data = {
                ...userData,
                createdAt: new Date().toISOString(),
                status: userData.userType === 'expert' ? 'pending' : 'active'
            };
            // 10초 타임아웃
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('서버 응답 시간 초과 (10초). 네트워크를 확인하고 다시 시도해주세요.')), 10000)
            );
            const ref = await Promise.race([
                db.collection('users').add(data),
                timeout
            ]);
            return { id: ref.id, ...data };
        },

        // 회원정보 수정
        async update(id, updates) {
            const db = getDB();
            const data = { ...updates, updatedAt: new Date().toISOString() };
            await db.collection('users').doc(id).update(data);
            return data;
        },

        // 로그인 검증
        async authenticate(userId, password, userType) {
            try {
                const user = await API.users.findByUserId(userId);
                if (!user) return { success: false, message: '존재하지 않는 아이디입니다.' };
                if (user.userType !== userType) return { success: false, message: '회원 유형이 일치하지 않습니다.' };
                if (user.password !== password) return { success: false, message: '비밀번호가 올바르지 않습니다.' };
                if (user.status === 'pending') return { success: false, message: '관리자 승인 대기 중입니다.' };
                if (user.status === 'blocked') return { success: false, message: '이용이 제한된 계정입니다.' };
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

        // 전체 조회 (관리자용)
        // ⚠️ orderBy 제거 → 클라이언트 정렬
        async getAll(params = '') {
            const db = getDB();
            const snap = await db.collection('applications').get();
            return { data: sortByCreatedAt(snapToArr(snap)) };
        },

        // 단건 조회
        async getById(id) {
            const db = getDB();
            const doc = await db.collection('applications').doc(id).get();
            return docToObj(doc);
        },

        // 특정 사용자의 신청 내역
        // ⚠️ where + orderBy 복합 인덱스 필요 → orderBy 제거, 클라이언트 정렬
        async getByUserId(userId) {
            const db = getDB();
            const snap = await db.collection('applications')
                .where('userId', '==', userId).get();
            return sortByCreatedAt(snapToArr(snap));
        },

        // 특정 법무사에게 배정된 신청 내역
        // ⚠️ where + where + orderBy → orderBy 제거, 클라이언트 정렬
        async getByExpertId(expertId, status = '') {
            const db = getDB();
            let query = db.collection('applications')
                .where('assigned_expert_id', '==', expertId);
            if (status) query = query.where('status', '==', status);
            const snap = await query.get();
            return sortByCreatedAt(snapToArr(snap));
        },

        // 신규 신청 저장
        async create(appData) {
            const db = getDB();
            const data = {
                ...appData,
                status: '접수',
                createdAt: new Date().toISOString()
            };
            const ref = await db.collection('applications').add(data);
            return { id: ref.id, ...data };
        },

        // 상태 업데이트
        async updateStatus(id, status, extra = {}) {
            const db = getDB();
            const data = {
                status,
                updatedAt: new Date().toISOString(),
                ...extra
            };
            await db.collection('applications').doc(id).update(data);
            return data;
        },

        // 법무사 배정
        async assignExpert(id, expertId, expertName) {
            const db = getDB();
            const data = {
                assigned_expert_id: expertId,
                expert_name: expertName,
                status: '매칭완료',
                assigned_at: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await db.collection('applications').doc(id).update(data);
            return data;
        }
    },

    // ============================================================
    // EXPERTS 컬렉션
    // ============================================================
    experts: {

        // ⚠️ orderBy 제거 → 클라이언트 정렬
        async getAll(params = '') {
            const db = getDB();
            const snap = await db.collection('experts').get();
            return { data: sortByCreatedAt(snapToArr(snap)) };
        },

        async getById(id) {
            const db = getDB();
            const doc = await db.collection('experts').doc(id).get();
            return docToObj(doc);
        },

        // ⚠️ where + where 복합 쿼리 (인덱스 필요할 수 있음)
        // array-contains + status 조합은 복합 인덱스 필요
        // → status 필터를 클라이언트로 이동
        async getByRegion(region) {
            const db = getDB();
            const snap = await db.collection('experts')
                .where('serviceRegions', 'array-contains', region).get();
            const all = snapToArr(snap);
            return all.filter(e => e.status === 'active');
        },

        async create(data) {
            const db = getDB();
            const d = { ...data, createdAt: new Date().toISOString() };
            const ref = await db.collection('experts').add(d);
            return { id: ref.id, ...d };
        },

        async update(id, updates) {
            const db = getDB();
            const data = { ...updates, updatedAt: new Date().toISOString() };
            await db.collection('experts').doc(id).update(data);
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
