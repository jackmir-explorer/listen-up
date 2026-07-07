# Google 로그인 설정 (1회, 약 10분)

Listening Miner 의 Google 계정 동기화는 **Firebase**(구글의 무료 앱 백엔드)를 사용합니다.
프로젝트는 본인 구글 계정 소유여야 해서 아래 1회 설정이 필요합니다. 전부 무료입니다.

## 1. Firebase 프로젝트 만들기
1. https://console.firebase.google.com 접속 → **프로젝트 추가**
2. 이름 예: `listen-up` → (애널리틱스는 꺼도 됨) → 만들기

## 2. 웹 앱 등록 + 설정 복사
1. 프로젝트 홈에서 **웹(</>) 아이콘** 클릭 → 앱 별명 예: `listen-up-web` → 등록
2. 나오는 코드에서 아래 부분을 **복사**해 두세요 (나중에 앱 ⚙에 붙여넣음):
   ```js
   const firebaseConfig = {
     apiKey: "…", authDomain: "….firebaseapp.com", projectId: "…",
     storageBucket: "…", messagingSenderId: "…", appId: "…"
   };
   ```
   > 이 값들은 비밀이 아니라서 노출돼도 안전합니다 (권한은 아래 보안 규칙이 결정).

## 3. Google 로그인 켜기
1. 왼쪽 메뉴 **빌드 → Authentication → 시작하기**
2. **Sign-in method** 탭 → **Google** → 사용 설정 → 저장
3. **Settings 탭 → 승인된 도메인**에 다음이 있는지 확인(없으면 추가):
   - `jackmir-explorer.github.io`

## 4. Firestore 만들기 + 보안 규칙
1. 왼쪽 메뉴 **빌드 → Firestore Database → 데이터베이스 만들기**
   - 위치: `asia-northeast3 (서울)` 권장 → **프로덕션 모드**로 시작
2. **규칙(Rules)** 탭에 아래를 붙여넣고 **게시**:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
       match /transcripts/{videoId} {
         allow read: if true;
         allow write: if request.auth != null;
       }
       match /analyze/{expr} {
         allow read: if true;
         allow write: if request.auth != null;
       }
     }
   }
   ```
   > `users/…` 는 각 사용자가 **자기 데이터만** 접근.
   > `transcripts/…` 는 **공유 자막 캐시** — 한 명이 뽑은 자막을 모두가 재사용해
   > Supadata 월 한도를 아낍니다 (읽기는 누구나, 쓰기는 로그인 사용자만).
   > `analyze/…` 는 **공유 분석 캐시** — 같은 단어·구문의 뜻·태그를 전 세계에서
   > 1번만 분석해 Anthropic 비용을 아낍니다.

## 5. 앱에 연결
1. 앱(https://jackmir-explorer.github.io/listen-up/) → **⚙ 설정 → Google 계정**
2. 2번에서 복사한 `firebaseConfig = { … }` 를 붙여넣고 **설정 저장** (앱이 새로고침됨)
3. **Google 로 로그인** → 끝!

## 동기화되는 것
| 항목 | 동기화 |
|---|---|
| 라이브러리(클립·어휘·책갈피·SRS) | ✅ |
| 학습 통계(스트릭·듣기 시간) | ✅ |
| 설정(목표 분·주제·백엔드 주소·최근 검색어) | ✅ |
| API 키(Anthropic·Supadata) | ✅ 계정에 저장 — 로그인하면 자동 적용, **로그아웃 시 그 기기에서 삭제**(공용 기기 보호) |
| Gist 토큰 | ❌ 기기별 보관 |

다른 기기에서는 같은 설정을 붙여넣고(1회) 로그인만 하면 이어집니다.
로그인 중에는 Gist 동기화 대신 계정 동기화가 사용됩니다.
