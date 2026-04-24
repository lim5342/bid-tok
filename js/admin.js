// ============================================
// Admin Dashboard Functions
// ============================================

// Load applications data from Table API
async function loadApplicationsData() {
    try {
        const response = await fetch('tables/applications?limit=100&sort=-created_at');
        const data = await response.json();
        
        if (data && data.data) {
            renderApplicationsTable(data.data);
        }
    } catch (error) {
        console.error('Error loading applications:', error);
        // Show sample data if API fails
        renderApplicationsTable([]);
    }
}

// Render applications table
function renderApplicationsTable(applications) {
    const tbody = document.getElementById('applicationsTableBody');
    
    if (!tbody) return;
    
    if (applications.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">신청 내역이 없습니다.</td></tr>';
        return;
    }
    
    tbody.innerHTML = applications.map(app => `
        <tr>
            <td>${formatDateTime(app.created_at)}</td>
            <td>${app.applicant_name || '-'}</td>
            <td>${app.phone || '-'}</td>
            <td>${app.case_number || '-'}</td>
            <td>${app.court || '-'}</td>
            <td>${formatNumber(app.bid_amount)}원</td>
            <td>${getStatusBadge(app.status)}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewApplicationDetail('${app.id}')">상세보기</button>
            </td>
        </tr>
    `).join('');
}

// Load experts data from Table API
async function loadExpertsData() {
    try {
        const response = await fetch('tables/experts?limit=100&sort=-created_at');
        const data = await response.json();
        
        if (data && data.data) {
            renderExpertsTable(data.data);
        }
    } catch (error) {
        console.error('Error loading experts:', error);
        renderExpertsTable([]);
    }
}

// Render experts table
function renderExpertsTable(experts) {
    const tbody = document.getElementById('expertsTableBody');
    
    if (!tbody) return;
    
    const pendingExperts = experts.filter(e => e.status === '대기');
    
    if (pendingExperts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">승인 대기 중인 전문가가 없습니다.</td></tr>';
        return;
    }
    
    tbody.innerHTML = pendingExperts.map(expert => `
        <tr>
            <td>${formatDateTime(expert.created_at)}</td>
            <td>${expert.name || '-'}</td>
            <td>${getExpertTypeBadge(expert.expert_type)}</td>
            <td>${expert.license_number || '-'}</td>
            <td>${expert.phone || '-'}</td>
            <td>${JSON.parse(expert.active_regions || '[]').join(', ')}</td>
            <td>
                <button class="btn btn-sm btn-success" onclick="approveExpert('${expert.id}')">승인</button>
                <button class="btn btn-sm btn-danger" onclick="rejectExpert('${expert.id}')">거절</button>
            </td>
        </tr>
    `).join('');
}

// Format datetime
function formatDateTime(datetime) {
    if (!datetime) return '-';
    const date = new Date(datetime);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Get status badge HTML
function getStatusBadge(status) {
    const statusMap = {
        '접수': { class: 'status-pending', text: '접수' },
        '매칭중': { class: 'status-matching', text: '매칭중' },
        '입찰완료': { class: 'status-completed', text: '입찰완료' },
        '낙찰': { class: 'status-success', text: '낙찰' },
        '유찰': { class: 'status-failed', text: '유찰' },
        '취소': { class: 'status-cancelled', text: '취소' }
    };
    
    const badge = statusMap[status] || { class: 'status-pending', text: status };
    return `<span class="status-badge ${badge.class}">${badge.text}</span>`;
}

// Get expert type badge
function getExpertTypeBadge(type) {
    if (type === '법무사') {
        return '<span class="badge-lawyer">⚖️ 법무사</span>';
    } else if (type === '매수신청대리인') {
        return '<span class="badge-agent">💰 매수신청대리인</span>';
    }
    return type;
}

// View application detail
async function viewApplicationDetail(appId) {
    try {
        const response = await fetch(`tables/applications/${appId}`);
        const app = await response.json();
        
        if (!app) {
            alert('신청 정보를 불러올 수 없습니다.');
            return;
        }
        
        let expertInfo = '미배정';
        if (app.assigned_expert_id) {
            try {
                const expertRes = await fetch(`tables/experts/${app.assigned_expert_id}`);
                const expert = await expertRes.json();
                expertInfo = `${expert.name} (${expert.expert_type})`;
            } catch (e) {
                console.error('Expert load failed:', e);
            }
        }
        
        const detail = `
━━━━━━━━━━━━━━━━━━━━━━
📋 대리입찰 신청 상세 정보
━━━━━━━━━━━━━━━━━━━━━━

📌 신청 정보
• 신청일시: ${formatDateTime(app.created_at)}
• 신청자: ${app.applicant_name}
• 연락처: ${app.phone}
• 이메일: ${app.email}

🏛️ 경매 정보
• 관할법원: ${app.court}
• 사건번호: ${app.case_number}
• 물건번호: ${app.property_number}
• 입찰기일: ${app.bid_date}

💰 입찰 정보
• 입찰가: ${formatNumber(app.bid_amount)}원
• 보증금: ${formatNumber(app.deposit)}원
• 입찰유형: ${app.bid_type}

👨‍⚖️ 전문가 정보
• 선택구분: ${app.expert_type}
• 수수료: ${formatNumber(app.service_fee)}원
• 배정전문가: ${expertInfo}

📊 처리 상태
• 신청상태: ${app.status}
• 결제상태: ${app.payment_status}

━━━━━━━━━━━━━━━━━━━━━━
        `.trim();
        
        alert(detail);
        
    } catch (error) {
        console.error('Error viewing detail:', error);
        alert('상세 정보를 불러오는 중 오류가 발생했습니다.');
    }
}

// Approve expert
async function approveExpert(expertId) {
    if (!confirm('이 전문가를 승인하시겠습니까?')) return;
    
    try {
        const response = await fetch(`tables/experts/${expertId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: '승인',
                approved_at: new Date().toISOString()
            })
        });
        
        if (response.ok) {
            alert('전문가가 승인되었습니다.\n\n실제 운영 시 이메일/카카오톡 알림이 발송됩니다.');
            loadExpertsData();
        } else {
            alert('승인 처리 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('Error approving expert:', error);
        alert('승인 처리 중 오류가 발생했습니다.');
    }
}

// Reject expert
async function rejectExpert(expertId) {
    const reason = prompt('거절 사유를 입력해주세요:');
    if (!reason) return;
    
    try {
        const response = await fetch(`tables/experts/${expertId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: '거절'
            })
        });
        
        if (response.ok) {
            alert(`전문가 신청이 거절되었습니다.\n\n거절 사유: ${reason}\n\n실제 운영 시 이메일/카카오톡 알림이 발송됩니다.`);
            loadExpertsData();
        } else {
            alert('거절 처리 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('Error rejecting expert:', error);
        alert('거절 처리 중 오류가 발생했습니다.');
    }
}

// Export to Excel (CSV)
function exportApplicationsToExcel() {
    fetch('tables/applications?limit=1000&sort=-created_at')
        .then(res => res.json())
        .then(data => {
            if (!data || !data.data || data.data.length === 0) {
                alert('다운로드할 데이터가 없습니다.');
                return;
            }
            
            // CSV header
            const headers = ['신청일시', '신청자', '연락처', '이메일', '관할법원', '사건번호', '물건번호', '입찰가', '보증금', '전문가구분', '수수료', '입찰유형', '상태', '결제상태', '입찰기일'];
            
            // CSV rows
            const rows = data.data.map(app => [
                formatDateTime(app.created_at),
                app.applicant_name,
                app.phone,
                app.email,
                app.court,
                app.case_number,
                app.property_number,
                app.bid_amount,
                app.deposit,
                app.expert_type,
                app.service_fee,
                app.bid_type,
                app.status,
                app.payment_status,
                app.bid_date
            ]);
            
            // Create CSV content
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.join(','))
            ].join('\n');
            
            // Add BOM for Excel UTF-8 support
            const BOM = '\uFEFF';
            const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
            
            // Download
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `대리입찰신청_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            alert('엑셀 파일 다운로드가 완료되었습니다.');
        })
        .catch(error => {
            console.error('Export error:', error);
            alert('엑셀 다운로드 중 오류가 발생했습니다.');
        });
}

// Export experts to Excel (CSV)
function exportExpertsToExcel() {
    fetch('tables/experts?limit=1000&sort=-created_at')
        .then(res => res.json())
        .then(data => {
            if (!data || !data.data || data.data.length === 0) {
                alert('다운로드할 데이터가 없습니다.');
                return;
            }
            
            // CSV header
            const headers = ['신청일시', '이름', '전문가구분', '자격증번호', '연락처', '이메일', '주소', '활동지역', '희망수수료', '카톡번호', '상태', '승인일시', '평점', '성공건수'];
            
            // CSV rows
            const rows = data.data.map(expert => [
                formatDateTime(expert.created_at),
                expert.name,
                expert.expert_type,
                expert.license_number,
                expert.phone,
                expert.email,
                `${expert.address} ${expert.address_detail}`,
                JSON.parse(expert.active_regions || '[]').join(' '),
                expert.service_fee,
                expert.kakao_phone,
                expert.status,
                formatDateTime(expert.approved_at),
                expert.rating || 0,
                expert.success_count || 0
            ]);
            
            // Create CSV content
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.join(','))
            ].join('\n');
            
            // Add BOM for Excel UTF-8 support
            const BOM = '\uFEFF';
            const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
            
            // Download
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `전문가목록_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            alert('엑셀 파일 다운로드가 완료되었습니다.');
        })
        .catch(error => {
            console.error('Export error:', error);
            alert('엑셀 다운로드 중 오류가 발생했습니다.');
        });
}

// Admin tab switching
function setupAdminTabs() {
    const tabButtons = document.querySelectorAll('.admin-tab');
    const tabContents = document.querySelectorAll('.admin-tab-content');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            
            // Remove active class from all
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked
            btn.classList.add('active');
            document.getElementById(targetTab + 'Tab').classList.add('active');
            
            // Load data based on tab
            if (targetTab === 'applications') {
                loadApplicationsData();
            } else if (targetTab === 'experts') {
                loadExpertsData();
            }
        });
    });
}

// Initialize admin page
function initAdminPage() {
    setupAdminTabs();
    loadApplicationsData();
    loadExpertsData();
}

// Format number with commas
function formatNumber(num) {
    if (!num) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
