# Listen-up — 모바일/배포 (study-app 방식)

`study-app` 에서 쓰던 방식 그대로 listen-up 에 적용한 셋업입니다 (1·2단계 반영).

- **단일 파일** `listen-up.html` 이 소스의 진실 (CSS/JS 통합) — 이미 그렇습니다.
- **localStorage 영속화** — 라이브러리(클립·저장한 표현·책갈피)가 브라우저에 저장돼 새로고침/재실행에도 유지됩니다.
- **GitHub Gist 동기화** — 우하단 ☁ 버튼에서 토큰을 연결하면 라이브러리가 비공개 Gist 에 백업되고 다른 기기와 동기화됩니다. (아래 "기기 간 동기화" 참고)
- **Capacitor 네이티브 래핑** — 같은 HTML 을 안드로이드 앱으로 패키징. `isNativeApp()` 으로 웹/네이티브 분기.
- **GitHub Pages 배포** — `deploy.sh` 가 `gh-pages` 브랜치로 푸시.
- **백엔드는 따로 호스팅** — listen-up 은 study-app 과 달리 서버(Anthropic·YouTube)가 필요. `API_BASE` 를 설정값으로 빼서 호스팅한 주소를 주입합니다.

> ⚠️ android/ · ios/ · www/ · node_modules/ 는 **로컬 생성물**이라 커밋하지 않습니다(.gitignore). 아래 명령을 **본인 PC**에서 실행하세요. (이 레포엔 설정·스크립트·문서만 들어 있습니다.)

---

## 0. 사전 준비
- Node.js 18+ / npm
- 안드로이드: **Android Studio** (SDK·에뮬레이터 포함)
- (선택) iOS: macOS + Xcode

## 1. 백엔드 호스팅 (먼저)
네이티브 앱·Pages 는 `localhost` 서버에 접근할 수 없으므로 백엔드를 한 곳에 올립니다.

**옵션 A — Render (블루프린트, 가장 쉬움)**
1. 이 레포를 Render 에 연결 → **New → Blueprint** (`render.yaml` 자동 인식)
2. `ANTHROPIC_API_KEY` (`sk-ant-...`) 입력
3. 배포되면 URL 확보 (예: `https://listen-up-api.onrender.com`)

**옵션 B — Docker 직접**
```bash
docker build -t listen-up-api .
docker run -p 3001:3001 -e ANTHROPIC_API_KEY=sk-ant-... listen-up-api
```
> 백엔드는 CORS 를 모든 출처에 허용하므로 Pages/네이티브에서 바로 호출됩니다. 운영 시에는 `server/server.js` 의 `cors()` 를 본인 도메인으로 제한하세요.

확보한 주소를 아래 `LISTENUP_API_BASE` 로 씁니다.

## 2. GitHub Pages 배포 (웹)
```bash
LISTENUP_API_BASE="https://listen-up-api.onrender.com" bash deploy.sh
```
- `listen-up.html` → `www/index.html` (백엔드 주소 주입) → `gh-pages` 브랜치 force-push
- **최초 1회**: 레포 **Settings → Pages → Source = gh-pages** 지정
- 결과: `https://<your-user>.github.io/listen-up/`

## 3. 안드로이드 앱 (Capacitor)
```bash
npm install                                              # Capacitor 설치
LISTENUP_API_BASE="https://listen-up-api.onrender.com" npm run build:www
npm run cap:add:android                                  # android/ 생성 (최초 1회)
npm run cap:open:android                                 # Android Studio 에서 빌드/실행
```
이후 코드 수정 → 반영:
```bash
LISTENUP_API_BASE="https://listen-up-api.onrender.com" npm run cap:sync
```
> iOS 는 macOS 에서 `npx cap add ios` → `npx cap open ios` (Xcode). 핵심 구조는 동일합니다.

---

## API_BASE 우선순위 (`listen-up.html` 의 `resolveApiBase()`)
1. `window.LISTEN_UP_API_BASE` — 빌드(`build-www.sh`)가 `LISTENUP_API_BASE` 로 주입
2. `localStorage["listen-up.apiBase"]` — 앱 안에서 런타임 변경
3. 기본값 — 서버가 직접 서빙하면 같은 출처(`""`), `file://`·네이티브면 개발용 `http://localhost:3001`

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
