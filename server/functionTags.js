// ╔══════════════════════════════════════════════════════════════════╗
// ║  FUNCTION_TAGS + analyze 프롬프트/스키마 (단일 소스)                  ║
// ║  ⚠ FUNCTION_TAGS 배열은 listen-up.html 의 것과 "반드시 동일"하게 유지.║
// ║    TAG_EXAMPLES 는 사용자 단어장(xlsx)에서 추출한 태그별 대표 예시로,  ║
// ║    모델이 사용자의 분류 기준을 따르도록 시스템 프롬프트에 들어간다.    ║
// ╚══════════════════════════════════════════════════════════════════╝
export const FUNCTION_TAGS = [
  { group: "묘사·진술", tags: ["상태", "변화", "움직임", "감각", "생각·판단", "추측", "전언", "인과·사건", "사역·유발", "상황·조건", "장소·공간", "묘사·설명", "시간", "강조", "정도·수량", "성향·성격"] },
  { group: "요청·해결", tags: ["부탁·바람", "제안·충고", "설득·강요", "허락", "시도·노력", "어려움·문제", "쉬움·수월", "성공·해결", "금지·방해", "거절·꺼림", "궁금·확인"] },
  { group: "의지·추측", tags: ["계획·의도", "의무·확신", "결심", "가정"] },
  { group: "논리·주장", tags: ["의견·주장", "포함·관계", "반박·대조", "따지기·반문", "인과·결론", "경고·비난", "비교", "화제 전환"] },
  { group: "감정·경험", tags: ["감사·기쁨", "슬픔·미움", "짜증·화남", "우려·사과", "공감", "안정", "선택·기회", "취향·취미", "돈·시간", "배움·목표"] },
];

export const TAG_VALUES = FUNCTION_TAGS.flatMap((g) => g.tags);
export const TAG_SET = new Set(TAG_VALUES);

// ── 사용자 단어장에서 추출한 태그별 대표 예시 (분류 기준의 ground truth) ──
export const TAG_EXAMPLES = {
  // 묘사·진술
  "상태": ["be", "become", "stay", "remain", "keep", "exist", "last", "belong", "stand"],
  "변화": ["change", "turn into", "convert", "shift", "vary", "transform", "increase", "decrease", "develop"],
  "움직임": ["run", "walk", "drive", "ride", "pass", "throw", "push", "pull", "lift", "carry", "cut", "break"],
  "감각": ["feel", "see", "look", "hear", "taste", "smell", "notice", "watch", "be aware of"],
  "생각·판단": ["think", "believe", "guess", "imagine", "realise", "consider", "suppose", "remember", "come up with"],
  "추측": ["seem like", "feel like", "sound like", "be likely to", "It seems like", "probably", "might", "I suppose"],
  "전언": ["say", "tell", "mention", "report", "claim", "suggest", "inform", "It is said that", "I heard that"],
  "인과·사건": ["happen", "take place", "fact", "the reason", "lead to", "result in", "cause", "due to", "because of"],
  "사역·유발": ["make someone do", "have someone do", "get someone to", "let", "allow", "force to", "cause", "enable", "prompt"],
  "상황·조건": ["situation", "condition", "circumstance", "in case", "environment", "background", "context", "status"],
  "장소·공간": ["place", "area", "location", "spot", "somewhere", "position", "site", "region", "direction"],
  "묘사·설명": ["explain", "describe", "depict", "illustrate", "detail", "show", "represent", "in other words"],
  "시간": ["later", "soon", "before", "after", "during", "while", "when", "ago", "eventually", "at the same time"],
  "강조": ["really", "so", "absolutely", "indeed", "definitely", "especially", "in fact", "no doubt", "strongly"],
  "정도·수량": ["a lot", "a bit", "slightly", "huge", "tiny", "plenty of", "hardly any", "to some extent", "more or less"],
  "성향·성격": ["tend to", "be inclined to", "by nature", "good at", "bad at", "easygoing", "stubborn", "character", "personality"],
  // 요청·해결
  "부탁·바람": ["want", "need", "would like to", "hope", "wish", "look forward to", "be eager to", "prefer", "fancy"],
  "제안·충고": ["should", "why don't you", "I'd recommend", "how about", "it's better to", "you could", "suggest", "advise"],
  "설득·강요": ["persuade", "convince", "force", "make someone", "talk into", "pressure", "push to", "cajole into"],
  "허락": ["let", "allow", "permit", "Can I", "May I", "be allowed to", "give permission", "approve"],
  "시도·노력": ["try", "attempt", "make an effort", "manage to", "work on", "strive", "do one's best", "tackle"],
  "어려움·문제": ["trouble", "problem", "difficulty", "obstacle", "issue", "struggle", "hard to", "get stuck", "face"],
  "쉬움·수월": ["easy", "simple", "straightforward", "manageable", "handy", "a piece of cake", "no problem", "effortless"],
  "성공·해결": ["solve", "resolve", "sort out", "work out", "succeed", "accomplish", "fix", "nail down", "pay off"],
  "금지·방해": ["prevent", "stop", "ban", "prohibit", "restrict", "block", "get in the way", "hold back", "not allowed"],
  "거절·꺼림": ["refuse", "decline", "turn down", "reluctant to", "unwilling to", "say no", "hesitate", "put off"],
  "궁금·확인": ["wonder", "want to know", "curious", "check", "make sure", "confirm", "I was wondering", "find out"],
  // 의지·추측
  "계획·의도": ["be going to", "plan to", "will", "intend to", "gonna", "be about to", "mean to", "be ready to"],
  "의무·확신": ["have to", "must", "should", "be supposed to", "need to", "be sure", "no doubt", "certainly", "definitely"],
  "결심": ["be determined to", "decide", "make up my mind", "commit to", "dedicate to", "resolve to", "I will"],
  "가정": ["if", "suppose", "assuming", "in case", "what if", "provided that", "unless", "imagine if"],
  // 논리·주장
  "의견·주장": ["I think", "in my opinion", "argue", "claim", "believe", "advocate", "insist", "point out", "I'd say"],
  "포함·관계": ["include", "contain", "consist of", "relate to", "be involved in", "depend on", "connect", "refer to"],
  "반박·대조": ["however", "but", "on the other hand", "on the contrary", "in contrast", "whereas", "although", "yet"],
  "따지기·반문": ["why would", "don't you think", "are you saying", "how can you", "isn't it", "what makes you think"],
  "인과·결론": ["so", "therefore", "as a result", "that's why", "thus", "in conclusion", "hence", "lead to"],
  "경고·비난": ["blame", "accuse", "warn", "criticise", "you shouldn't have", "beware", "watch out", "that's your fault"],
  "비교": ["more than", "less than", "as ... as", "compared to", "the same as", "twice as", "similar to", "bigger than"],
  "화제 전환": ["by the way", "anyway", "speaking of", "on another note", "that reminds me", "moving on", "well"],
  // 감정·경험
  "감사·기쁨": ["thank", "appreciate", "glad", "happy", "delighted", "pleased", "grateful", "lucky", "what a relief"],
  "슬픔·미움": ["sad", "disappointed", "upset", "hate", "miserable", "heartbroken", "depressed", "can't stand"],
  "짜증·화남": ["annoyed", "angry", "frustrated", "pissed off", "irritated", "mess up", "sick and tired", "drives me crazy"],
  "우려·사과": ["worry", "anxious", "afraid", "sorry", "regret", "apologise", "concerned", "I'm afraid", "my fault"],
  "공감": ["I understand how you feel", "I'm on your side", "that must be hard", "I know the feeling", "empathise", "totally get it"],
  "안정": ["relax", "calm", "relieved", "at ease", "peace of mind", "take it easy", "settle down", "laid-back"],
  "선택·기회": ["choose", "opportunity", "chance", "option", "decide", "pick", "select", "it's up to you"],
  "취향·취미": ["enjoy", "be into", "hobby", "prefer", "my cup of tea", "keen on", "fond of", "favourite"],
  "돈·시간": ["earn", "spend", "save", "cost", "afford", "waste", "pay", "budget", "worth"],
  "배움·목표": ["learn", "study", "improve", "goal", "aim", "achieve", "develop", "practice", "master"],
};

// 그룹 → "태그 — 예시들" 형태의 가이드 블록 (시스템 프롬프트에 삽입)
export const TAG_GUIDE_BLOCK = FUNCTION_TAGS
  .map((g) =>
    `[${g.group}]\n` +
    g.tags.map((t) => `  ${t} — ${(TAG_EXAMPLES[t] || []).join(", ")}`).join("\n")
  )
  .join("\n\n");

// ── analyze 시스템 프롬프트 ─────────────────────────────────────────
export const SYSTEM_PROMPT = `You are a lexicographer assisting a Korean-speaking learner of English listening.
You receive ONE English expression (a word, a phrase, or a full sentence) taken from a video transcript.

Return three fields:
- ko: a concise, natural Korean gloss of the expression's meaning. For a word/phrase, gloss that unit; for a full sentence, give its gist in Korean.
- en: a short, plain-English definition or paraphrase (a few words, not a long sentence).
- tag: the single FUNCTION TAG (in Korean) whose communicative function best matches the expression.

How to choose the tag:
- The tags and their example expressions below are taken from THIS user's own vocabulary notebook. Treat those examples as the ground truth for what each tag means, and classify new expressions the way the user would — by analogy to the closest examples.
- Judge by communicative FUNCTION, not by surface topic. (e.g. "look forward to" → 부탁·바람, because it expresses a wish/desire.)
- The tag MUST be exactly one of the tags below, copied verbatim, or an empty string "" if none clearly fits.
- Never invent a tag, never translate the tags, never return more than one.

FUNCTION TAGS with example expressions (from the user's notebook):
${TAG_GUIDE_BLOCK}

Keep ko and en short. Return the structured object only.`;

// ── 구조화 출력 스키마: tag 를 enum 으로 강제 (목록 밖 값 원천 차단) ──
export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ko: { type: "string" },
    en: { type: "string" },
    tag: { type: "string", enum: [...TAG_VALUES, ""] },
  },
  required: ["ko", "en", "tag"],
  additionalProperties: false,
};
