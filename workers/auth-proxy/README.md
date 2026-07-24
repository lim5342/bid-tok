# bidtok-auth-proxy

로그인·회원가입 등 **비밀번호가 오가는 처리를 서버(Cloudflare Worker)에서만** 수행하는 인증 중계기.
이 워커가 있어야 Firestore 보안 규칙을 잠글 수 있다(브라우저가 users/admins를 직접 읽지 않게 됨).

## 동작 원리
- Firebase **서비스 계정**으로 액세스 토큰을 발급 → Firestore REST 호출(보안 규칙 우회, 서버 권한).
- 비밀번호는 **PBKDF2-SHA256**로 해싱하여 저장. 저장형식: `pbkdf2$<반복>$<salt>$<hash>`.
- 기존 평문 비밀번호는 (1) 로그인 성공 시 자동으로 해시로 교체, (2) `/migrate-passwords`로 일괄 변환.

## 필요한 시크릿
```
wrangler secret put FIREBASE_SA        # 서비스 계정 JSON 전체
wrangler secret put ADMIN_MIGRATE_KEY  # 임의의 긴 문자열(마이그레이션 보호)
```

## 배포
```
cd workers/auth-proxy
npx wrangler deploy
```

## 엔드포인트 (POST)
| 경로 | 입력 | 설명 |
|---|---|---|
| `/login` | `{userId, password, userType}` | 일반 회원 로그인 |
| `/admin-login` | `{adminId, password}` | 관리자 로그인 |
| `/signup` | `{userData}` | 회원가입(비밀번호 해싱 저장) |
| `/check-id` | `{userId}` | 아이디 중복확인 |
| `/check-email` | `{email}` | 이메일 중복확인 |
| `/change-password` | `{userId, currentPassword, newPassword}` | 비밀번호 변경 |
| `/migrate-passwords` | `{key}` | 평문→해시 일괄 변환(ADMIN_MIGRATE_KEY 필요) |

## 서비스 계정 발급 방법 (Firebase Console)
1. Firebase Console → 프로젝트 `bid-tok` → ⚙ 프로젝트 설정 → **서비스 계정** 탭
2. **새 비공개 키 생성** → JSON 파일 다운로드
3. 파일 전체 내용을 `wrangler secret put FIREBASE_SA` 에 붙여넣기
