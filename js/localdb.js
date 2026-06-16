// ============================================================
// LocalDB — Firebase 403 완전 대체 로컬 영구 저장소
// IndexedDB 기반 (localStorage보다 용량 큼, 비동기 CRUD)
// Firebase가 복구되면 자동 동기화
// ============================================================

const LocalDB = (() => {
    const DB_NAME    = 'bidtok_localdb';
    const DB_VERSION = 2;
    const STORES     = ['users','applications','experts','admins','adminNotifications'];

    let _db = null;

    // ── IndexedDB 초기화 ────────────────────────────────────
    function openDB() {
        if (_db) return Promise.resolve(_db);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                STORES.forEach(s => {
                    if (!db.objectStoreNames.contains(s)) {
                        db.createObjectStore(s, { keyPath: 'id' });
                    }
                });
            };
            req.onsuccess = e => { _db = e.target.result; resolve(_db); };
            req.onerror   = e => reject(e.target.error);
        });
    }

    // ── 트랜잭션 헬퍼 ──────────────────────────────────────
    async function tx(storeName, mode, fn) {
        const db    = await openDB();
        const store = db.transaction(storeName, mode).objectStore(storeName);
        return new Promise((resolve, reject) => {
            const req = fn(store);
            req.onsuccess = e => resolve(e.target.result);
            req.onerror   = e => reject(e.target.error);
        });
    }

    // ── 전체 조회 ──────────────────────────────────────────
    async function getAll(storeName) {
        const db    = await openDB();
        const store = db.transaction(storeName, 'readonly').objectStore(storeName);
        return new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = e => resolve(e.target.result || []);
            req.onerror   = e => reject(e.target.error);
        });
    }

    // ── 단건 조회 ──────────────────────────────────────────
    async function getById(storeName, id) {
        const db    = await openDB();
        const store = db.transaction(storeName, 'readonly').objectStore(storeName);
        return new Promise((resolve, reject) => {
            const req = store.get(id);
            req.onsuccess = e => resolve(e.target.result || null);
            req.onerror   = e => reject(e.target.error);
        });
    }

    // ── 추가 (자동 ID) ─────────────────────────────────────
    async function add(storeName, data) {
        const id = data.id || (_genId());
        const item = { ...data, id, _localOnly: true };
        await tx(storeName, 'readwrite', s => s.put(item));
        return item;
    }

    // ── 업데이트 ───────────────────────────────────────────
    async function update(storeName, id, updates) {
        const existing = await getById(storeName, id) || { id };
        const item = { ...existing, ...updates, id, _localOnly: true };
        await tx(storeName, 'readwrite', s => s.put(item));
        return item;
    }

    // ── 삭제 ──────────────────────────────────────────────
    async function remove(storeName, id) {
        await tx(storeName, 'readwrite', s => s.delete(id));
        return true;
    }

    // ── ID 생성 ────────────────────────────────────────────
    function _genId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
    }

    // ── 마이그레이션 카운터 ───────────────────────────────
    const MIGRATED_KEY = '_ldb_migrated';
    function isMigrated() { return !!localStorage.getItem(MIGRATED_KEY); }
    function setMigrated() { localStorage.setItem(MIGRATED_KEY, '1'); }

    // ── Firebase → LocalDB 마이그레이션 ────────────────────
    // Firebase가 열려 있을 때 한 번만 실행 (데이터 가져오기)
    async function migrateFromFirebase() {
        if (isMigrated()) return { skipped: true };

        const PROJECT_ID = 'bid-tok';
        const API_KEY    = 'AIzaSyDrJwD2FfDr_PJbc54pvUDQcCRPGl6ICpQ';
        const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

        let totalMigrated = 0;
        const collections = ['users','applications','experts','adminNotifications'];

        for (const col of collections) {
            try {
                const res = await fetch(`${BASE}/${col}?key=${API_KEY}&pageSize=300`);
                if (!res.ok) continue;
                const json = await res.json();
                const docs = json.documents || [];

                for (const doc of docs) {
                    const id = doc.name.split('/').pop();
                    const obj = _fsFieldsToObj(doc.fields);
                    await update(col, id, { ...obj, id, _localOnly: false });
                    totalMigrated++;
                }
                console.log(`[LocalDB] ${col} 마이그레이션: ${docs.length}건`);
            } catch(e) {
                console.warn(`[LocalDB] ${col} 마이그레이션 실패:`, e.message);
            }
        }

        if (totalMigrated > 0) {
            setMigrated();
            console.log(`[LocalDB] 마이그레이션 완료: 총 ${totalMigrated}건`);
        }

        return { migrated: totalMigrated };
    }

    // ── Firestore fields → JS 객체 변환 (api.js 독립 복사) ─
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

    // ── 전체 데이터 Export (JSON) ──────────────────────────
    async function exportAll() {
        const result = {};
        for (const s of STORES) {
            result[s] = await getAll(s);
        }
        return result;
    }

    // ── JSON Import ────────────────────────────────────────
    async function importAll(data) {
        for (const [store, items] of Object.entries(data)) {
            if (!STORES.includes(store)) continue;
            for (const item of (items || [])) {
                if (item.id) await update(store, item.id, item);
            }
        }
    }

    // ── 초기화 (DB 열기 + 마이그레이션 시도) ───────────────
    async function init() {
        await openDB();
        // 백그라운드에서 Firebase 마이그레이션 시도
        migrateFromFirebase().catch(e => console.warn('[LocalDB] 마이그레이션:', e.message));
        console.log('[LocalDB] 초기화 완료 ✅');
    }

    return { init, getAll, getById, add, update, remove, exportAll, importAll, migrateFromFirebase, isMigrated };
})();

window.LocalDB = LocalDB;
console.log('[LocalDB] 모듈 로드 ✅');
