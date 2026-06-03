// Alpha-Helix · 미국 주식 일봉 OHLC 페처
// 1차: Stooq (https://stooq.com/q/d/l/?s=tqqq.us&i=d) — 무료, CORS 허용, API 키 불필요
// 2차 fallback: Yahoo Finance v7 download endpoint (CORS 막히면 r.jina.ai 프록시 사용)
// 결과는 localStorage에 24h 캐시.

const CACHE_PREFIX = "alpha-helix:ohlc:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * @returns {Promise<Array<{date: string, open: number, high: number, low: number, close: number, volume: number}>>}
 */
export async function fetchDailyOHLC(ticker, startDate /* "YYYY-MM-DD" */) {
  const key = `${CACHE_PREFIX}${ticker}:${startDate}`;
  const cachedRaw = localStorage.getItem(key);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw);
      if (cached.t && Date.now() - cached.t < CACHE_TTL_MS && Array.isArray(cached.rows) && cached.rows.length > 0) {
        return cached.rows;
      }
    } catch (_) { /* ignore */ }
  }

  let rows = null;
  // 1) Stooq
  try {
    rows = await _fetchStooq(ticker, startDate);
  } catch (e) {
    console.warn(`[marketData] Stooq fetch failed for ${ticker}:`, e?.message);
  }
  // 2) Yahoo via jina proxy fallback
  if (!rows || rows.length === 0) {
    try {
      rows = await _fetchYahooViaProxy(ticker, startDate);
    } catch (e) {
      console.warn(`[marketData] Yahoo fetch failed for ${ticker}:`, e?.message);
    }
  }

  if (rows && rows.length > 0) {
    try {
      localStorage.setItem(key, JSON.stringify({ t: Date.now(), rows }));
    } catch (_) { /* quota; ignore */ }
    return rows;
  }
  throw new Error(`market data unavailable for ${ticker}`);
}

async function _fetchStooq(ticker, startDate) {
  const d1 = startDate.replace(/-/g, "");
  const today = new Date();
  const d2 = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const url = `https://stooq.com/q/d/l/?s=${ticker.toLowerCase()}.us&d1=${d1}&d2=${d2}&i=d`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`stooq ${res.status}`);
  const text = await res.text();
  return _parseCSV(text);
}

async function _fetchYahooViaProxy(ticker, startDate) {
  const p1 = Math.floor(new Date(startDate).getTime() / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  const yahoo = `https://query1.finance.yahoo.com/v7/finance/download/${ticker}?period1=${p1}&period2=${p2}&interval=1d&events=history`;
  const url = `https://r.jina.ai/${yahoo}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`yahoo-proxy ${res.status}`);
  const text = await res.text();
  // jina proxy는 보통 헤더+본문; CSV header line "Date,Open,High,..."를 찾는다
  const idx = text.indexOf("Date,Open,High");
  const csv = idx >= 0 ? text.slice(idx) : text;
  return _parseCSV(csv);
}

function _parseCSV(text) {
  if (!text || typeof text !== "string") return [];
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase();
  if (!header.startsWith("date")) return [];
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 5) continue;
    const date = cols[0];
    const open = parseFloat(cols[1]);
    const high = parseFloat(cols[2]);
    const low = parseFloat(cols[3]);
    const close = parseFloat(cols[4]);
    const volume = cols[5] ? parseFloat(cols[5]) : 0;
    if (!date || !Number.isFinite(close)) continue;
    out.push({ date, open, high, low, close, volume });
  }
  return out;
}

export function clearMarketCache() {
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) toRemove.push(k);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}
