// ╔══════════════════════════════════════════════════════════════════╗
// ║  검색(search) — youtubei.js 키리스 검색                              ║
// ║   · 한국어 토픽 → 영어 검색어로 번역해 "영어 듣기" 콘텐츠를 찾음       ║
// ║   · 결과 → { id, title, channel, level, topics, total }              ║
// ║   · level(CEFR)은 YouTube가 안 주므로 제목에서 추정(휴리스틱)         ║
// ╚══════════════════════════════════════════════════════════════════╝
import { Innertube } from "youtubei.js";

// Innertube 인스턴스는 생성 비용이 있으니 1회만 만들고 재사용.
let _ytPromise;
const getYt = () => (_ytPromise ??= Innertube.create({ retrieve_player: false }));

// 프런트의 한국어 토픽 → 영어 검색어 (알려진 토픽 매핑; 그 외는 그대로)
const TOPIC_EN = {
  "여행": "travel",
  "과학": "science",
  "일상": "daily life",
  "심리": "psychology",
  "자연·환경": "nature",
  "요리": "cooking",
};

const LEVELS = ["A2", "B1", "B2", "C1"];

// 제목에서 CEFR 레벨 추정 — 영어학습 영상은 제목에 레벨이 자주 박혀 있음.
function guessLevel(title) {
  const t = " " + title.toLowerCase() + " ";
  if (/\bc1\b|\bc2\b|advanced/.test(t)) return "C1";
  if (/\bb2\b|upper.?intermediate/.test(t)) return "B2";
  if (/\bb1\b|intermediate/.test(t)) return "B1";
  if (/\ba1\b|\ba2\b|beginner|elementary|\beasy\b|basic/.test(t)) return "A2";
  return ""; // 모름 → 필터에서 제외하지 않고 통과시킴
}

// 무발화/이완 콘텐츠(난이도와 무관하게 듣기 학습 대상이 아님) — 결과에서 제외.
const NOSPEECH = /asmr|lo-?fi|white noise|brown noise|pink noise|nature sounds?|ocean sounds?|forest sounds?|rain (sounds?|ambience)|relaxing music|sleep music|study music|calm(ing)? music|ambient music|meditation music|piano music|\binstrumental\b|no talking|no commentary|music to (study|sleep|relax|work)/i;

// 난이도(0~4) → 검색어 편향. 낮을수록 쉽고 느린 영어, 높을수록 복잡한 원어민 콘텐츠.
// (정확한 CEFR 측정은 불가하므로 "결과 필터"가 아니라 "검색 편향"으로 처리)
const LEVEL_HINTS = [
  "slow easy english for beginners", // 0 입문
  "easy english conversation",       // 1 초급
  "",                                // 2 중급 (편향 없음 = 일반 콘텐츠)
  "interview discussion",            // 3 중상급
  "advanced in-depth lecture",       // 4 고급
];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// q: 자유 검색어(사용자 입력·영어로 번역돼 옴). topicsEn: 한글 토픽의 영어 번역(있으면 우선).
// sort: relevance(기본)|upload_date|view_count — YouTube 검색 정렬.
// page: "다른 결과 보기" 누를수록 커지며 더 깊은 검색 페이지를 본다.
// onResult: (선택) 결과 1건이 확정될 때마다 호출 → 라우트가 NDJSON 으로 즉시 스트리밍.
const SORTS = new Set(["relevance", "upload_date", "view_count", "rating"]);
export async function searchVideos({ q = "", minSec = 0, maxSec = 36000, level = 2, topics = [], topicsEn = null, sort = "relevance", page = 0 } = {}, onResult) {
  const yt = await getYt();
  const enTopics = (topicsEn && topicsEn.length ? topicsEn : (topics || []).map((t) => TOPIC_EN[t] || t)).filter(Boolean);
  const hint = LEVEL_HINTS[Math.max(0, Math.min(LEVEL_HINTS.length - 1, level | 0))] || "";
  // 자유 검색어가 있으면 그것을 중심으로, 토픽·난이도 힌트를 보조로 조합
  const parts = [String(q || "").trim(), ...enTopics, hint].filter(Boolean);
  const query = parts.length ? parts.join(" ") : "english podcast interview";
  const sortBy = SORTS.has(sort) ? sort : "relevance";

  // 자막(CC) 필터 + 정렬 검색 → 여러 페이지 수집(다양화). page 가 커지면 더 깊이 본다.
  let p;
  try {
    p = await yt.search(query, { type: "video", sort_by: sortBy, features: ["subtitles"] });
  } catch {
    try {
      p = await yt.search(query, { type: "video", sort_by: sortBy });
    } catch {
      p = await yt.search(query, { type: "video" }); // 필터·정렬 미지원 시 일반 검색으로 폴백
    }
  }
  const skip = Math.max(0, page | 0) * 2; // 페이지마다 2단계씩 더 깊이
  const take = 3;                          // 한 번에 3페이지 분량 수집
  const seen = new Set();
  const out = [];
  for (let i = 0; i < skip + take; i++) {
    if (i >= skip) {
      // 정렬 없는(관련순) 검색만 페이지 단위 셔플로 다양화 — 최신순·조회순은 순서 유지.
      const vids = (p.videos || []).slice();
      const batch = sortBy === "relevance" && !q ? shuffle(vids) : vids;
      for (const v of batch) {
        const id = v?.id || v?.video_id;
        if (!id || seen.has(id) || !v?.duration?.seconds) continue;
        seen.add(id);
        const title = v.title?.text ?? String(v.title ?? "");
        if (!title || NOSPEECH.test(title)) continue;       // 무발화 콘텐츠 제외
        const total = v.duration?.seconds ?? 0;
        if (total < minSec || total > maxSec) continue;
        const item = {
          id, title, channel: v.author?.name ?? "", level: guessLevel(title), topics: topics || [], total,
          views: v.short_view_count?.text ?? "",   // 예: "1.2M views"
          published: v.published?.text ?? "",      // 예: "3 years ago"
        };
        out.push(item);
        if (onResult) { try { onResult(item); } catch { /* 클라 끊김 등 무시 */ } }
      }
    }
    if (!p.has_continuation) break;
    try { p = await p.getContinuation(); } catch { break; }
  }
  return out;
}

// ── URL/ID 에서 11자리 영상 ID 추출 ──
export function extractVideoId(input) {
  const s = String(input || "").trim();
  if (/^[\w-]{11}$/.test(s)) return s; // 이미 ID
  const m = s.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/|\/v\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// oEmbed 폴백 — getBasicInfo 의 player 엔드포인트가 막힌 IP(클라우드/데이터센터)에서도
// 제목/채널은 공개 oEmbed 로 받을 수 있다(길이는 안 줌 → total 0). 영상 재생은
// 클라이언트(주거망)의 iframe 플레이어가 하므로 메타만 있으면 추가/학습엔 충분하다.
async function viaOembed(id) {
  const url = "https://www.youtube.com/oembed?format=json&url=" +
    encodeURIComponent("https://www.youtube.com/watch?v=" + id);
  const res = await fetch(url);
  if (!res.ok) throw new Error("oembed " + res.status);
  const j = await res.json();
  const title = j.title || id;
  return { id, title, channel: j.author_name || "", level: guessLevel(title), topics: [], total: 0 };
}

// ── 직접 import: URL/ID 로 영상 메타데이터 1건 반환 (검색 결과와 같은 모양) ──
export async function getVideoMeta(input) {
  const id = extractVideoId(input);
  if (!id) return null;
  // 1) getBasicInfo(player API) — 길이까지 받지만 일부 IP(클라우드)에선 막힘.
  //    에러를 던지지 않고 빈 제목을 줄 수도 있으니, "제대로 된 제목이 있을 때만" 채택한다.
  try {
    const yt = await getYt();
    const info = await yt.getBasicInfo(id);
    const bi = (info && info.basic_info) || {};
    if (bi.title) {
      return { id, title: bi.title, channel: bi.author || "", level: guessLevel(bi.title), topics: [], total: bi.duration || 0 };
    }
  } catch (e) {
    /* oEmbed 폴백으로 */
  }
  // 2) oEmbed 폴백 (player 차단/제목 없음) — 제목/채널만, 길이는 0.
  try {
    return await viaOembed(id);
  } catch (e) {
    // 3) 최후: 둘 다 실패해도 import 자체는 되게 ID 를 임시 제목으로(추가 후 재생은 가능)
    return { id, title: id, channel: "", level: "", topics: [], total: 0 };
  }
}
