/**
 * 언어 코드 → AI 응답 언어 지시 문장.
 * 시스템 프롬프트 끝에 붙여 AI가 해당 언어로만 답하게 한다.
 */
const LANG_DIRECTIVE = {
  ko: "반드시 한국어로만 답해줘.",
  en: "Always respond in English only.",
  zh: "请始终用中文回复，不要使用其他语言。",
  jp: "必ず日本語のみで返答してください。",
  // ChatBot 자체 언어 목록 (표시 이름 → 지시문)
  "한국어": "반드시 한국어로만 답해줘.",
  "English": "Always respond in English only.",
  "日本語": "必ず日本語のみで返答してください。",
  "العربية": "الرجاء الرد دائمًا باللغة العربية فقط.",
  "Català": "Respon sempre en català.",
  "中文": "请始终用中文回复，不要使用其他语言。",
  "Français": "Réponds toujours en français uniquement.",
  "Deutsch": "Antworte immer nur auf Deutsch.",
  "Español": "Responde siempre en español únicamente.",
};

/**
 * lang 코드 또는 ChatBot 표시 이름을 AI 언어 지시 문장으로 변환.
 * @param {string} lang - 언어 코드(ko/en/zh/jp) 또는 표시 이름(한국어/English/…)
 * @returns {string}
 */
export function langInstruction(lang) {
  return LANG_DIRECTIVE[lang] ?? LANG_DIRECTIVE.en;
}

/**
 * 백엔드 AI 프록시 호출.
 * Gemini API 키는 백엔드에만 존재하므로 브라우저에는 절대 노출되지 않는다.
 *
 * @param {Array<{role: "user"|"bot", text: string}>} messages - 화면에서 쓰는 메시지 배열
 * @param {string} systemInstruction - 페이지별 역할 프롬프트
 * @returns {Promise<string>} Gemini의 답변 텍스트
 */
export async function chatWithAI(messages, systemInstruction, model) {
  // 화면용 role("bot") → Gemini용 role("model") 변환
  const history = messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    text: m.text,
  }));

  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ systemInstruction, history, model: model || undefined }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `AI 요청 실패 (${res.status})`);
  }

  const data = await res.json();
  return data.reply;
}

/**
 * 백엔드 /api/ai/extract 엔드포인트 호출 (JSON 전용 / responseMimeType=application/json).
 * @param {string} systemInstruction - 시스템 지시문
 * @param {string} text - 분석할 원본 텍스트
 * @param {string} [model] - 선택. 없으면 서버 기본 (gemini-2.5-flash).
 * @returns {Promise<string>} JSON 포맷 문자열
 */
export async function extractWithAI(systemInstruction, text, model) {
  const res = await fetch("/api/ai/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ systemInstruction, text, model: model || undefined }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `AI 요청 실패 (${res.status})`);
  }

  const data = await res.json();
  return data.reply;
}

/**
 * 사용자가 사용 가능한 AI 모델 목록 + 잔여 토큰.
 * 인증 필요 (401이면 빈 배열 반환 → 게스트는 기본 Gemini 사용).
 */
export async function fetchAiModels() {
  try {
    const res = await fetch("/api/ai/models", { credentials: "include" });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * 현재 구독 정보 ({tier: "FREE"|"PRO", priceKrw}).
 */
export async function fetchSubscription() {
  try {
    const res = await fetch("/api/subscription/me", { credentials: "include" });
    if (!res.ok) return { tier: "FREE", priceKrw: 9900 };
    return await res.json();
  } catch {
    return { tier: "FREE", priceKrw: 9900 };
  }
}
