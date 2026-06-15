// ╔══════════════════════════════════════════════════════════════════╗
// ║  자막(transcript) 추출 — youtube-transcript 래퍼                     ║
// ║   · 영어 트랙 우선(없으면 기본 트랙)                                  ║
// ║   · {text, duration(ms), offset(ms)} → {start, end, text}(초) 변환    ║
// ║   · 자막 없음/비활성 등은 호출부(서버 라우트)에서 [] 로 폴백 처리      ║
// ╚══════════════════════════════════════════════════════════════════╝
import { YoutubeTranscript } from "youtube-transcript";

const EN_LANGS = ["en", "en-US", "en-GB"];
const round2 = (n) => Math.round(n * 100) / 100;

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

// videoId(또는 URL)로 자막 세그먼트 배열을 반환. 자막이 전혀 없으면 throw.
export async function fetchTranscriptSegments(videoId) {
  let raw = null;

  // 1) 영어 트랙 우선 시도
  for (const lang of EN_LANGS) {
    try {
      raw = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      if (raw && raw.length) break;
    } catch {
      /* 다음 언어 시도 */
    }
  }

  // 2) 영어가 없으면 기본(첫) 트랙 — 여기서 못 찾으면 throw 됨
  if (!raw || !raw.length) {
    raw = await YoutubeTranscript.fetchTranscript(videoId);
  }

  const segs = raw
    .map((seg) => ({
      start: seg.offset / 1000,
      end: (seg.offset + seg.duration) / 1000,
      text: decode(seg.text),
    }))
    .filter((s) => s.text);
  return regroupSentences(segs);
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
