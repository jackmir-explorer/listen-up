# Listening Miner (listen-up)

YouTube 로 배우는 영어 듣기 학습 앱.
영상을 듣다가 모르는 단어·구문을 **탭 한 번으로 채굴**하고, **받아쓰기**로 귀를 훈련하고, **간격 반복(SRS)** 으로 복습합니다.

**▶ 바로 쓰기:** https://jackmir-explorer.github.io/listen-up/ (폰에서 "홈 화면에 추가"하면 앱처럼 설치됩니다)

## 기능

| 기능 | 설명 |
|---|---|
| 🔍 콘텐츠 검색 | 주제(한글 가능)·길이·난이도로 자막 있는 영상 검색 — 결과 스트리밍 표시 |
| 🔗 링크로 추가 | YouTube 링크/ID 붙여넣기로 바로 추가 |
| ⛏️ 어휘 채굴 | 대본의 단어 탭 → 뜻·영영정의·기능태그 자동 분석 (Claude) |
| ✍️ 받아쓰기 | 문장 듣고 타이핑 → 단어 단위 채점·정확도 |
| 🔁 복습 (SRS) | 간격 반복 + 능동 인출 (표현 먼저 → 맥락 듣기 → 정답) |
| 📊 학습 통계 | 연속 학습일(스트릭)·듣기 시간·복습·받아쓰기 횟수 |
| ☁️ 기기 간 동기화 | GitHub Gist 로 라이브러리 백업·동기화 |
| 📱 PWA | 홈 화면 설치·오프라인 셸·다크 모드 |

## 구조

```
listen-up.html      프런트엔드 전부 (단일 파일 · React 18 + Babel standalone)
manifest.webmanifest· sw.js · icons/   PWA (설치·오프라인)
server/             백엔드 (Node/Express)
  server.js           /api/analyze·search·transcript·import·/health
  search.js           youtubei.js 키리스 검색 (CC 필터·NDJSON 스트리밍)
  transcript.js       자막: Supadata API → innertube → youtube-transcript
  functionTags.js     기능태그 프리셋 + Claude 구조화 출력 스키마
scripts/build-www.js  listen-up.html → www/ (Pages·Capacitor 공용 빌드)
.github/workflows/pages.yml  main 푸시 → GitHub Pages 자동 배포
render.yaml · Dockerfile     백엔드 호스팅 (Render 등)
```

## 실행·배포

**프런트 (GitHub Pages):** `main` 에 푸시하면 자동 배포. 로컬 미리보기는 `node scripts/build-www.js` 후 `www/` 를 정적 서빙.

**백엔드 (Render):** `render.yaml` 블루프린트로 배포. 비밀키가 서버에 없어도 부팅됩니다 — 키는 전부 앱에서 헤더로 전달.

**API 키 (앱 ⚙ 설정에 입력 — 코드·서버에 저장 안 됨):**
- **Anthropic** (`sk-ant-…`) — 어휘 뜻·태그 분석용. [발급](https://console.anthropic.com/settings/keys)
- **Supadata** — 클라우드 백엔드에서 자막 추출용 (무료 월 100건). [발급](https://supadata.ai)
- **GitHub PAT** (`gist` 권한) — 기기 간 동기화용 (선택)

앱 ⚙ 설정 → "백엔드 서버 주소"에 Render 주소를 넣으면 연결 완료.

> 💡 Render 무료 플랜은 유휴 시 잠들어 첫 요청이 30~50초 걸릴 수 있습니다.
> 앱이 시작 시 `/health` 로 웜업 핑을 보내지만, 상시 대기가 필요하면
> [UptimeRobot](https://uptimerobot.com) 같은 무료 모니터로 `/health` 를 5분마다 핑하세요.

**모바일 네이티브 (Capacitor):** [MOBILE.md](MOBILE.md) 참고.

## 로컬 개발

```bash
cd server && npm install && npm start   # http://localhost:3001 (프런트도 같이 서빙)
```
