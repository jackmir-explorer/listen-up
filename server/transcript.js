// ╔══════════════════════════════════════════════════════════════════╗
// ║  자막(transcript) 추출                                               ║
// ║   1) caption track baseUrl(json3) 직접 fetch (가장 견고)             ║
// ║   2) youtubei.js get_transcript                                      ║
// ║   3) youtube-transcript (폴백)                                       ║
// ║   · 영어 트랙 우선 → {start, end, text}(초)                          ║
// ║   · 모두 실패 시 호출부(라우트)에서 [] 폴백                          ║
// ╚══════════════════════════════════════════════════════════════════╝
import { Innertube } from "youtubei.js";
import { YoutubeTranscript } from "youtube-transcript";
import Anthropic from "@anthropic-ai/sdk";

const EN_LANGS = ["en", "en-US", "en-GB"];
const round2 = (n) => Math.round(n * 100) / 100;

let _yt;
const getYt = () => (_yt ??= Innertube.create());

function decode(s) {
  return String(s)
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// 영어 트랙 우선(수동 자막 > 자동(asr)), 없으면 수동 아무거나, 그래도 없으면 첫 트랙.
function pickEnglishTrack(tracks) {
  if (!tracks || !tracks.length) return null;
  const en = tracks.filter((t) => /^en/i.test(t.language_code || ""));
  return en.find((t) => t.kind !== "asr") || en[0] || tracks.find((t) => t.kind !== "asr") || tracks[0];
}

// timedtext base_url 을 json3 로 받아 세그먼트로 변환.
async function fetchCaptionTrack(baseUrl) {
  const url = baseUrl + (baseUrl.includes("fmt=") ? "" : "&fmt=json3");
  const res = await fetch(url);
  if (!res.ok) throw new Error("timedtext " + res.status);
  const data = await res.json();
  const out = [];
  for (const e of data.events || []) {
    if (!e.segs) continue;
    const text = decode(e.segs.map((s) => s.utf8 || "").join(""));
    if (!text) continue;
    const start = (e.tStartMs || 0) / 1000;
    const end = (e.tStartMs + (e.dDurationMs || 0)) / 1000;
    out.push({ start, end: end > start ? end : start, text });
  }
  return out;
}

// 1+2) youtubei.js 경로: caption baseUrl 직접 → 실패 시 get_transcript.
async function viaInnertube(videoId) {
  const yt = await getYt();
  const info = await yt.getInfo(videoId);

  // 1) caption track baseUrl(json3) 직접
  try {
    const track = pickEnglishTrack(info?.captions?.caption_tracks || []);
    if (track?.base_url) {
      const segs = await fetchCaptionTrack(track.base_url);
      if (segs.length) return segs;
    }
  } catch {
    /* baseUrl 실패 → get_transcript 시도 */
  }

  // 2) get_transcript
  let tr = await info.getTranscript();
  try {
    const langs = tr?.languages || [];
    const en = langs.find((l) => /english/i.test(l));
    if (en && en !== tr.selectedLanguage) tr = await tr.selectLanguage(en);
  } catch {
    /* 언어 선택 실패는 무시 */
  }
  const segments = tr?.transcript?.content?.body?.initial_segments || [];
  return segments
    .filter((g) => g && g.start_ms != null && g.snippet)
    .map((g) => {
      const start = Number(g.start_ms) / 1000;
      const end = Number(g.end_ms) / 1000;
      return { start, end: Number.isFinite(end) && end > start ? end : start, text: decode(g.snippet?.text ?? "") };
    })
    .filter((s) => s.text && Number.isFinite(s.start));
}

// 3) youtube-transcript 폴백.
async function viaYoutubeTranscript(videoId) {
  let raw = null;
  for (const lang of EN_LANGS) {
    try {
      raw = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      if (raw && raw.length) break;
    } catch {
      /* 다음 언어 */
    }
  }
  if (!raw || !raw.length) raw = await YoutubeTranscript.fetchTranscript(videoId);
  return raw
    .map((seg) => ({ start: seg.offset / 1000, end: (seg.offset + seg.duration) / 1000, text: decode(seg.text) }))
    .filter((s) => s.text);
}

// 0) Supadata 자막 API — 클라우드(데이터센터 IP)에서도 동작하는 서비스.
// 키는 요청 헤더(x-supadata-key)로만 전달되며, text=false 면 타임스탬프 세그먼트를 준다.
async function viaSupadata(videoId, apiKey) {
  const url =
    "https://api.supadata.ai/v1/transcript?text=false&lang=en&url=" +
    encodeURIComponent("https://www.youtube.com/watch?v=" + videoId);
  const res = await fetch(url, { headers: { "x-api-key": apiKey } });
  let data = await res.json().catch(() => ({}));
  // 비동기 처리(202): jobId 로 잠깐 폴링.
  if (res.status === 202 && data.jobId) {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const j = await fetch("https://api.supadata.ai/v1/transcript/" + data.jobId, {
        headers: { "x-api-key": apiKey },
      });
      const jd = await j.json().catch(() => ({}));
      if (jd.status === "completed") { data = jd; break; }
      if (jd.status === "failed") throw new Error("supadata job failed");
    }
  } else if (!res.ok) {
    throw new Error("supadata " + res.status + " " + (data.error || data.message || ""));
  }
  const content = Array.isArray(data.content) ? data.content : [];
  return content
    .map((c) => {
      const start = Number(c.offset) / 1000;
      const end = start + Number(c.duration || 0) / 1000;
      return { start, end: end > start ? end : start, text: decode(c.text || "") };
    })
    .filter((s) => s.text && Number.isFinite(s.start));
}

// videoId(또는 URL)로 자막 세그먼트 반환. supKey 가 있으면 Supadata 를 먼저 시도.
// anthKey 가 있으면 문장부호 없는 자동자막을 LLM 으로 복원해 문장 단위로 끊는다.
// 모두 실패하면 throw → 라우트가 [] 처리.
export async function fetchTranscriptSegments(videoId, supKey, anthKey) {
  let segs = [];
  // 0) Supadata (키 있을 때) — 클라우드 백엔드에서도 자막을 받는 경로
  if (supKey) {
    try {
      segs = await viaSupadata(videoId, supKey);
    } catch (e) {
      console.error("supadata 실패:", videoId, "-", e?.message || e);
    }
  }
  // 1) youtubei.js (주거망 IP, 예: PC 터널)
  if (!segs.length) {
    try {
      segs = await viaInnertube(videoId);
    } catch {
      /* 폴백으로 */
    }
  }
  if (!segs.length) segs = await viaYoutubeTranscript(videoId); // 실패 시 throw → 라우트가 [] 처리
  return regroupSmart(segs, anthKey);
}

// 진단용: 자막 트랙 가시성 + 세 경로 결과/에러를 그대로 보여준다.
export async function debugTranscript(videoId) {
  const result = { videoId, captionTracks: null, innertube: null, youtubeTranscript: null };
  try {
    const yt = await getYt();
    const info = await yt.getInfo(videoId);
    const tracks = info?.captions?.caption_tracks || [];
    result.captionTracks = tracks.map((t) => ({
      lang: t.language_code,
      kind: t.kind || "manual",
      name: t.name?.text || "",
    }));
  } catch (e) {
    result.captionTracks = { error: String(e?.message || e) };
  }
  try {
    const segs = await viaInnertube(videoId);
    result.innertube = { ok: true, count: segs.length, sample: segs.slice(0, 2) };
  } catch (e) {
    result.innertube = { ok: false, error: String(e?.message || e) };
  }
  try {
    const segs = await viaYoutubeTranscript(videoId);
    result.youtubeTranscript = { ok: true, count: segs.length, sample: segs.slice(0, 2) };
  } catch (e) {
    result.youtubeTranscript = { ok: false, error: String(e?.message || e) };
  }
  return result;
}

// 흔한 약어 — 뒤 마침표를 문장 끝으로 오인하지 않도록 제외.
const ABBR = /(?:^|\b)(mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|a\.m|p\.m|u\.s|u\.k)\.?$/i;
function isSentenceEnd(word) {
  if (!/[.!?]["'”’)\]]*$/.test(word)) return false;
  const core = word.replace(/["'”’)\]]*$/, "");
  if (/^\d+\.$/.test(core)) return false; // 숫자. (소수·번호)
  if (ABBR.test(core)) return false;      // 약어
  return true;
}

// 세그먼트 → 단어 스트림 [{w,t}] (세그먼트 안에서 시간을 균등 분배해 단어별 시각 부여)
function explodeWords(segs) {
  const words = [];
  for (const s of segs) {
    const ws = String(s.text).split(/\s+/).filter(Boolean);
    if (!ws.length) continue;
    const span = Math.max(0, (Number(s.end) || s.start) - s.start);
    ws.forEach((w, i) => words.push({ w, t: s.start + (ws.length > 1 ? (span * i) / ws.length : 0) }));
  }
  return words;
}

// 단어 스트림 → 문장 세그먼트 (문장부호 . ! ? 기준 + 길이/시간 상한)
function regroupFromWords(words) {
  if (!words.length) return [];
  const out = [];
  let buf = [];
  let startT = words[0].t;
  const flush = (endT) => {
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    if (text) out.push({ start: round2(startT), end: round2(endT), text });
    buf = [];
  };
  for (let i = 0; i < words.length; i++) {
    const { w, t } = words[i];
    if (!buf.length) startT = t;
    buf.push(w);
    const len = buf.reduce((n, x) => n + x.length + 1, 0);
    const dur = t - startT;
    const nextT = i + 1 < words.length ? words[i + 1].t : t;
    const clause = /[,;:]["'”’)\]]*$/.test(w);
    // 우선순위: 문장 끝 → (길면)절 끊기 → 강제 한도
    if (isSentenceEnd(w) || (len >= 100 && clause) || len >= 150 || dur >= 11) {
      flush(nextT);
    }
  }
  if (buf.length) flush(words[words.length - 1].t);
  return out;
}

// 문장부호가 거의 없는 자동자막: 침묵(단어 간 시간 간격) 기준으로 끊기 (키 없을 때 폴백)
function regroupByPause(words) {
  if (!words.length) return [];
  const out = [];
  let buf = [];
  let startT = words[0].t;
  const flush = (endT) => {
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    if (text) out.push({ start: round2(startT), end: round2(endT), text });
    buf = [];
  };
  for (let i = 0; i < words.length; i++) {
    const { w, t } = words[i];
    if (!buf.length) startT = t;
    buf.push(w);
    const len = buf.reduce((n, x) => n + x.length + 1, 0);
    const nextT = i + 1 < words.length ? words[i + 1].t : t;
    const gap = nextT - t; // 다음 단어까지의 간격 — 크면 호흡/문장 경계일 확률 높음
    if ((gap >= 0.9 && len >= 24) || len >= 140 || t - startT >= 10) flush(nextT);
  }
  if (buf.length) flush(words[words.length - 1].t);
  return out;
}

// LLM 문장부호 복원 (자동자막용): 단어는 그대로 두고 부호·대소문자만 고치게 한 뒤,
// 원 단어열과 정렬해 타임스탬프를 유지한다. 정렬 실패율이 높으면 throw → 호출부가 폴백.
const PUNCT_MODEL = "claude-haiku-4-5-20251001"; // 부호 복원은 저렴·빠른 모델로 충분
async function punctuateWords(words, apiKey) {
  const anthropic = new Anthropic({ apiKey });
  const CHUNK = 700; // 단어 단위 청크 (10분 영상 ≈ 2~3청크, 병렬 처리)
  const chunks = [];
  for (let s = 0; s < words.length; s += CHUNK) chunks.push(words.slice(s, s + CHUNK));
  const texts = await Promise.all(chunks.map(async (part) => {
    const msg = await anthropic.messages.create({
      model: PUNCT_MODEL,
      max_tokens: 4096,
      system:
        "Restore punctuation and capitalization in this raw speech transcript. Keep every word exactly as given, in the same order — do not add, remove, translate, or rephrase any word. Only insert punctuation marks and fix letter casing. Reply with the corrected text only.",
      messages: [{ role: "user", content: part.map((x) => x.w).join(" ") }],
    });
    return msg.content.find((b) => b.type === "text")?.text || "";
  }));
  const fixed = texts.join(" ").split(/\s+/).filter(Boolean);
  // 원 단어열과 정렬: 부호 제거·소문자화 후 비교, 어긋나면 앞쪽 4토큰 창에서 재동기화
  const norm = (w) => w.toLowerCase().replace(/[^a-z0-9']/g, "");
  const out = [];
  let j = 0, matched = 0;
  for (let i = 0; i < words.length; i++) {
    const target = norm(words[i].w);
    let pick = words[i].w;
    if (target) for (let k = 0; k < 4 && j + k < fixed.length; k++) {
      if (norm(fixed[j + k]) === target) { pick = fixed[j + k]; j += k + 1; matched++; break; }
    }
    out.push({ w: pick, t: words[i].t });
  }
  if (matched < words.length * 0.8) throw new Error("단어 정렬 실패 (" + matched + "/" + words.length + ")");
  return out;
}

// 대본 정리 진입점: 문장부호가 충분하면 그대로 문장 단위로 끊고,
// 없으면(자동자막) LLM 부호 복원 → 실패·키 없음이면 침묵 기준으로 끊는다.
async function regroupSmart(segs, anthKey) {
  const words = explodeWords(segs);
  if (!words.length) return [];
  const enders = words.filter((x) => /[.!?]["'”’)\]]*$/.test(x.w)).length;
  if (enders / words.length >= 0.02) return regroupFromWords(words); // 100단어당 2개↑ = 부호 신뢰
  if (anthKey) {
    try {
      return regroupFromWords(await punctuateWords(words, anthKey));
    } catch (e) {
      console.error("문장부호 복원 실패(침묵 기준으로 폴백):", e?.message || e);
    }
  }
  return regroupByPause(words);
}
