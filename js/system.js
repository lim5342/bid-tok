// ============================================
// 대리입찰 톡 - 핵심 운영 시스템 v1
// 매칭 / 정산 / 진행상황 / 취소정책
// ============================================

// ============================================
// 상태 정의
// ============================================
const STATUS = {
    PAID:        { code: 'paid',        label: '결제완료',   color: '#6B7280', step: 1 },
    MATCHING:    { code: 'matching',    label: '매칭중',     color: '#F59E0B', step: 2 },
    MATCHED:     { code: 'matched',     label: '매칭완료',   color: '#3B82F6', step: 3 },
    IN_PROGRESS: { code: 'in_progress', label: '진행중',     color: '#8B5CF6', step: 4 },
    DONE:        { code: 'done',        label: '완료',       color: '#10B981', step: 5 },
    CANCELLED:   { code: 'cancelled',   label: '취소',       color: '#EF4444', step: 0 },
    REMATCH:     { code: 'rematch',     label: '재매칭중',   color: '#F97316', step: 2 },
};

const STEP_LABELS = [
    { icon: '💳', label: '결제완료' },
    { icon: '🔍', label: '매칭중' },
    { icon: '🤝', label: '매칭완료' },
    { icon: '⚖️', label: '입찰진행중' },
    { icon: '✅', label: '완료' },
];

// ============================================
// 데이터 관리 (localStorage)
// ============================================
function getApplications() {
    try { return JSON.parse(localStorage.getItem('bidtok_applications') || '[]'); } catch(e) { return []; }
}
function saveApplications(apps) {
    localStorage.setItem('bidtok_applications', JSON.stringify(apps));
}
function getApplication(id) {
    return getApplications().find(a => a.id === id) || null;
}
function updateApplication(id, updates) {
    const apps = getApplications();
    const idx = apps.findIndex(a => a.id === id);
    if (idx >= 0) {
        apps[idx] = { ...apps[idx], ...updates, updatedAt: new Date().toISOString() };
        saveApplications(apps);
        return apps[idx];
    }
    return null;
}

// ============================================
// 신청서 생성 (결제 완료 시)
// ============================================
function createApplication(formData, caseData, expertType, fee) {
    const apps = getApplications();
    const id = 'APP' + Date.now();
    const now = new Date().toISOString();

    // 가용 전문가 목록 (실제로는 DB에서 가져옴)
    const availableExperts = getAvailableExperts(caseData.region);

    const app = {
        id,
        createdAt: now,
        updatedAt: now,
        status: STATUS.MATCHING.code,
        // 소비자 정보
        consumer: {
            name: formData.bidderName,
            phone: formData.phoneNumber,
            ssn: `${formData.ssnFront}-${formData.ssnBack}`,
            address: `${formData.addressRoad} ${formData.addressDetail}`,
            bank: formData.bankName,
            account: formData.accountNumber,
        },
        // 사건 정보
        case: {
            region: caseData.region,
            court: caseData.court,
            caseNumber: caseData.caseNumber,
            propertyNumber: caseData.propertyNumber || '1',
            auctionDate: caseData.auctionDate,
            minBid: caseData.minBid,
            bidAmount: formData.bidAmount,
            depositAmount: formData.depositAmount,
            bidType: formData.bidType || '개인',
        },
        // 전문가 정보
        expertType,
        fee,
        assignedExperts: [],     // 매칭된 전문가 ID 목록
        rejectedExperts: [],     // 거절한 전문가 ID 목록
        currentExpert: null,     // 현재 매칭된 전문가
        // 진행 이력
        timeline: [
            { time: now, status: STATUS.PAID.code, label: '결제가 완료되었습니다', icon: '💳' },
            { time: now, status: STATUS.MATCHING.code, label: '전문가 매칭을 시작합니다', icon: '🔍' },
        ],
        // 정산
        payment: {
            amount: fee,
            paidAt: now,
            expertPaidAt: null,
            status: 'held', // held → released → done
        },
        // 서명
        signatureData: formData.signatureData || null,
    };

    apps.push(app);
    saveApplications(apps);

    // 전문가 매칭 시뮬레이션 (실제는 카톡 API 호출)
    simulateExpertMatching(id, expertType, caseData.region);

    return app;
}

// ============================================
// 전문가 매칭 시뮬레이션
// ============================================
function getAvailableExperts(region) {
    // 실제로는 DB에서 해당 지역 활성 전문가 조회
    return [
        { id: 'EXP001', name: '김법무', type: '매수신청대리인', phone: '010-1234-5678', regions: ['서울','경기','인천'] },
        { id: 'EXP002', name: '이법사', type: '법무사', phone: '010-9876-5432', regions: ['서울 전체'] },
        { id: 'EXP003', name: '박대리', type: '매수신청대리인', phone: '010-5555-1234', regions: ['부산','경남','울산'] },
    ];
}

function simulateExpertMatching(appId, expertType, region) {
    // 실제 서비스에서는 카카오 알림톡 API 호출
    console.log(`[매칭] 신청 ${appId} - ${expertType} 전문가에게 알림 발송`);
    // 데모: 3초 후 매칭 대기 상태로 변경
    setTimeout(() => {
        const app = getApplication(appId);
        if (app && app.status === STATUS.MATCHING.code) {
            console.log(`[매칭] ${appId} 전문가 응답 대기 중...`);
        }
    }, 3000);
}

// ============================================
// 전문가 수락/거절
// ============================================
function expertAccept(appId, expertId) {
    const app = getApplication(appId);
    if (!app) return { success: false, msg: '신청을 찾을 수 없습니다.' };

    const experts = getAvailableExperts();
    const expert = experts.find(e => e.id === expertId);
    if (!expert) return { success: false, msg: '전문가 정보 오류' };

    const now = new Date().toISOString();
    const timeline = [...(app.timeline || []),
        { time: now, status: STATUS.MATCHED.code, label: `전문가 ${expert.name}님이 수락하였습니다`, icon: '🤝' }
    ];

    updateApplication(appId, {
        status: STATUS.MATCHED.code,
        currentExpert: expert,
        timeline,
        'payment.status': 'held',
    });

    // 소비자에게 알림 (실제: 카톡)
    console.log(`[알림] 소비자에게 매칭완료 알림 - 전문가: ${expert.name} ${expert.phone}`);
    return { success: true, expert };
}

function expertReject(appId, expertId) {
    const app = getApplication(appId);
    if (!app) return { success: false };

    const rejected = [...(app.rejectedExperts || []), expertId];
    const available = getAvailableExperts(app.case?.region).filter(
        e => !rejected.includes(e.id) && e.type === app.expertType
    );

    const now = new Date().toISOString();
    const timeline = [...(app.timeline || []),
        { time: now, status: STATUS.REMATCH.code, label: '전문가가 거절하여 재매칭을 시작합니다', icon: '🔄' }
    ];

    if (available.length === 0) {
        // 모든 전문가 거절 → 고객센터 연결
        updateApplication(appId, {
            status: 'no_expert',
            rejectedExperts: rejected,
            timeline: [...timeline, {
                time: now, status: 'no_expert',
                label: '가용 전문가가 없습니다. 고객센터로 연결됩니다.', icon: '📞'
            }]
        });
        return { success: false, noExpert: true };
    }

    updateApplication(appId, {
        status: STATUS.REMATCH.code,
        rejectedExperts: rejected,
        timeline,
    });
    return { success: true, rematch: true };
}

// ============================================
// 전문가 진행완료 처리
// ============================================
function expertComplete(appId) {
    const app = getApplication(appId);
    if (!app) return false;

    const now = new Date().toISOString();
    const timeline = [...(app.timeline || []),
        { time: now, status: STATUS.DONE.code, label: '전문가가 입찰을 완료하였습니다', icon: '✅' },
        { time: now, status: 'payment_released', label: '수수료 정산이 진행됩니다', icon: '💰' }
    ];

    updateApplication(appId, {
        status: STATUS.DONE.code,
        timeline,
        payment: { ...app.payment, status: 'release_pending', completedAt: now }
    });

    console.log(`[정산] ${appId} 정산 대기 → 관리자 승인 후 전문가 송금`);
    return true;
}

// ============================================
// 취소 정책 체크
// ============================================
function checkCancelPolicy(app) {
    const now = new Date();
    const createdAt = new Date(app.createdAt);
    const auctionDate = app.case?.auctionDate ? new Date(app.case.auctionDate) : null;

    // 진행중 취소 불가
    if (app.status === STATUS.IN_PROGRESS.code) {
        return { canCancel: false, reason: '진행 중인 신청은 취소할 수 없습니다. 전문가와 합의 후 고객센터로 연락해주세요.' };
    }
    // 완료 취소 불가
    if (app.status === STATUS.DONE.code) {
        return { canCancel: false, reason: '완료된 신청은 취소할 수 없습니다.' };
    }
    // 당일 취소 불가
    const diffHours = (now - createdAt) / (1000 * 60 * 60);
    if (diffHours < 24) {
        return { canCancel: false, reason: '당일 취소는 불가합니다. (펜션 예약과 동일 정책)\n영업일 기준 2일 전까지만 취소 가능합니다.' };
    }
    // 영업일 2일 전 체크
    if (auctionDate) {
        const diffDays = (auctionDate - now) / (1000 * 60 * 60 * 24);
        if (diffDays < 2) {
            return { canCancel: false, reason: '입찰기일 영업일 2일 전 이후에는 취소할 수 없습니다.\n전문가와 합의 후 고객센터로 연락해주세요.' };
        }
    }

    return { canCancel: true, reason: '전문가와의 합의가 완료된 경우에만 취소가 가능합니다.' };
}

// ============================================
// 진행상황 타임라인 UI 렌더링
// ============================================
function renderTimeline(app, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !app) return;

    const currentStep = STATUS[app.status.toUpperCase()]?.step || 1;

    const stepsHTML = STEP_LABELS.map((step, idx) => {
        const stepNum = idx + 1;
        const isDone = stepNum < currentStep;
        const isCurrent = stepNum === currentStep;
        const color = isDone ? '#10B981' : isCurrent ? '#1550E8' : '#E5E7EB';
        const textColor = isDone || isCurrent ? '#1A1A2E' : '#9CA3AF';

        return `
        <div style="display:flex;flex-direction:column;align-items:center;flex:1;position:relative;">
            ${idx < STEP_LABELS.length - 1 ? `
            <div style="position:absolute;top:20px;left:50%;right:-50%;height:2px;background:${isDone ? '#10B981' : '#E5E7EB'};z-index:0;"></div>` : ''}
            <div style="width:40px;height:40px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:${isDone ? '16px' : '14px'};color:white;position:relative;z-index:1;box-shadow:0 2px 8px rgba(0,0,0,0.1);transition:all 0.3s;">
                ${isDone ? '✓' : isCurrent ? step.icon : `${stepNum}`}
            </div>
            <div style="margin-top:8px;font-size:0.75rem;font-weight:${isCurrent ? '700' : '500'};color:${textColor};text-align:center;white-space:nowrap;">${step.label}</div>
            ${isCurrent ? `<div style="margin-top:4px;font-size:0.65rem;color:#1550E8;font-weight:600;background:#EEF3FF;padding:2px 8px;border-radius:100px;">현재</div>` : ''}
        </div>`;
    }).join('');

    const timelineHTML = (app.timeline || []).map(t => `
        <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #F3F4F6;">
            <div style="font-size:1.2rem;width:28px;flex-shrink:0;">${t.icon || '•'}</div>
            <div style="flex:1;">
                <div style="font-size:0.875rem;font-weight:600;color:#1A1A2E;">${t.label}</div>
                <div style="font-size:0.75rem;color:#9CA3AF;margin-top:2px;">${formatDateKR(t.time)}</div>
            </div>
        </div>
    `).reverse().join('');

    const statusInfo = STATUS[app.status.toUpperCase()] || STATUS.MATCHING;

    container.innerHTML = `
        <!-- 진행 상태 헤더 -->
        <div style="background:white;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <div>
                    <div style="font-size:0.75rem;color:#9CA3AF;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">신청번호</div>
                    <div style="font-size:1rem;font-weight:700;color:#1A1A2E;">${app.id}</div>
                </div>
                <div style="padding:6px 16px;border-radius:100px;background:${statusInfo.color}20;color:${statusInfo.color};font-size:0.85rem;font-weight:700;border:1px solid ${statusInfo.color}40;">
                    ${statusInfo.label}
                </div>
            </div>
            <!-- 스텝 진행바 -->
            <div style="display:flex;align-items:flex-start;padding:0 10px;">
                ${stepsHTML}
            </div>
        </div>

        <!-- 사건 정보 -->
        <div style="background:white;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin-bottom:16px;">
            <div style="font-size:0.875rem;font-weight:700;color:#1550E8;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;">📋 사건 정보</div>
            ${[
                ['법원', app.case?.court],
                ['사건번호', app.case?.caseNumber],
                ['입찰기일', app.case?.auctionDate],
                ['입찰가', app.case?.bidAmount ? formatAmount(parseInt(app.case.bidAmount.replace(/,/g,''))) + '원' : '-'],
                ['유형', app.expertType === '매수신청대리인' ? '매수신청대리인 (6만원)' : '법무사 (10만원)'],
            ].map(([label, val]) => `
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F9FAFB;font-size:0.875rem;">
                    <span style="color:#6B7280;">${label}</span>
                    <span style="font-weight:600;color:#1A1A2E;">${val || '-'}</span>
                </div>
            `).join('')}
        </div>

        <!-- 전문가 정보 (매칭완료 후만 공개) -->
        ${app.status === STATUS.MATCHED.code || app.status === STATUS.IN_PROGRESS.code || app.status === STATUS.DONE.code ? `
        <div style="background:#EEF3FF;border:1px solid rgba(21,80,232,0.2);border-radius:12px;padding:20px;margin-bottom:16px;">
            <div style="font-size:0.875rem;font-weight:700;color:#1550E8;margin-bottom:12px;">🤝 매칭된 전문가</div>
            <div style="font-size:1rem;font-weight:800;color:#1A1A2E;margin-bottom:4px;">${app.currentExpert?.name || '-'} (${app.currentExpert?.type || '-'})</div>
            <a href="tel:${app.currentExpert?.phone}" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#1550E8;color:white;border-radius:8px;font-size:0.9rem;font-weight:700;text-decoration:none;margin-top:8px;">
                📞 ${app.currentExpert?.phone || '-'} 전화하기
            </a>
        </div>` : `
        <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:16px;margin-bottom:16px;font-size:0.875rem;color:#92400E;">
            🔒 전문가 연락처는 매칭 완료 후 공개됩니다
        </div>`}

        <!-- 진행 이력 -->
        <div style="background:white;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin-bottom:16px;">
            <div style="font-size:0.875rem;font-weight:700;color:#1A1A2E;margin-bottom:12px;">📦 진행 이력</div>
            ${timelineHTML || '<div style="text-align:center;padding:20px;color:#9CA3AF;font-size:0.875rem;">진행 이력이 없습니다</div>'}
        </div>

        <!-- 취소 버튼 -->
        ${canShowCancelBtn(app) ? `
        <button onclick="requestCancel('${app.id}')" style="width:100%;padding:12px;background:white;color:#EF4444;border:1.5px solid #EF4444;border-radius:8px;font-size:0.875rem;font-weight:600;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">
            취소 요청 (전문가 합의 필요)
        </button>
        <div style="margin-top:8px;font-size:0.75rem;color:#9CA3AF;text-align:center;">
            ⚠️ 당일 취소 불가 · 영업일 2일 전까지만 가능 · 전문가 합의 필수
        </div>` : ''}
    `;
}

function canShowCancelBtn(app) {
    return ![STATUS.DONE.code, STATUS.CANCELLED.code, STATUS.IN_PROGRESS.code].includes(app.status);
}

function requestCancel(appId) {
    const app = getApplication(appId);
    if (!app) return;

    const policy = checkCancelPolicy(app);
    if (!policy.canCancel) {
        alert('❌ 취소 불가\n\n' + policy.reason);
        return;
    }

    const confirm1 = confirm(
        '취소 요청을 하시겠습니까?\n\n' +
        '⚠️ 취소 정책 안내\n' +
        '• 당일 취소 불가 (펜션 예약과 동일)\n' +
        '• 영업일 2일 전까지만 가능\n' +
        '• 전문가와의 합의가 필수입니다\n' +
        '• 플랫폼(대리입찰 톡)은 책임지지 않습니다\n\n' +
        '취소 요청 후 고객센터(02-853-5875)로 연락주세요.'
    );

    if (confirm1) {
        const now = new Date().toISOString();
        updateApplication(appId, {
            status: 'cancel_requested',
            timeline: [...(app.timeline || []),
                { time: now, status: 'cancel_requested', label: '취소 요청이 접수되었습니다. 고객센터 확인 후 처리됩니다.', icon: '🚫' }
            ]
        });
        alert('취소 요청이 접수되었습니다.\n고객센터(02-853-5875)로 연락주세요.\n영업시간: 평일 09:00~18:00');
    }
}

// ============================================
// 마이페이지 신청 목록 렌더링
// ============================================
function renderMyApplications(consumerId) {
    const apps = getApplications().filter(a =>
        a.consumer?.phone === consumerId || a.consumer?.name === consumerId
    );
    return apps;
}

// ============================================
// 관리자 정산 처리
// ============================================
function adminReleasePayment(appId) {
    const app = getApplication(appId);
    if (!app) return false;

    const now = new Date().toISOString();
    updateApplication(appId, {
        payment: { ...app.payment, status: 'released', paidAt: now }
    });
    console.log(`[정산완료] ${appId} → 전문가 ${app.currentExpert?.name} 송금 처리`);
    return true;
}

// ============================================
// 유틸
// ============================================
function formatDateKR(isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatAmount(num) {
    if (!num) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

console.log('[시스템] 대리입찰 톡 운영 시스템 v1 로드 완료');
