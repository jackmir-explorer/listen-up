# Listen-up — 모바일/배포 (study-app 방식)

`study-app` 에서 쓰던 방식 그대로 listen-up 에 적용한 셋업입니다 (1·2단계 반영).

- **단일 파일** `listen-up.html` 이 소스의 진실 (CSS/JS 통합) — 이미 그렇습니다.
- **localStorage 영속화** — 라이브러리(클립·저장한 표현·책갈피)가 브라우저에 저장돼 새로고침/재실행에도 유지됩니다.
- **GitHub Gist 동기화** — 우하단 ☁ 버튼에서 토큰을 연결하면 라이브러리가 비공개 Gist 에 백업되고 다른 기기와 동기화됩니다. (아래 "기기 간 동기화" 참고)
- **Capacitor 네이티브 래핑** — 같은 HTML 을 안드로이드 앱으로 패키징. `isNativeApp()` 으로 웹/네이티브 분기.
- **GitHub Pages 배포** — `.github/workflows/pages.yml`(Actions) 또는 `deploy.sh`.
- **백엔드는 따로 호스팅(비밀키 불필요)** — 검색·자막은 브라우저에서 직접 못 하므로 서버가 필요. Anthropic 키는 앱에서 입력해 헤더로 전달하므로 서버엔 비밀키가 없어도 됩니다. 백엔드 주소·키는 앱 **⚙ 설정**에서 런타임 지정(재빌드 불필요).

> ⚠️ android/ · ios/ · www/ · node_modules/ 는 **로컬 생성물**이라 커밋하지 않습니다(.gitignore). 아래 명령을 **본인 PC**에서 실행하세요. (이 레포엔 설정·스크립트·문서만 들어 있습니다.)

---

## 0. 사전 준비
- Node.js 18+ / npm
- 안드로이드: **Android Studio** (SDK·에뮬레이터 포함)
- (선택) iOS: macOS + Xcode

## 1. 백엔드 호스팅 (한 번만 — 비밀키 불필요)
검색·자막은 브라우저에서 직접 못 하므로 서버가 필요합니다. Anthropic 키는 앱에서 넣어 헤더로 전달되므로 **서버엔 비밀키를 둘 필요가 없어** 그냥 배포하면 됩니다.

**옵션 A — Render (블루프린트, 가장 쉬움)**
1. 이 레포를 Render 에 연결 → **New → Blueprint** (`render.yaml` 자동 인식) → 그대로 배포
2. 배포되면 URL 확보 (예: `https://listen-up-api.onrender.com`)

**옵션 B — Docker 직접 (본인 서버/PC)**
```bash
docker build -t listen-up-api .
docker run -p 3001:3001 listen-up-api
```
> CORS 가 모든 출처 허용이라 Pages·네이티브에서 바로 호출됩니다. Pages(HTTPS)에서 쓰려면 백엔드도 **HTTPS** 여야 합니다(Render 는 자동 HTTPS).

이 URL 은 빌드에 굽지 않고 **앱 ⚙ 설정 → "백엔드 서버 주소"** 에 넣습니다(아래).

## 2. GitHub Pages (웹에서 접근)
**방법 A — GitHub Actions (자동, 권장)**
1. 레포 **Settings → Pages → Source = "GitHub Actions"**
2. `main` 에 푸시(또는 Actions 탭에서 "Deploy to GitHub Pages" 수동 실행) → 자동 빌드·배포
3. 결과: `https://<your-user>.github.io/listen-up/`

**방법 B — 로컬 스크립트 (즉시)**
```bash
bash deploy.sh   # www → gh-pages force-push (최초 1회 Settings→Pages→Source=gh-pages)
```
> Pages 를 처음 연 뒤 앱 **⚙ 설정 → "백엔드 서버 주소"** 에 1번 URL, **"Anthropic API 키"** 에 키를 한 번 넣으면 끝.

## 3. 안드로이드 앱 (Capacitor)
```bash
npm install               # Capacitor (최초 1회)
npm run cap:add:android   # android/ 생성 (최초 1회)
npm run cap:open:android  # Android Studio 에서 ▶ 빌드/실행
```
코드 수정 후 반영: `npm run cap:sync`
> 앱을 처음 켜면 **⚙ 설정**에서 ① Anthropic 키, ② 백엔드 서버 주소를 한 번 입력하세요. Gist 동기화를 켜면 PC 라이브러리도 그대로 따라옵니다.
> iOS 는 macOS 에서 `npx cap add ios` → `npx cap open ios` (Xcode). 구조는 동일.

---

## 앱 설정값 (모두 ⚙ 설정 · 해당 기기 localStorage)
| 항목 | 키 | 용도 |
|---|---|---|
| Anthropic API 키 | `anthropic_key` | 뜻·태그 분석 (헤더로 백엔드 전달) |
| 백엔드 서버 주소 | `listen-up.apiBase` | Pages·모바일에서 API 호출 대상 |
| Gist 토큰·ID | `gist_token`·`gist_id` | 기기 간 동기화 |

API 주소 우선순위(`apiBase()`): **⚙ 설정값** → 빌드 주입(`window.LISTEN_UP_API_BASE`) → `file://`·네이티브면 `localhost:3001` → 같은 출처(`""`).

## 기기 간 동기화 (GitHub Gist)
study-app 방식: 라이브러리 전체(`{updatedAt, clips}`)를 **비공개 Gist** 한 파일(`listen-up_sync.json`)에 백업하고, 여러 기기에서 같은 Gist 를 공유합니다.

1. 앱 우하단 **☁ 버튼** → **토큰 발급하기** (GitHub classic PAT, `gist` 권한만)
2. 토큰을 붙여넣고 **연결** → 자동으로 비공개 Gist 생성/연결, 초기 동기화
3. 이후 변경은 2.5초 디바운스로 자동 백업. 다른 기기에선 연결 시 더 최신본을 자동으로 내려받음(last-write-wins). **지금 올리기/내려받기**로 수동 동기화도 가능.

- 키 저장: `gist_token`·`gist_id` (해당 기기 localStorage 에만). 공용 PC 에선 **연결 해제** 권장.
- 토큰은 서버를 안 거치고 브라우저에서 직접 `api.github.com/gists` 만 호출합니다.

## 개발 컨벤션 (study-app 과 동일)
- **외과적 수정** — 전체 재작성 금지, 정확한 위치만 최소 변경.
- **변경 후 commit + push** — 여러 기기에 같은 배포본을 제공하므로.

## 현재 한계 / 다음 단계
- Gist 동기화는 **라이브러리 전체 단위 last-write-wins** — 두 기기에서 동시에 편집하면 나중 저장이 우선. 학습 1인 사용엔 충분하나, 동시 편집 병합은 아직 없음.
- 자막은 비공식 추출이라 깨질 수 있음(기존 한계 동일).
