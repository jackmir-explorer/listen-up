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

// videoId(또는 URL)로 자막 세그먼트 반환. 모두 실패하면 throw.
export async function fetchTranscriptSegments(videoId) {
  let segs = [];
  try {
    segs = await viaInnertube(videoId);
  } catch {
    /* 폴백으로 */
  }
  if (!segs.length) segs = await viaYoutubeTranscript(videoId); // 실패 시 throw → 라우트가 [] 처리
  return regroupSentences(segs);
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

// 세그먼트를 단어 단위 타임스탬프로 펼친 뒤 문장부호(. ! ?) 기준으로 문장 단위로 묶는다.
// 문장부호가 없으면(자동 자막 등) 적당한 길이/시간에서 끊어 너무 길지 않게 한다.
function regroupSentences(segs) {
  // 1) 단어 단위로 펼치며 각 단어에 시간 부여(세그먼트 내 균등 분배)
  const words = [];
  for (const s of segs) {
    const ws = String(s.text).split(/\s+/).filter(Boolean);
    if (!ws.length) continue;
    const span = Math.max(0, (Number(s.end) || s.start) - s.start);
    ws.forEach((w, i) => words.push({ w, t: s.start + (ws.length > 1 ? (span * i) / ws.length : 0) }));
  }
  if (!words.length) return [];

  // 2) 단어를 모아 문장(또는 적당 길이) 단위로 flush
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
