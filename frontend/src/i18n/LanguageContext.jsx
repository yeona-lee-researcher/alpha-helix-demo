import { createContext, useContext, useState, useEffect } from "react";
import translations from "./translations";

const LANG_FONTS = {
  ko: "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  en: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  jp: "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  zh: "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(
    () => localStorage.getItem("devbridge_lang") || "en"
  );

  useEffect(() => {
    localStorage.setItem("devbridge_lang", lang);
    document.documentElement.style.setProperty(
      "--font-main",
      LANG_FONTS[lang] ?? LANG_FONTS.en
    );
  }, [lang]);

  /**
   * t("nav.login")               → "Login"
   * t("search.totalPartners", { count: 42 }) → "Total 42 Pro Partners"
   */
  const t = (key, vars = {}) => {
    const keys = key.split(".");
    let val = translations[lang];
    for (const k of keys) val = val?.[k];

    // Fallback to English if translation missing
    if (val === undefined) {
      val = translations.en;
      for (const k of keys) val = val?.[k];
    }
    if (val === undefined) return key;

    // Return arrays as-is (e.g. calendar.months, calendar.weekdays)
    if (Array.isArray(val)) return val;

    // Interpolate {variable} placeholders
    return String(val).replace(/\{(\w+)\}/g, (_, name) =>
      vars[name] !== undefined ? vars[name] : `{${name}}`
    );
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}
