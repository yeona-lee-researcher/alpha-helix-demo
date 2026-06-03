import { useState, useRef, useEffect } from "react";
import { X, Upload, Crop as CropIcon, Check } from "lucide-react";

const F = "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// 카테고리별 이모지 스티커
const EMOJI_STICKERS = {
  "💖 감정": ["✨", "💖", "💕", "💫", "🌟", "⭐", "🎀", "🌸", "🌷", "🌹", "🌺", "🌻", "🌼", "🍀", "🌿"],
  "🎯 목표": ["🎯", "🏆", "🥇", "👑", "💎", "🔑", "🚀", "🌈", "🎉", "🎊", "🎁", "🪄", "💡", "📌", "✅"],
  "💰 부와 자유": ["💰", "💵", "💸", "💳", "🪙", "📈", "📊", "💹", "🏦", "💼", "🏠", "🏝️", "🛥️", "✈️", "🚗"],
  "🌍 여행·라이프": ["🗽", "🗼", "🏰", "🌋", "🏔️", "🏖️", "🌊", "🌅", "🌄", "🌠", "🎡", "🎢", "🍷", "☕", "🍰"],
  "🐾 친구": ["🐶", "🐱", "🐰", "🦊", "🐻", "🐼", "🦁", "🐯", "🐨", "🐸", "🦄", "🐝", "🦋", "🐢", "🐬"],
};

export default function StickerPickerModal({ onClose, onPick }) {
  const [tab, setTab] = useState("emoji"); // emoji | upload
  const [cat, setCat] = useState(Object.keys(EMOJI_STICKERS)[0]);

  // 업로드 탭 상태
  const fileRef = useRef(null);
  const [imgSrc, setImgSrc] = useState(null);
  const [size, setSize] = useState(180);
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 1, h: 1 }); // 0~1 정규화
  const previewWrapRef = useRef(null);
  const naturalRef = useRef({ w: 0, h: 0 });
  const dragRef = useRef(null);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { alert("이미지는 5MB 이하만 가능합니다."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        naturalRef.current = { w: img.width, h: img.height };
        setImgSrc(reader.result);
        setCrop({ x: 0, y: 0, w: 1, h: 1 });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  // 크롭 박스 드래그 (간단한 4점 정사각 형태)
  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current) return;
      const wrap = previewWrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const { kind, startX, startY, orig } = dragRef.current;
      if (kind === "move") {
        const dx = nx - startX, dy = ny - startY;
        const newX = Math.max(0, Math.min(1 - orig.w, orig.x + dx));
        const newY = Math.max(0, Math.min(1 - orig.h, orig.y + dy));
        setCrop({ ...orig, x: newX, y: newY });
      } else if (kind === "se") {
        const newW = Math.max(0.1, Math.min(1 - orig.x, orig.w + (nx - startX)));
        const newH = Math.max(0.1, Math.min(1 - orig.y, orig.h + (ny - startY)));
        setCrop({ ...orig, w: newW, h: newH });
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const beginDrag = (kind) => (e) => {
    e.stopPropagation();
    const wrap = previewWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    dragRef.current = { kind, startX: nx, startY: ny, orig: { ...crop } };
  };

  // 크롭한 이미지를 캔버스에 그려서 dataURL 추출
  const buildCroppedDataUrl = () => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const sx = crop.x * img.width;
      const sy = crop.y * img.height;
      const sw = crop.w * img.width;
      const sh = crop.h * img.height;
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = imgSrc;
  });

  const handleRegister = async () => {
    if (!imgSrc) return;
    const src = await buildCroppedDataUrl();
    onPick({ src, w: size });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: F,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 640, maxHeight: "85vh",
          background: "white", borderRadius: 16,
          boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* 헤더 */}
        <div style={{
          padding: "16px 22px",
          background: "linear-gradient(135deg,#fce7f3 0%,#fbcfe8 30%,#e9d5ff 70%,#ddd6fe 100%)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid #f3e8ff",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22 }}>🎨</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#7c3aed" }}>스티커 고르기</span>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.6)", border: "none", borderRadius: 8,
            width: 30, height: 30, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X size={16} color="#7c3aed" />
          </button>
        </div>

        {/* 탭 */}
        <div style={{ display: "flex", padding: "12px 22px 0", gap: 8 }}>
          {[
            { k: "emoji", label: "이모지 스티커" },
            { k: "upload", label: "내 이미지 업로드" },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              background: tab === t.k
                ? "linear-gradient(135deg,#a78bfa,#c084fc)"
                : "#f5f3ff",
              color: tab === t.k ? "white" : "#6b21a8",
              fontWeight: 700, fontSize: 13, fontFamily: F,
            }}>{t.label}</button>
          ))}
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px 22px" }}>
          {tab === "emoji" ? (
            <>
              {/* 카테고리 칩 */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {Object.keys(EMOJI_STICKERS).map(c => (
                  <button key={c} onClick={() => setCat(c)} style={{
                    padding: "6px 12px", borderRadius: 20, border: "none", cursor: "pointer",
                    background: cat === c ? "#ede9fe" : "#f9fafb",
                    color: cat === c ? "#6d28d9" : "#475569",
                    fontWeight: 600, fontSize: 12, fontFamily: F,
                  }}>{c}</button>
                ))}
              </div>
              {/* 이모지 그리드 */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(8, 1fr)",
                gap: 8,
              }}>
                {EMOJI_STICKERS[cat].map(e => (
                  <button key={e} onClick={() => onPick({ src: emojiToDataUrl(e), w: 140 })}
                    style={{
                      aspectRatio: "1 / 1",
                      borderRadius: 10, border: "1px solid #f3e8ff",
                      background: "#fafaff", cursor: "pointer",
                      fontSize: 32, display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "transform 0.1s, background 0.15s",
                    }}
                    onMouseEnter={ev => { ev.currentTarget.style.background = "#f5f3ff"; ev.currentTarget.style.transform = "scale(1.08)"; }}
                    onMouseLeave={ev => { ev.currentTarget.style.background = "#fafaff"; ev.currentTarget.style.transform = "scale(1)"; }}
                  >{e}</button>
                ))}
              </div>
              <div style={{ marginTop: 14, fontSize: 11.5, color: "#94a3b8", lineHeight: 1.6 }}>
                이모지를 클릭하면 비전 보드에 바로 추가됩니다. 추가 후 보드에서 드래그·리사이즈 가능해요.
              </div>
            </>
          ) : (
            <>
              {!imgSrc ? (
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: "2px dashed #c4b5fd", borderRadius: 14,
                    padding: "44px 20px", textAlign: "center", cursor: "pointer",
                    background: "linear-gradient(135deg,#faf5ff 0%,#fdf2f8 100%)",
                  }}
                >
                  <Upload size={36} color="#a78bfa" style={{ marginBottom: 10 }} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#6d28d9", marginBottom: 6 }}>
                    클릭해서 이미지 업로드
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    JPG · PNG · GIF / 최대 5MB
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile} />
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6b21a8", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <CropIcon size={13} /> 영역을 드래그·리사이즈해서 사용할 부분만 자르세요
                  </div>
                  <div
                    ref={previewWrapRef}
                    style={{
                      position: "relative", width: "100%", maxHeight: 320,
                      borderRadius: 12, overflow: "hidden",
                      background: "#0f172a",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <img src={imgSrc} alt="preview" draggable={false}
                      style={{ maxWidth: "100%", maxHeight: 320, display: "block", userSelect: "none", pointerEvents: "none" }} />
                    {/* 크롭 오버레이 */}
                    <div
                      onMouseDown={beginDrag("move")}
                      style={{
                        position: "absolute",
                        left: `${crop.x * 100}%`, top: `${crop.y * 100}%`,
                        width: `${crop.w * 100}%`, height: `${crop.h * 100}%`,
                        border: "2px solid #a78bfa",
                        boxShadow: "0 0 0 9999px rgba(15,23,42,0.55)",
                        cursor: "move",
                      }}
                    >
                      <div
                        onMouseDown={beginDrag("se")}
                        style={{
                          position: "absolute", right: -7, bottom: -7,
                          width: 14, height: 14, borderRadius: 4,
                          background: "#a78bfa", border: "2px solid white",
                          cursor: "se-resize",
                        }}
                      />
                    </div>
                  </div>

                  {/* 크기 슬라이더 */}
                  <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#475569", minWidth: 80 }}>스티커 크기</span>
                    <input
                      type="range" min={80} max={400} step={10}
                      value={size}
                      onChange={e => setSize(Number(e.target.value))}
                      style={{ flex: 1, accentColor: "#a78bfa" }}
                    />
                    <span style={{ fontSize: 12, color: "#7c3aed", fontWeight: 700, minWidth: 50 }}>{size}px</span>
                  </div>

                  {/* 액션 */}
                  <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => { setImgSrc(null); setCrop({ x: 0, y: 0, w: 1, h: 1 }); }}
                      style={{
                        padding: "8px 16px", borderRadius: 8, border: "1px solid #e5e7eb",
                        background: "white", color: "#374151", fontWeight: 600,
                        fontSize: 13, cursor: "pointer", fontFamily: F,
                      }}
                    >다시 선택</button>
                    <button
                      onClick={handleRegister}
                      style={{
                        padding: "8px 18px", borderRadius: 8, border: "none",
                        background: "linear-gradient(135deg,#a78bfa,#c084fc)",
                        color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: F,
                        display: "inline-flex", alignItems: "center", gap: 6,
                        boxShadow: "0 4px 12px rgba(167,139,250,0.4)",
                      }}
                    >
                      <Check size={14} /> 스티커로 등록
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// 이모지를 SVG dataURL로 만들어 이미지 스티커처럼 다루게 함 (크기·캡션 동일 처리)
function emojiToDataUrl(emoji) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <text x="50%" y="50%" font-size="150" text-anchor="middle" dominant-baseline="central">${emoji}</text>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
