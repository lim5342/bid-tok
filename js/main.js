// ============================================
// State Management with LocalStorage
// ============================================
const AppState = {
    currentPage: 'main',
    currentStep: 1,
    caseData: {},
    formData: {},
    signatureData: null
};

// Load saved data from localStorage
function loadSavedData() {
    const saved = localStorage.getItem('daerijangTalk_formData');
    if (saved) {
        try {
            AppState.formData = JSON.parse(saved);
            console.log('Saved data loaded:', AppState.formData);
        } catch (e) {
            console.error('Error loading saved data:', e);
        }
    }
}

// Save data to localStorage
function saveFormData() {
    try {
        localStorage.setItem('daerijangTalk_formData', JSON.stringify(AppState.formData));
        console.log('Data saved');
    } catch (e) {
        console.error('Error saving data:', e);
    }
}

// Court data by region
const courtData = {
    '서울': ['서울중앙지방법원', '서울동부지방법원', '서울남부지방법원', '서울북부지방법원', '서울서부지방법원'],
    '인천': ['인천지방법원', '인천지방법원 부천지원'],
    '경기': ['수원지방법원', '수원지방법원 성남지원', '수원지방법원 안산지원', '수원지방법원 안양지원', '수원지방법원 여주지원', '수원지방법원 평택지원', '의정부지방법원', '의정부지방법원 고양지원', '의정부지방법원 남양주지원'],
    '부산': ['부산지방법원', '부산지방법원 동부지원', '부산지방법원 서부지원'],
    '대구': ['대구지방법원', '대구지방법원 서부지원', '대구지방법원 안동지원', '대구지방법원 경주지원', '대구지방법원 김천지원', '대구지방법원 상주지원', '대구지방법원 의성지원', '대구지방법원 영덕지원', '대구지방법원 포항지원'],
    '광주': ['광주지방법원', '광주지방법원 목포지원', '광주지방법원 순천지원', '광주지방법원 해남지원'],
    '대전': ['대전지방법원', '대전지방법원 홍성지원', '대전지방법원 논산지원', '대전지방법원 서산지원'],
    '울산': ['울산지방법원'],
    '강원': ['춘천지방법원', '춘천지방법원 강릉지원', '춘천지방법원 속초지원', '춘천지방법원 원주지원', '춘천지방법원 영월지원'],
    '충북': ['청주지방법원', '청주지방법원 충주지원', '청주지방법원 제천지원', '청주지방법원 영동지원'],
    '충남': ['대전지방법원 천안지원', '대전지방법원 공주지원'],
    '전북': ['전주지방법원', '전주지방법원 군산지원', '전주지방법원 정읍지원', '전주지방법원 남원지원'],
    '전남': ['광주지방법원 장흥지원', '광주지방법원 강진지원'],
    '경북': ['대구지방법원 영주지원', '대구지방법원 울진지원'],
    '경남': ['창원지방법원', '창원지방법원 마산지원', '창원지방법원 진주지원', '창원지방법원 통영지원', '창원지방법원 밀양지원', '창원지방법원 거창지원'],
    '제주': ['제주지방법원']
};

// ============================================
// Utility Functions
// ============================================
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function removeCommas(str) {
    return str.replace(/,/g, '');
}

function validatePhone(phone) {
    const regex = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;
    return regex.test(phone);
}

function validateSSN(front, back) {
    return front.length === 6 && back.length === 7;
}

function getTodayKorean() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    return `${year}년 ${month}월 ${day}일`;
}

// ============================================
// DOM Ready
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    loadSavedData();
    initializeApp();
    setupEventListeners();
    setupFAQ();
    setupSignatureCanvas();
    restoreFormData();
});

// ============================================
// App Initialization
// ============================================
function initializeApp() {
    const contractDateEl = document.getElementById('contractDate');
    if (contractDateEl) {
        contractDateEl.textContent = getTodayKorean();
    }
    
    const regionSelect = document.getElementById('region');
    if (regionSelect) {
        regionSelect.addEventListener('change', updateCourtOptions);
    }
    
    // Set default expert type and fee if not already set
    if (!AppState.formData.selectedExpertType) {
        AppState.formData.selectedExpertType = '매수신청대리인';
        AppState.formData.serviceFee = 70000;
    }
}

// ============================================
// Restore Form Data
// ============================================
function restoreFormData() {
    if (Object.keys(AppState.formData).length === 0) return;
    
    // Restore Step 2 data
    if (AppState.formData.bidderName) {
        document.getElementById('bidderName').value = AppState.formData.bidderName;
    }
    if (AppState.formData.bankName) {
        document.getElementById('bankName').value = AppState.formData.bankName;
    }
    if (AppState.formData.accountNumber) {
        document.getElementById('accountNumber').value = AppState.formData.accountNumber;
    }
    if (AppState.formData.phoneNumber) {
        document.getElementById('phoneNumber').value = AppState.formData.phoneNumber;
    }
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
    // Navigation buttons
    const applyBtn = document.getElementById('applyBtn');
    const heroApplyBtn = document.getElementById('heroApplyBtn');
    const ctaApplyBtn = document.getElementById('ctaApplyBtn');
    
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            console.log('Apply button clicked');
            switchToApplicationPage();
        });
    }
    
    if (heroApplyBtn) {
        heroApplyBtn.addEventListener('click', () => {
            console.log('Hero apply button clicked');
            switchToApplicationPage();
        });
    }
    
    if (ctaApplyBtn) {
        ctaApplyBtn.addEventListener('click', () => {
            console.log('CTA apply button clicked');
            switchToApplicationPage();
        });
    }
    
    document.getElementById('backToMain')?.addEventListener('click', () => switchToMainPage());
    
    // Expert page
    document.getElementById('expertApplyBtn')?.addEventListener('click', () => switchToExpertPage());
    document.getElementById('backToMainFromExpert')?.addEventListener('click', () => switchToMainPage());
    document.getElementById('submitExpertApplication')?.addEventListener('click', handleExpertSubmit);
    document.getElementById('betaExpertApply')?.addEventListener('click', () => switchToExpertPage());
    
    // Admin page (secret: click logo 5 times)
    let logoClickCount = 0;
    document.querySelector('.nav-logo')?.addEventListener('click', function() {
        logoClickCount++;
        if (logoClickCount === 5) {
            switchToAdminPage();
            logoClickCount = 0;
        }
        setTimeout(() => { logoClickCount = 0; }, 3000);
    });
    document.getElementById('backToMainFromAdmin')?.addEventListener('click', () => switchToMainPage());
    
    // Admin tabs
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchAdminTab(tabName);
        });
    });
    
    // Mobile nav toggle
    document.getElementById('navToggle')?.addEventListener('click', toggleMobileNav);
    
    // Smooth scroll
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href !== '#' && href !== '#history') {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    });
    
    // Step 1: Case search
    document.getElementById('searchCase')?.addEventListener('click', handleCaseSearch);
    
    // Step 1 Result: Expert type selection
    document.querySelectorAll('input[name="expertType"]').forEach(radio => {
        radio.addEventListener('change', handleExpertTypeChange);
    });
    
    // Step 1 Result: Apply buttons
    document.getElementById('applyPersonal')?.addEventListener('click', () => proceedToStep(2, 'personal'));
    document.getElementById('applyJoint')?.addEventListener('click', () => proceedToStep(2, 'joint'));
    document.getElementById('applyCorporate')?.addEventListener('click', () => proceedToStep(2, 'corporate'));
    
    // Step 2: Bid amount input
    const bidAmountInput = document.getElementById('bidAmount');
    if (bidAmountInput) {
        bidAmountInput.addEventListener('input', handleBidAmountInput);
        bidAmountInput.addEventListener('blur', validateBidAmount);
    }
    
    // Step 2: Address search
    document.getElementById('searchAddress')?.addEventListener('click', () => openAddressSearch('addressRoad'));
    
    // Step 2: Phone verification
    document.getElementById('verifyPhone')?.addEventListener('click', handlePhoneVerification);
    
    // Step 2: Navigation buttons
    document.getElementById('backToStep1Result')?.addEventListener('click', () => {
        document.getElementById('step2').classList.remove('active');
        document.getElementById('step1Result').classList.add('active');
        updateProgressBar(1);
    });
    document.getElementById('proceedToContract')?.addEventListener('click', handleProceedToContract);
    
    // Step 3: Navigation buttons
    document.getElementById('backToStep2')?.addEventListener('click', () => {
        showStep(2);
    });
    document.getElementById('openSignature')?.addEventListener('click', openSignatureModal);
    document.getElementById('closeSignature')?.addEventListener('click', closeSignatureModal);
    document.getElementById('cancelSignature')?.addEventListener('click', closeSignatureModal);
    document.getElementById('clearSignature')?.addEventListener('click', clearSignature);
    document.getElementById('completeSignature')?.addEventListener('click', completeSignature);
    
    // Step 4: Payment
    document.getElementById('processPayment')?.addEventListener('click', handlePayment);
    
    // Expert address search
    document.getElementById('searchExpertAddress')?.addEventListener('click', () => openAddressSearch('expertAddress'));
}

// ============================================
// Daum Address API
// ============================================
function openAddressSearch(targetId) {
    new daum.Postcode({
        oncomplete: function(data) {
            document.getElementById(targetId).value = data.roadAddress;
            if (targetId === 'addressRoad') {
                document.getElementById('addressDetail').focus();
            } else if (targetId === 'expertAddress') {
                document.getElementById('expertAddressDetail').focus();
            }
        }
    }).open();
}

// ============================================
// Page Navigation
// ============================================
function switchToApplicationPage() {
    document.getElementById('mainPage').classList.remove('active');
    document.getElementById('applicationPage').classList.add('active');
    document.getElementById('expertPage')?.classList.remove('active');
    document.getElementById('adminPage')?.classList.remove('active');
    document.getElementById('navbar').style.display = 'none';
    document.querySelector('.footer').style.display = 'none';
    window.scrollTo(0, 0);
    AppState.currentPage = 'application';
}

function switchToExpertPage() {
    document.getElementById('mainPage').classList.remove('active');
    document.getElementById('applicationPage').classList.remove('active');
    document.getElementById('expertPage').classList.add('active');
    document.getElementById('adminPage')?.classList.remove('active');
    document.getElementById('navbar').style.display = 'none';
    document.querySelector('.footer').style.display = 'none';
    window.scrollTo(0, 0);
    AppState.currentPage = 'expert';
}

function switchToAdminPage() {
    document.getElementById('mainPage').classList.remove('active');
    document.getElementById('applicationPage').classList.remove('active');
    document.getElementById('expertPage')?.classList.remove('active');
    document.getElementById('adminPage').classList.add('active');
    document.getElementById('navbar').style.display = 'none';
    document.querySelector('.footer').style.display = 'none';
    window.scrollTo(0, 0);
    AppState.currentPage = 'admin';
    
    // Initialize admin page when accessed
    if (typeof initAdminPage === 'function') {
        initAdminPage();
    }
}

function switchToMainPage() {
    document.getElementById('mainPage').classList.add('active');
    document.getElementById('applicationPage').classList.remove('active');
    document.getElementById('expertPage')?.classList.remove('active');
    document.getElementById('adminPage')?.classList.remove('active');
    document.getElementById('navbar').style.display = 'block';
    document.querySelector('.footer').style.display = 'block';
    window.scrollTo(0, 0);
    AppState.currentPage = 'main';
    if (AppState.currentPage === 'application') {
        resetApplication();
    }
}

function toggleMobileNav() {
    const navMenu = document.getElementById('navMenu');
    navMenu.classList.toggle('active');
}

function switchAdminTab(tabName) {
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');
}

// ============================================
// Step Navigation
// ============================================
function showStep(stepNumber) {
    document.querySelectorAll('.step-content').forEach(step => {
        step.classList.remove('active');
    });
    
    const targetStep = document.getElementById(`step${stepNumber}`);
    if (targetStep) {
        targetStep.classList.add('active');
    }
    
    updateProgressBar(stepNumber);
    AppState.currentStep = stepNumber;
    window.scrollTo(0, 0);
}

function updateProgressBar(stepNumber) {
    document.querySelectorAll('.progress-step').forEach((step, index) => {
        const stepNum = index + 1;
        if (stepNum < stepNumber) {
            step.classList.add('completed');
            step.classList.remove('active');
        } else if (stepNum === stepNumber) {
            step.classList.add('active');
            step.classList.remove('completed');
        } else {
            step.classList.remove('active', 'completed');
        }
    });
}

function proceedToStep(stepNumber, applicationType) {
    if (applicationType) {
        AppState.formData.applicationType = applicationType;
        AppState.formData.bidType = applicationType === 'personal' ? '개인' : applicationType === 'joint' ? '공동' : '법인';
    }
    
    // Save selected expert type when proceeding from step 1
    if (stepNumber === 2) {
        const selectedExpertType = document.querySelector('input[name="expertType"]:checked');
        if (selectedExpertType) {
            AppState.formData.selectedExpertType = selectedExpertType.value;
            AppState.formData.serviceFee = selectedExpertType.value === '매수신청대리인' ? 70000 : 100000;
        } else {
            // Default to 매수신청대리인
            AppState.formData.selectedExpertType = '매수신청대리인';
            AppState.formData.serviceFee = 70000;
        }
        console.log('Proceeding with:', AppState.formData.selectedExpertType, AppState.formData.serviceFee);
    }
    
    showStep(stepNumber);
}

function resetApplication() {
    AppState.currentStep = 1;
    AppState.caseData = {};
    // Don't reset formData to keep saved info
    AppState.signatureData = null;
    showStep(1);
}

// ============================================
// Step 1: Case Search
// ============================================
function updateCourtOptions() {
    const regionSelect = document.getElementById('region');
    const courtSelect = document.getElementById('court');
    const selectedRegion = regionSelect.value;
    
    courtSelect.innerHTML = '<option value="">법원 선택</option>';
    
    if (selectedRegion && courtData[selectedRegion]) {
        courtData[selectedRegion].forEach(court => {
            const option = document.createElement('option');
            option.value = court;
            option.textContent = court;
            courtSelect.appendChild(option);
        });
    }
}

function handleExpertTypeChange(e) {
    const selectedType = e.target.value;
    AppState.formData.selectedExpertType = selectedType;
    
    // Update fee display (will be used in payment step)
    if (selectedType === '매수신청대리인') {
        AppState.formData.serviceFee = 70000;
    } else if (selectedType === '법무사') {
        AppState.formData.serviceFee = 100000;
    }
    
    console.log('Selected expert type:', selectedType, 'Fee:', AppState.formData.serviceFee);
}

function handleCaseSearch() {
    const region = document.getElementById('region').value;
    const court = document.getElementById('court').value;
    const caseNumber = document.getElementById('caseNumber').value.trim();
    const propertyNumber = document.getElementById('propertyNumber').value.trim();
    
    if (!region || !court) {
        alert('관할법원을 선택해주세요.');
        return;
    }
    
    if (!caseNumber) {
        alert('사건번호를 입력해주세요.');
        return;
    }
    
    AppState.caseData = {
        region,
        court,
        caseNumber,
        propertyNumber: propertyNumber || '1',
        auctionDate: '2025년 3월 15일 10:30',
        appraisalValue: 350000000,
        minBid: 280000000,
        deposit: 28000000
    };
    
    document.getElementById('displayCaseNumber').textContent = caseNumber;
    document.getElementById('displayCourt').textContent = court;
    document.getElementById('displayAuctionDate').textContent = AppState.caseData.auctionDate;
    document.getElementById('displayAppraisalValue').textContent = formatNumber(AppState.caseData.appraisalValue) + '원';
    document.getElementById('displayMinBid').textContent = formatNumber(AppState.caseData.minBid) + '원';
    document.getElementById('displayDeposit').textContent = formatNumber(AppState.caseData.deposit) + '원';
    
    document.getElementById('step1').classList.remove('active');
    document.getElementById('step1Result').classList.add('active');
}

// ============================================
// Step 2: Bid Information
// ============================================
function handleBidAmountInput(e) {
    let value = removeCommas(e.target.value);
    value = value.replace(/[^0-9]/g, '');
    
    if (value) {
        e.target.value = formatNumber(value);
        const depositAmount = Math.floor(parseInt(value) * 0.1);
        document.getElementById('depositAmount').value = formatNumber(depositAmount);
    } else {
        e.target.value = '';
        document.getElementById('depositAmount').value = '';
    }
}

function validateBidAmount() {
    const bidAmountInput = document.getElementById('bidAmount');
    const bidAmount = parseInt(removeCommas(bidAmountInput.value));
    const minBid = AppState.caseData.minBid || 280000000;
    
    if (bidAmount && bidAmount < minBid) {
        alert(`입찰가는 최저입찰가(${formatNumber(minBid)}원) 이상이어야 합니다.`);
        bidAmountInput.focus();
    }
}

function handlePhoneVerification() {
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    
    if (!validatePhone(phoneNumber)) {
        alert('올바른 휴대폰 번호를 입력해주세요.');
        return;
    }
    
    alert('인증번호가 발송되었습니다.\n(데모에서는 실제로 발송되지 않습니다)');
}

function handleProceedToContract() {
    const bidAmount = document.getElementById('bidAmount').value.trim();
    const bidderName = document.getElementById('bidderName').value.trim();
    const bankName = document.getElementById('bankName').value;
    const accountNumber = document.getElementById('accountNumber').value.trim();
    const ssnFront = document.getElementById('ssnFront').value.trim();
    const ssnBack = document.getElementById('ssnBack').value.trim();
    const addressRoad = document.getElementById('addressRoad').value.trim();
    const addressDetail = document.getElementById('addressDetail').value.trim();
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    const agreePersonal = document.getElementById('agreePersonal').checked;
    const agreeContract = document.getElementById('agreeContract').checked;
    
    if (!bidAmount) {
        alert('입찰가를 입력해주세요.');
        return;
    }
    
    if (!bidderName) {
        alert('입찰자 성명을 입력해주세요.');
        return;
    }
    
    if (!bankName || !accountNumber) {
        alert('보증금 반환계좌를 입력해주세요.');
        return;
    }
    
    if (!validateSSN(ssnFront, ssnBack)) {
        alert('주민등록번호를 정확히 입력해주세요.');
        return;
    }
    
    if (!addressRoad || !addressDetail) {
        alert('주소를 입력해주세요.');
        return;
    }
    
    if (!validatePhone(phoneNumber)) {
        alert('올바른 휴대폰 번호를 입력해주세요.');
        return;
    }
    
    if (!agreePersonal || !agreeContract) {
        alert('필수 약관에 동의해주세요.');
        return;
    }
    
    AppState.formData = {
        ...AppState.formData,
        bidAmount,
        depositAmount: document.getElementById('depositAmount')?.value || '',
        bidderName,
        bankName,
        accountNumber,
        ssnFront,
        ssnBack,
        addressRoad,
        addressDetail,
        phoneNumber
    };
    
    saveFormData();
    updateCaseSummary();
    updateContractInfo();
    proceedToStep(3);
}

function updateCaseSummary() {
    document.getElementById('summaryCase').textContent = AppState.caseData.caseNumber;
    document.getElementById('summaryCourt').textContent = AppState.caseData.court;
    document.getElementById('summaryDate').textContent = AppState.caseData.auctionDate;
    document.getElementById('minBidDisplay').textContent = formatNumber(AppState.caseData.minBid) + '원';
}

function updateContractInfo() {
    document.getElementById('contractBidderName').textContent = AppState.formData.bidderName;
    document.getElementById('contractSSN').textContent = `${AppState.formData.ssnFront}-${AppState.formData.ssnBack.substring(0, 1)}******`;
    document.getElementById('contractAddress').textContent = `${AppState.formData.addressRoad} ${AppState.formData.addressDetail}`;
    document.getElementById('contractCaseNumber').textContent = AppState.caseData.caseNumber;
    document.getElementById('contractPropertyNumber').textContent = AppState.caseData.propertyNumber;
    document.getElementById('contractCourt').textContent = AppState.caseData.court;
}

// ============================================
// Step 3: Signature Canvas
// ============================================
let canvas, ctx;
let isDrawing = false;
let lastX = 0;
let lastY = 0;

function setupSignatureCanvas() {
    canvas = document.getElementById('signatureCanvas');
    if (!canvas) {
        console.error('Signature canvas not found');
        return;
    }
    
    ctx = canvas.getContext('2d');
    
    const resizeCanvas = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        ctx.strokeStyle = '#1550E8';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', stopDrawing);
    
    console.log('Signature canvas initialized successfully');
}

function startDrawing(e) {
    isDrawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];
}

function draw(e) {
    if (!isDrawing) return;
    
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
    
    [lastX, lastY] = [e.offsetX, e.offsetY];
}

function stopDrawing() {
    isDrawing = false;
}

function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    isDrawing = true;
    [lastX, lastY] = [touch.clientX - rect.left, touch.clientY - rect.top];
}

function handleTouchMove(e) {
    if (!isDrawing) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    
    [lastX, lastY] = [x, y];
}

function openSignatureModal() {
    const modal = document.getElementById('signatureModal');
    if (!modal) {
        console.error('Signature modal not found');
        return;
    }
    
    modal.classList.add('active');
    
    // Re-initialize canvas when modal opens
    if (!canvas) {
        setupSignatureCanvas();
    } else {
        // Resize canvas to ensure proper display
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        ctx.strokeStyle = '#1550E8';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }
    
    console.log('Signature modal opened');
}

function closeSignatureModal() {
    document.getElementById('signatureModal').classList.remove('active');
}

function clearSignature() {
    if (!ctx || !canvas) {
        console.error('Canvas context not available');
        return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    console.log('Signature cleared');
}

function completeSignature() {
    if (!ctx || !canvas) {
        alert('서명 기능 오류가 발생했습니다. 페이지를 새로고침해주세요.');
        return;
    }
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasSignature = imageData.data.some(channel => channel !== 0);
    
    if (!hasSignature) {
        alert('서명을 해주세요.');
        return;
    }
    
    AppState.signatureData = canvas.toDataURL('image/png');
    
    const signatureArea = document.getElementById('clientSignature');
    if (signatureArea) {
        signatureArea.innerHTML = `<img src="${AppState.signatureData}" alt="서명" style="max-width: 100%; max-height: 100%;">`;
        signatureArea.classList.add('signed');
    }
    
    closeSignatureModal();
    
    console.log('Signature completed');
    
    setTimeout(() => {
        updatePaymentDisplay(); // Update payment amounts before showing step 4
        proceedToStep(4);
    }, 500);
}

// ============================================
// Step 4: Payment
// ============================================
function updatePaymentDisplay() {
    const serviceFee = AppState.formData.serviceFee || 70000;
    const expertType = AppState.formData.selectedExpertType || '매수신청대리인';
    
    // Update all payment amount displays
    const paymentAmountElements = document.querySelectorAll('.payment-amount .amount');
    paymentAmountElements.forEach(el => {
        el.textContent = formatNumber(serviceFee) + '원';
    });
    
    // Update summary rows
    const summaryFeeElements = document.querySelectorAll('.summary-row:first-child span:last-child');
    summaryFeeElements.forEach(el => {
        el.textContent = formatNumber(serviceFee) + '원';
    });
    
    const summaryTotalElements = document.querySelectorAll('.summary-row.total span:last-child');
    summaryTotalElements.forEach(el => {
        el.textContent = formatNumber(serviceFee) + '원';
    });
    
    console.log(`Payment display updated: ${expertType} - ${formatNumber(serviceFee)}원`);
}

function handlePayment() {
    const agreePayment = document.getElementById('agreePayment').checked;
    
    if (!agreePayment) {
        alert('결제약관 및 환불 규정에 동의해주세요.');
        return;
    }
    
    const serviceFee = AppState.formData.serviceFee || 70000;
    const expertType = AppState.formData.selectedExpertType || '매수신청대리인';
    
    if (confirm(`${formatNumber(serviceFee)}원을 결제하시겠습니까?\n(${expertType})`)) {
        // Prepare application data
        const applicationData = {
            applicant_name: AppState.formData.bidderName || '',
            phone: AppState.formData.phoneNumber || '',
            email: AppState.formData.email || '',
            region: AppState.caseData.region || '',
            court: AppState.caseData.court || '',
            case_number: AppState.caseData.caseNumber || '',
            property_number: AppState.caseData.propertyNumber || '',
            bid_amount: parseInt(AppState.formData.bidAmount?.replace(/,/g, '') || 0),
            deposit: parseInt(AppState.formData.depositAmount?.replace(/,/g, '') || 0),
            expert_type: expertType,
            service_fee: serviceFee,
            bid_type: AppState.formData.bidType || '개인',
            status: '접수',
            payment_status: '완료',
            signature_data: AppState.signatureData || '',
            bid_date: AppState.caseData.bidDate || ''
        };
        
        // Submit to API
        fetch('tables/applications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(applicationData)
        })
        .then(response => response.json())
        .then(data => {
            console.log('Application submitted:', data);
            alert(`결제가 완료되었습니다!\n\n대리입찰 신청이 성공적으로 완료되었습니다.\n선택하신 ${expertType}이 입찰을 진행합니다.\n입찰 결과는 매각기일 이후 문자로 안내해 드립니다.`);
            
            // Clear saved data after successful payment
            localStorage.removeItem('daerijangTalk_formData');
            AppState.formData = {};
            AppState.caseData = {};
            AppState.signatureData = null;
            
            switchToMainPage();
        })
        .catch(error => {
            console.error('Application submission error:', error);
            alert(`결제가 완료되었습니다!\n\n대리입찰 신청이 성공적으로 완료되었습니다.\n선택하신 ${expertType}이 입찰을 진행합니다.\n입찰 결과는 매각기일 이후 문자로 안내해 드립니다.\n\n(데모 환경에서 실행 중입니다)`);
            
            // Clear saved data
            localStorage.removeItem('daerijangTalk_formData');
            switchToMainPage();
        });
    }
}

// ============================================
// Expert Application
// ============================================
function handleExpertSubmit() {
    const expertName = document.getElementById('expertName').value.trim();
    const licenseNumber = document.getElementById('licenseNumber').value.trim();
    const expertPhone = document.getElementById('expertPhone').value.trim();
    const expertEmail = document.getElementById('expertEmail').value.trim();
    const expertAddress = document.getElementById('expertAddress').value.trim();
    const expertAddressDetail = document.getElementById('expertAddressDetail').value.trim();
    const expertPhoto = document.getElementById('expertPhoto').files[0];
    const licenseFile = document.getElementById('licenseFile').files[0];
    const insuranceFile = document.getElementById('insuranceFile').files[0];
    const expertFee = document.getElementById('expertFee').value.trim();
    const kakaoPhone = document.getElementById('kakaoPhone').value.trim();
    const agreeExpertTerms = document.getElementById('agreeExpertTerms').checked;
    const agreeExpertPrivacy = document.getElementById('agreeExpertPrivacy').checked;
    
    // Check regions
    const selectedRegions = [];
    document.querySelectorAll('.region-checkbox:checked').forEach(cb => {
        selectedRegions.push(cb.value);
    });
    
    // Validation
    if (!expertName) {
        alert('성명을 입력해주세요.');
        return;
    }
    
    if (!licenseNumber) {
        alert('자격증 번호를 입력해주세요.');
        return;
    }
    
    if (!validatePhone(expertPhone)) {
        alert('올바른 연락처를 입력해주세요.');
        return;
    }
    
    if (!expertEmail) {
        alert('이메일을 입력해주세요.');
        return;
    }
    
    if (!expertAddress || !expertAddressDetail) {
        alert('사무소 주소를 입력해주세요.');
        return;
    }
    
    if (selectedRegions.length === 0) {
        alert('활동 가능 지역을 최소 1개 이상 선택해주세요.');
        return;
    }
    
    if (!licenseFile) {
        alert('자격증 사본을 업로드해주세요.');
        return;
    }
    
    if (!insuranceFile) {
        alert('배상책임보험증권을 업로드해주세요.');
        return;
    }
    
    if (!expertFee) {
        alert('희망 수수료를 입력해주세요.');
        return;
    }
    
    if (!validatePhone(kakaoPhone)) {
        alert('올바른 카카오톡 알림 수신 번호를 입력해주세요.');
        return;
    }
    
    if (!agreeExpertTerms || !agreeExpertPrivacy) {
        alert('필수 약관에 동의해주세요.');
        return;
    }
    
    // Get expert type
    const expertType = document.querySelector('input[name="expertType"]:checked')?.value || '매수신청대리인';
    const expertIntro = document.getElementById('expertIntro')?.value.trim() || '';
    
    // Save to database
    const expertData = {
        expert_type: expertType,
        name: expertName,
        license_number: licenseNumber,
        phone: expertPhone,
        email: expertEmail,
        address: expertAddress,
        address_detail: expertAddressDetail,
        active_regions: JSON.stringify(selectedRegions),
        service_fee: parseInt(expertFee),
        kakao_phone: kakaoPhone,
        introduction: expertIntro,
        status: '대기',
        rating: 0,
        success_count: 0
    };
    
    // Submit to API
    fetch('tables/experts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expertData)
    })
    .then(response => response.json())
    .then(data => {
        console.log('Expert application submitted:', data);
        alert('전문가 신청이 완료되었습니다!\n\n관리자 승인 후 활동 가능합니다.\n승인 결과는 이메일로 안내해 드립니다.');
        
        // Clear form
        document.getElementById('expertName').value = '';
        document.getElementById('licenseNumber').value = '';
        document.getElementById('expertPhone').value = '';
        document.getElementById('expertEmail').value = '';
        document.getElementById('expertAddress').value = '';
        document.getElementById('expertAddressDetail').value = '';
        document.getElementById('expertFee').value = '';
        document.getElementById('kakaoPhone').value = '';
        document.getElementById('expertIntro').value = '';
        document.querySelectorAll('.region-checkbox:checked').forEach(cb => cb.checked = false);
        document.getElementById('agreeExpertTerms').checked = false;
        document.getElementById('agreeExpertPrivacy').checked = false;
        
        switchToMainPage();
    })
    .catch(error => {
        console.error('Expert submission error:', error);
        alert('전문가 신청이 완료되었습니다!\n\n관리자 승인 후 활동 가능합니다.\n승인 결과는 이메일로 안내해 드립니다.\n\n(데모 환경에서 실행 중입니다)');
        switchToMainPage();
    });
}

// ============================================
// FAQ Accordion
// ============================================
function setupFAQ() {
    const faqQuestions = document.querySelectorAll('.faq-question');
    
    faqQuestions.forEach(question => {
        question.addEventListener('click', function() {
            const faqItem = this.parentElement;
            const isActive = faqItem.classList.contains('active');
            
            document.querySelectorAll('.faq-item').forEach(item => {
                item.classList.remove('active');
            });
            
            if (!isActive) {
                faqItem.classList.add('active');
            }
        });
    });
}