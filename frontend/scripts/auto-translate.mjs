#!/usr/bin/env node
/**
 * Alpha-Helix Auto-Translate Script
 * ──────────────────────────────────────────────────────────────────
 * Build-time으로 translations.js의 누락된 번역을 Google Translate API로
 * 자동 완성합니다.
 *
 * 사용법:
 *   node scripts/auto-translate.mjs --key=<GOOGLE_API_KEY>
 *   node scripts/auto-translate.mjs --key=<KEY> --from=ko --to=zh,ja
 *   node scripts/auto-translate.mjs --key=<KEY> --to=en --dry-run
 *
 * 환경변수로도 가능:
 *   GOOGLE_API_KEY=<key> node scripts/auto-translate.mjs
 *
 * Google API 키 발급:
 *   1. https://console.cloud.google.com/ → APIs & Services → Enable APIs
 *   2. "Cloud Translation API" 활성화
 *   3. Credentials → Create Credentials → API Key
 *   4. (선택) API Key 제한 → Cloud Translation API 만 허용
 *
 * 동작:
 *   - source 언어(기본 ko) 기준으로 target 언어에 없는 키를 자동 번역
 *   - 이미 번역된 키는 덮어쓰지 않음 (--force 옵션 시 덮어씀)
 *   - translations.js 파일을 직접 업데이트
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import https from "https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSLATIONS_PATH = path.resolve(__dirname, "../src/i18n/translations.js");

// ── CLI 인수 파싱 ──────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith("--"))
    .map(a => {
      const [k, ...v] = a.slice(2).split("=");
      return [k, v.length ? v.join("=") : true];
    })
);

const API_KEY   = args.key || process.env.GOOGLE_API_KEY || process.env.GOOGLE_TRANSLATE_API_KEY;
const FROM_LANG = args.from  || "ko";
const TO_LANGS  = (args.to   || "zh").split(",").map(s => s.trim()).filter(Boolean);
const DRY_RUN   = !!args["dry-run"];
const FORCE     = !!args.force;         // 이미 있는 키도 덮어쓰기
const MAX_BATCH = 100;                   // Google Translate 배치 크기

if (!API_KEY) {
  console.error(`
❌  GOOGLE_API_KEY 가 없습니다.

방법 1 (환경변수):
  GOOGLE_API_KEY=AIzaSy... node scripts/auto-translate.mjs

방법 2 (인수):
  node scripts/auto-translate.mjs --key=AIzaSy...

Google Cloud Console에서 Cloud Translation API를 활성화하고
API 키를 발급받으세요.
`);
  process.exit(1);
}

// ── translations.js 로드 (eval 방식, 빌드 도구 불필요) ───────────
const raw = readFileSync(TRANSLATIONS_PATH, "utf-8");

// `const translations = { ... }; export default translations;` 패턴 추출
const match = raw.match(/const\s+translations\s*=\s*(\{[\s\S]*?\});\s*\nexport default/);
if (!match) {
  console.error("❌ translations.js 파싱 실패 — `const translations = {...};` 패턴을 찾지 못했습니다.");
  process.exit(1);
}

// eslint-disable-next-line no-new-func
const translations = new Function(`return (${match[1]})`)();
console.log(`✅ translations.js 로드됨 (언어: ${Object.keys(translations).join(", ")})`);

// ── 유틸: 객체 평탄화 ─────────────────────────────────────────────
function flatten(obj, prefix = "") {
  const result = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(result, flatten(v, key));
    } else {
      result[key] = v;
    }
  }
  return result;
}

function setNested(obj, dotKey, value) {
  const keys = dotKey.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]] || typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

// ── Google Translate REST API ─────────────────────────────────────
async function googleTranslate(texts, target, source) {
  const url  = `https://translation.googleapis.com/language/translate/v2?key=${API_KEY}`;
  const body = JSON.stringify({ q: texts, target, source, format: "text" });

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", c => (data += c));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`Google API ${json.error.code}: ${json.error.message}`));
          } else {
            resolve(json.data.translations.map(t => t.translatedText));
          }
        } catch (e) {
          reject(new Error("응답 파싱 실패: " + e.message));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── 누락 키 번역 ──────────────────────────────────────────────────
async function translateMissing(fromLang, toLang) {
  const base   = flatten(translations[fromLang] ?? {});
  const target = flatten(translations[toLang]   ?? {});

  const missing = Object.entries(base).filter(([k, v]) => {
    if (typeof v !== "string") return false;    // 배열/숫자 등 스킵
    if (!v.trim()) return false;                // 빈 문자열 스킵
    const tv = target[k];
    if (FORCE) return true;
    return tv === undefined;                    // 없는 키만 (force 아닐 때)
  });

  if (missing.length === 0) {
    console.log(`  ✅ ${toLang}: 누락 없음`);
    return {};
  }

  console.log(`  🔄 ${toLang}: ${missing.length}개 번역 중...`);

  const result = {};
  for (let i = 0; i < missing.length; i += MAX_BATCH) {
    const batch = missing.slice(i, i + MAX_BATCH);
    process.stdout.write(`     배치 ${i + 1}~${Math.min(i + MAX_BATCH, missing.length)}/${missing.length} ... `);
    try {
      const translated = await googleTranslate(batch.map(([, v]) => v), toLang, fromLang);
      batch.forEach(([k], j) => { result[k] = translated[j]; });
      console.log("✓");
      if (i + MAX_BATCH < missing.length) {
        await new Promise(r => setTimeout(r, 350)); // rate limit 방지
      }
    } catch (e) {
      console.log(`❌ (${e.message})`);
    }
  }

  return result;
}

// ── JS 직렬화 (translations.js 포맷 유지) ────────────────────────
function toJsValue(v, indent) {
  if (Array.isArray(v)) {
    const items = v.map(item => {
      if (typeof item === "object" && item !== null) {
        const inner = Object.entries(item)
          .map(([k, iv]) => `${k}: ${JSON.stringify(iv)}`)
          .join(", ");
        return `{ ${inner} }`;
      }
      return JSON.stringify(item);
    });
    return `[${items.join(", ")}]`;
  }
  if (typeof v === "object" && v !== null) return toJsObj(v, indent);
  return JSON.stringify(v);
}

function toJsObj(obj, indent = 2) {
  const pad  = " ".repeat(indent);
  const pad0 = " ".repeat(Math.max(0, indent - 2));
  const lines = Object.entries(obj).map(([k, v]) => {
    const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
    return `${pad}${safeKey}: ${toJsValue(v, indent + 2)}`;
  });
  return `{\n${lines.join(",\n")},\n${pad0}}`;
}

// ── 메인 ─────────────────────────────────────────────────────────
console.log(`\n╔══════════════════════════════════════════╗`);
console.log(`║   Alpha-Helix Auto-Translate              ║`);
console.log(`╚══════════════════════════════════════════╝`);
console.log(`  Base    : ${FROM_LANG}`);
console.log(`  Targets : ${TO_LANGS.join(", ")}`);
console.log(`  Dry-run : ${DRY_RUN}`);
console.log(`  Force   : ${FORCE}\n`);

// deep clone
const updated = JSON.parse(JSON.stringify(translations));

for (const toLang of TO_LANGS) {
  const newKeys = await translateMissing(FROM_LANG, toLang);
  const count   = Object.keys(newKeys).length;
  if (count === 0) continue;

  if (!updated[toLang]) updated[toLang] = {};
  for (const [k, v] of Object.entries(newKeys)) {
    setNested(updated[toLang], k, v);
  }
  console.log(`  📝 ${toLang}: ${count}개 키 추가 예정\n`);
}

if (DRY_RUN) {
  console.log("🔍 Dry-run 완료. 파일 수정 없음.");
  process.exit(0);
}

// translations.js 재작성
const header = `// ============================================================
// Alpha-Helix — Translation Dictionary  (EN / KO / ZH)
// ============================================================

const translations = `;
const footer = `;\n\nexport default translations;\n`;

writeFileSync(TRANSLATIONS_PATH, header + toJsObj(updated, 2) + footer, "utf-8");
console.log(`\n✅ translations.js 업데이트 완료`);
console.log(`   실행 후 git diff src/i18n/translations.js 로 변경사항 확인하세요.`);
