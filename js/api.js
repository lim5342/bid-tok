// ============================================
// API 연동 모듈 (api.js)
// tables/ RESTful API 기반
// ============================================

const API = {
    BASE_URL: 'tables',

    // ── 공통 요청 함수 ──────────────────────────
    async request(method, endpoint, body = null) {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) options.body = JSON.stringify(body);

        try {
            const res = await fetch(`${this.BASE_URL}/${endpoint}`, options);
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`HTTP ${res.status}: ${errText}`);
            }
            return await res.json();
        } catch (err) {
            console.error(`API Error [${method} ${endpoint}]:`, err);
            throw err;
        }
    },

    get:    (endpoint)        => API.request('GET',    endpoint),
    post:   (endpoint, body)  => API.request('POST',   endpoint, body),
    patch:  (endpoint, body)  => API.request('PATCH',  endpoint, body),
    delete: (endpoint)        => API.request('DELETE', endpoint),

    // ============================================================
    // USERS 테이블 API
    // ============================================================
    users: {
        // 전체 조회 (관리자용)
        getAll(params = '') {
            return API.get(`users?${params}`);
        },

        // 단건 조회
        getById(id) {
            return API.get(`users/${id}`);
        },

        // 아이디로 조회 (로그인용)
        async findByUserId(userId) {
            const data = await API.get(`users?userId=${encodeURIComponent(userId)}&limit=1`);
            return (data && data.data && data.data.length > 0) ? data.data[0] : null;
        },

        // 이메일로 조회
        async findByEmail(email) {
            const data = await API.get(`users?email=${encodeURIComponent(email)}&limit=1`);
            return (data && data.data && data.data.length > 0) ? data.data[0] : null;
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
        create(userData) {
            return API.post('users', {
                ...userData,
                createdAt: new Date().toISOString(),
                status: userData.userType === 'expert' ? 'pending' : 'active'
            });
        },

        // 회원정보 수정
        update(id, updates) {
            return API.patch(`users/${id}`, {
                ...updates,
                updatedAt: new Date().toISOString()
            });
        },

        // 로그인 검증 (아이디 + 비밀번호 + 회원유형)
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
                return { success: false, message: 'API 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' };
            }
        }
    },

    // ============================================================
    // APPLICATIONS 테이블 API
    // ============================================================
    applications: {
        // 전체 조회 (관리자용)
        getAll(params = 'limit=100&sort=-createdAt') {
            return API.get(`applications?${params}`);
        },

        // 단건 조회
        getById(id) {
            return API.get(`applications/${id}`);
        },

        // 특정 사용자의 신청 내역 (phone 또는 email 기반 조회)
        async getByUserId(userId) {
            // applications 테이블에는 userId 필드가 없으므로
            // phone 또는 email로 매핑된 전체 데이터를 가져온 후 클라이언트에서 필터링
            // 단, 신청 시 userId를 저장했다면 해당 필드로 조회
            const data = await API.get(`applications?userId=${encodeURIComponent(userId)}&sort=-createdAt`);
            if (data && data.data && data.data.length > 0) return data.data;
            // fallback: applicant_phone 또는 user_id 필드 시도
            const data2 = await API.get(`applications?user_id=${encodeURIComponent(userId)}&sort=-createdAt`);
            return (data2 && data2.data) ? data2.data : [];
        },

        // 특정 법무사에게 배정된 신청 내역 (assigned_expert_id 필드 사용)
        async getByExpertId(expertId, status = '') {
            // README 스키마: assigned_expert_id 필드
            const baseQuery = `assigned_expert_id=${encodeURIComponent(expertId)}`;
            const query = status
                ? `${baseQuery}&status=${status}&sort=-createdAt`
                : `${baseQuery}&sort=-createdAt`;
            const data = await API.get(`applications?${query}`);
            if (data && data.data && data.data.length > 0) return data.data;
            // fallback: expertId 필드 시도
            const fallbackQuery = status
                ? `expertId=${encodeURIComponent(expertId)}&status=${status}&sort=-createdAt`
                : `expertId=${encodeURIComponent(expertId)}&sort=-createdAt`;
            const data2 = await API.get(`applications?${fallbackQuery}`);
            return (data2 && data2.data) ? data2.data : [];
        },

        // 신규 신청 저장
        create(appData) {
            return API.post('applications', {
                ...appData,
                status: '접수',
                createdAt: new Date().toISOString()
            });
        },

        // 상태 업데이트
        updateStatus(id, status, extra = {}) {
            return API.patch(`applications/${id}`, {
                status,
                updatedAt: new Date().toISOString(),
                ...extra
            });
        },

        // 법무사 배정 (README 스키마: assigned_expert_id)
        assignExpert(id, expertId, expertName) {
            return API.patch(`applications/${id}`, {
                assigned_expert_id: expertId,
                expert_name: expertName,
                status: '매칭완료',
                assigned_at: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }
    }
};

// 전역 노출
window.API = API;
console.log('API module loaded ✅');
