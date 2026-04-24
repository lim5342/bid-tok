// ============================================
// Admin Page - Enhanced v2
// ============================================

let adminApplications = [];
let adminExperts = [];

function initAdminPage() {
    loadApplicationsFromStorage();
    loadExpertsFromStorage();
    renderApplicationsTable();
    renderExpertsTable();
    renderApprovedExpertsTable();
    updateAdminStats();
    addSettlementTab();
}

// ============================================
// Load Data
// ============================================
function loadApplicationsFromStorage() {
    // Try API first, fall back to demo data
    adminApplications = getDemoApplications();
}

function loadExpertsFromStorage() {
    adminExperts = getDemoExperts();
}

function getDemoApplications() {
    return [
        {
            id: 1,
            created_at: '2026-04-24 10:30',
            applicant_name: '홍길동',
            phone: '010-1234-5678',
            case_number: '2025타경103123',
            court: '서울중앙지방법원',
            bid_amount: 280000000,
            expert_type: '법무사',
            bid_type: '개인',
            status: '접수',
            payment_status: '완료'
        },
        {
            id: 2,
            created_at: '2026-04-24 11:15',
            applicant_name: '김영희',
            phone: '010-9876-5432',
            case_number: '2025타경88421',
            court: '수원지방법원',
            bid_amount: 450000000,
            expert_type: '매수신청대리인',
            bid_type: '개인',
            status: '매칭중',
            payment_status: '완료'
        },
        {
            id: 3,
            created_at: '2026-04-23 14:22',
            applicant_name: '박민준',
            phone: '010-5555-1234',
            case_number: '2025타경20091',
            court: '인천지방법원',
            bid_amount: 185000000,
            expert_type: '법무사',
            bid_type: '공동',
            status: '진행중',
            payment_status: '완료'
        },
        {
            id: 4,
            created_at: '2026-04-23 09:45',
            applicant_name: '이수진',
            phone: '010-3333-7777',
            case_number: '2025타경55902',
            court: '부산지방법원',
            bid_amount: 320000000,
            expert_type: '매수신청대리인',
            bid_type: '개인',
            status: '완료(낙찰)',
            payment_status: '완료'
        },
        {
            id: 5,
            created_at: '2026-04-22 16:10',
            applicant_name: '최재원',
            phone: '010-7777-2222',
            case_number: '2025타경71234',
            court: '대구지방법원',
            bid_amount: 210000000,
            expert_type: '법무사',
            bid_type: '법인',
            status: '완료(패찰)',
            payment_status: '완료'
        }
    ];
}

function getDemoExperts() {
    return [
        {
            id: 1,
            created_at: '2026-04-24 09:15',
            name: '김법무',
            expert_type: '매수신청대리인',
            license_number: '제2024-001호',
            phone: '010-9876-5432',
            active_regions: '["서울", "경기", "인천"]',
            service_fee: 70000,
            status: '대기',
            rating: 0,
            success_count: 0
        },
        {
            id: 2,
            created_at: '2026-04-23 14:30',
            name: '이법사',
            expert_type: '법무사',
            license_number: '제2023-055호',
            phone: '010-1111-2222',
            active_regions: '["서울 전체"]',
            service_fee: 100000,
            status: '활동중',
            rating: 4.8,
            success_count: 127
        },
        {
            id: 3,
            created_at: '2026-04-22 11:00',
            name: '박대리',
            expert_type: '매수신청대리인',
            license_number: '제2022-189호',
            phone: '010-4444-5555',
            active_regions: '["부산", "경남", "울산"]',
            service_fee: 70000,
            status: '활동중',
            rating: 4.6,
            success_count: 89
        }
    ];
}

// ============================================
// Update Stats
// ============================================
function updateAdminStats() {
    const statsHtml = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:2rem;">
            <div style="background:white;border-radius:12px;padding:1.5rem;border:1px solid #E5E7EB;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                <div style="font-size:0.75rem;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">전체 신청</div>
                <div style="font-size:2rem;font-weight:800;color:#1550E8;">${adminApplications.length}</div>
                <div style="font-size:0.75rem;color:#10B981;margin-top:4px;">▲ 오늘 2건 접수</div>
            </div>
            <div style="background:white;border-radius:12px;padding:1.5rem;border:1px solid #E5E7EB;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                <div style="font-size:0.75rem;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">처리 대기</div>
                <div style="font-size:2rem;font-weight:800;color:#F59E0B;">${adminApplications.filter(a => a.status === '접수').length}</div>
                <div style="font-size:0.75rem;color:#F59E0B;margin-top:4px;">즉시 처리 필요</div>
            </div>
            <div style="background:white;border-radius:12px;padding:1.5rem;border:1px solid #E5E7EB;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                <div style="font-size:0.75rem;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">전문가 승인대기</div>
                <div style="font-size:2rem;font-weight:800;color:#EF4444;">${adminExperts.filter(e => e.status === '대기').length}</div>
                <div style="font-size:0.75rem;color:#EF4444;margin-top:4px;">서류 확인 필요</div>
            </div>
            <div style="background:white;border-radius:12px;padding:1.5rem;border:1px solid #E5E7EB;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                <div style="font-size:0.75rem;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">활동 전문가</div>
                <div style="font-size:2rem;font-weight:800;color:#10B981;">${adminExperts.filter(e => e.status === '활동중').length}</div>
                <div style="font-size:0.75rem;color:#10B981;margin-top:4px;">전국 커버리지</div>
            </div>
        </div>
    `;

    // 통계 박스를 첫 번째 admin-section 앞에 삽입
    const applicationsTab = document.getElementById('applicationsTab');
    if (applicationsTab) {
        const existing = applicationsTab.querySelector('.admin-stats-grid');
        if (!existing) {
            const statsDiv = document.createElement('div');
            statsDiv.className = 'admin-stats-grid';
            statsDiv.innerHTML = statsHtml;
            applicationsTab.insertBefore(statsDiv, applicationsTab.firstChild);
        }
    }
}

// ============================================
// Render Tables
// ============================================
function renderApplicationsTable() {
    const tbody = document.getElementById('applicationsTableBody');
    if (!tbody) return;

    const statusMap = {
        '접수': 'status-pending',
        '매칭중': 'status-matching',
        '진행중': 'status-matching',
        '완료(낙찰)': 'status-success',
        '완료(패찰)': 'status-failed',
        '취소': 'status-cancelled'
    };

    tbody.innerHTML = adminApplications.map(app => `
        <tr>
            <td style="color:#6B7280;font-size:0.8rem;">${app.created_at}</td>
            <td><strong>${app.applicant_name}</strong></td>
            <td>${app.phone}</td>
            <td style="font-family:monospace;font-size:0.85rem;">${app.case_number}</td>
            <td>${app.court}</td>
            <td style="font-weight:700;color:#1550E8;">${formatAmount(app.bid_amount)}원</td>
            <td><span class="status-badge ${statusMap[app.status] || 'status-pending'}">${app.status}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="showApplicationDetail(${app.id})" style="margin-right:4px;">상세</button>
                <button class="btn btn-sm" onclick="updateApplicationStatus(${app.id})" style="background:#F1F5F9;color:#475569;border:1px solid #E2E8F0;">상태변경</button>
            </td>
        </tr>
    `).join('');
}

function renderExpertsTable() {
    const tbody = document.getElementById('expertsTableBody');
    if (!tbody) return;

    const pending = adminExperts.filter(e => e.status === '대기');

    if (pending.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#9CA3AF;">승인 대기 중인 전문가가 없습니다</td></tr>';
        return;
    }

    tbody.innerHTML = pending.map(exp => {
        let regions = [];
        try { regions = JSON.parse(exp.active_regions); } catch(e) { regions = [exp.active_regions]; }
        return `
        <tr>
            <td style="color:#6B7280;font-size:0.8rem;">${exp.created_at}</td>
            <td><strong>${exp.name}</strong></td>
            <td><span class="status-badge ${exp.expert_type === '법무사' ? 'status-matching' : 'status-pending'}">${exp.expert_type}</span></td>
            <td style="font-size:0.85rem;">${exp.license_number}</td>
            <td>${exp.phone}</td>
            <td style="font-size:0.85rem;">${regions.join(', ')}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="viewExpertDoc(${exp.id})" style="margin-right:4px;">서류확인</button>
            </td>
            <td><span class="status-badge status-pending">승인대기</span></td>
            <td>
                <button class="btn btn-sm btn-success" onclick="approveExpert(${exp.id})" style="margin-right:4px;">승인</button>
                <button class="btn btn-sm btn-danger" onclick="rejectExpert(${exp.id})">거절</button>
            </td>
        </tr>
    `;}).join('');
}

function renderApprovedExpertsTable() {
    const tbody = document.querySelector('#expertsTab .admin-section:last-child tbody');
    if (!tbody) return;

    const approved = adminExperts.filter(e => e.status === '활동중');

    if (approved.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#9CA3AF;">활동 중인 전문가가 없습니다</td></tr>';
        return;
    }

    tbody.innerHTML = approved.map(exp => {
        let regions = [];
        try { regions = JSON.parse(exp.active_regions); } catch(e) { regions = [exp.active_regions]; }
        return `
        <tr>
            <td><strong>${exp.name}</strong></td>
            <td><span class="status-badge ${exp.expert_type === '법무사' ? 'status-matching' : 'status-pending'}">${exp.expert_type}</span></td>
            <td style="font-size:0.85rem;">${exp.license_number}</td>
            <td>${exp.phone}</td>
            <td style="font-size:0.85rem;">${regions.join(', ')}</td>
            
            <td><span class="status-badge status-approved">활동중</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewExpertDetail(${exp.id})" style="margin-right:4px;">상세</button>
                <button class="btn btn-sm btn-danger" onclick="suspendExpert(${exp.id})">정지</button>
            </td>
        </tr>
    `;}).join('');
}

// ============================================
// Actions
// ============================================
function showApplicationDetail(id) {
    const app = adminApplications.find(a => a.id === id);
    if (!app) return;

    const detail = `
신청인: ${app.applicant_name}
연락처: ${app.phone}
사건번호: ${app.case_number}
관할법원: ${app.court}
입찰가: ${formatAmount(app.bid_amount)}원
대리인유형: ${app.expert_type}
입찰유형: ${app.bid_type}
현재상태: ${app.status}
결제: ${app.payment_status}
신청일시: ${app.created_at}`;

    alert('📋 신청 상세 정보\n' + detail);
}

function updateApplicationStatus(id) {
    const statuses = ['접수', '매칭중', '진행중', '완료(낙찰)', '완료(패찰)', '취소'];
    const app = adminApplications.find(a => a.id === id);
    if (!app) return;

    const statusStr = statuses.map((s, i) => `${i+1}. ${s}`).join('\n');
    const choice = prompt(`현재 상태: ${app.status}\n\n변경할 상태를 선택하세요:\n${statusStr}\n\n번호를 입력하세요:`);
    
    const idx = parseInt(choice) - 1;
    if (idx >= 0 && idx < statuses.length) {
        app.status = statuses[idx];
        renderApplicationsTable();
        alert(`✅ 상태가 "${statuses[idx]}"으로 변경되었습니다.`);
    }
}

function approveExpert(id) {
    if (!confirm('이 전문가를 승인하시겠습니까?')) return;
    const exp = adminExperts.find(e => e.id === id);
    if (exp) {
        exp.status = '활동중';
        renderExpertsTable();
        renderApprovedExpertsTable();
        alert('✅ 전문가가 승인되었습니다.\n카카오톡 알림이 발송됩니다.');
    }
}

function rejectExpert(id) {
    const reason = prompt('거절 사유를 입력하세요:');
    if (reason === null) return;
    const exp = adminExperts.find(e => e.id === id);
    if (exp) {
        exp.status = '거절';
        renderExpertsTable();
        alert('❌ 전문가 신청이 거절되었습니다.');
    }
}

function suspendExpert(id) {
    if (!confirm('이 전문가를 정지하시겠습니까?')) return;
    const exp = adminExperts.find(e => e.id === id);
    if (exp) {
        exp.status = '정지';
        renderApprovedExpertsTable();
        alert('⏸ 전문가 활동이 정지되었습니다.');
    }
}

function viewExpertDoc(id) {
    alert('📄 서류 확인 기능\n\n실제 운영 시 업로드된 서류 파일을 여기서 확인할 수 있습니다.\n- 자격증 사본\n- 배상책임보험증권\n- 사업자등록증 (선택)');
}

function viewExpertDetail(id) {
    const exp = adminExperts.find(e => e.id === id);
    if (!exp) return;
    let regions = [];
    try { regions = JSON.parse(exp.active_regions); } catch(e) { regions = [exp.active_regions]; }
    alert(`👔 전문가 상세\n\n이름: ${exp.name}\n구분: ${exp.expert_type}\n자격번호: ${exp.license_number}\n연락처: ${exp.phone}\n활동지역: ${regions.join(', ')}\n수수료: ${formatAmount(exp.service_fee)}원\n평점: ⭐ ${exp.rating}\n완료건수: ${exp.success_count}건`);
}

// ============================================
// Excel Export
// ============================================
function exportApplicationsToExcel() {
    const headers = ['신청일시', '신청자', '연락처', '사건번호', '관할법원', '입찰가', '대리인유형', '상태'];
    const rows = adminApplications.map(app => [
        app.created_at, app.applicant_name, app.phone,
        app.case_number, app.court, app.bid_amount + '원',
        app.expert_type, app.status
    ]);

    let csv = '\uFEFF' + headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `대리입찰_신청목록_${new Date().toLocaleDateString('ko-KR').replace(/\./g, '').replace(/ /g, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportExpertsToExcel() {
    const headers = ['신청일시', '성명', '구분', '자격번호', '연락처', '활동지역', '수수료', '상태'];
    const rows = adminExperts.map(exp => {
        let regions = [];
        try { regions = JSON.parse(exp.active_regions); } catch(e) { regions = [exp.active_regions]; }
        return [exp.created_at, exp.name, exp.expert_type, exp.license_number, exp.phone, regions.join('|'), exp.service_fee + '원', exp.status];
    });

    let csv = '\uFEFF' + headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `전문가목록_${new Date().toLocaleDateString('ko-KR').replace(/\./g, '').replace(/ /g, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// Utils
// ============================================
function formatAmount(num) {
    if (!num) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\\d))/g, ',');
}


// ============================================
// 회원 목록 (관리자 전용)
// ============================================
function renderUsersTab() {
    const users = typeof getAdminUserList === 'function' ? getAdminUserList() : [];
    const container = document.getElementById('usersTabContent');
    if (!container) return;

    if (users.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#9CA3AF;">가입된 회원이 없습니다</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-container">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>아이디</th>
                        <th>이름</th>
                        <th>연락처</th>
                        <th>가입일</th>
                        <th>상태</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => `
                    <tr>
                        <td><strong>${u.id}</strong></td>
                        <td>${u.name}</td>
                        <td>${u.phone}</td>
                        <td>${u.joinDate || '-'}</td>
                        <td><span class="status-badge status-approved">정상</span></td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>
        <div style="margin-top:12px;font-size:0.85rem;color:#6B7280;">총 ${users.length}명의 회원</div>
    `;
}

// 관리자 탭에 회원관리 추가
function initAdminPage() {
    loadApplicationsFromStorage();
    loadExpertsFromStorage();
    renderApplicationsTable();
    renderExpertsTable();
    renderApprovedExpertsTable();
    updateAdminStats();
    addSettlementTab();

    // 회원관리 탭 동적 추가
    const tabsEl = document.querySelector('.admin-tabs');
    if (tabsEl && !document.getElementById('tabUsers')) {
        const userTab = document.createElement('button');
        userTab.className = 'admin-tab';
        userTab.id = 'tabUsers';
        userTab.dataset.tab = 'users';
        userTab.textContent = '회원 관리';
        userTab.addEventListener('click', function() {
            switchAdminTab('users');
            renderUsersTab();
        });
        tabsEl.appendChild(userTab);

        // 회원관리 탭 컨텐츠 추가
        const expertTab = document.getElementById('expertsTab');
        if (expertTab && !document.getElementById('usersTab')) {
            const usersTabDiv = document.createElement('div');
            usersTabDiv.className = 'admin-tab-content';
            usersTabDiv.id = 'usersTab';
            usersTabDiv.innerHTML = `
                <div class="admin-section">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                        <h2>회원 목록</h2>
                        <button class="btn btn-success" onclick="exportUsersToExcel()">
                            <i class="fas fa-file-excel"></i> 엑셀 다운로드
                        </button>
                    </div>
                    <div id="usersTabContent">로딩 중...</div>
                </div>
            `;
            expertTab.parentNode.appendChild(usersTabDiv);
        }
    }
}

function exportUsersToExcel() {
    const users = typeof getAdminUserList === 'function' ? getAdminUserList() : [];
    if (users.length === 0) { alert('회원 데이터가 없습니다.'); return; }

    const headers = ['아이디', '이름', '연락처', '가입일'];
    let csv = '\uFEFF' + headers.join(',') + '\n';
    users.forEach(u => {
        csv += [u.id, u.name, u.phone, u.joinDate || '-'].map(v => `"${v}"`).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `회원목록_${new Date().toLocaleDateString('ko-KR').replace(/\./g,'').replace(/ /g,'')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}


// ============================================
// 정산 관리 (관리자)
// ============================================
function renderSettlementTab() {
    const apps = typeof getApplications === 'function' ? getApplications() : [];
    const container = document.getElementById('settlementTabContent');
    if (!container) return;

    const settling = apps.filter(a => a.payment?.status === 'release_pending' || a.payment?.status === 'released');

    if (settling.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#9CA3AF;"><i class="fas fa-coins" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:12px;"></i>정산 대기 항목이 없습니다</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-container">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>신청번호</th><th>소비자</th><th>전문가</th><th>수수료</th>
                        <th>완료일시</th><th>정산상태</th><th>처리</th>
                    </tr>
                </thead>
                <tbody>
                    ${settling.map(a => `
                    <tr>
                        <td style="font-weight:700;color:#1550E8;">${a.id}</td>
                        <td>${a.consumer?.name || '-'}<br><small style="color:#9CA3AF;">${a.consumer?.phone || ''}</small></td>
                        <td>${a.currentExpert?.name || '미매칭'}<br><small style="color:#9CA3AF;">${a.currentExpert?.phone || ''}</small></td>
                        <td style="font-weight:700;color:#1550E8;">${formatAmount(a.fee)}원</td>
                        <td style="font-size:0.8rem;">${a.payment?.completedAt ? formatDateKR(a.payment.completedAt) : '-'}</td>
                        <td>
                            <span class="status-badge ${a.payment?.status === 'released' ? 'status-approved' : 'status-pending'}">
                                ${a.payment?.status === 'released' ? '✅ 정산완료' : '⏳ 정산대기'}
                            </span>
                        </td>
                        <td>
                            ${a.payment?.status === 'release_pending' ? `
                            <button class="btn btn-sm btn-success" onclick="adminDoRelease('${a.id}')">정산승인</button>
                            ` : '<span style="color:#9CA3AF;font-size:0.8rem;">완료</span>'}
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function adminDoRelease(appId) {
    if (!confirm(`${appId} 건의 수수료를 전문가에게 정산하시겠습니까?`)) return;
    if (typeof adminReleasePayment === 'function') {
        adminReleasePayment(appId);
        renderSettlementTab();
        alert('✅ 정산이 완료되었습니다. 전문가 계좌로 송금해주세요.');
    }
}

function formatDateKR(isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}


function addSettlementTab() {
    const tabsEl = document.querySelector('.admin-tabs');
    if (!tabsEl || document.getElementById('tabSettlement')) return;

    // 정산 탭 버튼
    const settleBtn = document.createElement('button');
    settleBtn.className = 'admin-tab';
    settleBtn.id = 'tabSettlement';
    settleBtn.dataset.tab = 'settlement';
    settleBtn.textContent = '💰 정산 관리';
    settleBtn.addEventListener('click', function() {
        switchAdminTab('settlement');
        renderSettlementTab();
    });
    tabsEl.appendChild(settleBtn);

    // 정산 탭 컨텐츠
    const lastTab = document.querySelector('.admin-tab-content:last-of-type');
    if (lastTab && !document.getElementById('settlementTab')) {
        const div = document.createElement('div');
        div.className = 'admin-tab-content';
        div.id = 'settlementTab';
        div.innerHTML = `
            <div class="admin-section">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                    <h2>정산 관리</h2>
                    <div style="font-size:0.85rem;color:#6B7280;">전문가 진행완료 → 관리자 승인 → 계좌 송금</div>
                </div>
                <div id="settlementTabContent"><div style="text-align:center;padding:40px;color:#9CA3AF;">로딩 중...</div></div>
            </div>
        `;
        lastTab.parentNode.appendChild(div);
    }
}
