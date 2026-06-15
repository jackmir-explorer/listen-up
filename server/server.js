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
import { fetchTranscriptSegments } from "./transcript.js";
import { searchVideos, getVideoMeta } from "./search.js";

// .env 를 이 파일 기준 절대경로로 로드 — 실행 위치(cwd)와 무관하게 동작.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const PORT = process.env.PORT || 3001;
const MODEL = "claude-sonnet-4-6"; // 요청하신 sonnet 계열. 바꾸려면 이 한 줄만 수정.

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
  if (ke) return res.status(401).json({ error: ke, ko: "", en: "", tag: "" });

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
    const segments = await fetchTranscriptSegments(videoId.trim());
    return res.json(segments);
  } catch (err) {
    // 자막 비활성/없음/추출 실패 → 빈 배열 (프런트가 빈 대본 UI 로 처리)
    console.error("transcript 실패:", videoId, "-", err?.name || "", err?.message || err);
    return res.json([]);
  }
});

// ── POST /api/search ──────────────────────────────────────────────
// body: { minSec, maxSec, maxLevel, topics[] } → [{ id, title, channel, level, topics, total }]
app.post("/api/search", async (req, res) => {
  const f = req.body || {};
  try {
    const results = await searchVideos({
      minSec: Number(f.minSec) || 0,
      maxSec: Number(f.maxSec) || 36000,
      level: Number.isInteger(f.level) ? f.level : 2,
      topics: Array.isArray(f.topics) ? f.topics : [],
    });
    return res.json(results);
  } catch (err) {
    console.error("search 실패:", err?.name || "", err?.message || err);
    return res.json([]); // 실패 시 빈 배열 (프런트가 "결과 없음" 처리)
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
app.get("/health", (_req, res) => res.json({ ok: true, model: MODEL }));

app.listen(PORT, () => {
  const src = process.env.ANTHROPIC_API_KEY ? ".env 키 사용" : "키는 앱 ⚙ 설정에서 입력";
  console.log(`✔ 서버 실행 중 → http://localhost:${PORT}  (model: ${MODEL}, ${src})`);
});
