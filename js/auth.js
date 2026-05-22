// ============================================
// 인증 및 세션 관리 시스템 (auth.js)
// tables/users API 연동 버전
// ============================================

const Auth = {
    // 현재 로그인한 사용자 정보 가져오기
    getCurrentUser: function() {
        const userJson = localStorage.getItem('currentUser');
        return userJson ? JSON.parse(userJson) : null;
    },

    // 사용자 정보 저장
    setCurrentUser: function(user) {
        localStorage.setItem('currentUser', JSON.stringify(user));
    },

    // 로그아웃
    logout: function() {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('autoLogin');
        window.location.href = 'index.html';
    },

    // 로그인 상태 확인
    isLoggedIn: function() {
        return this.getCurrentUser() !== null;
    },

    // 사용자 타입 확인
    getUserType: function() {
        const user = this.getCurrentUser();
        return user ? user.userType : null;
    },

    // ── 로그인 처리 ─────────────────────────────────────────────
    login: async function(userIdOrEmail, password, userType, autoLogin = false) {
        try {
            // API 모듈이 로드됐으면 실제 API 사용, 아니면 fallback
            if (typeof API !== 'undefined') {
                const result = await API.users.authenticate(userIdOrEmail, password, userType);
                if (!result.success) {
                    return { success: false, message: result.message };
                }
                const user = result.user;
                // 비밀번호는 세션에 저장하지 않음
                const sessionUser = {
                    id: user.id,
                    userId: user.userId,
                    email: user.email,
                    name: user.name,
                    userType: user.userType,
                    phone: user.phone || '',
                    licenseNumber: user.licenseNumber || '',
                    officeAddress: user.officeAddress || '',
                    status: user.status,
                    createdAt: user.createdAt
                };
                this.setCurrentUser(sessionUser);
                if (autoLogin) localStorage.setItem('autoLogin', 'true');
                return { success: true, user: sessionUser };
            }

            // ── API 없을 때 개발용 fallback ──────────────────────
            console.warn('⚠️ API 모듈 없음 – 개발용 임시 로그인');
            const devUser = {
                id: 'dev_' + Date.now(),
                userId: userIdOrEmail,
                email: userIdOrEmail.includes('@') ? userIdOrEmail : userIdOrEmail + '@example.com',
                name: '테스트사용자',
                userType: userType,
                phone: '010-1234-5678',
                status: 'active',
                createdAt: new Date().toISOString()
            };
            this.setCurrentUser(devUser);
            if (autoLogin) localStorage.setItem('autoLogin', 'true');
            return { success: true, user: devUser };

        } catch (error) {
            console.error('로그인 오류:', error);
            return { success: false, message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' };
        }
    },

    // ── 회원가입 처리 ────────────────────────────────────────────
    signup: async function(userData) {
        try {
            if (typeof API !== 'undefined') {
                // 아이디 중복 체크
                const idTaken = await API.users.isUserIdTaken(userData.userId);
                if (idTaken) return { success: false, message: '이미 사용 중인 아이디입니다.' };

                // 이메일 중복 체크
                const emailTaken = await API.users.isEmailTaken(userData.email);
                if (emailTaken) return { success: false, message: '이미 사용 중인 이메일입니다.' };

                // 회원 생성
                const newUser = await API.users.create(userData);
                return { success: true, message: '회원가입이 완료되었습니다.', user: newUser };
            }

            // ── 개발용 fallback ─────────────────────────────────
            console.warn('⚠️ API 모듈 없음 – 개발용 임시 회원가입');
            return { success: true, message: '회원가입이 완료되었습니다.' };

        } catch (error) {
            console.error('회원가입 오류:', error);
            // 타임아웃 / DB 연결 실패 메시지 구분
            const msg = (error.message || '').includes('timeout') || (error.message || '').includes('초과')
                ? '서버 응답 시간이 초과됐습니다. 인터넷 연결을 확인하고 다시 시도해주세요.'
                : (error.message || '회원가입 중 오류가 발생했습니다. 다시 시도해주세요.');
            return { success: false, message: msg };
        }
    },

    // ── 아이디 중복 체크 ──────────────────────────────────────────
    checkUserIdDuplicate: async function(userId) {
        try {
            if (typeof API !== 'undefined') {
                const taken = await API.users.isUserIdTaken(userId);
                return { available: !taken };
            }
            return { available: true }; // fallback
        } catch (error) {
            console.error('아이디 중복 체크 오류:', error);
            return { available: false, message: '서버 오류가 발생했습니다.' };
        }
    },

    // ── 이메일 중복 체크 ──────────────────────────────────────────
    checkEmailDuplicate: async function(email) {
        try {
            if (typeof API !== 'undefined') {
                const taken = await API.users.isEmailTaken(email);
                return { available: !taken };
            }
            return { available: true }; // fallback
        } catch (error) {
            console.error('이메일 중복 체크 오류:', error);
            return { available: false, message: '서버 오류가 발생했습니다.' };
        }
    },

    // 로그인 필수 페이지 체크
    requireLogin: function(redirectUrl = 'login.html') {
        if (!this.isLoggedIn()) {
            alert('로그인이 필요한 서비스입니다.');
            window.location.href = redirectUrl;
            return false;
        }
        return true;
    },

    // 특정 사용자 타입만 접근 가능
    requireUserType: function(requiredType, redirectUrl = 'index.html') {
        if (!this.isLoggedIn()) {
            alert('로그인이 필요한 서비스입니다.');
            window.location.href = 'login.html';
            return false;
        }
        const userType = this.getUserType();
        if (userType !== requiredType) {
            alert('접근 권한이 없습니다.');
            window.location.href = redirectUrl;
            return false;
        }
        return true;
    },

    // 관리자 권한 체크
    isAdmin: function() {
        const user = this.getCurrentUser();
        return user && user.userType === 'admin';
    },

    // 자동 로그인 체크
    checkAutoLogin: function() {
        const autoLogin = localStorage.getItem('autoLogin');
        return autoLogin === 'true' && this.isLoggedIn();
    },

    // 사용자 정보 업데이트 (로컬 세션)
    updateUserInfo: function(updates) {
        const user = this.getCurrentUser();
        if (user) {
            const updatedUser = { ...user, ...updates };
            this.setCurrentUser(updatedUser);
            return updatedUser;
        }
        return null;
    },

    // 프로필 저장 (API 연동)
    saveProfile: async function(updates) {
        const user = this.getCurrentUser();
        if (!user) return { success: false, message: '로그인이 필요합니다.' };
        try {
            const isDevOrTemp = user.id && (user.id.startsWith('dev_') || user.id.startsWith('temp_'));
            const isSocialUser = user.loginType === 'kakao' || user.loginType === 'naver';

            if (typeof API !== 'undefined' && user.id && !isDevOrTemp) {
                if (isSocialUser) {
                    // 소셜 로그인 사용자: DB에 없을 수 있으므로 upsert 방식 처리
                    try {
                        // 기존 유저 조회
                        const res = await API.users.getAll(`userId=${user.userId}&limit=1`);
                        const existing = res?.data?.length > 0 ? res.data[0] : null;
                        if (existing) {
                            await API.users.update(existing.id, updates);
                        } else {
                            // DB에 없으면 신규 생성
                            const newUser = { ...user, ...updates };
                            await API.users.create(newUser);
                        }
                    } catch (e) {
                        console.warn('소셜 사용자 DB 저장 시도 실패 (로컬 저장으로 대체):', e);
                    }
                } else {
                    await API.users.update(user.id, updates);
                }
            }
            this.updateUserInfo(updates);
            return { success: true };
        } catch (error) {
            console.error('프로필 저장 오류:', error);
            return { success: false, message: '저장 중 오류가 발생했습니다.' };
        }
    }
};

// ── 페이지 로드 시 네비게이션 업데이트 ──────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    updateNavigation();
});

// 네비게이션 UI 업데이트 함수
function updateNavigation() {
    const user = Auth.getCurrentUser();
    const loginActions = document.getElementById('loginActions');
    const loginBtn    = document.getElementById('loginBtn');   // 단독 loginBtn 호환
    const userInfo    = document.getElementById('userInfo');

    if (!userInfo) return;

    if (user) {
        // 비로그인 버튼 숨기기 (loginActions 우선, 없으면 loginBtn)
        if (loginActions) loginActions.style.display = 'none';
        else if (loginBtn) loginBtn.style.display = 'none';
        userInfo.style.display = 'flex';

        const userName     = document.getElementById('userName');
        const userTypeLabel = document.getElementById('userTypeLabel');

        if (userName) userName.textContent = user.name || user.userId || user.email;
        if (userTypeLabel) {
            const typeMap = { client: '신청자', expert: '법무사', admin: '관리자' };
            userTypeLabel.textContent = typeMap[user.userType] || user.userType;
        }
    } else {
        // 로그인 버튼 다시 보이기
        if (loginActions) loginActions.style.display = 'flex';
        else if (loginBtn) loginBtn.style.display = 'block';
        userInfo.style.display = 'none';
    }
}

// 로그아웃 버튼 핸들러
function handleLogout() {
    if (confirm('로그아웃 하시겠습니까?')) {
        Auth.logout();
    }
}

// 마이페이지 이동
function goToMypage() {
    const userType = Auth.getUserType();
    if (userType === 'client') {
        window.location.href = 'mypage.html';
    } else if (userType === 'expert') {
        window.location.href = 'expert-mypage.html';
    } else if (userType === 'admin') {
        window.location.href = 'admin.html';
    }
}
