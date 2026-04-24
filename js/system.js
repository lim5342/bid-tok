// ============================================
// 매칭 및 정산 시스템 (System.js)
// ============================================

// 상태 정의
const STATUS = {
    PAYMENT_COMPLETE: '결제완료',
    MATCHING: '매칭중',
    MATCHED: '매칭완료',
    IN_PROGRESS: '진행중',
    COMPLETE: '완료',
    REMATCHING: '재매칭중',
    CANCELED: '취소'
};

// 매칭 시스템
class MatchingSystem {
    constructor() {
        this.applications = [];
        this.experts = [];
    }

    // 자동 매칭 로직
    async matchExpert(applicationId) {
        try {
            const application = await this.getApplication(applicationId);
            if (!application) {
                console.error('Application not found');
                return null;
            }

            // 지역 기반 전문가 필터링
            const availableExperts = this.experts.filter(expert => {
                return expert.regions && expert.regions.includes(application.region) &&
                       expert.status === 'active' &&
                       expert.type === application.expertType;
            });

            if (availableExperts.length === 0) {
                // 고객센터 연결
                this.notifyCustomerService(applicationId);
                return null;
            }

            // 첫 번째 전문가에게 매칭 요청
            const selectedExpert = availableExperts[0];
            await this.sendMatchingRequest(applicationId, selectedExpert.id);
            
            return selectedExpert;
        } catch (error) {
            console.error('Matching error:', error);
            return null;
        }
    }

    // 매칭 요청 전송 (카카오톡)
    async sendMatchingRequest(applicationId, expertId) {
        // 실제 구현: 카카오 비즈메시지 API 연동
        console.log(`매칭 요청 전송: 신청ID ${applicationId} → 전문가ID ${expertId}`);
        
        // TODO: 카카오톡 알림 전송
        // await sendKakaoMessage(expertId, {
        //     template: 'matching_request',
        //     applicationId: applicationId
        // });
    }

    // 전문가 수락
    async acceptMatching(applicationId, expertId) {
        // 상태 업데이트: 매칭중 → 매칭완료
        await this.updateApplicationStatus(applicationId, STATUS.MATCHED);
        
        // 소비자에게 전문가 정보 공개 (카카오톡)
        await this.notifyConsumer(applicationId, expertId);
        
        console.log(`매칭 완료: 신청ID ${applicationId}, 전문가ID ${expertId}`);
    }

    // 전문가 거절
    async rejectMatching(applicationId, expertId) {
        // 해당 전문가 제외하고 재매칭
        await this.updateApplicationStatus(applicationId, STATUS.REMATCHING);
        
        // 다른 전문가 자동 매칭
        const newExpert = await this.matchExpert(applicationId);
        
        if (!newExpert) {
            console.log('모든 전문가가 거절 → 고객센터 연결');
        }
    }

    // 소비자에게 알림
    async notifyConsumer(applicationId, expertId) {
        // TODO: 카카오톡 알림 - 전문가 연락처 포함
        console.log(`소비자 알림 전송: 신청ID ${applicationId}`);
    }

    // 고객센터 연결
    notifyCustomerService(applicationId) {
        console.log(`고객센터 알림: 신청ID ${applicationId} - 매칭 가능한 전문가 없음`);
        // TODO: 관리자 대시보드 알림
    }

    // 상태 업데이트
    async updateApplicationStatus(applicationId, status) {
        try {
            const response = await fetch(`tables/applications/${applicationId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: status })
            });
            return await response.json();
        } catch (error) {
            console.error('Status update failed:', error);
        }
    }

    // 신청 정보 조회
    async getApplication(applicationId) {
        try {
            const response = await fetch(`tables/applications/${applicationId}`);
            return await response.json();
        } catch (error) {
            console.error('Get application failed:', error);
            return null;
        }
    }
}

// 정산 시스템
class SettlementSystem {
    constructor() {
        this.pendingSettlements = [];
    }

    // 진행완료 → 정산 대기
    async requestSettlement(applicationId, expertId) {
        try {
            // 신청 정보 조회
            const response = await fetch(`tables/applications/${applicationId}`);
            const application = await response.json();

            // 정산 정보 생성
            const settlement = {
                applicationId: applicationId,
                expertId: expertId,
                amount: application.serviceFee,
                status: '정산대기',
                requestDate: new Date().toISOString(),
                bankName: application.expertBankName,
                accountNumber: application.expertAccountNumber,
                accountHolder: application.expertName
            };

            this.pendingSettlements.push(settlement);
            console.log('정산 요청:', settlement);

            return settlement;
        } catch (error) {
            console.error('Settlement request failed:', error);
        }
    }

    // 관리자 정산 승인
    async approveSettlement(settlementId) {
        const settlement = this.pendingSettlements.find(s => s.id === settlementId);
        if (!settlement) {
            console.error('Settlement not found');
            return;
        }

        // 상태 업데이트
        settlement.status = '정산완료';
        settlement.approvalDate = new Date().toISOString();

        console.log('정산 승인:', settlement);

        // TODO: 실제 송금 처리 (수동 or 자동)
        // TODO: 세금계산서 발행
    }

    // 정산 내역 조회
    getPendingSettlements() {
        return this.pendingSettlements.filter(s => s.status === '정산대기');
    }
}

// 취소/환불 시스템
class RefundSystem {
    // 취소 가능 여부 확인
    canCancel(application) {
        const today = new Date();
        const bidDate = new Date(application.bidDate);
        const daysDiff = Math.floor((bidDate - today) / (1000 * 60 * 60 * 24));

        // 입찰일 2영업일 전까지만 취소 가능
        if (daysDiff >= 2 && application.status !== STATUS.IN_PROGRESS) {
            return { canCancel: true, reason: null };
        }

        // 진행중 상태는 취소 불가
        if (application.status === STATUS.IN_PROGRESS) {
            return { canCancel: false, reason: '입찰 진행중에는 취소가 불가능합니다.' };
        }

        // 당일 취소 불가
        if (daysDiff < 2) {
            return { canCancel: false, reason: '입찰일 2영업일 전까지만 취소 가능합니다.' };
        }

        return { canCancel: false, reason: '취소 불가 상태입니다.' };
    }

    // 취소 처리
    async cancelApplication(applicationId) {
        try {
            const response = await fetch(`tables/applications/${applicationId}`);
            const application = await response.json();

            const cancelCheck = this.canCancel(application);
            if (!cancelCheck.canCancel) {
                alert(cancelCheck.reason);
                return false;
            }

            // 전문가 동의 필요
            const expertAgreed = confirm('전문가의 동의가 필요합니다. 취소를 진행하시겠습니까?');
            if (!expertAgreed) {
                return false;
            }

            // 상태 업데이트
            await fetch(`tables/applications/${applicationId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    status: STATUS.CANCELED,
                    cancelDate: new Date().toISOString()
                })
            });

            // 환불 처리
            await this.processRefund(application);

            alert('취소가 완료되었습니다. 환불은 2-3 영업일 내 처리됩니다.');
            return true;

        } catch (error) {
            console.error('Cancel failed:', error);
            alert('취소 처리 중 오류가 발생했습니다.');
            return false;
        }
    }

    // 환불 처리
    async processRefund(application) {
        console.log('환불 처리:', {
            applicationId: application.id,
            amount: application.serviceFee,
            accountNumber: application.refundAccount
        });
        // TODO: 실제 환불 API 연동
    }
}

// 전역 인스턴스
const matchingSystem = new MatchingSystem();
const settlementSystem = new SettlementSystem();
const refundSystem = new RefundSystem();

// 전역 함수로 노출
window.matchingSystem = matchingSystem;
window.settlementSystem = settlementSystem;
window.refundSystem = refundSystem;

console.log('System.js loaded: 매칭/정산/환불 시스템 초기화 완료');
