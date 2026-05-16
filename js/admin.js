// ============================================
// Admin Dashboard Functions
// Firebase Firestore 기반 (API 모듈 사용)
// ============================================

// ── 헬퍼: Firestore 필드명 정규화 ──────────────────────────────
// API.experts.create() 저장 시 camelCase 사용 → 읽을 때도 camelCase 우선
function ef(expert, camel, snake) {
    return expert[camel] !== undefined ? expert[camel] : expert[snake];
}

// ============================================
// Applications (입찰 신청 관리)
// ============================================

// Load applications data from Firestore
async function loadApplicationsData() {
    const tbody = document.getElementById('applicationsTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">로딩 중...</td></tr>';

    try {
        const result = await API.applications.getAll();
        const apps = (result && result.data) ? result.data : (Array.isArray(result) ? result : []);
        renderApplicationsTable(apps);
    } catch (error) {
        console.error('Error loading applications:', error);
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:red;">데이터 로딩 실패: ' + (error.message || error) + '</td></tr>';
    }
}

// Render applications table
function renderApplicationsTable(applications) {
    const tbody = document.getElementById('applicationsTableBody');
    if (!tbody) return;

    if (!applications || applications.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">신청 내역이 없습니다.</td></tr>';
        return;
    }

    tbody.innerHTML = applications.map(app => `
        <tr>
            <td>${formatDateTime(app.createdAt || app.created_at)}</td>
            <td>${app.applicantName || app.applicant_name || '-'}</td>
            <td>${app.phone || '-'}</td>
            <td>${app.caseNumber || app.case_number || '-'}</td>
            <td>${app.court || '-'}</td>
            <td>${formatNumber(app.bidAmount || app.bid_amount)}원</td>
            <td>${getStatusBadge(app.status)}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewApplicationDetail('${app.id}')">상세보기</button>
            </td>
        </tr>
    `).join('');
}

// ============================================
// Experts (전문가 관리)
// ============================================

// Load experts data from Firestore
async function loadExpertsData() {
    const tbody = document.getElementById('expertsTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">로딩 중...</td></tr>';

    try {
        const result = await API.experts.getAll();
        const experts = (result && result.data) ? result.data : (Array.isArray(result) ? result : []);
        renderExpertsTable(experts);
    } catch (error) {
        console.error('Error loading experts:', error);
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:red;">데이터 로딩 실패: ' + (error.message || error) + '</td></tr>';
    }
}

// Render experts table — 대기 중 항목 표시
function renderExpertsTable(experts) {
    const tbody = document.getElementById('expertsTableBody');
    if (!tbody) return;

    // status === '대기' 필터 (camelCase / snake_case 모두 처리)
    const pendingExperts = experts.filter(e => {
        const s = ef(e, 'status', 'status');
        return s === '대기';
    });

    if (pendingExperts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">승인 대기 중인 전문가가 없습니다.</td></tr>';
        return;
    }

    tbody.innerHTML = pendingExperts.map(expert => {
        const regions = ef(expert, 'activeRegions', 'active_regions');
        const regionsText = Array.isArray(regions)
            ? regions.join(', ')
            : (typeof regions === 'string' ? (regions.startsWith('[') ? JSON.parse(regions) : [regions]).join(', ') : '-');

        const licenseFile   = ef(expert, 'licenseFileName',   'license_file_name')   || '';
        const insuranceFile = ef(expert, 'insuranceFileName', 'insurance_file_name') || '';

        return `
        <tr>
            <td>${formatDateTime(ef(expert, 'createdAt', 'created_at'))}</td>
            <td>${ef(expert, 'name', 'name') || '-'}</td>
            <td>${getExpertTypeBadge(ef(expert, 'expertType', 'expert_type'))}</td>
            <td>${ef(expert, 'licenseNumber', 'license_number') || '-'}</td>
            <td>${ef(expert, 'phone', 'phone') || '-'}</td>
            <td>${regionsText}</td>
            <td>
                ${licenseFile   ? `<small>📄 ${licenseFile}</small><br>` : ''}
                ${insuranceFile ? `<small>🛡️ ${insuranceFile}</small>` : ''}
            </td>
            <td>
                <button class="btn btn-sm btn-success" onclick="approveExpert('${expert.id}')">승인</button>
                <button class="btn btn-sm btn-danger"  onclick="rejectExpert('${expert.id}')">거절</button>
            </td>
        </tr>`;
    }).join('');
}

// ============================================
// 상세보기
// ============================================
async function viewApplicationDetail(appId) {
    try {
        const app = await API.applications.getById(appId);
        if (!app) {
            alert('신청 정보를 불러올 수 없습니다.');
            return;
        }

        let expertInfo = '미배정';
        const assignedId = app.assignedExpertId || app.assigned_expert_id;
        if (assignedId) {
            try {
                const expert = await API.experts.getById(assignedId);
                if (expert) expertInfo = `${expert.name} (${ef(expert, 'expertType', 'expert_type')})`;
            } catch (e) {
                console.error('Expert load failed:', e);
            }
        }

        const detail = `
━━━━━━━━━━━━━━━━━━━━━━
📋 대리입찰 신청 상세 정보
━━━━━━━━━━━━━━━━━━━━━━

📌 신청 정보
• 신청일시: ${formatDateTime(app.createdAt || app.created_at)}
• 신청자: ${app.applicantName || app.applicant_name || '-'}
• 연락처: ${app.phone || '-'}
• 이메일: ${app.email || '-'}

🏛️ 경매 정보
• 관할법원: ${app.court || '-'}
• 사건번호: ${app.caseNumber || app.case_number || '-'}
• 물건번호: ${app.propertyNumber || app.property_number || '-'}
• 입찰기일: ${app.bidDate || app.bid_date || '-'}

💰 입찰 정보
• 입찰가: ${formatNumber(app.bidAmount || app.bid_amount)}원
• 보증금: ${formatNumber(app.deposit)}원
• 입찰유형: ${app.bidType || app.bid_type || '-'}

👨‍⚖️ 전문가 정보
• 선택구분: ${app.expertType || app.expert_type || '-'}
• 수수료: ${formatNumber(app.serviceFee || app.service_fee)}원
• 배정전문가: ${expertInfo}

📊 처리 상태
• 신청상태: ${app.status || '-'}
• 결제상태: ${app.paymentStatus || app.payment_status || '-'}

━━━━━━━━━━━━━━━━━━━━━━
        `.trim();

        alert(detail);

    } catch (error) {
        console.error('Error viewing detail:', error);
        alert('상세 정보를 불러오는 중 오류가 발생했습니다.');
    }
}

// ============================================
// 전문가 승인 / 거절
// ============================================
async function approveExpert(expertId) {
    if (!confirm('이 전문가를 승인하시겠습니까?')) return;

    try {
        await API.experts.update(expertId, {
            status: '승인',
            approvedAt: new Date().toISOString()
        });
        alert('전문가가 승인되었습니다.\n\n실제 운영 시 이메일/카카오톡 알림이 발송됩니다.');
        loadExpertsData();
    } catch (error) {
        console.error('Error approving expert:', error);
        alert('승인 처리 중 오류가 발생했습니다.\n' + (error.message || error));
    }
}

async function rejectExpert(expertId) {
    const reason = prompt('거절 사유를 입력해주세요:');
    if (!reason) return;

    try {
        await API.experts.update(expertId, {
            status: '거절',
            rejectReason: reason
        });
        alert(`전문가 신청이 거절되었습니다.\n\n거절 사유: ${reason}\n\n실제 운영 시 이메일/카카오톡 알림이 발송됩니다.`);
        loadExpertsData();
    } catch (error) {
        console.error('Error rejecting expert:', error);
        alert('거절 처리 중 오류가 발생했습니다.\n' + (error.message || error));
    }
}

// ============================================
// 엑셀 내보내기 (CSV)
// ============================================
function exportApplicationsToExcel() {
    API.applications.getAll()
        .then(result => {
            const data = (result && result.data) ? result.data : (Array.isArray(result) ? result : []);
            if (data.length === 0) {
                alert('다운로드할 데이터가 없습니다.');
                return;
            }

            const headers = ['신청일시','신청자','연락처','이메일','관할법원','사건번호','물건번호','입찰가','보증금','전문가구분','수수료','입찰유형','상태','결제상태','입찰기일'];
            const rows = data.map(app => [
                formatDateTime(app.createdAt || app.created_at),
                app.applicantName   || app.applicant_name   || '',
                app.phone || '',
                app.email || '',
                app.court || '',
                app.caseNumber      || app.case_number      || '',
                app.propertyNumber  || app.property_number  || '',
                app.bidAmount       || app.bid_amount       || '',
                app.deposit || '',
                app.expertType      || app.expert_type      || '',
                app.serviceFee      || app.service_fee      || '',
                app.bidType         || app.bid_type         || '',
                app.status || '',
                app.paymentStatus   || app.payment_status   || '',
                app.bidDate         || app.bid_date         || ''
            ]);

            _downloadCSV(headers, rows, `대리입찰신청_${new Date().toISOString().split('T')[0]}.csv`);
        })
        .catch(error => {
            console.error('Export error:', error);
            alert('엑셀 다운로드 중 오류가 발생했습니다.');
        });
}

function exportExpertsToExcel() {
    API.experts.getAll()
        .then(result => {
            const data = (result && result.data) ? result.data : (Array.isArray(result) ? result : []);
            if (data.length === 0) {
                alert('다운로드할 데이터가 없습니다.');
                return;
            }

            const headers = ['신청일시','이름','전문가구분','자격증번호','연락처','이메일','주소','활동지역','희망수수료','카톡번호','자격증파일','보험파일','상태','승인일시','평점','성공건수'];
            const rows = data.map(expert => {
                const regions = ef(expert, 'activeRegions', 'active_regions');
                const regionsText = Array.isArray(regions)
                    ? regions.join(' ')
                    : (typeof regions === 'string' ? regions : '');

                return [
                    formatDateTime(ef(expert, 'createdAt', 'created_at')),
                    ef(expert, 'name', 'name') || '',
                    ef(expert, 'expertType', 'expert_type') || '',
                    ef(expert, 'licenseNumber', 'license_number') || '',
                    ef(expert, 'phone', 'phone') || '',
                    ef(expert, 'email', 'email') || '',
                    `${ef(expert, 'address', 'address') || ''} ${ef(expert, 'addressDetail', 'address_detail') || ''}`.trim(),
                    regionsText,
                    ef(expert, 'serviceFee', 'service_fee') || '',
                    ef(expert, 'kakaoPhone', 'kakao_phone') || '',
                    ef(expert, 'licenseFileName',   'license_file_name')   || '',
                    ef(expert, 'insuranceFileName', 'insurance_file_name') || '',
                    ef(expert, 'status', 'status') || '',
                    formatDateTime(ef(expert, 'approvedAt', 'approved_at')),
                    ef(expert, 'rating', 'rating') || 0,
                    ef(expert, 'successCount', 'success_count') || 0
                ];
            });

            _downloadCSV(headers, rows, `전문가목록_${new Date().toISOString().split('T')[0]}.csv`);
        })
        .catch(error => {
            console.error('Export error:', error);
            alert('엑셀 다운로드 중 오류가 발생했습니다.');
        });
}

function _downloadCSV(headers, rows, filename) {
    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert('엑셀 파일 다운로드가 완료되었습니다.');
}

// ============================================
// 탭 & 초기화
// ============================================
function setupAdminTabs() {
    const tabButtons  = document.querySelectorAll('.admin-tab');
    const tabContents = document.querySelectorAll('.admin-tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;

            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const tabEl = document.getElementById(targetTab + 'Tab');
            if (tabEl) tabEl.classList.add('active');

            if (targetTab === 'applications') loadApplicationsData();
            else if (targetTab === 'experts')  loadExpertsData();
        });
    });
}

function initAdminPage() {
    setupAdminTabs();
    loadApplicationsData();
    loadExpertsData();
}

// ============================================
// 공통 포맷 헬퍼
// ============================================
function formatDateTime(datetime) {
    if (!datetime) return '-';
    const date = new Date(datetime);
    if (isNaN(date.getTime())) return '-';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatNumber(num) {
    if (!num) return '0';
    return Number(num).toLocaleString('ko-KR');
}

function getStatusBadge(status) {
    const statusMap = {
        '접수':   { class: 'status-pending',   text: '접수'   },
        '매칭중': { class: 'status-matching',  text: '매칭중' },
        '입찰완료':{ class: 'status-completed', text: '입찰완료'},
        '낙찰':   { class: 'status-success',   text: '낙찰'   },
        '유찰':   { class: 'status-failed',    text: '유찰'   },
        '취소':   { class: 'status-cancelled', text: '취소'   }
    };
    const badge = statusMap[status] || { class: 'status-pending', text: status || '-' };
    return `<span class="status-badge ${badge.class}">${badge.text}</span>`;
}

function getExpertTypeBadge(type) {
    if (type === '법무사')         return '<span class="badge-lawyer">⚖️ 법무사</span>';
    if (type === '매수신청대리인') return '<span class="badge-agent">💰 매수신청대리인</span>';
    return type || '-';
}
