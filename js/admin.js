// ============================================
// Admin Dashboard Functions
// ============================================

// Load applications data
async function loadApplicationsData() {
    try {
        console.log('신청 데이터 로드 중...');
        const response = await fetch('tables/applications?limit=100&sort=-created_at');
        const data = await response.json();
        
        if (data && data.data) {
            renderApplicationsTable(data.data);
        }
    } catch (error) {
        console.error('Error loading applications:', error);
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

// Format datetime
function formatDateTime(datetime) {
    if (!datetime) return '-';
    const date = new Date(datetime);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Get status badge
function getStatusBadge(status) {
    const statusMap = {
        '접수': 'status-pending',
        '매칭중': 'status-matching',
        '완료': 'status-completed'
    };
    
    const className = statusMap[status] || 'status-pending';
    return `<span class="status-badge ${className}">${status}</span>`;
}

// Format number
function formatNumber(num) {
    if (!num) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

console.log('admin.js 로드 완료');
