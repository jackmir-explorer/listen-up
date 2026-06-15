# Listening Miner — 백엔드

영어 듣기 학습 웹앱 `listen-up.html`의 백엔드입니다.
현재 **`POST /api/analyze`** (표현 분석), **`POST /api/transcript`** (자막), **`POST /api/search`** (검색), **`POST /api/import`** (링크로 직접 추가)가 구현돼 있고, 프런트의 **YouTube IFrame 플레이어**(학습·복습 모두 실제 재생)도 연결됐습니다.

## 무엇을 하나요?

표현 하나를 받아 Anthropic Claude API로 분석해 한국어 뜻·영어 정의·기능 태그를 돌려줍니다.

```
POST /api/analyze
요청  { "text": "look forward to", "type": "phrase" }
응답  { "ko": "~을 고대하다", "en": "to anticipate with pleasure", "tag": "부탁·바람" }
```

- `type` 은 `"word" | "phrase" | "sentence"` 중 하나.
- `tag` 는 `listen-up.html` 의 `FUNCTION_TAGS` 안에 있는 값, 또는 해당 없으면 빈 문자열 `""`.
  (시스템 프롬프트 + 구조화 출력 enum + 서버 검증의 3중 장치로 목록 밖 값이 나오지 않도록 강제)
- 어떤 태그를 고를지는 사용자 **단어장(xlsx)에서 뽑은 태그별 예시**(`functionTags.js` 의 `TAG_EXAMPLES`)를 기준으로 분류합니다. 모델이 이 예시에 빗대어 새 표현을 분류합니다.

## 자막 (POST /api/transcript)

영상 자막을 추출해 시간정보와 함께 돌려줍니다.

```
POST /api/transcript
요청  { "videoId": "dQw4w9WgXcQ" }   // 영상 ID 또는 URL
응답  [ { "start": 18.64, "end": 21.88, "text": "We're no strangers to love" }, ... ]
```

- `youtube-transcript` 라이브러리로 추출하며, **영어 트랙 우선**(없으면 기본 트랙), 밀리초→초 변환. 잘게 쪼개진 자동 자막은 **문장 단위로 병합**(구문 선택이 한 줄 안에서 되도록)해 반환합니다.
- 한계: YouTube 공식 자막 API가 아니라 **비공식 추출**입니다. 자막이 없거나 비활성/추출 실패 시 **`[]`** 를 반환하고, 프런트는 빈 대본 UI로 처리합니다.

## 검색 (POST /api/search)

조건에 맞는 영어 듣기 영상을 찾아 줍니다. **YouTube Data API 키 없이** `youtubei.js`(키리스)로 검색합니다.

```
POST /api/search
요청  { "minSec": 0, "maxSec": 7200, "level": 2, "topics": ["여행"] }   // level 0(입문)~4(고급)
응답  [ { "id": "...", "title": "...", "channel": "...", "level": "A2", "topics": ["여행"], "total": 252 }, ... ]
```

- 한국어 토픽을 영어로 번역해 **일반 콘텐츠**를 검색합니다(여행→travel 등; ESL 강의 전용이 아님). 토픽이 없으면 일반 영어 콘텐츠.
- **난이도(`level` 0~4)는 결과를 거르는 필터가 아니라 검색어 편향**입니다(YouTube가 CEFR를 안 주므로). 0(입문)=느리고 쉬운 영어, 2(중급)=일반, 4(고급)=원어민 강의·심화. 응답의 `level`(A2/B1…)은 제목에 표기가 있을 때만 채워지는 배지용 보너스.
- **ASMR·음악·수면·노이즈 등 무발화 콘텐츠는 제외**합니다(듣기 학습 대상이 아니므로).
- `total`(초)로 길이 필터(minSec~maxSec)를 적용합니다. 실제 듣기 영상은 대체로 길어서 프런트 길이 슬라이더를 최대 180분까지 넓혀 두었습니다.
- 비공식 검색이라 실패 시 **`[]`** 를 반환합니다.

## 링크로 추가 (POST /api/import)

검색 대신 **특정 영상을 직접** 가져옵니다. 검색 화면 상단 "링크로 추가"에 URL/ID를 넣으면 호출됩니다.

```
POST /api/import
요청  { "url": "https://www.youtube.com/watch?v=..." }   // 링크 또는 11자리 ID
응답  { "id": "...", "title": "...", "channel": "...", "level": "", "topics": [], "total": 213 }
```

- `youtubei.js` 로 영상 메타데이터(제목·채널·길이)를 가져옵니다. 키 불필요.
- 반환 모양이 검색 결과와 같아, 프런트는 검색 추가와 동일한 흐름(자막 로드 → 학습)으로 처리합니다.

## 사전 준비

- **Node.js 18.18 이상** (`node -v` 로 확인)
- **Anthropic API 키** — https://console.anthropic.com 의 *API Keys* 에서 발급 (`sk-ant-...`)

## 설치

`server/` 폴더에서:

```bash
npm install
```

> 최신 SDK를 원하면: `npm install @anthropic-ai/sdk@latest`

## .env 설정

`server/.env.example` 을 복사해 `server/.env` 를 만들고 키를 채웁니다.

```bash
# macOS / Linux
cp .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

그런 다음 `.env` 를 열어 본인 키를 넣습니다:

```
ANTHROPIC_API_KEY=sk-ant-실제-키-값
PORT=3001
```

- `.env` 는 `.gitignore` 에 들어 있어 커밋되지 않습니다. **키를 절대 git/프런트에 올리지 마세요.**
- 키는 서버에서만 읽히고, 브라우저는 이 서버(`/api/analyze`)만 호출하므로 키가 노출되지 않습니다.

## 실행

```bash
npm start
```

성공하면 다음과 같이 출력됩니다:

```
✔ analyze 서버 실행 중 → http://localhost:3001  (model: claude-sonnet-4-6)
```

개발 중 자동 재시작을 원하면: `npm run dev`

## 동작 확인 (서버만 단독 테스트)

다른 터미널에서:

```bash
# 헬스 체크
curl http://localhost:3001/health

# analyze 호출
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"inevitable\",\"type\":\"word\"}"

# transcript 호출 (영상 ID)
curl -X POST http://localhost:3001/api/transcript \
  -H "Content-Type: application/json" \
  -d "{\"videoId\":\"dQw4w9WgXcQ\"}"

# search 호출
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d "{\"minSec\":0,\"maxSec\":7200,\"maxLevel\":\"C1\",\"topics\":[\"여행\"]}"
```

`{ "ko": "...", "en": "...", "tag": "..." }` 가 돌아오면 성공입니다.

## 프런트엔드 연결 (완료)

서버가 `listen-up.html` 도 직접 제공하므로, 브라우저 주소창에 **http://localhost:3001/** 만 입력하면 앱이 실행됩니다 (별도 정적 서버 불필요·같은 출처라 CORS 무관). 프런트의 `USE_BACKEND` 는 이미 `true` 라 분석·검색·자막이 이 서버를 호출합니다. (mock 으로 되돌리려면 `false`.)

```js
const USE_BACKEND = true;
const API_BASE    = "http://localhost:3001";  // 위 포트와 일치
```

## 참고 / 주의

- **모델 변경:** `server.js` 의 `MODEL` 상수 한 줄만 바꾸면 됩니다 (예: `claude-opus-4-8`).
- **태그 동기화:** `server/functionTags.js` 는 `listen-up.html` 의 `FUNCTION_TAGS` 사본입니다.
  한쪽을 수정하면 **반드시 다른 쪽도** 똑같이 맞추세요.
- **태그 분류 조정:** 특정 표현이 원하는 태그로 안 나오면 `functionTags.js` 의 `TAG_EXAMPLES` 에서 해당 태그에 그 표현(또는 비슷한 예)을 추가하세요. 모델이 예시 기준으로 분류하므로 바로 반영됩니다(서버 재시작 필요).
- **end-to-end:** 검색 → "+ 추가" 시 실제 영상 ID로 자막을 받아 학습 화면에서 진짜 대본이 뜹니다. (라이브러리의 초기 mock 클립은 ID가 가짜라 자막이 비어 보일 수 있음 — 검색으로 추가한 클립을 쓰세요.) 재생도 YouTube IFrame 플레이어로 학습·복습 모두 실제 영상이 재생됩니다.
- **검색 한계:** 자막이 없는 영상을 추가하면 대본이 비어 보입니다. 또 키리스 검색이라 YouTube 내부 변경 시 깨질 수 있습니다.
- **CORS:** 지금은 로컬 개발용으로 모든 출처를 허용합니다. 배포 시에는 허용 origin 을 제한하세요.
