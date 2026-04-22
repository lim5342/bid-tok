// ============================================
// State Management
// ============================================
const AppState = {
    currentPage: 'main',
    currentStep: 1,
    caseData: {},
    formData: {},
    signatureData: null
};

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('대리입찰 톡 초기화 완료');
    initializeApp();
    setupEventListeners();
});

function initializeApp() {
    console.log('앱 초기화 중...');
    
    // Set default expert type
    if (!AppState.formData.selectedExpertType) {
        AppState.formData.selectedExpertType = '매수신청대리인';
        AppState.formData.serviceFee = 70000;
    }
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
    // Navigation buttons
    const applyBtn = document.getElementById('applyBtn');
    const heroApplyBtn = document.getElementById('heroApplyBtn');
    
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            console.log('대리입찰 신청 버튼 클릭');
            alert('대리입찰 신청 기능이 곧 오픈됩니다!');
        });
    }
    
    if (heroApplyBtn) {
        heroApplyBtn.addEventListener('click', () => {
            console.log('지금 바로 신청하기 버튼 클릭');
            alert('대리입찰 신청 기능이 곧 오픈됩니다!');
        });
    }
    
    // Expert application button
    const expertApplyBtn = document.getElementById('expertApplyBtn');
    if (expertApplyBtn) {
        expertApplyBtn.addEventListener('click', () => {
            console.log('전문가 신청 버튼 클릭');
            alert('전문가 신청 기능이 곧 오픈됩니다!');
        });
    }
}

// ============================================
// Utility Functions
// ============================================
function formatNumber(num) {
    if (!num) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

console.log('main.js 로드 완료');
