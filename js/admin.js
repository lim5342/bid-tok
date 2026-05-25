// ============================================
// Admin Dashboard Functions
// Firebase Firestore 기반 (API 모듈 사용)
// ============================================

// ── 필드명 정규화 헬퍼 ──────────────────────────────────────────
function ef(obj, camel, snake) {
    return (obj[camel] !== undefined && obj[camel] !== '') ? obj[camel]
         : (obj[snake] !== undefined                      ? obj[snake] : '');
}

// ============================================================
// Applications (입찰 신청 관리)
// ============================================================
async function loadApplicationsData() {
    const tbody = document.getElementById('applicationsTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">로딩 중...</td></tr>';
    try {
        const result = await API.applications.getAll();
        const apps   = (result && result.data) ? result.data : (Array.isArray(result) ? result : []);
        renderApplicationsTable(apps);
    } catch (error) {
        console.error('Error loading applications:', error);
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:red;">로딩 실패: ' + (error.message || error) + '</td></tr>';
    }
}

function renderApplicationsTable(applications) {
    const tbody = document.getElementById('applicationsTableBody');
    if (!tbody) return;
    if (!applications || applications.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">신청 내역이 없습니다.</td></tr>';
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
            <td><button class="btn btn-sm btn-primary" onclick="viewApplicationDetail('${app.id}')">상세보기</button></td>
        </tr>
    `).join('');
}

// ============================================================
// Experts (전문가 관리)
// ============================================================
async function loadExpertsData() {
    const tbody = document.getElementById('expertsTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">로딩 중...</td></tr>';
    try {
        const result  = await API.experts.getAll();
        const experts = (result && result.data) ? result.data : (Array.isArray(result) ? result : []);
        renderExpertsTable(experts);
    } catch (error) {
        console.error('Error loading experts:', error);
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:red;">로딩 실패: ' + (error.message || error) + '</td></tr>';
    }
}

function renderExpertsTable(experts) {
    const tbody = document.getElementById('expertsTableBody');
    if (!tbody) return;

    const pending = experts.filter(e => ef(e, 'status', 'status') === '대기');

    if (pending.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">승인 대기 중인 전문가가 없습니다.</td></tr>';
        return;
    }

    tbody.innerHTML = pending.map(expert => {
        const regions     = ef(expert, 'activeRegions', 'active_regions');
        const regionsText = Array.isArray(regions)
            ? regions.join(', ')
            : (typeof regions === 'string' && regions.startsWith('[')
                ? JSON.parse(regions).join(', ') : regions || '-');

        const hasLicense   = !!ef(expert, 'licenseFileURL',   'license_file_url');
        const hasInsurance = !!ef(expert, 'insuranceFileURL', 'insurance_file_url');
        const hasBusiness  = !!ef(expert, 'businessFileURL',  'business_file_url');

        const fileIcons = [
            hasLicense   ? '📄 자격증'     : '<span style="color:#ccc">📄 자격증</span>',
            hasInsurance ? '🛡️ 보험증권'  : '<span style="color:#ccc">🛡️ 보험증권</span>',
            hasBusiness  ? '🏢 사업자등록증' : ''
        ].filter(Boolean).join(' &nbsp; ');

        return `
        <tr>
            <td>${formatDateTime(ef(expert, 'createdAt', 'created_at'))}</td>
            <td><strong>${ef(expert, 'name', 'name') || '-'}</strong></td>
            <td>${getExpertTypeBadge(ef(expert, 'expertType', 'expert_type'))}</td>
            <td>${ef(expert, 'licenseNumber', 'license_number') || '-'}</td>
            <td>${ef(expert, 'phone', 'phone') || '-'}</td>
            <td style="font-size:0.82rem;">${regionsText}</td>
            <td style="font-size:0.8rem;">${fileIcons}</td>
            <td>
                <button class="btn btn-sm btn-primary"  onclick="openExpertDetail('${expert.id}')" style="margin-bottom:4px;">🔍 상세보기</button><br>
                <button class="btn btn-sm btn-success"  onclick="approveExpert('${expert.id}')">✅ 승인</button>
                <button class="btn btn-sm btn-danger"   onclick="rejectExpert('${expert.id}')" style="margin-left:4px;">❌ 거절</button>
            </td>
        </tr>`;
    }).join('');
}

// ============================================================
// 전문가 상세보기 모달
// ============================================================
async function openExpertDetail(expertId) {
    const modal = document.getElementById('expertDetailModal');
    const body  = document.getElementById('expertDetailBody');
    if (!modal || !body) return;

    body.innerHTML = '<div style="text-align:center;padding:3rem;color:#666;">⏳ 정보 불러오는 중...</div>';
    modal.style.display = 'block';

    try {
        const e = await API.experts.getById(expertId);
        if (!e) { body.innerHTML = '<p style="color:red;">데이터를 불러올 수 없습니다.</p>'; return; }

        const regions = ef(e, 'activeRegions', 'active_regions');
        const regText = Array.isArray(regions) ? regions.join(', ')
            : (typeof regions === 'string' && regions.startsWith('[') ? JSON.parse(regions).join(', ') : regions || '-');

        const licURL  = ef(e, 'licenseFileURL',   'license_file_url');
        const insURL  = ef(e, 'insuranceFileURL', 'insurance_file_url');
        const bizURL  = ef(e, 'businessFileURL',  'business_file_url');
        const licName = ef(e, 'licenseFileName',   'license_file_name')   || '자격증 사본';
        const insName = ef(e, 'insuranceFileName', 'insurance_file_name') || '배상책임보험증권';
        const bizName = ef(e, 'businessFileName',  'business_file_name')  || '사업자등록증';

        body.innerHTML = `
        <!-- 기본 정보 -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem 2rem; margin-bottom:1.5rem; padding-bottom:1.5rem; border-bottom:1px solid #eee;">
            <div><span style="color:#888; font-size:0.82rem;">성명</span><br><strong style="font-size:1.05rem;">${ef(e,'name','name') || '-'}</strong></div>
            <div><span style="color:#888; font-size:0.82rem;">구분</span><br>${getExpertTypeBadge(ef(e,'expertType','expert_type'))}</div>
            <div><span style="color:#888; font-size:0.82rem;">자격증 번호</span><br><strong>${ef(e,'licenseNumber','license_number') || '-'}</strong></div>
            <div><span style="color:#888; font-size:0.82rem;">연락처</span><br><strong>${ef(e,'phone','phone') || '-'}</strong></div>
            <div><span style="color:#888; font-size:0.82rem;">이메일</span><br><strong>${ef(e,'email','email') || '-'}</strong></div>
            <div><span style="color:#888; font-size:0.82rem;">카카오톡 알림 번호</span><br><strong>${ef(e,'kakaoPhone','kakao_phone') || '-'}</strong></div>
            <div style="grid-column:1/-1;"><span style="color:#888; font-size:0.82rem;">사무소 주소</span><br><strong>${ef(e,'address','address') || ''} ${ef(e,'addressDetail','address_detail') || ''}</strong></div>
            <div style="grid-column:1/-1;"><span style="color:#888; font-size:0.82rem;">활동지역</span><br><strong>${regText}</strong></div>
            <div><span style="color:#888; font-size:0.82rem;">신청일시</span><br><strong>${formatDateTime(ef(e,'createdAt','created_at'))}</strong></div>
            <div><span style="color:#888; font-size:0.82rem;">상태</span><br>${getExpertStatusBadge(ef(e,'status','status'))}</div>
        </div>

        <!-- 소개 -->
        ${ef(e,'introduction','introduction') ? `
        <div style="margin-bottom:1.5rem; padding-bottom:1.5rem; border-bottom:1px solid #eee;">
            <span style="color:#888; font-size:0.82rem;">📝 소개글</span>
            <p style="margin:0.5rem 0 0; background:#f8f9fa; padding:1rem; border-radius:8px; white-space:pre-wrap;">${ef(e,'introduction','introduction')}</p>
        </div>` : ''}

        <!-- 첨부 서류 -->
        <div>
            <p style="color:#888; font-size:0.82rem; margin-bottom:1rem;">📎 첨부 서류</p>
            <div style="display:flex; flex-direction:column; gap:1rem;">
                ${makeFileCard('📄 법무사 자격증 사본',      licName, licURL)}
                ${makeFileCard('🛡️ 배상책임보험증권',       insName, insURL)}
                ${bizURL ? makeFileCard('🏢 사업자등록증',  bizName, bizURL) : ''}
            </div>
        </div>

        <!-- 하단 승인/거절 버튼 -->
        <div style="display:flex; gap:1rem; margin-top:2rem; padding-top:1.5rem; border-top:1px solid #eee;">
            <button onclick="approveExpert('${e.id}'); closeExpertModal();"
                style="flex:1; padding:0.85rem; background:#22c55e; color:#fff; border:none; border-radius:10px; font-size:1rem; font-weight:700; cursor:pointer;">
                ✅ 승인하기
            </button>
            <button onclick="closeExpertModal(); rejectExpert('${e.id}');"
                style="flex:1; padding:0.85rem; background:#ef4444; color:#fff; border:none; border-radius:10px; font-size:1rem; font-weight:700; cursor:pointer;">
                ❌ 거절하기
            </button>
        </div>`;

    } catch (err) {
        console.error('openExpertDetail error:', err);
        body.innerHTML = '<p style="color:red; padding:1rem;">오류 발생: ' + (err.message || err) + '</p>';
    }
}

// 파일 카드 HTML 생성
function makeFileCard(label, fileName, fileURL) {
    if (!fileURL) {
        return `<div style="display:flex; align-items:center; gap:1rem; padding:1rem; background:#f8f9fa; border-radius:10px; border:1px dashed #ccc; color:#aaa;">
            <span style="font-size:1.5rem;">📎</span>
            <div><strong style="color:#bbb;">${label}</strong><br><small>첨부 없음</small></div>
        </div>`;
    }

    const isPDF = fileName.toLowerCase().endsWith('.pdf');
    const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileName);
    const escapedURL  = fileURL.replace(/'/g, "\\'");
    const escapedName = fileName.replace(/'/g, "\\'");

    return `<div style="background:#f0f7ff; border-radius:10px; border:1px solid #c7dfff; overflow:hidden;">
        <!-- 헤더 -->
        <div style="display:flex; align-items:center; justify-content:space-between; padding:0.85rem 1rem; border-bottom:1px solid #c7dfff;">
            <div style="display:flex; align-items:center; gap:0.75rem;">
                <span style="font-size:1.4rem;">${isPDF ? '📕' : '🖼️'}</span>
                <div>
                    <strong style="color:#1550E8;">${label}</strong><br>
                    <small style="color:#666;">${fileName}</small>
                </div>
            </div>
            <div style="display:flex; gap:0.5rem;">
                ${isImg || isPDF
                    ? `<button onclick="openFilePreview('${escapedURL}', '${isPDF ? 'pdf' : 'img'}')"
                        style="padding:0.4rem 0.9rem; background:#1550E8; color:#fff; border:none; border-radius:7px; cursor:pointer; font-size:0.82rem; font-weight:600;">
                        🔍 미리보기
                    </button>`
                    : ''}
                <a href="${fileURL}" download="${fileName}" target="_blank"
                    style="padding:0.4rem 0.9rem; background:#0f1340; color:#fff; border-radius:7px; cursor:pointer; font-size:0.82rem; font-weight:600; text-decoration:none; display:inline-block;">
                    ⬇️ 다운로드
                </a>
            </div>
        </div>
        <!-- 이미지 썸네일 (이미지인 경우) -->
        ${isImg ? `<div style="text-align:center; padding:1rem; background:#fff; cursor:pointer;" onclick="openFilePreview('${escapedURL}', 'img')">
            <img src="${fileURL}" alt="${label}" style="max-height:220px; max-width:100%; border-radius:8px; object-fit:contain; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        </div>` : ''}
        <!-- PDF 뷰어 버튼 -->
        ${isPDF ? `<div style="text-align:center; padding:1rem; background:#fff;">
            <button onclick="openFilePreview('${escapedURL}', 'pdf')"
                style="padding:0.6rem 2rem; background:#fff; border:2px solid #1550E8; color:#1550E8; border-radius:8px; cursor:pointer; font-size:0.9rem; font-weight:600;">
                📄 PDF 전체 화면으로 보기
            </button>
        </div>` : ''}
    </div>`;
}

// 모달 열기/닫기
function closeExpertModal() {
    const modal = document.getElementById('expertDetailModal');
    if (modal) modal.style.display = 'none';
}

// 파일 미리보기 팝업
function openFilePreview(url, type) {
    const modal   = document.getElementById('filePreviewModal');
    const content = document.getElementById('filePreviewContent');
    if (!modal || !content) return;

    if (type === 'img') {
        content.innerHTML = `<img src="${url}" style="max-width:88vw; max-height:86vh; display:block; object-fit:contain;">`;
    } else if (type === 'pdf') {
        content.innerHTML = `<iframe src="${url}" style="width:88vw; height:86vh; border:none; display:block;"></iframe>`;
    }

    modal.style.display = 'flex';
}

function closeFilePreview() {
    const modal   = document.getElementById('filePreviewModal');
    const content = document.getElementById('filePreviewContent');
    if (modal)   modal.style.display = 'none';
    if (content) content.innerHTML = '';
}

// 모달 바깥 클릭 닫기
document.addEventListener('click', function(e) {
    const expertModal  = document.getElementById('expertDetailModal');
    const previewModal = document.getElementById('filePreviewModal');

    if (e.target === expertModal)  closeExpertModal();
    if (e.target === previewModal) closeFilePreview();
});

// ============================================================
// 상세보기 (대리입찰 신청)
// ============================================================
async function viewApplicationDetail(appId) {
    try {
        const app = await API.applications.getById(appId);
        if (!app) { alert('신청 정보를 불러올 수 없습니다.'); return; }

        let expertInfo = '미배정';
        const assignedId = app.assignedExpertId || app.assigned_expert_id;
        if (assignedId) {
            try {
                const expert = await API.experts.getById(assignedId);
                if (expert) expertInfo = `${expert.name} (${ef(expert,'expertType','expert_type')})`;
            } catch (e) { console.error('Expert load failed:', e); }
        }

        const detail = [
            '━━━━━━━━━━━━━━━━━━━━━━',
            '📋 대리입찰 신청 상세 정보',
            '━━━━━━━━━━━━━━━━━━━━━━',
            '',
            '📌 신청 정보',
            `• 신청일시: ${formatDateTime(app.createdAt || app.created_at)}`,
            `• 신청자: ${app.applicantName || app.applicant_name || '-'}`,
            `• 연락처: ${app.phone || '-'}`,
            `• 이메일: ${app.email || '-'}`,
            '',
            '🏛️ 경매 정보',
            `• 관할법원: ${app.court || '-'}`,
            `• 사건번호: ${app.caseNumber || app.case_number || '-'}`,
            `• 물건번호: ${app.propertyNumber || app.property_number || '-'}`,
            `• 입찰기일: ${app.bidDate || app.bid_date || '-'}`,
            '',
            '💰 입찰 정보',
            `• 입찰가: ${formatNumber(app.bidAmount || app.bid_amount)}원`,
            `• 보증금: ${formatNumber(app.deposit)}원`,
            `• 입찰유형: ${app.bidType || app.bid_type || '-'}`,
            '',
            '👨‍⚖️ 전문가 정보',
            `• 선택구분: ${app.expertType || app.expert_type || '-'}`,
            `• 수수료: ${formatNumber(app.serviceFee || app.service_fee)}원`,
            `• 배정전문가: ${expertInfo}`,
            '',
            '📊 처리 상태',
            `• 신청상태: ${app.status || '-'}`,
            `• 결제상태: ${app.paymentStatus || app.payment_status || '-'}`,
            '',
            '━━━━━━━━━━━━━━━━━━━━━━'
        ].join('\n');

        alert(detail);
    } catch (error) {
        console.error('Error viewing detail:', error);
        alert('상세 정보를 불러오는 중 오류가 발생했습니다.');
    }
}

// ============================================================
// 전문가 승인 / 거절
// ============================================================
async function approveExpert(expertId) {
    if (!confirm('이 전문가를 승인하시겠습니까?')) return;
    try {
        await API.experts.update(expertId, { status: '승인', approvedAt: new Date().toISOString() });
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
        await API.experts.update(expertId, { status: '거절', rejectReason: reason });
        alert(`전문가 신청이 거절되었습니다.\n\n거절 사유: ${reason}`);
        loadExpertsData();
    } catch (error) {
        console.error('Error rejecting expert:', error);
        alert('거절 처리 중 오류가 발생했습니다.\n' + (error.message || error));
    }
}

// ============================================================
// 엑셀 내보내기
// ============================================================
function exportApplicationsToExcel() {
    API.applications.getAll()
        .then(result => {
            const data = (result && result.data) ? result.data : (Array.isArray(result) ? result : []);
            if (data.length === 0) { alert('다운로드할 데이터가 없습니다.'); return; }
            const headers = ['신청일시','신청자','연락처','이메일','관할법원','사건번호','물건번호','입찰가','보증금','전문가구분','수수료','입찰유형','상태','결제상태','입찰기일'];
            const rows = data.map(app => [
                formatDateTime(app.createdAt || app.created_at),
                app.applicantName || app.applicant_name || '',
                app.phone || '', app.email || '', app.court || '',
                app.caseNumber || app.case_number || '',
                app.propertyNumber || app.property_number || '',
                app.bidAmount || app.bid_amount || '',
                app.deposit || '',
                app.expertType || app.expert_type || '',
                app.serviceFee || app.service_fee || '',
                app.bidType || app.bid_type || '',
                app.status || '',
                app.paymentStatus || app.payment_status || '',
                app.bidDate || app.bid_date || ''
            ]);
            _downloadCSV(headers, rows, `대리입찰신청_${new Date().toISOString().split('T')[0]}.csv`);
        })
        .catch(error => { console.error('Export error:', error); alert('엑셀 다운로드 중 오류가 발생했습니다.'); });
}

function exportExpertsToExcel() {
    API.experts.getAll()
        .then(result => {
            const data = (result && result.data) ? result.data : (Array.isArray(result) ? result : []);
            if (data.length === 0) { alert('다운로드할 데이터가 없습니다.'); return; }
            const headers = ['신청일시','이름','전문가구분','자격증번호','연락처','이메일','주소','활동지역','수수료','카톡번호','자격증파일URL','보험증권URL','사업자등록URL','상태','승인일시'];
            const rows = data.map(e => {
                const regions = ef(e,'activeRegions','active_regions');
                const regText = Array.isArray(regions) ? regions.join(' ') : (regions || '');
                return [
                    formatDateTime(ef(e,'createdAt','created_at')),
                    ef(e,'name','name') || '',
                    ef(e,'expertType','expert_type') || '',
                    ef(e,'licenseNumber','license_number') || '',
                    ef(e,'phone','phone') || '',
                    ef(e,'email','email') || '',
                    (ef(e,'address','address') + ' ' + ef(e,'addressDetail','address_detail')).trim(),
                    regText,
                    ef(e,'serviceFee','service_fee') || '',
                    ef(e,'kakaoPhone','kakao_phone') || '',
                    ef(e,'licenseFileURL','license_file_url') || '',
                    ef(e,'insuranceFileURL','insurance_file_url') || '',
                    ef(e,'businessFileURL','business_file_url') || '',
                    ef(e,'status','status') || '',
                    formatDateTime(ef(e,'approvedAt','approved_at'))
                ];
            });
            _downloadCSV(headers, rows, `전문가목록_${new Date().toISOString().split('T')[0]}.csv`);
        })
        .catch(error => { console.error('Export error:', error); alert('엑셀 다운로드 중 오류가 발생했습니다.'); });
}

function _downloadCSV(headers, rows, filename) {
    const csvContent = [
        headers.join(','),
        ...rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','))
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert('엑셀 파일 다운로드가 완료되었습니다.');
}

// ============================================================
// 탭 & 초기화
// ============================================================
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
            else if (targetTab === 'experts') loadExpertsData();
        });
    });
}

function initAdminPage() {
    setupAdminTabs();
    loadApplicationsData();
    loadExpertsData();
}

// ============================================================
// 공통 포맷 헬퍼
// ============================================================
function formatDateTime(datetime) {
    if (!datetime) return '-';
    const date = new Date(datetime);
    if (isNaN(date.getTime())) return '-';
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}

function formatNumber(num) {
    if (!num) return '0';
    return Number(num).toLocaleString('ko-KR');
}

function getStatusBadge(status) {
    const m = {
        '접수':   ['status-pending',   '접수'],
        '매칭중': ['status-matching',  '매칭중'],
        '입찰완료':['status-completed','입찰완료'],
        '낙찰':   ['status-success',   '낙찰'],
        '유찰':   ['status-failed',    '유찰'],
        '취소':   ['status-cancelled', '취소']
    };
    const b = m[status] || ['status-pending', status || '-'];
    return `<span class="status-badge ${b[0]}">${b[1]}</span>`;
}

function getExpertStatusBadge(status) {
    const m = {
        '대기':   ['#f59e0b', '#fffbeb', '⏳ 대기'],
        '승인':   ['#22c55e', '#f0fdf4', '✅ 승인'],
        '거절':   ['#ef4444', '#fef2f2', '❌ 거절']
    };
    const b = m[status] || ['#999', '#f5f5f5', status || '-'];
    return `<span style="background:${b[1]}; color:${b[0]}; border:1px solid ${b[0]}; padding:0.25rem 0.7rem; border-radius:999px; font-size:0.82rem; font-weight:700;">${b[2]}</span>`;
}

function getExpertTypeBadge(type) {
    if (type === '법무사')         return '<span class="badge-lawyer">⚖️ 법무사</span>';
    if (type === '매수신청대리인') return '<span class="badge-agent">💰 매수신청대리인</span>';
    return type || '-';
}
