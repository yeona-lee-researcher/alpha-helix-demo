import { useState, useEffect, useRef } from "react";
import { Image as ImageIcon, Type, Trash2, Save, HelpCircle, Smile } from "lucide-react";
import StickerPickerModal from "./VisionBoard.StickerPickerModal";

const STORAGE = "alpha.visionBoard.v2";
const F = "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MEMO_COLORS = [
  "#FEF9C3", "#DBEAFE", "#DCFCE7", "#FCE7F3",
  "#EDE9FE", "#FFF7ED", "#FFEDD5", "#F0FDF4",
];

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE) || "[]"); } catch { return []; }
}
function save(items) {
  try { localStorage.setItem(STORAGE, JSON.stringify(items)); } catch {}
}

let _id = Date.now();
const uid = () => ++_id;

export default function VisionBoard() {
  const [items, setItems]         = useState(load);
  const [selected, setSelected]   = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [showText, setShowText]   = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [newText, setNewText]     = useState("");
  const [newColor, setNewColor]   = useState(MEMO_COLORS[0]);
  const [dirty, setDirty]         = useState(false);
  const [savedAnim, setSavedAnim] = useState(false);
  const [showDesc, setShowDesc]   = useState(false);

  const fileRef    = useRef(null);
  const canvasRef  = useRef(null);
  const itemsRef   = useRef(items);
  const dragging   = useRef(null); // { id, startX, startY, origX, origY }
  const resizing   = useRef(null); // { id, startX, startY, origW, origH }

  useEffect(() => { itemsRef.current = items; }, [items]);

  // items가 초기 로드 이후에 바뀔 때만 dirty 표시
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    setDirty(true);
  }, [items]);

  const handleSave = () => {
    save(itemsRef.current);
    setDirty(false);
    setSavedAnim(true);
    setTimeout(() => setSavedAnim(false), 1800);
  };

  /* ── 전역 마우스 핸들러 ── */
  useEffect(() => {
    const onMove = (e) => {
      if (dragging.current) {
        const { id, startX, startY, origX, origY } = dragging.current;
        setItems(prev => prev.map(x =>
          x.id === id
            ? { ...x, x: Math.max(0, origX + e.clientX - startX), y: Math.max(0, origY + e.clientY - startY) }
            : x
        ));
      }
      if (resizing.current) {
        const { id, startX, startY, origW, origH } = resizing.current;
        const item = itemsRef.current.find(x => x.id === id);
        setItems(prev => prev.map(x =>
          x.id === id ? {
            ...x,
            w: Math.max(100, origW + e.clientX - startX),
            ...(item?.type === "text" ? { h: Math.max(60, origH + e.clientY - startY) } : {}),
          } : x
        ));
      }
    };
    const onUp = () => { dragging.current = null; resizing.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  /* ── 이미지 추가 ── */
  const addImage = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { alert("이미지는 5MB 이하만 가능합니다."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const id = uid();
      setItems(prev => [...prev, {
        id, type: "image", src: reader.result, caption: "",
        x: 120 + Math.random() * 500, y: 80 + Math.random() * 350, w: 240,
      }]);
      setSelected(id);
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  /* ── 텍스트 추가 ── */
  const addText = () => {
    const text = newText.trim();
    if (!text) return;
    const id = uid();
    setItems(prev => [...prev, {
      id, type: "text", text, color: newColor,
      x: 140 + Math.random() * 450, y: 100 + Math.random() * 350, w: 210, h: 130,
    }]);
    setSelected(id);
    setNewText("");
    setShowText(false);
  };

  /* ── 삭제 ── */
  const remove = (id) => { setItems(prev => prev.filter(x => x.id !== id)); setSelected(null); };

  /* ── 드래그 시작 ── */
  const onStickerDown = (e, id) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (editingId === id) return; // 편집 중엔 드래그 안 함
    const item = itemsRef.current.find(x => x.id === id);
    if (!item) return;
    setSelected(id);
    // 선택 아이템을 맨 위로
    setItems(prev => { const it = prev.find(x => x.id === id); return [...prev.filter(x => x.id !== id), it]; });
    dragging.current = { id, startX: e.clientX, startY: e.clientY, origX: item.x, origY: item.y };
  };

  /* ── 리사이즈 시작 ── */
  const onResizeDown = (e, id) => {
    e.stopPropagation();
    e.preventDefault();
    const item = itemsRef.current.find(x => x.id === id);
    if (!item) return;
    resizing.current = { id, startX: e.clientX, startY: e.clientY, origW: item.w, origH: item.h ?? 130 };
  };

  /* ── 캔버스 클릭 (선택 해제) ── */
  const onCanvasClick = (e) => {
    if (e.target === canvasRef.current) { setSelected(null); setEditingId(null); }
  };

  const updateText    = (id, text)    => setItems(prev => prev.map(x => x.id === id ? { ...x, text }    : x));
  const updateCaption = (id, caption) => setItems(prev => prev.map(x => x.id === id ? { ...x, caption } : x));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 44px)", fontFamily: F, overflow: "hidden" }}>

      {/* ── 툴바 ── */}
      <div style={{
        background: "white", borderBottom: "1px solid #E2E8F0",
        padding: "9px 20px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        {/* 타이틀 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: "linear-gradient(135deg,#fbcfe8 0%,#e9d5ff 50%,#c7d2fe 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, fontSize: 18,
          }}>
            🖼️
          </div>
          <span style={{
            fontSize: 15, fontWeight: 800,
            background: "linear-gradient(90deg,#3b82f6,#6366f1)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            whiteSpace: "nowrap",
          }}>비전 보드</span>
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
            <div
              onMouseEnter={() => setShowDesc(true)}
              onMouseLeave={() => setShowDesc(false)}
              style={{
                width: 22, height: 22, borderRadius: "50%",
                background: "#F1F5F9", border: "1px solid #E2E8F0",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "default",
              }}
            >
              <HelpCircle size={13} color="#94A3B8" />
            </div>
            {showDesc && (
              <div style={{
                position: "absolute", top: "calc(100% + 8px)", left: 0,
                background: "#ffffff", borderRadius: 12,
                padding: "14px 18px", zIndex: 9999,
                boxShadow: "0 8px 28px rgba(99,102,241,0.18), 0 0 0 1px #E0E7FF",
                whiteSpace: "nowrap", pointerEvents: "none",
              }}>
                <div style={{
                  position: "absolute", top: -6, left: 10,
                  width: 12, height: 12, background: "#ffffff",
                  borderLeft: "1px solid #E0E7FF", borderTop: "1px solid #E0E7FF",
                  transform: "rotate(45deg)",
                }} />
                <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.6 }}>
                  투자 자유를 꿈꾸는 당신의 비전을 시각화하세요.<br />
                  목표하는 삶, 가고 싶은 곳, 이루고 싶은 것들을 자유롭게 붙여보세요.
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ width: 1, height: 22, background: "#E2E8F0", margin: "0 4px" }} />

        <Btn onClick={() => fileRef.current?.click()} icon={<ImageIcon size={13} />} label="이미지" primary />
        <button
          onClick={() => { setShowText(v => !v); setNewText(""); }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "6px 12px", borderRadius: 7,
            border: showText ? "1px solid #fb923c" : "1px solid #fde68a",
            background: "linear-gradient(135deg,#fef9c3 0%,#fef3c7 100%)",
            color: "#c2410c", fontSize: 13, fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
            boxShadow: showText ? "0 0 0 2px rgba(251,146,60,0.2)" : "0 1px 3px rgba(202,138,4,0.15)",
            transition: "background 0.12s, border-color 0.12s",
          }}
        >
          <Type size={13} /> 텍스트
        </button>
        <button
          onClick={() => setShowStickerPicker(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "6px 12px", borderRadius: 7, border: "none",
            background: "linear-gradient(135deg,#fce7f3 0%,#fbcfe8 35%,#e9d5ff 70%,#ddd6fe 100%)",
            color: "#7c3aed", fontSize: 13, fontWeight: 700,
            cursor: "pointer", fontFamily: F,
            boxShadow: "0 1px 4px rgba(192,132,252,0.25)",
            whiteSpace: "nowrap",
          }}
        >
          <Smile size={13} /> 스티커
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={addImage} />

        {/* 사용 힌트 — 물음표 호버 툴팁 */}
        <HintTooltip />

        {selected && (
          <>
            <div style={{ width: 1, height: 22, background: "#E2E8F0", margin: "0 4px" }} />
            <Btn onClick={() => remove(selected)} icon={<Trash2 size={13} />} label="삭제" danger />
          </>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {/* 미저장 / 저장 완료 표시 */}
          {savedAnim && (
            <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>✓ 저장됨</span>
          )}
          {!savedAnim && dirty && (
            <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>● 저장되지 않은 변경사항</span>
          )}
          {!savedAnim && !dirty && items.length > 0 && (
            <span style={{ fontSize: 12, color: "#94A3B8" }}>{items.length}개 스티커</span>
          )}
          <Btn
            onClick={handleSave}
            icon={<Save size={13} />}
            label="저장"
            primary
            disabled={!dirty}
          />
        </div>
      </div>

      {/* ── 텍스트 입력 바 ── */}
      {showText && (
        <div style={{
          background: "#F8FAFC", borderBottom: "1px solid #E2E8F0",
          padding: "10px 20px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        }}>
          <input
            autoFocus
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") addText(); if (e.key === "Escape") setShowText(false); }}
            placeholder="텍스트 내용 입력 후 Enter..."
            style={{
              flex: 1, padding: "8px 12px", borderRadius: 8, fontFamily: F,
              border: "1.5px solid #C7D2FE", fontSize: 14, outline: "none",
            }}
            onFocus={e => e.target.style.borderColor = "#6366f1"}
            onBlur={e => e.target.style.borderColor = "#C7D2FE"}
          />
          {/* 색상 팔레트 */}
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {MEMO_COLORS.map(c => (
              <button key={c} onClick={() => setNewColor(c)} style={{
                width: 20, height: 20, borderRadius: "50%", background: c, border: "none",
                cursor: "pointer", outline: newColor === c ? "2px solid #6366f1" : "none",
                outlineOffset: 2, flexShrink: 0,
              }} />
            ))}
          </div>
          <Btn onClick={addText} label="추가" primary disabled={!newText.trim()} />
          <Btn onClick={() => setShowText(false)} label="취소" />
        </div>
      )}

      {/* ── 캔버스 ── */}
      <div style={{ flex: 1, overflow: "hidden", background: "#DDE1E9", position: "relative" }}>
        <div
          ref={canvasRef}
          onClick={onCanvasClick}
          style={{
            position: "relative",
            width: "100%", height: "100%",
            backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.12) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
            userSelect: "none",
          }}
        >
          {/* 빈 상태 힌트 */}
          {items.length === 0 && (
            <div style={{
              position: "absolute", top: "38%", left: "50%",
              transform: "translate(-50%,-50%)",
              textAlign: "center", pointerEvents: "none",
            }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🎯</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#94A3B8", marginBottom: 8 }}>
                비전 보드가 비어있어요
              </div>
              <div style={{ fontSize: 14, color: "#94A3B8", lineHeight: 1.7 }}>
                위 툴바에서 이미지·텍스트·스티커를 추가해보세요<br />
                드래그로 자유롭게 배치하고, 우측 아래 핸들을 당겨 크기를 조절할 수 있어요
              </div>
            </div>
          )}

          {items.map(it => (
            <Sticker
              key={it.id}
              item={it}
              selected={selected === it.id}
              editing={editingId === it.id}
              onDown={onStickerDown}
              onResizeDown={onResizeDown}
              onDoubleClick={() => { if (it.type === "text") { setEditingId(it.id); setSelected(it.id); } }}
              onBlurEdit={() => setEditingId(null)}
              onChangeText={updateText}
              onChangeCaption={updateCaption}
            />
          ))}
        </div>
      </div>

      {/* 스티커 픽커 모달 — 이모지/이미지 추가 */}
      {showStickerPicker && (
        <StickerPickerModal
          onClose={() => setShowStickerPicker(false)}
          onPick={(sticker) => {
            const id = uid();
            setItems(prev => [...prev, {
              id, type: "image", src: sticker.src, caption: "",
              x: 200 + Math.random() * 400, y: 120 + Math.random() * 300,
              w: sticker.w || 180,
            }]);
            setSelected(id);
            setShowStickerPicker(false);
          }}
        />
      )}
    </div>
  );
}

/* ── 스티커 컴포넌트 ── */
function Sticker({ item, selected, editing, onDown, onResizeDown, onDoubleClick, onBlurEdit, onChangeText, onChangeCaption }) {
  const isImage = item.type === "image";

  return (
    <div
      onMouseDown={e => onDown(e, item.id)}
      onDoubleClick={onDoubleClick}
      style={{
        position: "absolute",
        left: item.x, top: item.y,
        width: item.w,
        ...(isImage ? {} : { height: item.h }),
        cursor: editing ? "text" : "grab",
        borderRadius: 14,
        background: isImage ? "white" : item.color,
        boxShadow: selected
          ? "0 0 0 2.5px #6366f1, 0 8px 32px rgba(99,102,241,0.28)"
          : "0 4px 20px rgba(0,0,0,0.18)",
        overflow: "hidden",
        zIndex: selected ? 100 : 1,
        transition: "box-shadow 0.12s",
      }}
    >
      {isImage ? (
        <>
          <img
            src={item.src}
            alt={item.caption || "vision"}
            draggable={false}
            style={{ width: "100%", display: "block", pointerEvents: "none", userSelect: "none" }}
          />
          {selected && (
            <input
              value={item.caption}
              onChange={e => onChangeCaption(item.id, e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              placeholder="캡션 추가..."
              style={{
                width: "100%", border: "none", borderTop: "1px solid #E2E8F0",
                padding: "8px 10px", fontSize: 12.5, color: "#374151",
                fontFamily: F, outline: "none", background: "white",
                boxSizing: "border-box",
              }}
            />
          )}
        </>
      ) : (
        editing ? (
          <textarea
            autoFocus
            value={item.text}
            onChange={e => onChangeText(item.id, e.target.value)}
            onMouseDown={e => e.stopPropagation()}
            onBlur={onBlurEdit}
            style={{
              width: "100%", height: "100%", border: "none", resize: "none",
              padding: "14px 16px", fontSize: 15, fontWeight: 600,
              color: "#1F2937", fontFamily: F, outline: "none",
              background: "transparent", boxSizing: "border-box", lineHeight: 1.55,
            }}
          />
        ) : (
          <div style={{
            padding: "14px 16px", fontSize: 15, fontWeight: 600, lineHeight: 1.55,
            color: "#1F2937", whiteSpace: "pre-wrap", wordBreak: "break-word",
            minHeight: "100%", fontFamily: F,
          }}>
            {item.text || <span style={{ color: "#9CA3AF", fontWeight: 400, fontSize: 13 }}>더블클릭해서 편집</span>}
          </div>
        )
      )}

      {/* 리사이즈 핸들 */}
      {selected && (
        <div
          onMouseDown={e => { e.stopPropagation(); onResizeDown(e, item.id); }}
          style={{
            position: "absolute", bottom: 0, right: 0,
            width: 18, height: 18, cursor: "se-resize",
            background: "#6366f1", borderRadius: "6px 0 14px 0",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 10,
          }}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M1.5 7.5L7.5 1.5M4.5 7.5L7.5 4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {/* 선택 표시 점 */}
      {selected && (
        <>
          <Corner top left />
          <Corner top />
          <Corner left />
          <Corner />
        </>
      )}
    </div>
  );
}

/* ── 선택 모서리 점 ── */
function Corner({ top, left }) {
  return (
    <div style={{
      position: "absolute",
      top: top ? -3 : undefined, bottom: !top ? -3 : undefined,
      left: left ? -3 : undefined, right: !left ? -3 : undefined,
      width: 7, height: 7, borderRadius: "50%",
      background: "#6366f1", border: "1.5px solid white",
      pointerEvents: "none",
      ...((!top && !left) ? { display: "none" } : {}), // 오른쪽 아래는 리사이즈 핸들이 대신함
    }} />
  );
}

/* ── 버튼 컴포넌트 ── */
const HINTS = [
  { icon: "✦", text: "스티커를 드래그해서 자유롭게 이동" },
  { icon: "⤡", text: "선택 후 우측 아래 핸들을 당겨 크기 조절" },
  { icon: "✎", text: "텍스트 더블 클릭 후 글 내용 편집" },
  { icon: "🗑", text: "스티커 선택 후 툴바 삭제 버튼으로 제거" },
];

function HintTooltip() {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <div
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          width: 22, height: 22, borderRadius: "50%",
          background: "#F1F5F9", border: "1px solid #E2E8F0",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "default",
        }}
      >
        <HelpCircle size={13} color="#94A3B8" />
      </div>
      {show && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", left: 0,
          background: "#ffffff", borderRadius: 12,
          padding: "14px 18px", zIndex: 9999,
          boxShadow: "0 8px 28px rgba(99,102,241,0.18), 0 0 0 1px #E0E7FF",
          width: 340,
          pointerEvents: "none",
        }}>
          {/* 말풍선 화살표 */}
          <div style={{
            position: "absolute", top: -6, left: 10,
            width: 12, height: 12, background: "#ffffff",
            borderLeft: "1px solid #E0E7FF", borderTop: "1px solid #E0E7FF",
            transform: "rotate(45deg)",
          }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", letterSpacing: 0.6, marginBottom: 10, textTransform: "uppercase" }}>
            사용법
          </div>
          {HINTS.map(h => (
            <div key={h.text} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8, whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1, color: "#6366f1" }}>{h.icon}</span>
              <span style={{ fontSize: 12.5, color: "#334155", lineHeight: 1.5 }}>{h.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Btn({ onClick, icon, label, primary, danger, active, disabled }) {
  const bg = danger ? "#FEE2E2" : primary ? "#6366f1" : active ? "#EEF2FF" : "#F1F5F9";
  const color = danger ? "#DC2626" : primary ? "white" : active ? "#4f46e5" : "#374151";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "6px 12px", borderRadius: 7, border: "none",
        background: bg, color, fontSize: 13, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer", fontFamily: F,
        opacity: disabled ? 0.45 : 1, whiteSpace: "nowrap",
        transition: "background 0.12s",
      }}
    >
      {icon}{label}
    </button>
  );
}
