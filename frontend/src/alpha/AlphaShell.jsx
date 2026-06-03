import { useRef, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";

export default function AlphaShell() {
  const location = useLocation();
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.animation = "none";
    void el.offsetHeight; // force reflow
    el.style.animation = "alphaPageIn 0.22s cubic-bezier(0.22,1,0.36,1)";
  }, [location.pathname]);

  return (
    <>
      <style>{`
        @keyframes alphaPageIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div ref={ref} style={{ animation: "alphaPageIn 0.22s cubic-bezier(0.22,1,0.36,1)" }}>
        <Outlet />
      </div>
    </>
  );
}
