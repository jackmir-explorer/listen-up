// ╔══════════════════════════════════════════════════════════════════╗
// ║  Listening Miner 백엔드 — analyze 엔드포인트                         ║
// ║                                                                    ║
// ║  POST /api/analyze   body: { text, type:"word"|"phrase"|"sentence" }║
// ║                       →    { ko, en, tag }                          ║
// ║    · tag 는 FUNCTION_TAGS 안의 값 또는 "" (구조화 출력 enum 으로 강제)║
// ║    · 태그 분류 기준은 functionTags.js 의 단어장 예시(SYSTEM_PROMPT)   ║
// ║    · ANTHROPIC_API_KEY 는 .env 에서만 읽음 (프런트에 절대 노출 안 됨) ║
// ╚══════════════════════════════════════════════════════════════════╝
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, OUTPUT_SCHEMA, TAG_SET } from "./functionTags.js";
import { fetchTranscriptSegments, debugTranscript } from "./transcript.js";
import { searchVideos, getVideoMeta, extractVideoId } from "./search.js";

// .env 를 이 파일 기준 절대경로로 로드 — 실행 위치(cwd)와 무관하게 동작.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const PORT = process.env.PORT || 3001;
// 어휘 뜻·태그 분석과 토픽 번역은 Haiku 로 충분 — Sonnet 대비 비용 약 1/5~1/10.
// 품질을 올리고 싶으면 이 한 줄만 "claude-sonnet-4-6" 으로.
const MODEL = "claude-haiku-4-5-20251001";

// API 키는 두 곳에서 받는다:
//   (1) 요청 헤더 x-anthropic-key — 앱 ⚙ 설정에서 입력 (권장; .env 불필요)
//   (2) 서버 .env 의 ANTHROPIC_API_KEY — 헤더가 없을 때 폴백
// 키가 없어도 서버는 정상 부팅하고, 분석 요청 시점에만 검사한다.
function resolveKey(req) {
  const h = req.header("x-anthropic-key");
  return ((h && h.trim()) || process.env.ANTHROPIC_API_KEY || "").trim();
}
function keyError(key) {
  if (!key) return "Anthropic API 키가 없습니다. 앱의 ⚙ 설정에서 키(sk-ant-…)를 입력하세요.";
  if (/[^\x00-\x7F]/.test(key)) return "API 키에 비-ASCII 문자(예: 한글)가 섞여 있습니다.";
  if (!key.startsWith("sk-ant-")) return "API 키 형식이 올바르지 않습니다 ('sk-ant-' 로 시작합니다).";
  return null;
}

const app = express();
app.use(cors()); // 로컬 개발용: 모든 출처 허용. 배포 시 origin 제한 권장.
app.use(express.json());

// 프런트(단일 HTML)를 같은 서버에서 제공 → 브라우저에서 http://localhost:3001/ 로 바로 실행.
// (프로젝트 루트의 listen-up.html 만 노출; server/ 의 다른 파일은 제공하지 않음)
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "..", "listen-up.html")));

const VALID_TYPES = new Set(["word", "phrase", "sentence"]);

// ── POST /api/analyze ─────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  const { text, type } = req.body || {};

  // 입력 검증
  if (typeof text !== "string" || !text.trim() || !VALID_TYPES.has(type)) {
    return res.status(400).json({
      error: 'body 는 { text:string, type:"word"|"phrase"|"sentence" } 형식이어야 합니다.',
    });
  }

  // 키 검증 (요청 헤더 또는 .env)
  const apiKey = resolveKey(req);
  const ke = keyError(apiKey);
  if (ke) { console.error("analyze 키 거부:", ke, "(헤더 키 길이:", (req.header("x-anthropic-key") || "").length, ")"); return res.status(401).json({ error: ke, ko: "", en: "", tag: "" }); }

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [
        { role: "user", content: `type: ${type}\nexpression: ${text.trim()}` },
      ],
    });

    // 구조화 출력은 첫 text 블록에 유효한 JSON 을 보장한다.
    const block = msg.content.find((b) => b.type === "text");
    if (!block) throw new Error("응답에 text 블록이 없습니다.");
    const parsed = JSON.parse(block.text);

    // 최종 방어선: 혹시라도 목록 밖 태그면 "" 로 보정.
    const tag = TAG_SET.has(parsed.tag) ? parsed.tag : "";

    return res.json({
      ko: typeof parsed.ko === "string" ? parsed.ko : "",
      en: typeof parsed.en === "string" ? parsed.en : "",
      tag,
    });
  } catch (err) {
    console.error("analyze 실패:", err?.message || err);
    // 프런트 analyze() 는 비-200 응답을 빈 값으로 폴백 처리한다.
    return res.status(502).json({ error: "analyze 실패", ko: "", en: "", tag: "" });
  }
});

// ── POST /api/transcript ──────────────────────────────────────────
// body: { videoId } → [{ start, end, text }]  (자막 없음/실패 시 [])
app.post("/api/transcript", async (req, res) => {
  const { videoId } = req.body || {};
  if (typeof videoId !== "string" || !videoId.trim()) {
    return res.status(400).json({ error: "body 는 { videoId:string } 형식이어야 합니다." });
  }
  try {
    // 사용자 키(헤더) 우선, 없으면 서버 공용 키(env SUPADATA_API_KEY — 선택) 폴백
    const supKey = (req.header("x-supadata-key") || "").trim() || (process.env.SUPADATA_API_KEY || "").trim();
    const anthKey = (() => { const k = resolveKey(req); return keyError(k) ? "" : k; })(); // 자동자막 문장부호 복원용(선택)
    const segments = await fetchTranscriptSegments(videoId.trim(), supKey, anthKey);
    return res.json(segments);
  } catch (err) {
    // 자막 비활성/없음/추출 실패 → 빈 배열 (프런트가 빈 대본 UI 로 처리)
    console.error("transcript 실패:", videoId, "-", err?.name || "", err?.message || err);
    return res.json([]);
  }
});

// ── POST /api/level-titles ────────────────────────────────────────
// body: { items:[{id,title,channel}] } → { levels:{ [id]:"A2"|"B1"|"B2"|"C1" } }
// 검색 결과의 듣기 난이도를 제목·채널로 대략 분류(Haiku·캐시). 키 없으면 빈 결과.
// (정밀 난이도는 클립 추가 시 프런트가 자막으로 실측 — WPM+문장 복잡도)
const LEVEL_MODEL = "claude-haiku-4-5-20251001";
const _levelCache = new Map();
const LEVELS_SCHEMA = {
  type: "object",
  properties: { levels: { type: "array", items: {
    type: "object",
    properties: { id: { type: "string" }, level: { type: "string", enum: ["A2", "B1", "B2", "C1"] } },
    required: ["id", "level"], additionalProperties: false } } },
  required: ["levels"], additionalProperties: false,
};
app.post("/api/level-titles", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 40) : [];
  const out = {};
  const todo = [];
  for (const it of items) {
    const id = String(it?.id || ""); if (!id) continue;
    if (_levelCache.has(id)) out[id] = _levelCache.get(id);
    else todo.push({ id, title: String(it.title || "").slice(0, 120), channel: String(it.channel || "").slice(0, 60) });
  }
  const apiKey = resolveKey(req);
  if (todo.length && !keyError(apiKey)) {
    try {
      const anthropic = new Anthropic({ apiKey });
      const msg = await anthropic.messages.create({
        model: LEVEL_MODEL,
        max_tokens: 2048,
        system:
          "Estimate the English listening difficulty (CEFR) of each YouTube video for language learners, using only its title and channel name. A2 = slow, simple learner content; B1 = clear everyday speech; B2 = natural native speed on general topics; C1 = fast, dense, or technical native content. Return a level for every id you were given.",
        output_config: { format: { type: "json_schema", schema: LEVELS_SCHEMA } },
        messages: [{ role: "user", content: JSON.stringify(todo) }],
      });
      const block = msg.content.find((b) => b.type === "text");
      const parsed = JSON.parse(block?.text || "{}");
      for (const l of parsed.levels || []) {
        if (l && l.id && ["A2", "B1", "B2", "C1"].includes(l.level)) { _levelCache.set(l.id, l.level); out[l.id] = l.level; }
      }
    } catch (e) {
      console.error("level-titles 실패:", e?.message || e);
    }
  }
  return res.json({ levels: out });
});

// 한글 토픽 → 영어 검색어. 결과 캐시. 키 없으면(또는 영어면) 원문 그대로.
// mode "study": 영어 학습 콘텐츠 쪽으로 번역 편향 / "general": 중립 번역(주제 그대로)
const _topicCache = new Map();
async function toEnglishTopics(topics, apiKey, mode = "study") {
  const out = [];
  const system = mode === "general"
    ? "Translate the Korean topic or search phrase into a short English YouTube search query (1-6 words). Reply with ONLY the query — no quotes, no punctuation, no explanation."
    : "Translate the Korean topic or search phrase into a short English YouTube search query (1-6 words) for finding English-language listening/learning videos. Reply with ONLY the query — no quotes, no punctuation, no explanation.";
  for (const ko of topics) {
    if (!/[가-힣]/.test(ko)) { out.push(ko); continue; } // 한글 없으면 그대로
    const ck = mode + ":" + ko;
    if (_topicCache.has(ck)) { out.push(_topicCache.get(ck)); continue; }
    if (keyError(apiKey)) { out.push(ko); continue; }            // 키 없으면 번역 불가 → 원문
    try {
      const anthropic = new Anthropic({ apiKey });
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 60,
        system,
        messages: [{ role: "user", content: ko }],
      });
      const en = (msg.content.find((b) => b.type === "text")?.text || "").trim().replace(/^["'\s]+|["'\s]+$/g, "");
      const val = en || ko;
      _topicCache.set(ck, val);
      out.push(val);
    } catch (e) {
      console.error("topic 번역 실패:", ko, "-", e?.message || e);
      out.push(ko);
    }
  }
  return out;
}

// ── POST /api/search ──────────────────────────────────────────────
// body: { minSec, maxSec, level, topics[], page }
// 응답: NDJSON 스트림 — 결과 1건당 한 줄({...}\n). 검색되는 대로 즉시 흘려보내
//       프런트가 오는 대로 화면에 추가한다(체감 속도 개선).
app.post("/api/search", async (req, res) => {
  const f = req.body || {};
  const topics = Array.isArray(f.topics) ? f.topics : [];
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no"); // 프록시(예: Render) 버퍼링 방지
  try {
    const key = resolveKey(req);
    const q = typeof f.q === "string" ? f.q.trim() : "";
    const mode = f.mode === "general" ? "general" : "study"; // 학습 중심(기본) | 일반·전체
    // 한글 검색어·토픽을 영어로 (캐시됨 — 같은 입력은 재번역 안 함)
    const [qEn] = q ? await toEnglishTopics([q], key, mode) : [""];
    const topicsEn = await toEnglishTopics(topics, key, mode);
    await searchVideos(
      {
        q: qEn,
        minSec: Number(f.minSec) || 0,
        maxSec: Number(f.maxSec) || 36000,
        level: Number.isInteger(f.level) ? f.level : 2,
        topics,        // 원본(표시용)
        topicsEn,      // 영어(검색용)
        sort: typeof f.sort === "string" ? f.sort : "relevance",
        mode,
        page: Number(f.page) || 0,
      },
      (item) => res.write(JSON.stringify(item) + "\n") // 결과 1건 → 한 줄 즉시 전송
    );
    res.end();
  } catch (err) {
    console.error("search 실패:", err?.name || "", err?.message || err);
    res.end(); // 빈 스트림 → 프런트가 "결과 없음" 처리
  }
});

// ── POST /api/import ──────────────────────────────────────────────
// body: { url } → { id, title, channel, level, topics, total }  (URL/ID 로 직접 가져오기)
app.post("/api/import", async (req, res) => {
  const { url } = req.body || {};
  if (typeof url !== "string" || !url.trim()) {
    return res.status(400).json({ error: "body 는 { url:string } 형식이어야 합니다." });
  }
  try {
    const meta = await getVideoMeta(url.trim());
    if (!meta) return res.status(404).json({ error: "유효한 YouTube 링크/ID 가 아닙니다." });
    return res.json(meta);
  } catch (err) {
    console.error("import 실패:", url, "-", err?.message || err);
    return res.status(502).json({ error: "영상 정보를 가져오지 못했습니다." });
  }
});

// 헬스 체크 (선택) — 서버가 떴는지 빠르게 확인용.
// 자막 진단: GET /api/transcript-debug?videoId=<id 또는 URL>  (두 추출 경로 결과/에러 표시)
app.get("/api/transcript-debug", async (req, res) => {
  const id = extractVideoId(req.query.videoId || req.query.id || "");
  if (!id) return res.status(400).json({ error: "?videoId=<영상 ID 또는 URL> 가 필요합니다." });
  try {
    res.json(await debugTranscript(id));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// 헬스 체크 + 배포 확인: Render 가 주입하는 커밋/브랜치로 "지금 어떤 코드가 떠 있는지" 확인 가능.
const BOOT_AT = new Date().toISOString();
app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    model: MODEL,
    commit: process.env.RENDER_GIT_COMMIT || null,
    branch: process.env.RENDER_GIT_BRANCH || null,
    bootAt: BOOT_AT,
  })
);

app.listen(PORT, () => {
  const src = process.env.ANTHROPIC_API_KEY ? ".env 키 사용" : "키는 앱 ⚙ 설정에서 입력";
  console.log(`✔ 서버 실행 중 → http://localhost:${PORT}  (model: ${MODEL}, ${src})`);
});
