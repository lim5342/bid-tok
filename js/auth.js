// 인증 및 세션 관리 시스템
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

    // 로그인 처리
    login: async function(userIdOrEmail, password, userType, autoLogin = false) {
        try {
            // TODO: 실제 API 연동 시 교체
            // 임시 로그인 로직 (개발용)
            console.log('로그인 시도:', { userIdOrEmail, userType });
            
            // 임시 사용자 데이터
            const user = {
                id: 'temp_' + Date.now(),
                userId: userIdOrEmail,
                email: userIdOrEmail + '@example.com',
                name: '테스트사용자',
                userType: userType,
                phone: '010-1234-5678',
                createdAt: new Date().toISOString()
            };

            // 세션 저장
            this.setCurrentUser(user);
            
            // 자동 로그인 설정
            if (autoLogin) {
                localStorage.setItem('autoLogin', 'true');
            }

            return { success: true, user: user };
        } catch (error) {
            console.error('로그인 오류:', error);
            return { success: false, error: error.message };
        }
    },

    // 회원가입 처리
    signup: async function(userData) {
        try {
            // TODO: 실제 API 연동 시 교체
            console.log('회원가입 시도:', userData);
            
            // 임시 회원가입 성공
            return { success: true, message: '회원가입이 완료되었습니다.' };
        } catch (error) {
            console.error('회원가입 오류:', error);
            return { success: false, error: error.message };
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

    // 특정 사용자 타입만 접근 가능하도록 체크
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

    // 사용자 정보 업데이트
    updateUserInfo: function(updates) {
        const user = this.getCurrentUser();
        if (user) {
            const updatedUser = { ...user, ...updates };
            this.setCurrentUser(updatedUser);
            return updatedUser;
        }
        return null;
    }
};

// 페이지 로드 시 자동 로그인 체크
document.addEventListener('DOMContentLoaded', function() {
    // 네비게이션 UI 업데이트
    updateNavigation();
});

// 네비게이션 UI 업데이트 함수
function updateNavigation() {
    const user = Auth.getCurrentUser();
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');

    if (!loginBtn || !userInfo) return;

    if (user) {
        // 로그인 상태
        loginBtn.style.display = 'none';
        userInfo.style.display = 'flex';
        
        const userName = document.getElementById('userName');
        const userTypeLabel = document.getElementById('userTypeLabel');
        
        if (userName) {
            userName.textContent = user.name || user.email;
        }
        
        if (userTypeLabel) {
            userTypeLabel.textContent = user.userType === 'client' ? '신청자' : '법무사';
        }
    } else {
        // 비로그인 상태
        loginBtn.style.display = 'block';
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
