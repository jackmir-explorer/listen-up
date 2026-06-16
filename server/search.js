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

export async function searchVideos({ minSec = 0, maxSec = 36000, level = 2, topics = [] } = {}) {
  const yt = await getYt();
  const topicsEn = (topics || []).map((t) => TOPIC_EN[t] || t);
  const hint = LEVEL_HINTS[Math.max(0, Math.min(LEVEL_HINTS.length - 1, level | 0))] || "";
  const parts = [...topicsEn, hint].filter(Boolean);
  const query = parts.length ? parts.join(" ") : "english podcast interview";

  // 자막(CC) 있는 영상만 — YouTube 검색의 subtitles 필터. (듣기 학습엔 자막이 필수)
  let search;
  try {
    search = await yt.search(query, { type: "video", features: ["subtitles"] });
  } catch {
    search = await yt.search(query, { type: "video" }); // 필터 미지원/오류 시 일반 검색으로 폴백
  }
  const nodes = (search.results || search.videos || []).filter(
    (v) => (v?.id || v?.video_id) && v?.duration?.seconds
  );

  return nodes
    .map((v) => {
      const title = v.title?.text ?? String(v.title ?? "");
      return {
        id: v.id || v.video_id,
        title,
        channel: v.author?.name ?? "",
        level: guessLevel(title), // 제목에 CEFR 표기가 있으면 배지로 표시(보너스)
        topics: topics || [],
        total: v.duration?.seconds ?? 0,
      };
    })
    .filter((r) => r.id && r.title)
    .filter((r) => !NOSPEECH.test(r.title)) // 무발화 콘텐츠 제외
    .filter((r) => r.total >= minSec && r.total <= maxSec);
}

// ── URL/ID 에서 11자리 영상 ID 추출 ──
export function extractVideoId(input) {
  const s = String(input || "").trim();
  if (/^[\w-]{11}$/.test(s)) return s; // 이미 ID
  const m = s.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/|\/v\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// ── 직접 import: URL/ID 로 영상 메타데이터 1건 반환 (검색 결과와 같은 모양) ──
export async function getVideoMeta(input) {
  const id = extractVideoId(input);
  if (!id) return null;
  const yt = await getYt();
  const info = await yt.getBasicInfo(id);
  const bi = (info && info.basic_info) || {};
  const title = bi.title || id;
  return {
    id,
    title,
    channel: bi.author || "",
    level: guessLevel(title),
    topics: [],
    total: bi.duration || 0,
  };
}
