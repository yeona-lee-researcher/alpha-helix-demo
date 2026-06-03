import React, { useEffect, useState, useMemo } from "react";
import { Wallet } from "lucide-react";
import binanceLogo from "../assets/binance.png";
import { useTheme, BRAND_GRADIENT } from "./ThemeContext";
import { useLanguage } from "../i18n/LanguageContext";
import {
  listBrokerAccounts, upsertBrokerAccount, deleteBrokerAccount,
  testBrokerAccount, setBrokerTrading, setBrokerAutoExecute, getPromotionGate,
  getBrokerBalance, getBrokerOrdersToday,
  previewBrokerOrder, placeBrokerOrder, getBrokerQuote,
  testBinanceAccount, getBinanceBalance,
} from "./alphaApi";

/**
 * 계좌 페이지 — KIS(한국투자증권) + Binance 모의/실전 동시 등록·관리.
 *
 * 흐름:
 *  1. 상단 탭으로 브로커 선택 (KIS | BINANCE)
 *  2. 환경 탭으로 MOCK / REAL 선택
 *  3. 미등록이면 등록 폼, 등록되어 있으면 상태 + 잔고 + 주문 UI
 *  4. 모든 broker API 호출은 ?env=MOCK|REAL 파라미터 동반
 */
export default function AccountPage() {
  const { theme: rawTheme } = useTheme();
  const { t } = useLanguage();
  const theme = useMemo(() => ({
    ...rawTheme,
    card: rawTheme.panel,
    border: rawTheme.panelBorder,
    subtle: rawTheme.textMuted,
  }), [rawTheme]);

  const [brokerType, setBrokerType] = useState("KIS"); // "KIS" | "BINANCE"
  const [env, setEnv] = useState("MOCK");
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  // 현재 선택된 브로커+환경에 해당하는 계좌
  const acct = useMemo(
    () => accounts.find(a => a.brokerType === brokerType && a.env === env) || null,
    [accounts, brokerType, env]
  );

  const reload = async () => {
    try {
      const list = await listBrokerAccounts();
      setAccounts(Array.isArray(list) ? list : []);
    } catch (e) {
      setMsg({ type: "err", text: "계좌 조회 실패: " + (e?.response?.data?.error || e.message) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  return (
    <div className="alpha-account" style={{ padding: "36px 40px 80px", background: "#F8FAFC", minHeight: "calc(100vh - 44px)" }}>
      <style>{`
        @media (max-width: 768px) {
          .alpha-account { padding: 16px 12px !important; }
          .alpha-account h1 { font-size: 22px !important; }
          .alpha-account .broker-tabs, .alpha-account .env-tabs { flex-wrap: wrap; }
          .alpha-account .broker-tabs button, .alpha-account .env-tabs button { flex: 1 1 45%; min-width: 0; padding: 10px 12px !important; font-size: 13px !important; }
          .alpha-account .info-row { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
          .alpha-account .action-row { flex-wrap: wrap; gap: 8px !important; }
          .alpha-account .action-row button { flex: 1 1 calc(50% - 4px); min-height: 44px; }
          .alpha-account input, .alpha-account select, .alpha-account textarea { font-size: 16px !important; }
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{
            width: 54, height: 54, borderRadius: 17, flexShrink: 0,
            background: "linear-gradient(135deg,#60a5fa 0%,#6366f1 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 6px 20px rgba(99,102,241,0.32)",
          }}>
            <Wallet size={24} color="white" strokeWidth={2.2} />
          </div>
          <div>
            <h1 style={{
              margin: 0, fontSize: 26, fontWeight: 800, lineHeight: 1.15,
              background: "linear-gradient(90deg,#3b82f6 0%,#6366f1 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>{t("account.title")}</h1>
            <p style={{ margin: "5px 0 0", fontSize: 13, color: "#64748B", fontWeight: 500 }}>
              {t("account.subtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* 브로커 탭 + 컨텐츠 패널 (브라우저 탭처럼 하나로 묶임) */}
      <div className="broker-tabs" style={{ display: "flex", gap: 4, marginBottom: 0 }}>
        {[
          { id: "KIS",     label: t("account.brokers.KIS.label"),     sub: t("account.brokers.KIS.sub"),     icon: <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}><img src="https://www.google.com/s2/favicons?domain=truefriend.com&sz=64" alt="KIS" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>,  accent: "linear-gradient(135deg,#60a5fa,#6366f1)" },
          { id: "BINANCE", label: t("account.brokers.BINANCE.label"), sub: t("account.brokers.BINANCE.sub"), icon: <img src={binanceLogo} alt="Binance.US" style={{ width: 32, height: 32, objectFit: "contain" }} />, accent: "linear-gradient(135deg,#fbbf24,#f59e0b)" },
        ].map(({ id, label, sub, icon, accent }) => {
          const active = brokerType === id;
          const hasAny = accounts.some(a => a.brokerType === id);
          return (
            <button key={id} onClick={() => { setBrokerType(id); setMsg(null); }}
              style={{
                flex: "0 1 320px", padding: "14px 18px",
                borderTopLeftRadius: 14, borderTopRightRadius: 14,
                borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
                cursor: "pointer",
                background: active ? "white" : "rgba(241,245,249,0.7)",
                border: "1px solid #E2E8F0",
                borderBottom: active ? "1px solid white" : "1px solid #E2E8F0",
                marginBottom: -1,
                boxShadow: active ? "0 -2px 8px rgba(15,23,42,0.04)" : "none",
                display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                position: "relative", zIndex: active ? 2 : 1,
                transition: "background 0.15s",
              }}>
              <div style={{
                flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{icon}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: 14.5, fontWeight: 800,
                  color: active ? "#0f172a" : "#64748B",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  {label}
                  {hasAny && (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      padding: "2px 7px", borderRadius: 99,
                      background: "#DCFCE7", color: "#15803D",
                    }}>● 등록됨</span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: active ? "#64748B" : "#94A3B8", marginTop: 2, fontWeight: 500 }}>
                  {sub}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 브로커 탭 컨텐츠 패널 */}
      <div style={{
        background: "white",
        border: "1px solid #E2E8F0",
        borderRadius: 16,
        borderTopLeftRadius: brokerType === "KIS" ? 0 : 16,
        padding: "22px 24px 26px",
        boxShadow: "0 4px 18px rgba(15,23,42,0.05)",
        position: "relative", zIndex: 1,
      }}>

      {/* 환경 탭 */}
      <div className="env-tabs" style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {["MOCK", "REAL"].map(e => {
          const active = env === e;
          const has = accounts.some(a => a.brokerType === brokerType && a.env === e);
          return (
            <button key={e} onClick={() => { setEnv(e); setMsg(null); }}
              style={{
                padding: "10px 18px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer",
                background: active
                  ? (e === "REAL" ? "linear-gradient(135deg,#ef4444,#dc2626)" : "linear-gradient(135deg,#60a5fa,#3b82f6)")
                  : "#F8FAFC",
                color: active ? "white" : theme.text,
                border: `1px solid ${active ? "transparent" : theme.border}`,
              }}>
              {e === "MOCK" ? "🧪 모의/테스트넷" : "💰 실전/메인넷"} {has && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.85 }}>● 등록됨</span>}
            </button>
          );
        })}
      </div>

      {msg && (
        <div style={{
          padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: msg.type === "err" ? "#FEE2E2" : "#DCFCE7",
          color: msg.type === "err" ? "#991B1B" : "#166534",
        }}>{msg.text}</div>
      )}

      {loading ? <div style={{ color: theme.subtle }}>불러오는 중…</div>
        : acct
          ? (brokerType === "BINANCE"
              ? <BinanceActive theme={theme} env={env} acct={acct} reload={reload} setMsg={setMsg} />
              : <AccountActive theme={theme} env={env} acct={acct} reload={reload} setMsg={setMsg} />)
          : (brokerType === "BINANCE"
              ? <BinanceRegister theme={theme} env={env} reload={reload} setMsg={setMsg} />
              : <AccountRegister theme={theme} env={env} accounts={accounts} reload={reload} setMsg={setMsg} />)}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────── 등록 폼 */
function AccountRegister({ theme, env, accounts = [], reload, setMsg }) {
  const [form, setForm] = useState({
    appKey: "", appSecret: "", cano: "", acntPrdtCd: "01",
    maxOrderUsd: env === "REAL" ? 100 : 1000,
    dailyOrderUsd: env === "REAL" ? 500 : 5000,
    // KIS 전용 — 1일 누적 매수/매도 한도 (원화). 기본값: 실전 1천만/3천만, 모의 5천만/3억.
    dailyBuyKrw:  env === "REAL" ? 10_000_000  : 50_000_000,
    dailySellKrw: env === "REAL" ? 30_000_000  : 300_000_000,
  });
  const [saving, setSaving] = useState(false);

  // 다른 환경에 이미 등록된 계좌(있다면) — 키 중복 차단용
  const otherEnv = env === "MOCK" ? "REAL" : "MOCK";
  const otherAcct = accounts.find(a => a.env === otherEnv) || null;

  const submit = async (e) => {
    e.preventDefault();
    // 입력값 정화 — 양 끝 공백/줄바꿈/zero-width 제거
    const cleanKey = (form.appKey || "").replace(/[\s\u200B\u00A0]/g, "");
    const cleanSecret = (form.appSecret || "").replace(/[\s\u200B\u00A0]/g, "");
    if (cleanKey.length < 20) {
      setMsg({ type: "err", text: `App Key가 너무 짧습니다 (${cleanKey.length}자). 정상 키는 36자입니다.` });
      return;
    }
    if (cleanSecret.length < 100) {
      setMsg({ type: "err", text: `App Secret이 너무 짧습니다 (${cleanSecret.length}자). 정상 시크릿은 180자+ 입니다.` });
      return;
    }
    // ⚠ MOCK/REAL 동일 키 차단 — KIS는 환경별 별도 키쌍을 발급함
    if (otherAcct?.appKeyMasked) {
      const masked = otherAcct.appKeyMasked; // 예: "PSji9T...cbl3"
      const m = masked.match(/^(.{4,8}).*?(.{3,5})$/);
      if (m && cleanKey.startsWith(m[1]) && cleanKey.endsWith(m[2])) {
        setMsg({ type: "err", text: `❌ 입력한 키가 ${otherEnv} 환경에 이미 등록된 키와 같습니다 (${masked}). KIS는 모의/실전이 별도 키쌍을 발급합니다. ${env === "MOCK" ? "모의투자" : "실전"}용 키를 KIS 개발자센터에서 다시 발급/복사해 주세요.` });
        return;
      }
    }
    // 사용자에게 마지막 확인 — 키 앞/뒤 + 설정 환경 표시
    const envLabel = env === "MOCK" ? "모의투자" : "실전투자";
    const ok = window.confirm(
      `[${envLabel}] 계좌로 등록합니다. 아래 값이 맞나요?\n\n` +
      `• App Key:    ${cleanKey.slice(0, 6)} … ${cleanKey.slice(-5)}  (전체 ${cleanKey.length}자)\n` +
      `• App Secret: ∗∗∗∗ 알 수 없음 ∗∗∗∗  (전체 ${cleanSecret.length}자)\n` +
      `• CANO:       ${form.cano}\n` +
      `• 상품코드:    ${form.acntPrdtCd}\n\n` +
      `→ ${envLabel} 용 키쌍이 맞으면 [확인], 아니면 [취소] 후 다시 입력하세요.`
    );
    if (!ok) return;
    setSaving(true); setMsg(null);
    try {
      await upsertBrokerAccount({ ...form, appKey: cleanKey, appSecret: cleanSecret, env });
      setMsg({ type: "ok", text: `${env} 계좌 등록 완료. 아래에서 연결 테스트를 진행하세요.` });
      reload();
    } catch (err) {
      setMsg({ type: "err", text: "등록 실패: " + (err?.response?.data?.error || err.message) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card theme={theme}>
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>
        {env === "MOCK" ? "🧪 모의투자 계좌 등록" : "💰 실전투자 계좌 등록"}
      </h2>
      {env === "REAL" && (
        <div style={{ background: "#FEF3C7", color: "#92400E", padding: 10, borderRadius: 6, fontSize: 12, marginBottom: 14 }}>
          ⚠️ 실전계좌는 진짜 돈이 움직입니다. 1회·일일 한도를 작게 설정하고 매매 스위치는 OFF로 시작하세요.
        </div>
      )}
      <form onSubmit={submit} autoComplete="off" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* 브라우저 자동완성 후킹 와전 차단: hidden dummy fields */}
        <input type="text" name="username" autoComplete="username" style={{ display: "none" }} />
        <input type="password" name="password" autoComplete="current-password" style={{ display: "none" }} />
        <Field label={`App Key (${env === "MOCK" ? "모의" : "실전"}용, 36자)`} col={2}>
          <input style={inp(theme)} value={form.appKey} name={`appkey-${env}`}
            autoComplete="off" spellCheck="false" autoCorrect="off"
            placeholder={env === "MOCK" ? "PSKey... 으로 시작하는 모의 키" : "PS... 으로 시작하는 실전 키"}
            onChange={e => setForm(f => ({ ...f, appKey: e.target.value }))} required />
        </Field>
        <Field label={`App Secret (${env === "MOCK" ? "모의" : "실전"}용, 180자+)`} col={2}>
          <input type="text" style={{ ...inp(theme), fontFamily: "monospace", fontSize: 11 }}
            value={form.appSecret} name={`appsecret-${env}`}
            autoComplete="off" spellCheck="false" autoCorrect="off"
            placeholder="KIS에서 복사한 App Secret 전체를 붙여넣으세요"
            onChange={e => setForm(f => ({ ...f, appSecret: e.target.value }))} required />
        </Field>
        <Field label="종합계좌번호 (CANO)">
          <input style={inp(theme)} value={form.cano}
            onChange={e => setForm(f => ({ ...f, cano: e.target.value }))} placeholder="46953079" required />
        </Field>
        <Field label="상품코드">
          <input style={inp(theme)} value={form.acntPrdtCd}
            onChange={e => setForm(f => ({ ...f, acntPrdtCd: e.target.value }))} placeholder="01" required />
        </Field>
        <Field label="1회 최대 주문 (USD)">
          <input type="number" min="0" style={inp(theme)} value={form.maxOrderUsd}
            onChange={e => setForm(f => ({ ...f, maxOrderUsd: Number(e.target.value) }))} />
        </Field>
        <Field label="일일 누적 한도 (USD) — Binance 호환">
          <input type="number" min="0" style={inp(theme)} value={form.dailyOrderUsd}
            onChange={e => setForm(f => ({ ...f, dailyOrderUsd: Number(e.target.value) }))} />
        </Field>
        <Field label="매수 1일 누적 한도 (원화)">
          <input type="number" min="0" step="1000000" style={inp(theme)} value={form.dailyBuyKrw}
            onChange={e => setForm(f => ({ ...f, dailyBuyKrw: Number(e.target.value) }))} />
        </Field>
        <Field label="매도 1일 누적 한도 (원화)">
          <input type="number" min="0" step="1000000" style={inp(theme)} value={form.dailySellKrw}
            onChange={e => setForm(f => ({ ...f, dailySellKrw: Number(e.target.value) }))} />
        </Field>
        <div style={{ gridColumn: "1 / -1", marginTop: 6 }}>
          <button type="submit" disabled={saving} style={btnPrimary}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </Card>
  );
}

/* ───────────────────────────────────────────── 활성 계좌 */
function AccountActive({ theme, env, acct, reload, setMsg }) {
  const [balance, setBalance] = useState(null);
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState(null); // { passed, summary, checks } — REAL 계정에만 로드

  const refresh = async () => {
    try {
      const [b, o] = await Promise.all([
        getBrokerBalance(env).catch(() => null),
        getBrokerOrdersToday(env).catch(() => null),
      ]);
      setBalance(b); setOrders(o);
    } catch {}
  };
  useEffect(() => { setBalance(null); setOrders(null); if (acct.lastVerifiedAt) refresh(); }, [env, acct.id, acct.lastVerifiedAt]);

  // REAL 계정 선택 시 승격 게이트 현황 자동 로드
  useEffect(() => {
    if (env !== "REAL") { setGate(null); return; }
    getPromotionGate(env).then(setGate).catch(() => setGate(null));
  }, [env, acct.id, acct.tradingEnabled, acct.lastVerifiedAt]);

  const doTest = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await testBrokerAccount(env);
      setMsg({ type: "ok", text: `연결 성공 — USD $${Number(res.cash_usd || 0).toFixed(2)} / KRW ₩${Number(res.cash_krw || 0).toLocaleString("ko-KR")}` });
      // test 응답이 이미 balance 데이터를 전부 가지고 있으니 그대로 박는다.
      // (별도 refresh() 호출은 또 KIS 4종을 부르므로 EGW00201 재발 위험)
      setBalance({
        cash_usd: res.cash_usd,
        cash_krw: res.cash_krw,
        positions: res.positions || [],
        total_market_value_usd: res.total_market_value_usd || 0,
      });
      reload();
    } catch (e) {
      const status = e?.response?.status;
      const data = e?.response?.data || {};
      // 서버 암호화 키 변경/불일치 → 재등록 안내 + 원클릭 삭제
      if (status === 409 && data.requireReregister) {
        if (window.confirm(
          "저장된 키를 복호화할 수 없습니다 (서버 암호화 키가 바뀌었습니다).\n\n" +
          "이 계좌를 지금 삭제하고 다시 등록하시겠어요?\n" +
          "(취소 시 수동으로 '삭제' 버튼을 눌러도 됩니다)"
        )) {
          try {
            await deleteBrokerAccount(env);
            reload();
            setMsg({ type: "ok", text: "삭제 완료 — 등록 폼에서 키를 다시 입력해 주세요." });
          } catch (de) {
            setMsg({ type: "err", text: "자동 삭제 실패: " + (de?.response?.data?.error || de.message) });
          }
        } else {
          setMsg({ type: "err", text: data.error || "키 복호화 실패 — 삭제 후 재등록 필요" });
        }
      } else {
        setMsg({ type: "err", text: "테스트 실패: " + (data.error || e.message) });
      }
    } finally { setBusy(false); }
  };
  const doToggleTrading = async () => {
    setBusy(true); setMsg(null);
    try {
      await setBrokerTrading(env, !acct.tradingEnabled);
      reload();
    } catch (e) {
      const data = e?.response?.data;
      // 승격 게이트 실패 → 체크리스트 패널로 대체
      if (data?.checks) {
        setGate({ passed: false, summary: data.summary, checks: data.checks });
        setMsg({ type: "err", text: "승격 게이트 미충족 — 아래 체크리스트 확인" });
      } else {
        setMsg({ type: "err", text: "스위치 변경 실패: " + (data?.error || e.message) });
      }
    } finally { setBusy(false); }
  };
  const doToggleAutoExecute = async () => {
    const turningOn = !acct.autoExecute;
    if (turningOn && env === "REAL" &&
        !confirm("⚠️ REAL 자동 체결을 켜면 시그널 발생 시 사람 승인 없이 실제 주문이 자동 실행됩니다.\n(모든 한도·kill-switch는 유지) 계속할까요?")) return;
    setBusy(true); setMsg(null);
    try {
      await setBrokerAutoExecute(env, turningOn);
      setMsg({ type: "ok", text: turningOn ? "자동 체결 ON" : "자동 체결 OFF" });
      reload();
    } catch (e) {
      const data = e?.response?.data;
      // REAL 졸업 게이트 미충족 → summary 안내
      if (data?.summary && data?.requiredTrades) {
        setMsg({ type: "err", text: `REAL 자동체결 졸업 게이트 미충족 — ${data.summary}` });
      } else {
        setMsg({ type: "err", text: "자동체결 변경 실패: " + (data?.error || e.message) });
      }
    } finally { setBusy(false); }
  };
  const doDelete = async () => {
    if (!confirm(`${env} 계좌 등록을 정말 삭제할까요? (KIS 키도 DB에서 제거됩니다)`)) return;
    setBusy(true);
    try { await deleteBrokerAccount(env); reload(); }
    catch (e) { setMsg({ type: "err", text: "삭제 실패: " + (e?.response?.data?.error || e.message) }); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* 상태 카드 */}
      <Card theme={theme}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 22 }}>
            <Stat label="환경" value={env === "REAL" ? "실전" : "모의"} tone={env === "REAL" ? "warn" : "info"} theme={theme} />
            <Stat label="계좌번호" value={`${acct.cano}-${acct.acntPrdtCd}`} theme={theme} />
            <Stat label="App Key" value={acct.appKeyMasked} theme={theme} />
            <Stat label="검증 시각" value={acct.lastVerifiedAt ? new Date(acct.lastVerifiedAt).toLocaleString() : "미검증"}
                  tone={acct.lastVerifiedAt ? "ok" : "warn"} theme={theme} />
            <Stat label="매매 스위치" value={acct.tradingEnabled ? "ON" : "OFF"}
                  tone={acct.tradingEnabled ? "ok" : "warn"} theme={theme} />
            <Stat label="자동 체결" value={acct.autoExecute ? "ON" : "OFF"}
                  tone={acct.autoExecute ? (env === "REAL" ? "warn" : "ok") : "info"} theme={theme} />
            <Stat label="1회 한도" value={`$${Number(acct.maxOrderUsd || 0).toLocaleString()}`} theme={theme} />
            <Stat label="매수 1일 한도" value={acct.dailyBuyKrw != null ? `₩${Number(acct.dailyBuyKrw).toLocaleString("ko-KR")}` : "무제한"} theme={theme} />
            <Stat label="매도 1일 한도" value={acct.dailySellKrw != null ? `₩${Number(acct.dailySellKrw).toLocaleString("ko-KR")}` : "무제한"} theme={theme} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={doTest} disabled={busy} style={btnSecondary}>🔌 연결 테스트</button>
            <button onClick={doToggleTrading} disabled={busy || !acct.lastVerifiedAt}
              style={acct.tradingEnabled ? btnDanger : btnPrimary}>
              {acct.tradingEnabled ? "매매 OFF" : "매매 ON"}
            </button>
            <button onClick={doToggleAutoExecute} disabled={busy || !acct.tradingEnabled}
              title={!acct.tradingEnabled ? "먼저 매매 스위치를 켜세요" : (env === "REAL" ? "REAL 은 MOCK 자동매매 2주+20회 졸업 게이트 필요" : "")}
              style={acct.autoExecute ? btnDanger : btnSecondary}>
              {acct.autoExecute ? "자동체결 OFF" : "🤖 자동체결 ON"}
            </button>
            <button onClick={doDelete} disabled={busy} style={btnDefault}>삭제</button>
          </div>
        </div>
      </Card>

      {/* MOCK\u2192REAL \uc2b9\uaca9 \uac8c\uc774\ud2b8 (REAL \uacc4\uc815\uc5d0\ub9cc \ud45c\uc2dc) */}
      {env === "REAL" && gate && (
        <Card theme={theme}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
            {gate.passed ? "✅ MOCK→REAL 승격 게이트 통과" : "🚧 MOCK→REAL 승격 게이트"}
          </h3>
          <p style={{ fontSize: 12, color: theme.subtle, marginTop: 0, marginBottom: 12, lineHeight: 1.6 }}>
            {gate.summary}
          </p>
          <div style={{ display: "grid", gap: 6 }}>
            {(gate.checks || []).map((c) => (
              <div key={c.key} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", borderRadius: 8,
                background: c.ok ? "#ECFDF5" : "#FEF2F2",
                border: `1px solid ${c.ok ? "#A7F3D0" : "#FECACA"}`,
              }}>
                <span style={{ fontSize: 16 }}>{c.ok ? "✓" : "✗"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c.ok ? "#065F46" : "#991B1B" }}>
                    {c.label}
                  </div>
                  <div style={{ fontSize: 12, color: c.ok ? "#047857" : "#B91C1C", marginTop: 2 }}>
                    {c.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 잔고 */}
      <Card theme={theme}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>📊 보유 자산</h3>
          <div title="통합증거금이 활성화되어 있어 USD 잔고가 0이어도 KRW에서 환산 차감으로 미국 주식 매수가 가능합니다."
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 999,
              background: "linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%)",
              border: "1px solid #6ee7b7", color: "#065f46",
              fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
            }}>
            ✅ 통합증거금 ON · KRW→USD 자동환산 매수 가능
          </div>
        </div>
        {!balance ? <div style={{ color: theme.subtle, fontSize: 13 }}>연결 테스트 후 표시됩니다.</div> : (
          <>
            <div style={{ fontSize: 13, color: theme.subtle, marginBottom: 8 }}>
              예수금 (USD): <b style={{ color: theme.text }}>${Number(balance.cash_usd || 0).toFixed(2)}</b>
              {" · "}예수금 (KRW): <b style={{ color: theme.text }}>₩{Number(balance.cash_krw || 0).toLocaleString("ko-KR")}</b>
              {" · "}총 평가금액: <b style={{ color: theme.text }}>${Number(balance.total_market_value_usd || 0).toFixed(2)}</b>
            </div>
            {(balance.positions || []).length === 0 ? (
              <div style={{ color: theme.subtle, fontSize: 13 }}>보유 종목 없음</div>
            ) : (
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead><tr style={{ color: theme.subtle, textAlign: "left" }}>
                  <th style={th}>티커</th><th style={th}>수량</th><th style={th}>평단</th>
                  <th style={th}>평가금액</th><th style={th}>평가손익</th>
                </tr></thead>
                <tbody>
                  {balance.positions.map((p, i) => {
                    const pnl = Number(p.unrealized_pnl || 0);
                    return (
                      <tr key={i} style={{ borderTop: `1px solid ${theme.border}` }}>
                        <td style={td}>{p.ticker}</td>
                        <td style={td}>{p.qty}</td>
                        <td style={td}>${Number(p.avg_price).toFixed(2)}</td>
                        <td style={td}>${Number(p.market_value).toFixed(2)}</td>
                        <td style={{ ...td, color: pnl >= 0 ? "#16a34a" : "#dc2626", fontWeight: 700 }}>
                          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </Card>

      {/* 자동 주문 내역 (무한매수법 TQQQ / SOXL) */}
      <AutoOrderPanel theme={theme} env={env} orders={orders} />

      {/* 주문 */}
      <OrderForm theme={theme} env={env} acct={acct} setMsg={setMsg} onPlaced={refresh} />

      {/* 당일 주문 */}
      <Card theme={theme}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>📜 당일 주문 내역</h3>
        <OrdersTable theme={theme} orders={orders} />
      </Card>
    </div>
  );
}

/* ───────────────────────────────────────────── 주문 폼 */
function OrderForm({ theme, env, acct, setMsg, onPlaced }) {
  const [form, setForm] = useState({ ticker: "QQQ", side: "BUY", quantity: 1, limitPrice: "" });
  const [quote, setQuote] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const fetchQuote = async (ticker) => {
    if (!ticker || !acct.lastVerifiedAt) { setQuote(null); return; }
    try { setQuote(await getBrokerQuote(env, ticker)); } catch { setQuote(null); }
  };
  const doPreview = async () => {
    setBusy(true); setMsg(null);
    try {
      const p = await previewBrokerOrder(env, {
        ...form, ticker: form.ticker.toUpperCase(),
        limitPrice: form.limitPrice ? Number(form.limitPrice) : null,
      });
      setPreview(p);
    } catch (e) {
      setMsg({ type: "err", text: "프리뷰 실패: " + (e?.response?.data?.error || e.message) });
    } finally { setBusy(false); }
  };
  const doPlace = async () => {
    if (!preview?.ok) return;
    setBusy(true); setMsg(null);
    try {
      const r = await placeBrokerOrder(env, {
        ...form, ticker: form.ticker.toUpperCase(),
        limitPrice: form.limitPrice ? Number(form.limitPrice) : null,
      });
      setMsg({ type: "ok", text: `주문 전송 완료 — KIS 주문번호 ${r.kis_order_no || "(응답확인)"}` });
      setPreview(null);
      onPlaced?.();
    } catch (e) {
      setMsg({ type: "err", text: "주문 실패: " + (e?.response?.data?.error || e.message) });
    } finally { setBusy(false); }
  };

  const overLimit = preview?.over_single_limit;

  return (
    <Card theme={theme}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>🛒 수동 주문 ({env === "REAL" ? "실전" : "모의"})</h3>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.2fr auto", gap: 8, alignItems: "end" }}>
        <Field label="티커">
          <input style={inp(theme)} value={form.ticker}
            onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))}
            onBlur={e => fetchQuote(e.target.value.trim().toUpperCase())} />
        </Field>
        <Field label="매매구분">
          <select style={inp(theme)} value={form.side}
            onChange={e => setForm(f => ({ ...f, side: e.target.value }))}>
            <option value="BUY">매수</option><option value="SELL">매도</option>
          </select>
        </Field>
        <Field label="수량">
          <input type="number" min="1" style={inp(theme)} value={form.quantity}
            onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
        </Field>
        <Field label="지정가 (USD)">
          <input type="number" step="0.01" style={inp(theme)} value={form.limitPrice}
            onChange={e => setForm(f => ({ ...f, limitPrice: e.target.value }))} />
        </Field>
        <button onClick={doPreview} disabled={busy} style={btnSecondary}>프리뷰</button>
      </div>

      {quote && quote.last_price > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: theme.subtle }}>
          📊 <b>{quote.ticker}</b> ({quote.exchange}) 현재가:{" "}
          <b style={{ color: theme.text }}>${Number(quote.last_price).toFixed(2)}</b>{" "}
          <span style={{ color: quote.change_rate_pct >= 0 ? "#22c55e" : "#ef4444" }}>
            ({quote.change_rate_pct >= 0 ? "+" : ""}{Number(quote.change_rate_pct).toFixed(2)}%)
          </span>
          {" · "}
          <button type="button"
            onClick={() => setForm(f => ({ ...f, limitPrice: quote.last_price.toFixed(2) }))}
            style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            이 가격으로 입력 →
          </button>
        </div>
      )}

      {preview && (
        <div style={{
          marginTop: 14, padding: 12, borderRadius: 8,
          background: overLimit ? "#FEE2E2" : (form.side === "BUY" ? "#DCFCE7" : "#FEE2E2"),
          color: overLimit ? "#991B1B" : (form.side === "BUY" ? "#166534" : "#991B1B"),
          fontSize: 13,
        }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            {overLimit ? "❌ 한도 초과" : `✅ ${preview.side} ${preview.quantity}주 @ $${preview.limit_price}`}
          </div>
          <div>예상 총액: ${Number(preview.est_total_usd).toFixed(2)} / 한도 ${preview.max_order_usd}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
            <button onClick={doPlace} disabled={busy || !preview.ok || !acct.tradingEnabled}
              style={form.side === "BUY" ? btnPrimary : btnDanger}>
              {acct.tradingEnabled ? `🚀 ${form.side === "BUY" ? "매수" : "매도"} 실행` : "매매 스위치 OFF"}
            </button>
            <button onClick={() => setPreview(null)} style={btnDefault}>취소</button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ───────────────────────────────────────────── 자동 주문 패널 (무한매수법) */
function AutoOrderPanel({ theme, env, orders }) {
  const LS_KEY = `autoStrategy:${env}`;
  const [strategies, setStrategies] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (saved && typeof saved === "object") return saved;
    } catch {}
    return { TQQQ: false, SOXL: false };
  });
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(strategies)); } catch {}
  }, [strategies, LS_KEY]);

  const toggle = (ticker) => setStrategies(s => ({ ...s, [ticker]: !s[ticker] }));

  // 무한매수법 룰 요약: 매일 시드의 1/40씩 분할매수, +10% 도달 시 전량 매도, 40회 분할 완료 시 사이클 리셋
  const RULE = "매일 시드의 1/40 분할매수 · +10% 도달 시 전량 매도 · 40회 완주 시 사이클 리셋";

  // 자동 주문으로 표시할 후보: 오늘 주문 중 strategy_tag === 'INFINITE_BUY' 또는 메모에 [AUTO] 포함
  const autoOrders = useMemo(() => {
    const list = Array.isArray(orders) ? orders : [];
    return list.filter(o =>
      o?.strategy_tag === "INFINITE_BUY" ||
      o?.tag === "AUTO" ||
      (typeof o?.memo === "string" && o.memo.includes("[AUTO]"))
    );
  }, [orders]);

  return (
    <Card theme={theme}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>🤖 자동 주문 내역 — 무한매수법</h3>
        <div style={{ fontSize: 11, color: theme.subtle }}>전략: <b style={{ color: theme.text }}>레버리지 ETF 무한매수법</b></div>
      </div>
      <div style={{
        padding: 10, borderRadius: 8, marginBottom: 12,
        background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a",
        fontSize: 12, lineHeight: 1.6,
      }}>
        ℹ️ {RULE}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {["TQQQ", "SOXL"].map(t => {
          const on = !!strategies[t];
          return (
            <button key={t} onClick={() => toggle(t)} style={{
              padding: "10px 16px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13,
              minWidth: 180, display: "inline-flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              background: on ? "linear-gradient(135deg,#60a5fa 0%,#3b82f6 50%,#6366f1 100%)" : theme.card,
              color: on ? "white" : theme.text,
              border: `1px solid ${on ? "transparent" : theme.border}`,
            }}>
              <span>{t} 무한매수법</span>
              <span style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 999,
                background: on ? "rgba(255,255,255,0.25)" : "#f3f4f6",
                color: on ? "white" : "#6b7280", fontWeight: 800,
              }}>{on ? "ON" : "OFF"}</span>
            </button>
          );
        })}
      </div>

      {autoOrders.length === 0 ? (
        <div style={{
          padding: 14, borderRadius: 8, textAlign: "center",
          background: theme.card, border: `1px dashed ${theme.border}`, color: theme.subtle, fontSize: 13,
        }}>
          {Object.values(strategies).some(Boolean)
            ? "오늘 체결된 자동 주문이 없습니다 — 다음 미국장 개장 시 스케줄러가 분할매수/익절 주문을 자동 전송합니다."
            : "활성화된 자동 전략이 없습니다 — 위에서 종목을 ON으로 켜주세요."}
        </div>
      ) : (
        <OrdersTable theme={theme} orders={autoOrders} />
      )}
    </Card>
  );
}

/* ───────────────────────────────────────────── 공통 UI */
function Card({ children, theme }) {
  return <div style={{
    background: theme.card, border: `1px solid ${theme.border}`,
    borderRadius: 12, padding: 18,
  }}>{children}</div>;
}
function Field({ label, children, col }) {
  return <label style={{ display: "block", gridColumn: col ? `span ${col}` : undefined }}>
    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, opacity: 0.7 }}>{label}</div>
    {children}
  </label>;
}
function Stat({ label, value, tone, theme }) {
  const c = tone === "ok" ? "#16a34a" : tone === "warn" ? "#d97706" : tone === "info" ? "#3b82f6" : theme.text;
  return <div>
    <div style={{ fontSize: 10, color: theme.subtle, marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{value}</div>
  </div>;
}

/* 당일 주문 내역 — KIS inquire-nccs 응답(output 배열) 정상화 */
function OrdersTable({ theme, orders }) {
  // 백엔드가 KIS raw JsonNode를 그대로 반환 → output / output1 / output2 어디든 배열을 찾는다
  const rows = (() => {
    if (!orders || typeof orders !== "object") return null;
    const cand = orders.output ?? orders.output1 ?? orders.output2;
    if (Array.isArray(cand)) return cand;
    if (Array.isArray(orders)) return orders;
    return null;
  })();
  if (!orders) return <div style={{ color: theme.subtle, fontSize: 13 }}>—</div>;
  if (!rows || rows.length === 0) {
    return <div style={{ color: theme.subtle, fontSize: 13 }}>당일 주문 없음</div>;
  }
  return (
    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
      <thead><tr style={{ color: theme.subtle, textAlign: "left" }}>
        <th style={th}>시각</th><th style={th}>티커</th><th style={th}>구분</th>
        <th style={th}>수량</th><th style={th}>가격</th><th style={th}>상태</th>
      </tr></thead>
      <tbody>
        {rows.map((r, i) => {
          const time = r.ord_tmd || r.ord_time || r.dmst_ord_dt || "-";
          const ticker = r.pdno || r.ovrs_pdno || r.symb || "-";
          const side = (r.sll_buy_dvsn_cd === "01" || r.buy_sll_dvsn_cd === "01") ? "매도"
                     : (r.sll_buy_dvsn_cd === "02" || r.buy_sll_dvsn_cd === "02") ? "매수"
                     : (r.sll_buy_dvsn_cd || r.buy_sll_dvsn_cd || "-");
          const qty = r.ord_qty || r.tot_ccld_qty || "-";
          const price = r.ord_unpr || r.ord_unpr3 || r.avg_prvs || "-";
          const status = r.ord_stat_name || r.ccld_yn || (r.rmn_qty > 0 ? "미체결" : "체결");
          return (
            <tr key={i} style={{ borderTop: `1px solid ${theme.border}` }}>
              <td style={td}>{time}</td>
              <td style={td}>{ticker}</td>
              <td style={td}>{side}</td>
              <td style={td}>{qty}</td>
              <td style={td}>{price}</td>
              <td style={td}>{status}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const inp = (theme) => ({
  width: "100%", boxSizing: "border-box",
  padding: "8px 10px", borderRadius: 6,
  border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 13,
});
const th = { padding: "6px 8px", fontWeight: 600, fontSize: 11, textTransform: "uppercase" };
const td = { padding: "6px 8px" };
const btnPrimary = {
  padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
  background: "linear-gradient(135deg,#60a5fa 0%,#3b82f6 50%,#6366f1 100%)", color: "white",
};
const btnSecondary = {
  padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
  background: "#DBEAFE", color: "#1e3a5f",
};
const btnDanger = {
  padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
  background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "white",
};
const btnDefault = {
  padding: "8px 14px", borderRadius: 8, border: "1px solid #E5E7EB", cursor: "pointer", fontWeight: 600, fontSize: 13,
  background: "#ffffff", color: "#374151",
};

/* ─────────────────────────────── Binance 등록 폼 */
function BinanceRegister({ theme, env, reload, setMsg }) {
  const [form, setForm] = useState({
    binanceApiKey: "", binanceApiSecret: "",
    binanceMode: "SPOT",
    maxOrderUsd: env === "REAL" ? 200 : 2000,
    dailyOrderUsd: env === "REAL" ? 1000 : 10000,
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const cleanKey = (form.binanceApiKey || "").replace(/[\s\u200B\u00A0]/g, "");
    const cleanSecret = (form.binanceApiSecret || "").replace(/[\s\u200B\u00A0]/g, "");
    if (cleanKey.length < 20) {
      setMsg({ type: "err", text: `API Key가 너무 짧습니다 (${cleanKey.length}자). Binance에서 발급한 키를 확인해 주세요.` });
      return;
    }
    if (cleanSecret.length < 20) {
      setMsg({ type: "err", text: `API Secret이 너무 짧습니다 (${cleanSecret.length}자).` });
      return;
    }
    const envLabel = env === "MOCK" ? "테스트넷" : "메인넷";
    if (!window.confirm(
      `[${envLabel}] Binance 계정으로 등록합니다.\n\n` +
      `• API Key: ${cleanKey.slice(0, 6)} … ${cleanKey.slice(-5)} (${cleanKey.length}자)\n` +
      `• Mode: ${form.binanceMode}\n\n` +
      `${env === "REAL" ? "⚠️ 실전 계정입니다. API 권한이 최소한으로 설정되었는지 확인하세요." : ""}\n\n` +
      `계속하시겠습니까?`
    )) return;

    setSaving(true); setMsg(null);
    try {
      await upsertBrokerAccount({
        brokerType: "BINANCE", env,
        binanceApiKey: cleanKey, binanceApiSecret: cleanSecret,
        binanceMode: form.binanceMode,
        maxOrderUsd: form.maxOrderUsd, dailyOrderUsd: form.dailyOrderUsd,
      });
      setMsg({ type: "ok", text: `Binance ${envLabel} 계정 등록 완료. 연결 테스트를 진행하세요.` });
      reload();
    } catch (err) {
      setMsg({ type: "err", text: "등록 실패: " + (err?.response?.data?.error || err.message) });
    } finally { setSaving(false); }
  };

  return (
    <Card theme={theme}>
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>
        {env === "MOCK" ? "🧪 Binance 테스트넷 등록" : "🟡 Binance 메인넷 등록"}
      </h2>
      {env === "REAL" && (
        <div style={{ background: "#FEF3C7", color: "#92400E", padding: 10, borderRadius: 6, fontSize: 12, marginBottom: 14 }}>
          ⚠️ 실전 계정입니다. Binance API 키 생성 시 <strong>IP 화이트리스트</strong>를 반드시 설정하고,
          필요한 권한(스팟: Enable Spot & Margin / 선물: Enable Futures)만 최소로 부여하세요.
        </div>
      )}
      <form onSubmit={submit} autoComplete="off" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <input type="text" name="username" autoComplete="username" style={{ display: "none" }} />
        <input type="password" name="password" autoComplete="current-password" style={{ display: "none" }} />
        <Field label="API Key" col={2}>
          <input style={inp(theme)} value={form.binanceApiKey} name={`bnb-key-${env}`}
            autoComplete="off" spellCheck="false"
            placeholder="Binance API Key (64자)"
            onChange={e => setForm(f => ({ ...f, binanceApiKey: e.target.value }))} required />
        </Field>
        <Field label="API Secret" col={2}>
          <input type="text" style={{ ...inp(theme), fontFamily: "monospace", fontSize: 11 }}
            value={form.binanceApiSecret} name={`bnb-secret-${env}`}
            autoComplete="off" spellCheck="false"
            placeholder="Binance API Secret (64자)"
            onChange={e => setForm(f => ({ ...f, binanceApiSecret: e.target.value }))} required />
        </Field>
        <Field label="거래 모드">
          <select style={inp(theme)} value={form.binanceMode}
            onChange={e => setForm(f => ({ ...f, binanceMode: e.target.value }))}>
            <option value="SPOT">SPOT (현물)</option>
            <option value="FUTURES">FUTURES (선물)</option>
          </select>
        </Field>
        <Field label="" />
        <Field label="1회 최대 주문 (USD)">
          <input type="number" min="0" style={inp(theme)} value={form.maxOrderUsd}
            onChange={e => setForm(f => ({ ...f, maxOrderUsd: Number(e.target.value) }))} />
        </Field>
        <Field label="일일 누적 한도 (USD)">
          <input type="number" min="0" style={inp(theme)} value={form.dailyOrderUsd}
            onChange={e => setForm(f => ({ ...f, dailyOrderUsd: Number(e.target.value) }))} />
        </Field>
        <div style={{ gridColumn: "1 / -1", marginTop: 6 }}>
          <button type="submit" disabled={saving} style={btnPrimary}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </Card>
  );
}

/* ─────────────────────────────── Binance 활성 계좌 */
function BinanceActive({ theme, env, acct, reload, setMsg }) {
  const [balance, setBalance] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(acct.binanceMode || "SPOT");

  const refresh = async () => {
    try {
      const b = await getBinanceBalance(env, mode);
      setBalance(b);
    } catch {}
  };
  useEffect(() => { setBalance(null); if (acct.lastVerifiedAt) refresh(); }, [env, acct.id, mode]);

  const doTest = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await testBinanceAccount(env, mode);
      const bal = res.balance || {};
      const summary = mode === "FUTURES"
        ? `잔고 ${Number(bal.totalWalletBalance || 0).toFixed(2)} USDT (가용: ${Number(bal.availableBalance || 0).toFixed(2)})`
        : `잔고 ${Number(bal.totalUsdtValue || 0).toFixed(2)} USDT`;
      setMsg({ type: "ok", text: `Binance 연결 성공 — ${summary}` });
      setBalance(bal);
      reload();
    } catch (e) {
      setMsg({ type: "err", text: "테스트 실패: " + (e?.response?.data?.error || e.message) });
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!confirm(`${env} Binance 계정을 삭제할까요?`)) return;
    setBusy(true);
    try { await deleteBrokerAccount(env, "BINANCE"); reload(); }
    catch (e) { setMsg({ type: "err", text: "삭제 실패: " + (e?.response?.data?.error || e.message) }); }
    finally { setBusy(false); }
  };

  // 매매 스위치 토글 (brokerType=BINANCE 명시 — 미지정 시 백엔드가 KIS 로 라우팅하는 버그 회피)
  const doToggleTrading = async () => {
    const next = !acct.tradingEnabled;
    if (next && env === "REAL" && !confirm("실전(메인넷) Binance 매매를 활성화합니다. 실제 자산으로 주문이 나갈 수 있어요. 계속할까요?")) return;
    setBusy(true); setMsg(null);
    try {
      await setBrokerTrading(env, next, "BINANCE");
      setMsg({ type: "ok", text: `매매 스위치 ${next ? "ON ✅" : "OFF"}` });
      reload();
    } catch (e) {
      setMsg({ type: "err", text: "스위치 변경 실패: " + (e?.response?.data?.error || e.message) });
    } finally { setBusy(false); }
  };

  const infoRow = (label, value) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, borderBottom: `1px solid ${theme.border}` }}>
      <span style={{ color: theme.subtle }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card theme={theme}>
        <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>
          🟡 Binance {env === "MOCK" ? "테스트넷" : "메인넷"} 계정
        </h2>
        {infoRow("API Key", acct.binanceApiKeyMasked || "—")}
        {infoRow("거래 모드", acct.binanceMode || "SPOT")}
        {infoRow("매매 활성화", acct.tradingEnabled ? "✅ ON" : "❌ OFF")}
        {infoRow("마지막 검증", acct.lastVerifiedAt ? new Date(acct.lastVerifiedAt).toLocaleString("ko-KR") : "미검증")}
        {infoRow("1회 한도", `$${(acct.maxOrderUsd || 0).toLocaleString()}`)}
        {infoRow("일일 한도", `$${(acct.dailyOrderUsd || 0).toLocaleString()}`)}

        {/* 모드 선택 */}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {["SPOT", "FUTURES"].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              ...btnDefault, fontSize: 12,
              background: mode === m ? "#DBEAFE" : "#ffffff",
              color: mode === m ? "#1e3a5f" : "#374151",
              fontWeight: mode === m ? 700 : 600,
            }}>{m}</button>
          ))}
        </div>

        <div className="action-row" style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={doTest} disabled={busy} style={btnPrimary}>
            {busy ? "테스트 중…" : "🔗 연결 테스트"}
          </button>
          {acct.lastVerifiedAt && (
            <button onClick={doToggleTrading} disabled={busy}
              style={acct.tradingEnabled ? btnDanger : { ...btnPrimary, background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
              {acct.tradingEnabled ? "⏸ 매매 OFF" : "▶ 매매 ON"}
            </button>
          )}
          <button onClick={() => refresh()} disabled={busy} style={btnSecondary}>
            잔고 새로고침
          </button>
          <button onClick={doDelete} disabled={busy} style={btnDanger}>
            삭제
          </button>
        </div>
      </Card>

      {/* 현물 주문 폼 (SPOT + 검증완료일 때만) */}
      {mode === "SPOT" && acct.lastVerifiedAt && (
        <BinanceOrderForm theme={theme} env={env} acct={acct} setMsg={setMsg} onPlaced={refresh} />
      )}
      {mode === "FUTURES" && (
        <Card theme={theme}>
          <div style={{ fontSize: 13, color: theme.subtle }}>
            ⚠️ 선물(FUTURES) 주문은 현재 비활성화되어 있습니다 — 안전을 위해 <strong>SPOT(현물)</strong>만 지원합니다.
            (잔고·포지션 조회는 가능)
          </div>
        </Card>
      )}

      {/* 잔고 카드 */}
      {balance && (
        <Card theme={theme}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>💰 {mode} 잔고</h3>
          {mode === "FUTURES" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                ["지갑 잔고", `${Number(balance.totalWalletBalance || 0).toFixed(4)} USDT`],
                ["가용 잔고", `${Number(balance.availableBalance || 0).toFixed(4)} USDT`],
                ["미실현 손익", `${Number(balance.totalUnrealizedProfit || 0).toFixed(4)} USDT`],
              ].map(([k, v]) => (
                <div key={k} style={{ background: theme.bg, borderRadius: 8, padding: "8px 12px", border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: 11, color: theme.subtle }}>{k}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: theme.subtle, marginBottom: 8 }}>
                총 추정 USDT 가치: <strong>{Number(balance.totalUsdtValue || 0).toFixed(4)} USDT</strong>
                &nbsp;|&nbsp; 거래 가능: {balance.canTrade ? "✅" : "❌"}
              </div>
              {Array.isArray(balance.balances) && balance.balances.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: theme.bg }}>
                      <th style={th}>자산</th><th style={th}>가용</th><th style={th}>잠금</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balance.balances.map((b, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td style={td}><strong>{b.asset}</strong></td>
                        <td style={td}>{Number(b.free).toFixed(8)}</td>
                        <td style={td}>{Number(b.locked).toFixed(8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* 오픈 포지션 (선물만) */}
          {mode === "FUTURES" && Array.isArray(balance.openPositions) && balance.openPositions.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>오픈 포지션</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: theme.bg }}>
                    <th style={th}>심볼</th><th style={th}>수량</th><th style={th}>진입가</th>
                    <th style={th}>미실현P&L</th><th style={th}>레버리지</th>
                  </tr>
                </thead>
                <tbody>
                  {balance.openPositions.map((p, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={td}><strong>{p.symbol}</strong></td>
                      <td style={{ ...td, color: p.positionAmt > 0 ? "#16a34a" : "#dc2626" }}>
                        {p.positionAmt > 0 ? "▲" : "▼"} {Math.abs(p.positionAmt)}
                      </td>
                      <td style={td}>{Number(p.entryPrice).toFixed(4)}</td>
                      <td style={{ ...td, color: Number(p.unrealizedPnl) >= 0 ? "#16a34a" : "#dc2626" }}>
                        {Number(p.unrealizedPnl).toFixed(4)}
                      </td>
                      <td style={td}>{p.leverage}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/* ─────────────────────────────── Binance 현물 주문 폼 (분수 수량 · MARKET/LIMIT · USDT) */
function BinanceOrderForm({ theme, env, acct, setMsg, onPlaced }) {
  const [form, setForm] = useState({ symbol: "BTCUSDT", side: "BUY", quantity: "", type: "MARKET", limitPrice: "" });
  const [quote, setQuote] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const fetchQuote = async (symbol) => {
    if (!symbol || !acct.lastVerifiedAt) { setQuote(null); return; }
    try { setQuote(await getBrokerQuote(env, symbol, "BINANCE")); } catch { setQuote(null); }
  };

  const buildBody = () => ({
    ticker: (form.symbol || "").toUpperCase(),
    side: form.side,
    quantity: form.quantity ? Number(form.quantity) : 0,
    limitPrice: form.type === "LIMIT" && form.limitPrice ? Number(form.limitPrice) : null,
  });

  const doPreview = async () => {
    setBusy(true); setMsg(null);
    try { setPreview(await previewBrokerOrder(env, buildBody(), "BINANCE")); }
    catch (e) { setMsg({ type: "err", text: "프리뷰 실패: " + (e?.response?.data?.error || e.message) }); }
    finally { setBusy(false); }
  };
  const doPlace = async () => {
    if (!preview?.ok) return;
    setBusy(true); setMsg(null);
    try {
      const r = await placeBrokerOrder(env, buildBody(), "BINANCE");
      setMsg({ type: "ok", text: `Binance 주문 전송 완료 — 주문번호 ${r.order_no || "(응답확인)"}${r.status_code ? ` (${r.status_code})` : ""}` });
      setPreview(null);
      onPlaced?.();
    } catch (e) {
      setMsg({ type: "err", text: "주문 실패: " + (e?.response?.data?.error || e.message) });
    } finally { setBusy(false); }
  };

  const overLimit = preview?.over_single_limit;
  const isLimit = form.type === "LIMIT";

  return (
    <Card theme={theme}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>🪙 Binance 현물 주문 ({env === "REAL" ? "메인넷" : "테스트넷"})</h3>
      <div style={{ display: "grid", gridTemplateColumns: isLimit ? "1.6fr 1fr 1fr 1.2fr 1.2fr auto" : "1.6fr 1fr 1fr 1.4fr auto", gap: 8, alignItems: "end" }}>
        <Field label="심볼 (예: BTCUSDT)">
          <input style={inp(theme)} value={form.symbol}
            onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
            onBlur={e => fetchQuote(e.target.value.trim().toUpperCase())} />
        </Field>
        <Field label="매매구분">
          <select style={inp(theme)} value={form.side}
            onChange={e => setForm(f => ({ ...f, side: e.target.value }))}>
            <option value="BUY">매수</option><option value="SELL">매도</option>
          </select>
        </Field>
        <Field label="주문유형">
          <select style={inp(theme)} value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
            <option value="MARKET">시장가</option><option value="LIMIT">지정가</option>
          </select>
        </Field>
        <Field label="수량 (코인)">
          <input type="number" step="any" min="0" style={inp(theme)} value={form.quantity}
            placeholder="예: 0.001"
            onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
        </Field>
        {isLimit && (
          <Field label="지정가 (USDT)">
            <input type="number" step="any" style={inp(theme)} value={form.limitPrice}
              onChange={e => setForm(f => ({ ...f, limitPrice: e.target.value }))} />
          </Field>
        )}
        <button onClick={doPreview} disabled={busy} style={btnSecondary}>프리뷰</button>
      </div>

      {quote && quote.last_price > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: theme.subtle }}>
          📊 <b>{form.symbol}</b> 현재가:{" "}
          <b style={{ color: theme.text }}>{Number(quote.last_price).toLocaleString(undefined, { maximumFractionDigits: 8 })} USDT</b>
          {isLimit && <>
            {" · "}
            <button type="button"
              onClick={() => setForm(f => ({ ...f, limitPrice: String(quote.last_price) }))}
              style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
              이 가격으로 입력 →
            </button>
          </>}
        </div>
      )}

      {preview && (
        <div style={{
          marginTop: 14, padding: 12, borderRadius: 8,
          background: overLimit ? "#FEE2E2" : (form.side === "BUY" ? "#DCFCE7" : "#FEE2E2"),
          color: overLimit ? "#991B1B" : (form.side === "BUY" ? "#166534" : "#991B1B"),
          fontSize: 13,
        }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            {overLimit ? "❌ 한도 초과" : `✅ ${preview.side} ${preview.quantity} ${preview.ticker}${isLimit ? ` @ ${preview.limit_price} USDT` : " (시장가)"}`}
          </div>
          <div>예상 명목가: ${Number(preview.est_total_usd).toFixed(2)} / 1건 한도 ${preview.max_order_usd}{!isLimit && preview.ref_price > 0 ? ` · 참고가 ${Number(preview.ref_price).toLocaleString(undefined, { maximumFractionDigits: 8 })} USDT` : ""}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
            <button onClick={doPlace} disabled={busy || !preview.ok || !acct.tradingEnabled}
              style={form.side === "BUY" ? btnPrimary : btnDanger}>
              {acct.tradingEnabled ? `🚀 ${form.side === "BUY" ? "매수" : "매도"} 실행` : "매매 스위치 OFF"}
            </button>
            <button onClick={() => setPreview(null)} style={btnDefault}>취소</button>
          </div>
        </div>
      )}
    </Card>
  );
}

