import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, ChevronDown, CheckCircle2, Info, UserCircle } from "lucide-react";
import useStore from "../store/useStore";
import partnerDefault from "../assets/hero_default.png";
import clientDefault from "../assets/heli_face.png";
import { bankApi } from "../api/bank.api";
import { profileApi } from "../api/profile.api";
import { paymentMethodsApi } from "../api/paymentMethods.api";
import { useLanguage } from "../i18n/LanguageContext";

const BASE_FONT = "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PRIMARY = "linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)";
const FIELD_STYLE = {
  width: "100%", padding: "12px 16px", borderRadius: 12,
  border: "1.5px solid #E5E7EB", fontSize: 14, fontWeight: 500,
  color: "#111827", backgroundColor: "white", fontFamily: BASE_FONT,
  outline: "none", boxSizing: "border-box",
};
const READONLY_STYLE = {
  ...FIELD_STYLE, backgroundColor: "#F9FAFB", color: "#6B7280", cursor: "default",
};
const LABEL_STYLE = {
  fontSize: 13, fontWeight: 600, color: "#374151",
  marginBottom: 6, fontFamily: BASE_FONT, display: "block",
};

const BANKS = [
  "국민은행", "기업은행", "농협은행", "신한은행", "우리은행", "하나은행",
  "SC제일은행", "씨티은행", "카카오뱅크", "토스뱅크", "케이뱅크",
  "새마을금고", "우체국", "신협", "수협", "부산은행", "대구은행",
  "광주은행", "제주은행", "전북은행", "경남은행",
];

/* ── Toast 팝업 ── */
function Toast({ msg, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2800);
    return () => clearTimeout(t);
  }, [onClose]);  // onClose는 마운트 시 1회만 타이머 설정 의도
  return (
    <div style={{
      position: "fixed", top: 28, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, backgroundColor: "#111827", color: "white",
      padding: "14px 28px", borderRadius: 14,
      fontSize: 14, fontWeight: 600, fontFamily: BASE_FONT,
      boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
      display: "flex", alignItems: "center", gap: 10,
      animation: "fadeInDown 0.25s ease",
    }}>
      <span style={{ fontSize: 18 }}>✅</span> {msg}
    </div>
  );
}

/* ── 달력 팝업 ── */
function DatePicker({ value, onChange, disabled }) {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("day"); // "day" | "year" | "month"
  const ref = useRef(null);
  const yearListRef = useRef(null);
  const parsed = value ? new Date(value) : null;
  const [viewYear, setViewYear] = useState(parsed?.getFullYear() || 1995);
  const [viewMonth, setViewMonth] = useState(parsed ? parsed.getMonth() : 4);

  useEffect(() => {
    const fn = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setView("day");
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // 년도 목록 열릴 때 현재 년도로 자동 스크롤
  useEffect(() => {
    if (view === "year" && yearListRef.current) {
      const YEAR_START = 1940;
      const ROW_H = 34;
      yearListRef.current.scrollTop = (viewYear - YEAR_START) * ROW_H - 100;
    }
  }, [view, viewYear]);

  const dim = (y, m) => new Date(y, m + 1, 0).getDate();
  const fd  = new Date(viewYear, viewMonth, 1).getDay();
  const MONTHS = t("myPage.calendar.months");
  const DAYS   = t("myPage.calendar.weekdays");
  const total  = Math.ceil((fd + dim(viewYear, viewMonth)) / 7) * 7;

  const YEAR_START = 1940;
  const YEAR_END   = new Date().getFullYear() + 5;
  const YEARS = Array.from({ length: YEAR_END - YEAR_START + 1 }, (_, i) => YEAR_START + i);

  const prevM = () => { if (viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); };
  const nextM = () => { if (viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); };
  const pick  = (d) => {
    const mm=String(viewMonth+1).padStart(2,"0"), dd=String(d).padStart(2,"0");
    onChange(`${viewYear}-${mm}-${dd}`); setOpen(false); setView("day");
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input readOnly value={value||""} placeholder="YYYY-MM-DD"
          onClick={() => !disabled && setOpen(o=>!o)}
          style={{ ...FIELD_STYLE, cursor: disabled?"default":"pointer",
            backgroundColor: disabled?"#F9FAFB":"white", paddingRight: 44 }} />
        <span
          onClick={() => !disabled && setOpen(o=>!o)}
          style={{ position:"absolute", right:13, top:"50%", transform:"translateY(-50%)",
            fontSize:21, lineHeight:1, cursor: disabled?"default":"pointer", userSelect:"none" }}>
          🗓️
        </span>
      </div>
      {open && (
        <div style={{
          position:"absolute", top:"calc(100% + 6px)", left:0, zIndex:300,
          backgroundColor:"white", borderRadius:14,
          boxShadow:"0 8px 30px rgba(0,0,0,0.14)", border:"1px solid #E5E7EB",
          padding:"12px 10px", width:234, fontFamily:BASE_FONT,
        }}>

          {/* ── 날짜 캘린더 뷰 ── */}
          {view === "day" && (<>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <button onClick={prevM} style={{ background:"none",border:"none",fontSize:17,cursor:"pointer",color:"#374151",padding:"2px 6px" }}>↑</button>
              <span
                onClick={() => setView("year")}
                style={{ fontWeight:700, fontSize:13, color:"#111827", cursor:"pointer",
                  display:"flex", alignItems:"center", gap:4, userSelect:"none" }}>
                {lang === "en" ? `${MONTHS[viewMonth]} ${viewYear}` : lang === "zh" ? `${viewYear}年 ${MONTHS[viewMonth]}` : `${viewYear}년 ${MONTHS[viewMonth]}`}
                <span style={{ fontSize:11, color:"#6B7280" }}>▼</span>
              </span>
              <button onClick={nextM} style={{ background:"none",border:"none",fontSize:17,cursor:"pointer",color:"#374151",padding:"2px 6px" }}>↓</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:2 }}>
              {DAYS.map((d,i)=>(
                <div key={d} style={{ textAlign:"center", fontSize:11, fontWeight:600, padding:"3px 0",
                  color: i===0?"#EF4444":i===6?"#3B82F6":"#9CA3AF" }}>{d}</div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:1 }}>
              {Array.from({length:total},(_,idx)=>{
                const d=idx-fd+1, valid=d>=1&&d<=dim(viewYear,viewMonth);
                const mm=String(viewMonth+1).padStart(2,"0"), dd=String(d).padStart(2,"0");
                const isSel = value===`${viewYear}-${mm}-${dd}`;
                const dow=idx%7;
                return (
                  <div key={idx} onClick={()=>valid&&pick(d)}
                    style={{ textAlign:"center", padding:"5px 1px", borderRadius:7, fontSize:12,
                      fontWeight:isSel?700:500, cursor:valid?"pointer":"default",
                      color:!valid?"transparent":isSel?"white":dow===0?"#EF4444":dow===6?"#3B82F6":"#111827",
                      backgroundColor:isSel?"#3B82F6":"transparent", transition:"background 0.1s" }}
                    onMouseEnter={e=>{if(valid&&!isSel)e.currentTarget.style.backgroundColor="#EFF6FF";}}
                    onMouseLeave={e=>{if(!isSel)e.currentTarget.style.backgroundColor="transparent";}}
                  >{valid?d:""}</div>
                );
              })}
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:10, borderTop:"1px solid #F3F4F6", paddingTop:8 }}>
              <button onClick={()=>{onChange("");setOpen(false);}}
                style={{ background:"none",border:"none",fontSize:12,color:"#EF4444",cursor:"pointer",fontFamily:BASE_FONT }}>{t("myPage.calendar.delete")}</button>
              <button onClick={()=>{
                const now=new Date(); setViewYear(now.getFullYear()); setViewMonth(now.getMonth());
                const mm=String(now.getMonth()+1).padStart(2,"0"), dd=String(now.getDate()).padStart(2,"0");
                onChange(`${now.getFullYear()}-${mm}-${dd}`); setOpen(false);
              }} style={{ background:"none",border:"none",fontSize:12,color:"#3B82F6",cursor:"pointer",fontFamily:BASE_FONT }}>{t("myPage.calendar.today")}</button>
            </div>
          </>)}

          {/* ── 년도 선택 뷰 ── */}
          {view === "year" && (<>
            <div style={{ fontWeight:700, fontSize:13, color:"#111827", textAlign:"center", marginBottom:8 }}>
              {t("myPage.calendar.yearSelect")}
            </div>
            <div ref={yearListRef} style={{ height:220, overflowY:"auto", borderRadius:8,
              border:"1px solid #F3F4F6" }}>
              {YEARS.map(y => {
                const isCur = y === viewYear;
                return (
                  <div key={y} onClick={() => { setViewYear(y); setView("month"); }}
                    style={{ padding:"7px 14px", cursor:"pointer", fontSize:13, fontWeight:isCur?700:400,
                      backgroundColor: isCur?"#3B82F6":"transparent",
                      color: isCur?"white":"#111827", transition:"background 0.1s" }}
                    onMouseEnter={e=>{ if(!isCur) e.currentTarget.style.backgroundColor="#EFF6FF"; }}
                    onMouseLeave={e=>{ if(!isCur) e.currentTarget.style.backgroundColor="transparent"; }}>
                    {lang === "en" ? `${y}` : lang === "zh" ? `${y}年` : `${y}년`}
                  </div>
                );
              })}
            </div>
            <button onClick={() => setView("day")}
              style={{ marginTop:8, background:"none",border:"none",fontSize:12,color:"#6B7280",
                cursor:"pointer",fontFamily:BASE_FONT,padding:"4px 0" }}>
              {t("myPage.calendar.backToCalendar")}
            </button>
          </>)}

          {/* ── 월 선택 뷰 ── */}
          {view === "month" && (<>
            <div
              onClick={() => setView("year")}
              style={{ fontWeight:700, fontSize:13, color:"#111827", textAlign:"center",
                marginBottom:12, cursor:"pointer", display:"flex", alignItems:"center",
                justifyContent:"center", gap:4, userSelect:"none" }}>
              <span style={{ fontSize:11, color:"#6B7280" }}>◀</span>
              {lang === "en" ? `${viewYear}` : lang === "zh" ? `${viewYear}年` : `${viewYear}년`}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6 }}>
              {MONTHS.map((m, i) => {
                const isCur = i === viewMonth;
                return (
                  <div key={i} onClick={() => { setViewMonth(i); setView("day"); }}
                    style={{ padding:"9px 4px", textAlign:"center", borderRadius:8, fontSize:13,
                      fontWeight:isCur?700:400, cursor:"pointer",
                      backgroundColor: isCur?"#3B82F6":"transparent",
                      color: isCur?"white":"#111827", border: isCur?"none":"1px solid #F3F4F6",
                      transition:"background 0.1s" }}
                    onMouseEnter={e=>{ if(!isCur) e.currentTarget.style.backgroundColor="#EFF6FF"; }}
                    onMouseLeave={e=>{ if(!isCur) e.currentTarget.style.backgroundColor="transparent"; }}>
                    {m}
                  </div>
                );
              })}
            </div>
          </>)}

        </div>
      )}
    </div>
  );
}

/* ── 계좌 등록 카드 ── */
function BankCard({ onToast }) {
  const { t } = useLanguage();
  const [bank, setBank]             = useState("");
  const [accountNum, setAccountNum] = useState("");
  const [owner, setOwner]           = useState("");
  const [authShown, setAuthShown]   = useState(false);
  const [authCode, setAuthCode]     = useState("");
  const [authDone, setAuthDone]     = useState(false);
  const [connected, setConnected]   = useState(false);
  const [loading, setLoading]       = useState(false);

  // 마운트 시 기존 계좌 정보 로드
  useEffect(() => {
    bankApi.getAccount()
      .then(data => {
        if (data.verified) {
          setBank(data.bankName);
          setAccountNum(data.accountNumber);
          setOwner(data.accountHolder);
          setAuthDone(true);
          setConnected(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleVerify = async () => {
    if (!bank || !accountNum || !owner) {
      onToast(t("myPage.bankAccount.toasts.fillAll")); return;
    }
    // JWT는 HttpOnly 쿠키로 이전됐기 때문에 localStorage.accessToken 가드는 더이상 무효.
    // 로그인 여부는 dbId(비민감 식별자)로 확인하고, 토큰 만료 등 실제 인증 실패는 백엔드 401로 잡는다.
    if (!localStorage.getItem("dbId")) {
      onToast(t("myPage.bankAccount.toasts.loginRequired")); return;
    }
    setLoading(true);
    try {
      const res = await bankApi.sendCode();
      onToast(`가입 이메일로 3자리 인증코드가 발송되었어요. (개발모드 코드: ${res.mockCode})`);
      setAuthShown(true);
    } catch (err) {
      if (err?.response?.status === 401) {
        onToast(t("myPage.bankAccount.toasts.sessionExpired"));
      } else {
        const msg = err?.response?.data?.message || t("myPage.bankAccount.toasts.issueFailed") || "Failed to issue verification code.";
        onToast(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAuthConfirm = async () => {
    if (!authCode) return;
    setLoading(true);
    try {
      await bankApi.verifyCode(authCode, bank, accountNum, owner);
      onToast(t("myPage.bankAccount.toasts.verified"));
      setAuthDone(true);
      setAuthShown(false);
    } catch (err) {
      if (err?.response?.status === 401) {
        onToast(t("myPage.bankAccount.toasts.sessionExpired"));
      } else {
        const msg = err?.response?.data?.message || t("myPage.bankAccount.toasts.codeMismatch") || "Code mismatch.";
        onToast(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    if (!authDone) { onToast(t("myPage.bankAccount.toasts.verifyFirst")); return; }
    setConnected(true);
    onToast(t("myPage.bankAccount.toasts.registered"));
  };

  return (
    <div style={{
      backgroundColor:"white", borderRadius:24,
      boxShadow:"0 2px 20px rgba(0,0,0,0.07)",
      padding:"28px 28px 24px",
    }}>
      <h2 style={{ fontSize:22, fontWeight:800, color:"#111827", marginBottom:26, fontFamily:BASE_FONT }}>
        {t("myPage.bankAccount.title")}
      </h2>

      {/* 은행 선택 */}
      <div style={{ marginBottom:20 }}>
        <label style={LABEL_STYLE}>{t("myPage.bankAccount.bankSelect")}</label>
        <div style={{ position:"relative" }}>
          <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:20, color:"#60A5FA" }}>🏦</span>
          <select value={bank} onChange={e=>setBank(e.target.value)}
            style={{ ...FIELD_STYLE, paddingLeft:44, paddingRight:40, appearance:"none", cursor:"pointer",
              color: bank?"#111827":"#9CA3AF" }}>
            <option value="">{t("myPage.bankAccount.bankDefault")}</option>
            {BANKS.map(b=><option key={b} value={b}>{b}</option>)}
          </select>
          <ChevronDown size={16} color="#9CA3AF"
            style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} />
        </div>
      </div>

      {/* 계좌번호 */}
      <div style={{ marginBottom:20 }}>
        <label style={LABEL_STYLE}>{t("myPage.bankAccount.accountNumber")}</label>
        <input value={accountNum} onChange={e=>setAccountNum(e.target.value.replace(/\D/g,""))}
          placeholder={t("myPage.bankAccount.accountPlaceholder")} inputMode="numeric"
          style={{ ...FIELD_STYLE, backgroundColor:"#F9FAFB" }} />
      </div>

      {/* 예금주 확인 */}
      <div style={{ marginBottom: authShown ? 14 : 20 }}>
        <label style={LABEL_STYLE}>{t("myPage.bankAccount.holderVerify")}</label>
        <div style={{ display:"flex", gap:10 }}>
          <input value={owner} onChange={e=>setOwner(e.target.value)}
            placeholder={authDone ? t("myPage.bankAccount.verifiedPlaceholder") : t("myPage.bankAccount.holderPlaceholder")}
            readOnly={authDone}
            style={{ ...FIELD_STYLE, flex:1, backgroundColor:"#F9FAFB" }} />
          {!authDone && (
            <button onClick={handleVerify} disabled={loading}
              style={{
                flexShrink:0, padding:"12px 24px", borderRadius:12,
                border:"none", background:"linear-gradient(135deg,#93C5FD,#818CF8)",
                fontSize:14, fontWeight:700, color:"white",
                cursor: loading ? "not-allowed" : "pointer", fontFamily:BASE_FONT,
                boxShadow:"0 2px 10px rgba(99,102,241,0.25)",
                opacity: loading ? 0.7 : 1,
              }}>{loading ? t("myPage.bankAccount.issuing") : t("myPage.bankAccount.verifyBtn")}</button>
          )}
          {authDone && (
            <div style={{ display:"flex", alignItems:"center", gap:6, color:"#10B981", fontWeight:700, fontSize:14, fontFamily:BASE_FONT, flexShrink:0 }}>
              <CheckCircle2 size={18} /> {t("myPage.bankAccount.verified")}
            </div>
          )}
        </div>
      </div>

      {/* 인증번호 입력 (확인 후 표시) */}
      {authShown && (
        <div style={{ marginBottom:20 }}>
          <label style={LABEL_STYLE}>{t("myPage.bankAccount.codeLabel")}</label>
          <div style={{ display:"flex", gap:10 }}>
            <input value={authCode} onChange={e=>setAuthCode(e.target.value)}
              placeholder={t("myPage.bankAccount.codePlaceholder")} inputMode="numeric"
              style={{ ...FIELD_STYLE, flex:1 }} />
            <button onClick={handleAuthConfirm} disabled={loading}
              style={{
                flexShrink:0, padding:"12px 20px", borderRadius:12,
                border:"none", background:PRIMARY,
                fontSize:14, fontWeight:700, color:"white",
                cursor: loading ? "not-allowed" : "pointer", fontFamily:BASE_FONT,
                boxShadow:"0 2px 10px rgba(99,102,241,0.25)",
                opacity: loading ? 0.7 : 1,
              }}>{loading ? t("myPage.bankAccount.confirmingBtn") : t("myPage.bankAccount.confirmBtn")}</button>
          </div>
        </div>
      )}

      {/* 연결하기 / 등록완료 버튼 */}
      {connected ? (
        <div style={{
          width:"100%", padding:"16px 0", borderRadius:16,
          background:"linear-gradient(135deg,#D1FAE5,#A7F3D0)",
          fontSize:16, fontWeight:700, color:"#065F46",
          display:"flex", alignItems:"center", justifyContent:"center", gap:10,
          marginBottom:16, boxSizing:"border-box",
        }}>
          <CheckCircle2 size={20} /> {t("myPage.bankAccount.registeredLabel")}
        </div>
      ) : (
        <button onClick={handleConnect}
          style={{
            width:"100%", padding:"16px 0", borderRadius:16,
            border:"none", background: authDone ? PRIMARY : "#D1D5DB",
            fontSize:16, fontWeight:700, color:"white",
            cursor: authDone ? "pointer" : "not-allowed", fontFamily:BASE_FONT,
            display:"flex", alignItems:"center", justifyContent:"center", gap:10,
            boxShadow: authDone ? "0 4px 18px rgba(99,102,241,0.35)" : "none",
            marginBottom:16,
          }}
          onMouseEnter={e=>{ if(authDone) e.currentTarget.style.opacity="0.9"; }}
          onMouseLeave={e=>e.currentTarget.style.opacity="1"}
        >
          {t("myPage.bankAccount.connectBtn")}
        </button>
      )}

      {/* 안내 문구 */}
      <div style={{ display:"flex", gap:8, padding:"14px 16px", backgroundColor:"#F0F9FF",
        borderRadius:12, border:"1px solid #DBEAFE" }}>
        <Info size={16} color="#60A5FA" style={{ flexShrink:0, marginTop:1 }} />
        <p style={{ margin:0, fontSize:13, color:"#374151", lineHeight:1.6, fontFamily:BASE_FONT }}>
          {t("myPage.bankAccount.instruction")}
        </p>
      </div>
    </div>
  );
}

/* ── 카드 결제수단 카드 (Client + Partner 공통) ── */
function PaymentMethodsCard({ onToast }) {
  const { t } = useLanguage();
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const reload = () => {
    setLoading(true);
    paymentMethodsApi.list()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  const handleSetDefault = async (id) => {
    try { await paymentMethodsApi.setDefault(id); reload(); onToast?.(t("myPage.card.toasts.defaultChanged")); }
    catch (e) { onToast?.(e?.response?.data?.message || t("myPage.card.toasts.defaultChanged")); }
  };
  const handleRemove = async (id) => {
    if (!window.confirm(t("myPage.card.delete") + "?")) return;
    try { await paymentMethodsApi.remove(id); reload(); onToast?.(t("myPage.card.toasts.deleted")); }
    catch (e) { onToast?.(e?.response?.data?.message || t("myPage.card.toasts.deleted")); }
  };

  return (
    <div style={{
      background:"white", borderRadius:24, padding:32,
      boxShadow:"0 4px 20px rgba(0,0,0,0.06)", border:"1px solid #F3F4F6",
    }}>
      <h2 style={{
        fontSize:20, fontWeight:800, color:"#1F2937", marginBottom:6,
        display:"flex", alignItems:"center", gap:10, fontFamily:BASE_FONT,
      }}>
        {t("myPage.card.title")}
      </h2>
      <p style={{ marginTop:0, marginBottom:20, fontSize:13, color:"#6B7280", fontFamily:BASE_FONT }}>
        {t("myPage.card.desc")}
      </p>

      {loading && (
        <div style={{ padding:24, textAlign:"center", color:"#9CA3AF", fontFamily:BASE_FONT }}>
          {t("myPage.card.loading")}
        </div>
      )}

      {!loading && list.length === 0 && (
        <div style={{
          padding:"28px 16px", textAlign:"center", color:"#6B7280",
          background:"#F9FAFB", borderRadius:12, marginBottom:16, fontFamily:BASE_FONT, fontSize:14,
        }}>
          {t("myPage.card.noCard")}
        </div>
      )}

      {!loading && list.map((c) => (
        <div key={c.id} style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"14px 16px", marginBottom:10, borderRadius:14,
          background: c.isDefault ? "linear-gradient(135deg,#EFF6FF,#E0E7FF)" : "#F9FAFB",
          border: c.isDefault ? "1px solid #C7D2FE" : "1px solid #E5E7EB",
          fontFamily:BASE_FONT,
        }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#1F2937" }}>
              {c.brand} •••• {c.last4}
              {c.isDefault && (
                <span style={{
                  marginLeft:8, padding:"2px 8px", borderRadius:8,
                  background:"#3B82F6", color:"white", fontSize:11, fontWeight:700,
                }}>{t("myPage.card.defaultBadge")}</span>
              )}
            </div>
            <div style={{ fontSize:12, color:"#6B7280", marginTop:3 }}>
              {c.holderName} · {String(c.expMonth).padStart(2,"0")}/{String(c.expYear).slice(-2)}
              {c.nickname ? ` · ${c.nickname}` : ""}
            </div>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            {!c.isDefault && (
              <button onClick={() => handleSetDefault(c.id)} style={{
                padding:"6px 12px", borderRadius:8, border:"1px solid #E5E7EB",
                background:"white", fontSize:12, color:"#374151", fontWeight:600,
                cursor:"pointer", fontFamily:BASE_FONT,
              }}>{t("myPage.card.setDefault")}</button>
            )}
            <button onClick={() => handleRemove(c.id)} style={{
              padding:"6px 12px", borderRadius:8, border:"1px solid #FCA5A5",
              background:"white", fontSize:12, color:"#DC2626", fontWeight:600,
              cursor:"pointer", fontFamily:BASE_FONT,
            }}>{t("myPage.card.delete")}</button>
          </div>
        </div>
      ))}

      <button onClick={() => setShowAdd(true)} style={{
        width:"100%", padding:"14px 0", marginTop:8, borderRadius:14,
        border:"1px dashed #93C5FD", background:"#F0F9FF",
        fontSize:14, fontWeight:700, color:"#2563EB",
        cursor:"pointer", fontFamily:BASE_FONT,
      }}>
        {t("myPage.card.addCard")}
      </button>

      {showAdd && (
        <CardRegisterModal
          onClose={() => setShowAdd(false)}
          onSuccess={(_created) => { setShowAdd(false); reload(); onToast?.(t("myPage.card.toasts.registered")); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}

/* ── 카드 등록 모달 ── */
function CardRegisterModal({ onClose, onSuccess, onToast }) {
  const { t } = useLanguage();
  const [num, setNum]           = useState("");      // "1234 5678 9012 3456"
  const [holder, setHolder]     = useState("");
  const [exp, setExp]           = useState("");      // "MM/YY"
  const [cvc, setCvc]           = useState("");
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const formatNum = (raw) => raw.replace(/\D/g,"").slice(0,19).replace(/(.{4})/g, "$1 ").trim();
  const formatExp = (raw) => {
    const d = raw.replace(/\D/g,"").slice(0,4);
    if (d.length < 3) return d;
    return d.slice(0,2) + "/" + d.slice(2);
  };

  const _luhnOk = (digits) => {
    if (digits.length < 13) return false;
    let sum = 0, alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = parseInt(digits[i], 10);
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  };

  const handleSubmit = async () => {
    const digits = num.replace(/\D/g,"");
    const expDigits = exp.replace(/\D/g,"");
    if (digits.length < 13 || digits.length > 19)
                                   return onToast?.(t("myPage.card.toasts.invalidNumber"));
    if (!holder.trim())            return onToast?.(t("myPage.card.toasts.holderRequired"));
    if (expDigits.length !== 4)    return onToast?.(t("myPage.card.toasts.expiryFormat"));
    if (cvc.length < 3)            return onToast?.(t("myPage.card.toasts.cvcRequired"));
    const month = parseInt(expDigits.slice(0,2), 10);
    const yr2   = parseInt(expDigits.slice(2), 10);
    const year  = 2000 + yr2;
    if (month < 1 || month > 12)   return onToast?.(t("myPage.card.toasts.invalidMonth"));

    setSubmitting(true);
    try {
      const created = await paymentMethodsApi.create({
        number: digits, holderName: holder.trim(),
        expMonth: month, expYear: year,
        cvc, nickname: nickname.trim() || null,
      });
      onSuccess?.(created);
    } catch (e) {
      onToast?.(e?.response?.data?.message || t("myPage.card.toasts.registerFail"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1100,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20, fontFamily:BASE_FONT,
    }} onClick={onClose}>
      <div style={{
        background:"white", borderRadius:20, padding:28, width:"100%", maxWidth:440,
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin:0, marginBottom:6, fontSize:20, fontWeight:800, color:"#1F2937" }}>
          {t("myPage.card.modal.title")}
        </h3>
        <p style={{ margin:0, marginBottom:20, fontSize:12, color:"#9CA3AF" }}>
          {t("myPage.card.modal.desc")}
        </p>

        <label style={LABEL_STYLE}>{t("myPage.card.modal.cardNumber")}</label>
        <input value={num} onChange={(e) => setNum(formatNum(e.target.value))}
          placeholder="1234 5678 9012 3456" inputMode="numeric"
          style={{ ...FIELD_STYLE, marginBottom:14 }} />

        <label style={LABEL_STYLE}>{t("myPage.card.modal.holderName")}</label>
        <input value={holder} onChange={(e) => setHolder(e.target.value.toUpperCase())}
          placeholder="HONG GIL DONG"
          style={{ ...FIELD_STYLE, marginBottom:14 }} />

        <div style={{ display:"flex", gap:12, marginBottom:14 }}>
          <div style={{ flex:1 }}>
            <label style={LABEL_STYLE}>{t("myPage.card.modal.expiry")}</label>
            <input value={exp} onChange={(e) => setExp(formatExp(e.target.value))}
              placeholder="MM/YY" inputMode="numeric" style={FIELD_STYLE} />
          </div>
          <div style={{ flex:1 }}>
            <label style={LABEL_STYLE}>CVC</label>
            <input value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g,"").slice(0,4))}
              placeholder="123" inputMode="numeric" style={FIELD_STYLE} />
          </div>
        </div>

        <label style={LABEL_STYLE}>{t("myPage.card.modal.alias")}</label>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)}
          placeholder="예: 메인 카드"
          style={{ ...FIELD_STYLE, marginBottom:24 }} />

        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} disabled={submitting} style={{
            flex:1, padding:"14px 0", borderRadius:12, border:"1px solid #E5E7EB",
            background:"white", color:"#374151", fontSize:14, fontWeight:600,
            cursor: submitting ? "not-allowed" : "pointer", fontFamily:BASE_FONT,
          }}>{t("myPage.card.modal.cancel")}</button>
          <button onClick={handleSubmit} disabled={submitting} style={{
            flex:1.4, padding:"14px 0", borderRadius:12, border:"none",
            background:"linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)",
            color:"white", fontSize:14, fontWeight:700,
            cursor: submitting ? "not-allowed" : "pointer", fontFamily:BASE_FONT,
            opacity: submitting ? 0.7 : 1,
          }}>{submitting ? t("myPage.card.modal.registering") : t("myPage.card.modal.register")}</button>
        </div>
      </div>
    </div>
  );
}


/* ── 입학/졸업 년월 선택 픽커 ── */
function YearMonthPicker({ value, onChange, disabled }) {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const yearListRef = useRef(null);

  const parts    = value ? value.split("-") : [];
  const selYear  = parts[0] ? parseInt(parts[0]) : null;
  const selMonth = parts[1] ? parseInt(parts[1]) : null;
  const [viewYear, setViewYear] = useState(() => selYear || new Date().getFullYear());

  const YEAR_START = 1940;
  const YEAR_END   = new Date().getFullYear() + 10;
  const YEARS = Array.from({ length: YEAR_END - YEAR_START + 1 }, (_, i) => YEAR_START + i);

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  useEffect(() => {
    if (open && yearListRef.current) {
      const ROW_H = 34;
      yearListRef.current.scrollTop = Math.max(0, (viewYear - YEAR_START) * ROW_H - 90);
    }
  }, [open, viewYear]);

  const display  = selYear && selMonth
    ? lang === "en" ? `${t("myPage.calendar.months")[selMonth-1]} ${selYear}`
    : lang === "zh" ? `${selYear}年 ${String(selMonth).padStart(2,"0")}月`
    : `${selYear}년 ${String(selMonth).padStart(2,"0")}월`
    : "";
  const pickMonth = (m) => { onChange(`${viewYear}-${String(m).padStart(2,"0")}`); setOpen(false); };

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <div style={{ position:"relative" }}>
        <input readOnly value={display} placeholder={lang === "en" ? "---- --" : lang === "zh" ? "----年 --月" : "----년 --월"}
          onClick={() => !disabled && setOpen(o=>!o)}
          style={{ ...FIELD_STYLE, cursor:disabled?"default":"pointer",
            backgroundColor:disabled?"#F9FAFB":"white", paddingRight:44 }} />
        <span onClick={() => !disabled && setOpen(o=>!o)}
          style={{ position:"absolute", right:13, top:"50%", transform:"translateY(-50%)",
            fontSize:17, cursor:disabled?"default":"pointer", userSelect:"none", color:"#9CA3AF" }}>🗓</span>
      </div>
      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 6px)", left:0, zIndex:400,
          backgroundColor:"white", borderRadius:14,
          boxShadow:"0 8px 30px rgba(0,0,0,0.14)", border:"1px solid #E5E7EB",
          padding:"12px 10px", width:230, fontFamily:BASE_FONT }}>
          {/* 년도 목록 */}
          <div ref={yearListRef} style={{ height:152, overflowY:"auto", borderRadius:8,
            border:"1px solid #F3F4F6", marginBottom:8 }}>
            {YEARS.map(y => {
              const isSel  = y === selYear;
              const isView = y === viewYear;
              return (
                <div key={y} onClick={() => setViewYear(y)}
                  style={{ padding:"7px 14px", cursor:"pointer", fontSize:13,
                    fontWeight:isSel?700:400,
                    backgroundColor:isSel?"#3B82F6":isView&&!isSel?"#EFF6FF":"transparent",
                    color:isSel?"white":"#111827", transition:"background 0.1s" }}
                  onMouseEnter={e => { if(!isSel) e.currentTarget.style.backgroundColor="#EFF6FF"; }}
                  onMouseLeave={e => { if(!isSel) e.currentTarget.style.backgroundColor=isView?"#EFF6FF":"transparent"; }}>
                  {y}
                </div>
              );
            })}
          </div>
          {/* 월 그리드 */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:3, marginBottom:8 }}>
            {Array.from({length:12},(_,i)=>i+1).map(m => {
              const isSel = m===selMonth && viewYear===selYear;
              return (
                <div key={m} onClick={() => pickMonth(m)}
                  style={{ padding:"7px 2px", textAlign:"center", borderRadius:7,
                    fontSize:13, fontWeight:isSel?700:400,
                    backgroundColor:isSel?"#3B82F6":"transparent",
                    color:isSel?"white":"#111827",
                    cursor:"pointer", transition:"background 0.1s", border:"1px solid #F3F4F6" }}
                  onMouseEnter={e => { if(!isSel) e.currentTarget.style.backgroundColor="#EFF6FF"; }}
                  onMouseLeave={e => { if(!isSel) e.currentTarget.style.backgroundColor="transparent"; }}>
                  {m}
                </div>
              );
            })}
          </div>
          {/* 삭제 / 이번 달 */}
          <div style={{ display:"flex", justifyContent:"space-between",
            borderTop:"1px solid #F3F4F6", paddingTop:8 }}>
            <button onClick={() => { onChange(""); setOpen(false); }}
              style={{ background:"none", border:"none", fontSize:12, color:"#EF4444",
                cursor:"pointer", fontFamily:BASE_FONT }}>{t("myPage.calendar.delete")}</button>
            <button onClick={() => {
              const now=new Date();
              onChange(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`);
              setOpen(false);
            }} style={{ background:"none", border:"none", fontSize:12, color:"#3B82F6",
              cursor:"pointer", fontFamily:BASE_FONT }}>{t("myPage.calendar.thisMonth")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 학력 입력 폼 카드 ── */
function EducationForm({ formData, onChange, onSave, onCancel }) {
  const { schoolType } = formData;
  const isHigh       = schoolType === "고등학교";
  const isUniv       = schoolType === "대학교(4년)";
  const isGrad       = schoolType === "대학원(석사)" || schoolType === "대학원(박사)";
  const isUnivOrGrad = isUniv || isGrad;

  const selStyle = (val) => ({
    ...FIELD_STYLE, appearance:"none", paddingRight:36, cursor:"pointer",
    color: val ? "#111827" : "#9CA3AF",
  });

  return (
    <div style={{ backgroundColor:"white", borderRadius:20, border:"1px solid #E5E7EB",
      boxShadow:"0 2px 14px rgba(0,0,0,0.06)", padding:"22px 22px 18px",
      marginBottom:16, position:"relative" }}>

      {/* X 닫기 */}
      <button onClick={onCancel}
        style={{ position:"absolute", top:14, right:14, width:28, height:28, borderRadius:"50%",
          border:"none", background:"transparent", cursor:"pointer", fontSize:19,
          color:"#9CA3AF", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor="#F3F4F6"; e.currentTarget.style.color="#374151"; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor="transparent"; e.currentTarget.style.color="#9CA3AF"; }}>
        ×
      </button>

      {/* 학교 구분 + 안내 */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16,
        marginBottom: schoolType ? 18 : 0 }}>
        <div>
          <label style={LABEL_STYLE}>학교 구분<span style={{ color:"#EF4444" }}>*</span></label>
          <div style={{ position:"relative" }}>
            <select value={schoolType} onChange={e=>onChange("schoolType",e.target.value)}
              style={selStyle(schoolType)}>
              <option value="">선택</option>
              <option>고등학교</option>
              <option>대학교(4년)</option>
              <option>대학원(석사)</option>
              <option>대학원(박사)</option>
            </select>
            <ChevronDown size={16} color="#9CA3AF"
              style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} />
          </div>
        </div>
        <div style={{ display:"flex", alignItems: schoolType?"flex-end":"center",
          paddingBottom: schoolType?10:0 }}>
          <span style={{ fontSize:13, color:"#9CA3AF", fontFamily:BASE_FONT }}>
            학교 구분에 따라 입력 항목이 변경됩니다.
          </span>
        </div>
      </div>

      {/* 미선택 안내 */}
      {!schoolType && (
        <div style={{ textAlign:"center", padding:"22px 0 4px",
          color:"#9CA3AF", fontSize:14, fontFamily:BASE_FONT }}>
          학교 구분을 선택해 주세요.
        </div>
      )}

      {/* ── 고등학교 필드 ── */}
      {isHigh && (<>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <div>
            <label style={LABEL_STYLE}>학교명<span style={{ color:"#EF4444" }}>*</span></label>
            <input value={formData.schoolName} onChange={e=>onChange("schoolName",e.target.value)}
              placeholder="학교명을 입력하세요" style={FIELD_STYLE} />
          </div>
          <div>
            <label style={LABEL_STYLE}>계열/전공</label>
            <input value={formData.track} onChange={e=>onChange("track",e.target.value)}
              placeholder="예: 인문계, 이공계, 예체능 등" style={FIELD_STYLE} />
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:8 }}>
          <div>
            <label style={LABEL_STYLE}>졸업 상태<span style={{ color:"#EF4444" }}>*</span></label>
            <div style={{ position:"relative" }}>
              <select value={formData.status} onChange={e=>onChange("status",e.target.value)}
                style={selStyle(formData.status)}>
                <option value="">선택</option>
                <option>졸업</option>
                <option>재학</option>
                <option>중퇴</option>
              </select>
              <ChevronDown size={16} color="#9CA3AF"
                style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} />
            </div>
          </div>
          <div>
            <label style={LABEL_STYLE}>입학년월</label>
            <YearMonthPicker value={formData.admissionDate} onChange={v=>onChange("admissionDate",v)} />
          </div>
          <div>
            <label style={LABEL_STYLE}>졸업년월</label>
            <YearMonthPicker value={formData.graduationDate} onChange={v=>onChange("graduationDate",v)} />
          </div>
        </div>
      </>)}

      {/* ── 대학교(4년) / 대학원 공통 필드 ── */}
      {isUnivOrGrad && (<>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <div>
            <label style={LABEL_STYLE}>학교명<span style={{ color:"#EF4444" }}>*</span></label>
            <input value={formData.schoolName} onChange={e=>onChange("schoolName",e.target.value)}
              placeholder="학교명을 입력하세요" style={FIELD_STYLE} />
          </div>
          <div>
            <label style={LABEL_STYLE}>전공명<span style={{ color:"#EF4444" }}>*</span></label>
            <input value={formData.major} onChange={e=>onChange("major",e.target.value)}
              placeholder="전공명을 입력하세요" style={FIELD_STYLE} />
          </div>
          <div>
            <label style={LABEL_STYLE}>학위 종류<span style={{ color:"#EF4444" }}>*</span></label>
            <div style={{ position:"relative" }}>
              <select value={formData.degreeType} onChange={e=>onChange("degreeType",e.target.value)}
                style={selStyle(formData.degreeType)}>
                <option value="">선택</option>
                {isUniv && <><option>학사</option><option>전문학사</option></>}
                {isGrad && <><option>석사</option><option>박사</option><option>명예박사</option></>}
              </select>
              <ChevronDown size={16} color="#9CA3AF"
                style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} />
            </div>
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <div>
            <label style={LABEL_STYLE}>졸업 상태<span style={{ color:"#EF4444" }}>*</span></label>
            <div style={{ position:"relative" }}>
              <select value={formData.status} onChange={e=>onChange("status",e.target.value)}
                style={selStyle(formData.status)}>
                <option value="">선택</option>
                <option>졸업</option>
                <option>재학</option>
                <option>중퇴</option>
              </select>
              <ChevronDown size={16} color="#9CA3AF"
                style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} />
            </div>
          </div>
          <div>
            <label style={LABEL_STYLE}>입학년월</label>
            <YearMonthPicker value={formData.admissionDate} onChange={v=>onChange("admissionDate",v)} />
          </div>
          <div>
            <label style={LABEL_STYLE}>졸업년월</label>
            <YearMonthPicker value={formData.graduationDate} onChange={v=>onChange("graduationDate",v)} />
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <div>
            <label style={LABEL_STYLE}>학점 (GPA)</label>
            <input value={formData.gpa} onChange={e=>onChange("gpa",e.target.value)}
              placeholder="0.00" type="number" min="0" max="5" step="0.01" style={FIELD_STYLE} />
          </div>
          <div>
            <label style={LABEL_STYLE}>기준 학점</label>
            <div style={{ position:"relative" }}>
              <select value={formData.gpaScale} onChange={e=>onChange("gpaScale",e.target.value)}
                style={{ ...FIELD_STYLE, appearance:"none", paddingRight:36, cursor:"pointer" }}>
                <option>4.5</option>
                <option>4.3</option>
                <option>4.0</option>
                <option>100</option>
              </select>
              <ChevronDown size={16} color="#9CA3AF"
                style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} />
            </div>
          </div>
        </div>
      </>)}

      {/* ── 대학원 전용: 연구 주제 / 논문 제목 ── */}
      {isGrad && (
        <div style={{ marginBottom:16 }}>
          <label style={LABEL_STYLE}>연구 주제 / 논문 제목</label>
          <input value={formData.researchTopic} onChange={e=>onChange("researchTopic",e.target.value)}
            placeholder="수행한 연구 주제 또는 논문 제목을 입력하세요" style={FIELD_STYLE} />
        </div>
      )}

      {/* 저장 버튼 */}
      {schoolType && (
        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
          <button onClick={onSave}
            style={{ padding:"11px 30px", borderRadius:10, border:"none",
              background:"#DBEAFE", fontSize:14, fontWeight:600, color:"#1e3a5f",
              cursor:"pointer", fontFamily:BASE_FONT, transition:"background 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background="#BFDBFE"}
            onMouseLeave={e => e.currentTarget.style.background="#DBEAFE"}>
            저장
          </button>
        </div>
      )}
    </div>
  );
}

/* ── 저장된 학력 요약 행 ── */
function EducationItem({ item, onEdit, onDelete }) {
  const [editHov, setEditHov] = useState(false);
  const [delHov,  setDelHov]  = useState(false);

  const nameStr = item.schoolName + (item.major || item.track ? ` | ${item.major || item.track}` : "");
  const meta    = [item.schoolType, item.degreeType, item.status].filter(Boolean).join(" · ");

  return (
    <div style={{ display:"flex", alignItems:"center", padding:"14px 18px",
      backgroundColor:"white", borderRadius:16, border:"1px solid #E5E7EB",
      boxShadow:"0 1px 6px rgba(0,0,0,0.04)", marginBottom:10 }}>
      <div style={{ width:42, height:42, borderRadius:12, backgroundColor:"#EFF6FF",
        display:"flex", alignItems:"center", justifyContent:"center",
        marginRight:14, flexShrink:0 }}>
        <GraduationCap size={21} color="#3B82F6" />
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:15, fontWeight:700, color:"#111827", fontFamily:BASE_FONT,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {nameStr}
        </div>
        <div style={{ fontSize:13, color:"#6B7280", fontFamily:BASE_FONT, marginTop:2 }}>
          {meta}
        </div>
      </div>
      <div style={{ display:"flex", gap:4, flexShrink:0 }}>
        <button
          onMouseEnter={() => setEditHov(true)} onMouseLeave={() => setEditHov(false)}
          onClick={() => onEdit(item.id)}
          style={{ width:34, height:34, borderRadius:8, border:"none", cursor:"pointer",
            backgroundColor:editHov?"#DBEAFE":"transparent",
            display:"flex", alignItems:"center", justifyContent:"center", transition:"background 0.2s" }}>
          <Pencil size={15} color={editHov?"#3B82F6":"#9CA3AF"} />
        </button>
        <button
          onMouseEnter={() => setDelHov(true)} onMouseLeave={() => setDelHov(false)}
          onClick={() => onDelete(item.id)}
          style={{ width:34, height:34, borderRadius:8, border:"none", cursor:"pointer",
            backgroundColor:delHov?"#FEE2E2":"transparent",
            display:"flex", alignItems:"center", justifyContent:"center", transition:"background 0.2s" }}>
          <Trash2 size={15} color={delHov?"#EF4444":"#9CA3AF"} />
        </button>
      </div>
    </div>
  );
}

/* ── 학력 관리 섹션 ── */
function EducationSection({ onToast }) {
  const [savedEntries, setSavedEntries] = useState([]);
  const [activeForms,  setActiveForms]  = useState([]);
  const idCounter   = useRef(1);
  const tempCounter = useRef(1);

  const isBeingEdited = (id) => activeForms.some(f => f.originalId === id);

  const INIT_DATA = () => ({
    schoolType:"", schoolName:"", track:"", major:"", degreeType:"",
    status:"", admissionDate:"", graduationDate:"", gpa:"", gpaScale:"4.5", researchTopic:"",
  });

  const handleAddForm = () => {
    setActiveForms(prev => [...prev, {
      tempId: tempCounter.current++, originalId: null, data: INIT_DATA(),
    }]);
  };

  const handleFormChange = (tempId, field, val) => {
    setActiveForms(prev => prev.map(f =>
      f.tempId === tempId ? { ...f, data: { ...f.data, [field]: val } } : f
    ));
  };

  const handleFormSave = (tempId) => {
    const form = activeForms.find(f => f.tempId === tempId);
    if (!form) return;
    const { data } = form;
    if (!data.schoolType)       { onToast("학교 구분을 선택해 주세요.");  return; }
    if (!data.schoolName.trim()){ onToast("학교명을 입력해 주세요.");     return; }
    if (!data.status)           { onToast("졸업 상태를 선택해 주세요."); return; }

    if (form.originalId !== null) {
      setSavedEntries(prev => prev.map(e =>
        e.id === form.originalId ? { ...e, ...data } : e
      ));
    } else {
      setSavedEntries(prev => [...prev, { id: idCounter.current++, ...data }]);
    }
    setActiveForms(prev => prev.filter(f => f.tempId !== tempId));
    onToast("학력이 저장되었습니다.");
  };

  const handleFormCancel = (tempId) => {
    setActiveForms(prev => prev.filter(f => f.tempId !== tempId));
  };

  const handleEdit = (entryId) => {
    const entry = savedEntries.find(e => e.id === entryId);
    if (!entry || isBeingEdited(entryId)) return;
    setActiveForms(prev => [...prev, {
      tempId: tempCounter.current++, originalId: entryId, data: { ...entry },
    }]);
  };

  const handleDelete = (entryId) => {
    setSavedEntries(prev => prev.filter(e => e.id !== entryId));
  };

  return (
    <div style={{ marginTop:36, fontFamily:BASE_FONT }}>
      <h2 style={{ fontSize:22, fontWeight:800, color:"#111827", margin:"0 0 6px", fontFamily:BASE_FONT }}>
        학력 관리
      </h2>
      <p style={{ fontSize:14, color:"#6B7280", margin:"0 0 22px", fontFamily:BASE_FONT }}>
        귀하의 학술적 배경을 입력하여 신뢰도를 높여보세요. 학교, 전공 및 학위 정보를 추가할 수 있습니다.
      </p>

      {/* 저장된 학력 목록 (편집 중인 항목은 폼으로 대체) */}
      {savedEntries.map(entry => {
        const editForm = activeForms.find(f => f.originalId === entry.id);
        if (editForm) {
          return (
            <EducationForm key={editForm.tempId}
              formData={editForm.data}
              onChange={(field,val) => handleFormChange(editForm.tempId, field, val)}
              onSave={() => handleFormSave(editForm.tempId)}
              onCancel={() => handleFormCancel(editForm.tempId)} />
          );
        }
        return (
          <EducationItem key={entry.id} item={entry}
            onEdit={handleEdit} onDelete={handleDelete} />
        );
      })}

      {/* 새로 추가 중인 폼들 */}
      {activeForms.filter(f => f.originalId === null).map(form => (
        <EducationForm key={form.tempId}
          formData={form.data}
          onChange={(field,val) => handleFormChange(form.tempId, field, val)}
          onSave={() => handleFormSave(form.tempId)}
          onCancel={() => handleFormCancel(form.tempId)} />
      ))}

      {/* 학력 추가 버튼 */}
      <div onClick={handleAddForm}
        style={{ padding:"18px 0", border:"2px dashed #D1D5DB", borderRadius:16,
          display:"flex", alignItems:"center", justifyContent:"center",
          gap:8, cursor:"pointer", color:"#6B7280", fontSize:15, fontWeight:600,
          backgroundColor:"white", transition:"all 0.15s", marginBottom:6 }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor="#93C5FD";
          e.currentTarget.style.color="#3B82F6";
          e.currentTarget.style.backgroundColor="#F0F9FF";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor="#D1D5DB";
          e.currentTarget.style.color="#6B7280";
          e.currentTarget.style.backgroundColor="white";
        }}>
        <span style={{ fontSize:22, lineHeight:1 }}>⊕</span> 학력 추가
      </div>

      {/* 전체 설정 저장하기 */}
      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:20 }}>
        <button
          onClick={() => onToast("학력 정보가 전체 저장되었습니다.")}
          style={{ padding:"15px 36px", borderRadius:16, border:"none", background:PRIMARY,
            fontSize:16, fontWeight:700, color:"white", cursor:"pointer", fontFamily:BASE_FONT,
            boxShadow:"0 4px 18px rgba(99,102,241,0.35)" }}
          onMouseEnter={e => e.currentTarget.style.opacity="0.9"}
          onMouseLeave={e => e.currentTarget.style.opacity="1"}>
          전체 설정 저장하기
        </button>
      </div>
    </div>
  );
}

/* ── 메인 컴포넌트 ── */
function Mypage() {
  const { t, lang: _lang } = useLanguage();
  const { 
    user, loginUser, setUser, userRole, username: storeUsername, 
    partnerProfile, setPartnerProfile, 
    clientProfileDetail, setClientProfileDetail,
    bumpProfileRefresh,
    clearAll 
  } = useStore();
  const navigate = useNavigate();
  const [isEditing, setIsEditing]   = useState(false);
  const [toast, setToast]           = useState(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [loading, setLoading]       = useState(true);
  const heroInputRef = useRef(null);

  const handleWithdraw = () => {
    clearAll();
    navigate("/signup", { replace: true });
  };

  const showToast = (msg) => setToast(msg);

  // 사용자 타입 판별: store userRole 우선 → user.userType → localStorage('userType')
  const storedUserType = typeof window !== 'undefined' ? localStorage.getItem('userType') : null;
  const normalizedRole = (userRole || user?.userType || storedUserType || "").toString().toLowerCase();
  const isPartner = normalizedRole === "partner";
  const defaultHero = isPartner ? partnerDefault : clientDefault;

  // gender 변환 헬퍼 함수
  const toKoreanGender = (enumGender) => {
    if (!enumGender) return "남성";
    switch (enumGender.toUpperCase()) {
      case "FEMALE": return "여성";
      case "MALE": return "남성";
      case "OTHER": return "기타";
      default: return enumGender; // 이미 한글이면 그대로 반환
    }
  };

  const toEnglishGender = (koreanGender) => {
    switch (koreanGender) {
      case "여성": return "FEMALE";
      case "남성": return "MALE";
      case "기타": return "OTHER";
      default: return koreanGender; // 이미 영문이면 그대로 반환
    }
  };

  // 컴포넌트 마운트 시 DB에서 최신 데이터 가져오기
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        const data = await profileApi.getMyDetail();
        
        // user 객체 업데이트 (DB에서 가져온 최신 데이터)
        const updatedUser = {
          ...user,
          email: data.email || user?.email,
          username: data.username || user?.username,
          phone: data.phone || user?.phone,
          birthDate: data.birthDate || user?.birthDate,
          region: data.region || user?.region,
          gender: toKoreanGender(data.gender) || user?.gender,
          taxEmail: data.taxEmail || user?.taxEmail,
          contactEmail: data.contactEmail || user?.contactEmail,
          heroImage: data.profileImageUrl || user?.heroImage,
          githubUsername: data.githubUsername !== undefined ? data.githubUsername : user?.githubUsername,
          userType: data.userType || user?.userType,
          serviceField: data.serviceField || user?.serviceField,
          industry: data.industry || user?.industry,
        };
        setUser(updatedUser);

        // 파트너 프로필 업데이트
        if (isPartner && data.serviceField) {
          setPartnerProfile({
            ...partnerProfile,
            serviceField: data.serviceField,
          });
        }

        // 클라이언트 프로필 업데이트
        if (!isPartner && data.industry) {
          setClientProfileDetail({
            ...clientProfileDetail,
            industry: data.industry,
          });
        }
      } catch (error) {
        console.error("사용자 데이터 로드 실패:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 시 1회만

  // userInfo를 user 객체에서 동적으로 생성 (저장 후에도 업데이트된 값 반영)
  const userInfo = {
    name:        user?.name        || loginUser?.name        || "랄라릴",
    loginEmail:  user?.email       || loginUser?.email       || "",
    nickname:    user?.username    || storeUsername          || "",
    gender:      user?.gender      || loginUser?.gender      || "남성",
    role:        user?.role        || loginUser?.role        || (isPartner ? "파트너" : "클라이언트"),
    partnerType: partnerProfile?.partnerType || user?.partnerType || "개인",
    birthdate:   user?.birthDate   || user?.birthdate   || "",  // birthDate 우선
    contact:     user?.phone       || user?.contact || "",  // phone 우선 매핑
    githubNickname: user?.githubNickname || user?.githubUsername || "",
    heroImage:   user?.heroImage   || defaultHero,
  };

  const [form, setForm]           = useState({ ...userInfo });
  const [heroPreview, setHeroPreview] = useState(null);

  // user가 변경될 때마다 form 업데이트 (저장 후 반영)
  useEffect(() => {
    if (!isEditing && !loading) {
      setForm({ ...userInfo });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, partnerProfile, clientProfileDetail, isEditing, loading]);

  const handleChange = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  const handleEdit = async () => {
    if (isEditing) {
      // 저장 모드 - API 호출하여 DB에 저장
      try {
        // 빈 문자열 필드 제거 (백엔드 파싱 에러 방지)
        const cleanValue = (val) => (val && val.trim() !== "" ? val : undefined);

        const payload = {
          email: cleanValue(form.loginEmail),
          username: cleanValue(form.nickname),
          phone: cleanValue(form.contact),
          birthDate: cleanValue(form.birthdate),
          profileImageUrl: heroPreview || cleanValue(form.heroImage),
          githubNickname: cleanValue(form.githubNickname),
        };

        Object.keys(payload).forEach(key => {
          if (payload[key] === undefined) delete payload[key];
        });

        console.log("📤 저장 요청 payload:", payload);
        const response = await profileApi.updateBasicInfo(payload);
        console.log("📥 백엔드 응답:", response);
        
        const updatedUser = {
          ...user,
          email: form.loginEmail || user?.email,
          username: form.nickname || user?.username,
          phone: form.contact,
          birthDate: form.birthdate,
          heroImage: heroPreview || form.heroImage,
          githubNickname: form.githubNickname,
          githubUsername: form.githubNickname,
        };
        setUser(updatedUser);
        
        
        showToast(response?.message || t("myPage.toasts.saved"));
        setIsEditing(false);
        // BannerCard 등 다른 컴포넌트 자동 갱신
        bumpProfileRefresh();
      } catch (error) {
        console.error("정보 저장 실패:", error);
        const errorMsg = error?.response?.data?.message || t("myPage.toasts.saveFailed");
        showToast(errorMsg);
      }
    } else {
      // 편집 모드로 전환
      setIsEditing(true);
    }
  };

  const handleCancel = () => {
    setForm({ ...userInfo });
    setHeroPreview(null);
    setIsEditing(false);
  };

  const handleHeroChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const imageData = ev.target.result;
      setHeroPreview(imageData);
      // form 상태도 업데이트
      setForm(prev => ({ ...prev, heroImage: imageData }));
    };
    reader.readAsDataURL(file);
  };

  const heroRaw = heroPreview || form.heroImage;
  const isValidHeroSrc = (s) => {
    if (!s || typeof s !== 'string') return false;
    if (/cdn\.devbridge\.com/i.test(s)) return false;
    return /^(data:|blob:|https?:\/\/|\/)/i.test(s);
  };
  const heroSrc = isValidHeroSrc(heroRaw) ? heroRaw : defaultHero;
  // PARTNER_TYPES는 회원가입에서 확정된 고정 정보 — 편집 불가
  const registeredPartnerType = partnerProfile?.partnerType || form.partnerType;

  return (
    <div style={{ minHeight:"calc(100vh - 44px)", backgroundColor:"#F8FAFC", fontFamily:BASE_FONT }}>
      <style>{`
        @keyframes fadeInDown {
          from { opacity:0; transform:translate(-50%,-12px); }
          to   { opacity:1; transform:translate(-50%,0); }
        }
      `}</style>

      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}

      <main style={{ maxWidth:1200, margin:"0 auto", padding:"36px 40px 80px" }}>

        {/* ── 페이지 헤더 ── */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:32, flexWrap:"wrap", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:18 }}>
            <div style={{
              width:54, height:54, borderRadius:17, flexShrink:0,
              background:"linear-gradient(135deg,#60a5fa 0%,#6366f1 100%)",
              display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:"0 6px 20px rgba(99,102,241,0.32)",
            }}>
              <UserCircle size={24} color="white" strokeWidth={2.2} />
            </div>
            <div>
              <h1 style={{
                margin:0, fontSize:26, fontWeight:800, lineHeight:1.15,
                background:"linear-gradient(90deg,#3b82f6 0%,#6366f1 100%)",
                WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
              }}>마이페이지</h1>
              <p style={{ margin:"5px 0 0", fontSize:13, color:"#64748B", fontWeight:500 }}>
                내 프로필 및 계정 정보를 관리하세요
              </p>
            </div>
          </div>
        </div>

        {/* ── 2열 레이아웃 ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, alignItems:"flex-start" }}>

          {/* ── 왼쪽: 마이페이지 정보 카드 ── */}
          <div style={{ backgroundColor:"white", borderRadius:24,
            boxShadow:"0 2px 20px rgba(0,0,0,0.07)", overflow:"hidden" }}>

            {/* 카드 타이틀 */}
            <div style={{ padding:"28px 28px 0" }}>
              <h2 style={{ fontSize:22, fontWeight:800, color:"#111827", marginBottom:20, fontFamily:BASE_FONT }}>
                {t("myPage.pageTitle")}
              </h2>
            </div>

            {/* 히어로 이미지 */}
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"0 28px 20px" }}>
              <div style={{ position:"relative", cursor: isEditing?"pointer":"default" }}
                onClick={() => isEditing && heroInputRef.current?.click()}>
                <div style={{ width:160, height:160, borderRadius:28,
                  overflow:"hidden", backgroundColor:"#EFF6FF", border:"3px solid #DBEAFE",
                  display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <img src={heroSrc} alt="hero"
                    style={{ width:"100%", height:"100%", objectFit:"cover" }}
                    onError={(e) => { e.currentTarget.src = defaultHero; }} />
                </div>
                {isEditing && (
                  <div style={{ position:"absolute", bottom:-4, right:-4,
                    width:36, height:36, borderRadius:"50%",
                    background:"#3B82F6", border:"2.5px solid white",
                    display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <Camera size={17} color="white" />
                  </div>
                )}
              </div>
              {!isEditing && (
                <div style={{ marginTop:8, fontSize:12, color:"#94A3B8", textAlign:"center" }}>
                  {t("myPage.imageHint")}
                </div>
              )}
              <input ref={heroInputRef} type="file" accept="image/*"
                onChange={handleHeroChange} style={{ display:"none" }} />
            </div>

            {/* 폼 영역 */}
            <div style={{ padding:"0 28px 28px" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"18px 20px" }}>

                {/* 구독 유형 — 현재 구독 플랜 표시 (수정 불가) */}
                <div>
                  <label style={LABEL_STYLE}>구독 유형</label>
                  <div style={{ ...READONLY_STYLE, display:"flex", alignItems:"center", justifyContent:"space-between", background:"#F8FAFC", color:"#64748B" }}>
                    <span>{(() => {
                      const ut = (user?.userType || storedUserType || "").toUpperCase();
                      if (ut === "PREMIUM") return "PREMIUM";
                      if (ut === "STANDARD" || ut === "PRO") return "STANDARD";
                      return "FREE";
                    })()}</span>
                    <span style={{ fontSize:10, color:"#94A3B8", fontWeight:600, letterSpacing:"0.05em" }}>{t("myPage.fixedLabel")}</span>
                  </div>
                </div>

                {/* 아이디 (이메일) */}
                <div>
                  <label style={LABEL_STYLE}>{t("myPage.fields.username")}<span style={{ color:"#EF4444" }}>*</span></label>
                  <input
                    value={isEditing ? form.loginEmail : userInfo.loginEmail}
                    onChange={e => handleChange("loginEmail", e.target.value)}
                    readOnly={!isEditing}
                    type="email"
                    style={isEditing ? FIELD_STYLE : READONLY_STYLE}
                    placeholder="이메일을 입력하세요"
                  />
                </div>

                {/* 닉네임 */}
                <div>
                  <label style={LABEL_STYLE}>닉네임</label>
                  <input
                    value={isEditing ? form.nickname : userInfo.nickname}
                    onChange={e => handleChange("nickname", e.target.value)}
                    readOnly={!isEditing}
                    style={isEditing ? FIELD_STYLE : READONLY_STYLE}
                    placeholder="닉네임을 입력하세요"
                    maxLength={50}
                  />
                </div>

                {/* 생년월일 */}
                <div>
                  <label style={LABEL_STYLE}>{t("myPage.fields.birthdate")}</label>
                  <DatePicker
                    value={isEditing?form.birthdate:userInfo.birthdate}
                    onChange={v=>handleChange("birthdate",v)}
                    disabled={!isEditing} />
                </div>

                {/* 연락처 */}
                <div>
                  <label style={LABEL_STYLE}>{t("myPage.fields.contact")}<span style={{ color:"#EF4444" }}>*</span></label>
                  <input value={isEditing?form.contact:userInfo.contact}
                    onChange={e=>handleChange("contact",e.target.value)}
                    readOnly={!isEditing} type="tel"
                    style={isEditing?FIELD_STYLE:READONLY_STYLE}
                    placeholder={t("myPage.fields.contactPlaceholder")} />
                </div>

                {/* GitHub 닉네임 (선택) */}
                <div>
                  <label style={LABEL_STYLE}>GitHub 닉네임</label>
                  <input value={isEditing?form.githubNickname:userInfo.githubNickname}
                    onChange={e=>handleChange("githubNickname",e.target.value)}
                    readOnly={!isEditing}
                    style={isEditing?FIELD_STYLE:READONLY_STYLE}
                    placeholder="GitHub 아이디 (선택)" />
                </div>

              </div>

              {/* 버튼 영역 */}
              <div style={{ marginTop:24 }}>
                {isEditing ? (
                  <div style={{ display:"flex", gap:12 }}>
                    <button onClick={handleCancel}
                      style={{
                        padding:"15px 90px", borderRadius:14, flexShrink:0,
                        border:"1.5px solid #D1D5DB", background:"white",
                        fontSize:15, fontWeight:600, color:"#374151",
                        cursor:"pointer", fontFamily:BASE_FONT,
                      }}>{t("myPage.buttons.cancel")}</button>
                    <button onClick={handleEdit}
                      style={{
                        flex:1, padding:"15px 0", borderRadius:14,
                        border:"none", background:PRIMARY,
                        fontSize:15, fontWeight:700, color:"white",
                        cursor:"pointer", fontFamily:BASE_FONT,
                        display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                        boxShadow:"0 4px 16px rgba(99,102,241,0.35)",
                      }}>
                      <CheckCircle2 size={18} />{t("myPage.buttons.save")}
                    </button>
                  </div>
                ) : (
                  <div style={{ display:"flex", justifyContent:"center" }}>
                    <button onClick={handleEdit}
                      style={{
                        width:"calc(100% - 120px)",
                        padding:"15px 0", borderRadius:14,
                        border:"none", background:PRIMARY,
                        fontSize:15, fontWeight:700, color:"white",
                        cursor:"pointer", fontFamily:BASE_FONT,
                        display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                        boxShadow:"0 4px 16px rgba(99,102,241,0.35)",
                      }}
                      onMouseEnter={e=>e.currentTarget.style.opacity="0.9"}
                      onMouseLeave={e=>e.currentTarget.style.opacity="1"}
                    >
                      <CheckCircle2 size={18} />{t("myPage.buttons.edit")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── 오른쪽: 계좌 등록 카드 + 카드 결제수단 ── */}
          <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
            <BankCard onToast={showToast} />
            <PaymentMethodsCard onToast={showToast} />
          </div>

        </div>

        {/* 하단 보조 링크 */}
        <div style={{ display:"flex", justifyContent:"center", gap:28, marginTop:20 }}>
          <button onClick={() => navigate("/find-password")}
            style={{ background:"none", border:"none", fontSize:13,
            color:"#9CA3AF", cursor:"pointer", fontFamily:BASE_FONT,
            textDecoration:"underline", padding:0 }}>{t("myPage.buttons.changePassword")}</button>
          <button onClick={() => setShowWithdraw(true)}
            style={{ background:"none", border:"none", fontSize:13,
            color:"#38BDF8", cursor:"pointer", fontFamily:BASE_FONT,
            textDecoration:"underline", padding:0 }}>{t("myPage.buttons.withdraw")}</button>
        </div>

        {/* 회원 탈퇴 확인 모달 */}
        {showWithdraw && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000,
            display:"flex", alignItems:"center", justifyContent:"center" }}
            onClick={() => setShowWithdraw(false)}>
            <div style={{ background:"white", borderRadius:20, padding:"36px 32px",
              maxWidth:400, width:"90%", boxShadow:"0 20px 60px rgba(0,0,0,0.2)",
              fontFamily:BASE_FONT }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize:32, textAlign:"center", marginBottom:12 }}>⚠️</div>
              <h2 style={{ fontSize:18, fontWeight:900, color:"#0F172A", margin:"0 0 10px",
                textAlign:"center" }}>{t("myPage.withdraw.title")}</h2>
              <p style={{ fontSize:13, color:"#64748B", textAlign:"center", lineHeight:1.7,
                margin:"0 0 8px" }}>
                {t("myPage.withdraw.desc")}
              </p>
              <p style={{ fontSize:13, color:"#3B82F6", textAlign:"center", lineHeight:1.7,
                margin:"0 0 24px", fontWeight:600 }}>
                {t("myPage.withdraw.canRejoin")}
              </p>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={() => setShowWithdraw(false)}
                  style={{ flex:1, padding:"11px 0", borderRadius:10,
                    border:"1.5px solid #E5E7EB", background:"white",
                    color:"#64748B", fontSize:14, fontWeight:600,
                    cursor:"pointer", fontFamily:BASE_FONT }}>{t("myPage.withdraw.cancel")}</button>
                <button onClick={handleWithdraw}
                  style={{ flex:1, padding:"11px 0", borderRadius:10,
                    border:"none", background:"#EF4444", color:"white",
                    fontSize:14, fontWeight:700, cursor:"pointer",
                    fontFamily:BASE_FONT }}>{t("myPage.withdraw.confirm")}</button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

export default Mypage;
