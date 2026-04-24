# 대리입찰 톡 배포 가이드

## 📦 GitHub Pages + 가비아 도메인 연결

이 가이드는 **대출톡**과 동일한 방식으로 **대리입찰 톡**을 배포하는 방법입니다.

---

## 🎯 배포 방식

- **호스팅**: GitHub Pages (무료)
- **도메인**: 가비아에서 구매한 도메인
- **연결**: CNAME 레코드로 도메인 → GitHub Pages 연결

---

## 📋 1단계: GitHub 저장소 생성

### 1-1. GitHub 계정 접속
- https://github.com 접속
- 로그인

### 1-2. 새 저장소 생성
```
1. 우측 상단 "+" 클릭 → "New repository"
2. Repository name: daeriipchaltalk (또는 원하는 이름)
3. Public 선택 ✅
4. "Create repository" 클릭
```

### 1-3. 저장소에 파일 업로드

**방법 1: GitHub 웹에서 직접 업로드**
```
1. "uploading an existing file" 클릭
2. 모든 파일 드래그 앤 드롭
   - index.html
   - css/ 폴더
   - js/ 폴더
   - README.md
   - CNAME
3. "Commit changes" 클릭
```

**방법 2: Git 명령어 사용 (로컬)**
```bash
# 1. 로컬에 파일 다운로드
# 2. 터미널에서 실행

git init
git add .
git commit -m "Initial commit: 대리입찰 톡 v1.0"
git branch -M main
git remote add origin https://github.com/your-username/daeriipchaltalk.git
git push -u origin main
```

---

## 📋 2단계: GitHub Pages 설정

### 2-1. Settings → Pages
```
1. 저장소 페이지에서 "Settings" 탭 클릭
2. 좌측 메뉴에서 "Pages" 클릭
```

### 2-2. Source 설정
```
- Branch: main 선택
- Folder: / (root) 선택
- "Save" 클릭
```

### 2-3. 배포 확인
```
- 몇 분 후 "Your site is live at https://your-username.github.io/daeriipchaltalk/" 메시지 표시
- 링크 클릭하여 사이트 확인 ✅
```

---

## 📋 3단계: 가비아 도메인 구매

### 3-1. 가비아 접속
- https://www.gabia.com 접속
- 로그인 또는 회원가입

### 3-2. 도메인 검색 및 구매
```
1. 원하는 도메인 검색 (예: daeriipchaltalk.com)
2. 사용 가능 확인
3. 장바구니 담기 → 결제
4. 도메인 등록 (1년 약 15,000원)
```

**추천 도메인:**
- daeriipchaltalk.com
- daeriipchaltalk.co.kr
- daeriipchaltalk.kr

---

## 📋 4단계: 가비아 DNS 설정

### 4-1. My가비아 → 도메인 관리
```
1. My가비아 접속
2. "서비스 관리" → "도메인" 클릭
3. 구매한 도메인 선택
```

### 4-2. DNS 정보 설정
```
1. "DNS 정보" 또는 "DNS 관리" 클릭
2. "DNS 설정" 버튼 클릭
```

### 4-3. CNAME 레코드 추가

**레코드 1: www 서브도메인**
```
- 타입: CNAME
- 호스트: www
- 값/위치: your-username.github.io.
- TTL: 3600
```

**레코드 2: A 레코드 (루트 도메인)**
```
GitHub Pages IP 주소 4개 추가:

타입: A
호스트: @
값/위치: 185.199.108.153
TTL: 3600

타입: A
호스트: @
값/위치: 185.199.109.153
TTL: 3600

타입: A
호스트: @
값/위치: 185.199.110.153
TTL: 3600

타입: A
호스트: @
값/위치: 185.199.111.153
TTL: 3600
```

### 4-4. 저장 및 적용
```
- "저장" 또는 "적용" 버튼 클릭
- DNS 전파까지 최대 24~48시간 소요 (보통 1~2시간)
```

---

## 📋 5단계: GitHub Pages에서 도메인 설정

### 5-1. Custom domain 설정
```
1. GitHub 저장소 → Settings → Pages
2. "Custom domain" 입력란에 도메인 입력
   예: daeriipchaltalk.com
3. "Save" 클릭
```

### 5-2. HTTPS 활성화
```
- "Enforce HTTPS" 체크박스 활성화 ✅
- 몇 분 후 자동으로 SSL 인증서 발급됨
```

---

## 📋 6단계: CNAME 파일 확인

저장소 루트에 `CNAME` 파일이 자동 생성됨:
```
daeriipchaltalk.com
```

만약 생성되지 않았다면:
```
1. 저장소 루트에 "CNAME" 파일 생성 (확장자 없음)
2. 내용: daeriipchaltalk.com
3. Commit
```

---

## 📋 7단계: 배포 완료 및 테스트

### 7-1. DNS 전파 확인
```bash
# Windows 명령 프롬프트
nslookup daeriipchaltalk.com

# macOS/Linux 터미널
dig daeriipchaltalk.com
```

### 7-2. 사이트 접속 테스트
```
✅ http://daeriipchaltalk.com
✅ https://daeriipchaltalk.com
✅ https://www.daeriipchaltalk.com
```

### 7-3. 모바일 테스트
- 스마트폰에서 도메인 접속
- 반응형 디자인 확인
- 서명 기능 터치 테스트

---

## 🔄 업데이트 방법

### 파일 수정 후 배포
```bash
# 로컬에서 파일 수정 후

git add .
git commit -m "업데이트 내용 설명"
git push

# 또는 GitHub 웹에서 직접 파일 수정
```

### 자동 배포
- GitHub에 push하면 자동으로 GitHub Pages가 배포됨
- 1~2분 후 사이트 반영

---

## 📊 예상 비용

| 항목 | 비용 | 주기 |
|------|------|------|
| GitHub Pages 호스팅 | 무료 | 영구 |
| 가비아 .com 도메인 | 약 15,000원 | 1년 |
| SSL 인증서 | 무료 (Let's Encrypt) | 자동 갱신 |
| **총 비용** | **약 15,000원/년** | - |

---

## 🛠 문제 해결

### 문제 1: 사이트가 안 열려요
**원인**: DNS 전파 대기 중
**해결**: 1~2시간 기다리거나, 다음 명령어로 확인
```bash
nslookup your-domain.com
```

### 문제 2: HTTPS 오류
**원인**: SSL 인증서 발급 중
**해결**: GitHub Settings → Pages에서 "Enforce HTTPS" 체크 해제 후 재활성화

### 문제 3: 404 Not Found
**원인**: index.html 파일이 루트에 없음
**해결**: 저장소 루트에 index.html이 있는지 확인

### 문제 4: CSS/JS 안 불러와짐
**원인**: 상대경로 문제
**해결**: 
```html
<!-- 절대경로 대신 상대경로 사용 -->
<link rel="stylesheet" href="css/style.css">
<script src="js/main.js"></script>
```

---

## 📱 실제 적용 사례: 대출톡

**대출톡** 역시 동일한 방식으로 배포되었습니다:
- GitHub Pages 호스팅
- 가비아 도메인 연결
- HTTPS 자동 적용

**대리입찰 톡도 동일하게 적용 가능!**

---

## 🎯 완료 체크리스트

- [ ] GitHub 저장소 생성
- [ ] 파일 업로드 완료
- [ ] GitHub Pages 활성화
- [ ] 가비아 도메인 구매
- [ ] 가비아 DNS 설정 (CNAME + A 레코드)
- [ ] GitHub Custom domain 설정
- [ ] HTTPS 활성화
- [ ] DNS 전파 확인
- [ ] 사이트 접속 테스트
- [ ] 모바일 테스트

---

## 📞 참고 링크

- **GitHub Pages 공식 문서**: https://pages.github.com/
- **가비아**: https://www.gabia.com
- **DNS 전파 확인**: https://dnschecker.org/

---

**배포 완료 후 실제 도메인으로 접속 가능합니다!** 🚀

예: https://daeriipchaltalk.com