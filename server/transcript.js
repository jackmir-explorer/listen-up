// ╔══════════════════════════════════════════════════════════════════╗
// ║  자막(transcript) 추출                                               ║
// ║   1순위) youtubei.js getTranscript (안정적, 키리스)                  ║
// ║   2순위) youtube-transcript (폴백)                                   ║
// ║   · 영어 트랙 우선 → {start, end, text}(초) 로 정규화                 ║
// ║   · 자막 없음/실패는 호출부(서버 라우트)에서 [] 로 폴백 처리          ║
// ╚══════════════════════════════════════════════════════════════════╝
import { Innertube } from "youtubei.js";
import { YoutubeTranscript } from "youtube-transcript";

const EN_LANGS = ["en", "en-US", "en-GB"];
const round2 = (n) => Math.round(n * 100) / 100;

// Innertube 인스턴스 1회 생성 후 재사용.
let _yt;
const getYt = () => (_yt ??= Innertube.create());

// 흔한 HTML 엔티티 정리 (라이브러리가 대부분 처리하지만 안전망).
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

// 1순위) youtubei.js — getInfo → getTranscript. 영어 트랙 있으면 선택.
async function viaInnertube(videoId) {
  const yt = await getYt();
  const info = await yt.getInfo(videoId);
  let tr = await info.getTranscript();

  try {
    const langs = tr?.languages || [];
    const en = langs.find((l) => /english/i.test(l));
    if (en && en !== tr.selectedLanguage) tr = await tr.selectLanguage(en);
  } catch {
    /* 언어 선택 실패는 무시하고 기본 트랙 사용 */
  }

  const segments = tr?.transcript?.content?.body?.initial_segments || [];
  return segments
    .filter((g) => g && g.start_ms != null && g.snippet) // 섹션 헤더 등 제외
    .map((g) => {
      const start = Number(g.start_ms) / 1000;
      const end = Number(g.end_ms) / 1000;
      return {
        start,
        end: Number.isFinite(end) && end > start ? end : start,
        text: decode(g.snippet?.text ?? ""),
      };
    })
    .filter((s) => s.text && Number.isFinite(s.start));
}

// 2순위) youtube-transcript 폴백. 영어 우선, 없으면 기본 트랙(없으면 throw).
async function viaYoutubeTranscript(videoId) {
  let raw = null;
  for (const lang of EN_LANGS) {
    try {
      raw = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      if (raw && raw.length) break;
    } catch {
      /* 다음 언어 시도 */
    }
  }
  if (!raw || !raw.length) raw = await YoutubeTranscript.fetchTranscript(videoId);

  return raw
    .map((seg) => ({
      start: seg.offset / 1000,
      end: (seg.offset + seg.duration) / 1000,
      text: decode(seg.text),
    }))
    .filter((s) => s.text);
}

// videoId(또는 URL)로 자막 세그먼트 배열을 반환. 둘 다 실패하면 throw.
export async function fetchTranscriptSegments(videoId) {
  let segs = [];
  try {
    segs = await viaInnertube(videoId);
  } catch {
    /* youtubei.js 실패 → 폴백 */
  }
  if (!segs.length) segs = await viaYoutubeTranscript(videoId); // 실패 시 throw → 라우트가 [] 처리
  return regroupSentences(segs);
}

// 진단용: 두 추출 경로를 각각 돌려 결과/에러를 그대로 보여준다. (왜 자막이 안 뜨는지 파악)
export async function debugTranscript(videoId) {
  const result = { videoId, innertube: null, youtubeTranscript: null };
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

// 잘게 쪼개진 자막을 문장 단위로 합침: 문장부호(. ! ?)에서 끊되, 부호가 없으면
// 너무 길어지지 않게 ~14초/220자에서 끊는다. (구문 선택이 한 줄 안에서 되도록)
function regroupSentences(segs) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur) {
      const text = cur.text.replace(/\s+/g, " ").trim();
      if (text) out.push({ start: round2(cur.start), end: round2(cur.end), text });
    }
    cur = null;
  };
  for (const s of segs) {
    if (!cur) cur = { start: s.start, end: s.end, text: s.text };
    else { cur.end = s.end; cur.text += " " + s.text; }
    const t = cur.text.trim();
    const endsSentence = /[.!?]["'”’)\]]?$/.test(t);
    const tooLong = cur.end - cur.start >= 14 || t.length >= 220;
    if (endsSentence || tooLong) flush();
  }
  flush();
  return out;
}
