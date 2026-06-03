import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import beachVideo from '../assets/beach.mp4';

function LandingPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState(0);
  const [pageFadeOut, setPageFadeOut] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 400);
    const t2 = setTimeout(() => setPhase(2), 1200);
    const t3 = setTimeout(() => setPhase(3), 2000);
    const t4 = setTimeout(() => setPageFadeOut(true), 4800);
    const t5 = setTimeout(() => navigate('/home'), 6200);
    return () => [t1, t2, t3, t4, t5].forEach(clearTimeout);
  }, [navigate]);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      overflow: 'hidden',
      backgroundColor: '#000',
      opacity: pageFadeOut ? 0 : 1,
      transition: pageFadeOut ? 'opacity 1.4s ease-in-out' : 'none',
    }}>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUpSub {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 0.75; transform: translateY(0); }
        }
        @keyframes dotPulse {
          0%,100% { opacity: 0.3; transform: scale(1); }
          50%      { opacity: 0.7; transform: scale(1.5); }
        }
      `}</style>

      {/* 諛곌꼍 鍮꾨뵒??*/}
      <video autoPlay loop muted playsInline style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '100%', height: '100%', objectFit: 'cover',
      }}>
        <source src={beachVideo} type="video/mp4" />
      </video>

      {/* ?대몢???ㅻ쾭?덉씠 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.015)',
      }} />

      {/* ?띿뒪?????곷떒 諛곗튂 */}
      <div style={{
        position: 'absolute', top: '18%', left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2, textAlign: 'center', userSelect: 'none',
        width: '100%',
      }}>
        {/* ?뚯젣紐?*/}
        {phase >= 1 && (
          <p style={{
            fontSize: 13, fontWeight: 500, letterSpacing: '0.28em',
            color: 'rgba(203,213,225,0.85)',
            fontFamily: "'Pretendard', sans-serif",
            textTransform: 'uppercase',
            margin: '0 0 18px',
            animation: 'slideUp 0.8s ease-out both',
          }}>
            Quant Developer Platform
          </p>
        )}

        {/*  1 */}
        {phase >= 1 && (
          <h1 style={{
            fontSize: 56, fontWeight: 300, fontStyle: 'italic',
            color: 'rgba(248,250,252,0.95)',
            fontFamily: "'Georgia', 'Times New Roman', serif",
            letterSpacing: '1px', lineHeight: 1.2, margin: 0,
            textShadow: '0 2px 24px rgba(0,0,0,0.7)',
            animation: 'slideUp 0.9s ease-out both',
          }}>
            The bridge between
          </h1>
        )}

        {/*  */}
        {phase >= 2 && (
          <h1 style={{
            fontSize: 62, fontWeight: 700,
            background: 'linear-gradient(90deg, #7DD3FC 0%, #38BDF8 25%, #818CF8 65%, #93C5FD 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontFamily: "'Georgia', 'Times New Roman', serif",
            letterSpacing: '-0.5px', lineHeight: 1.2, margin: '4px 0 0',
            animation: 'slideUp 0.9s ease-out both',
          }}>
            vision and execution.
          </h1>
        )}

        {/*   */}
        {phase >= 3 && (
          <>
            <div style={{
              width: 48, height: 1.5,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
              margin: '22px auto 18px',
              animation: 'slideUp 0.7s ease-out both',
            }} />
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'rgba(203,213,225,0.55)',
                  animation: `dotPulse 1.4s ease-in-out ${i * 0.22}s infinite`,
                }} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* 브랜드명 + 개인정보처리방침 링크 — Google OAuth 브랜딩 인증용 */}
      <div style={{
        position: 'absolute', bottom: 20, left: 0, right: 0,
        zIndex: 10, textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}>
        <p style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '0.18em',
          color: 'rgba(203,213,225,0.6)',
          fontFamily: "'Pretendard', sans-serif",
          textTransform: 'uppercase', margin: 0,
        }}>
          Alpha-Helix
        </p>
        <div style={{ display: 'flex', gap: 16 }}>
          <a href="/privacy" style={{
            fontSize: 11, color: 'rgba(203,213,225,0.45)',
            textDecoration: 'none', fontFamily: "'Pretendard', sans-serif",
          }}
            onMouseEnter={e => e.target.style.color = 'rgba(203,213,225,0.8)'}
            onMouseLeave={e => e.target.style.color = 'rgba(203,213,225,0.45)'}
          >
            개인정보처리방침
          </a>
          <a href="/terms" style={{
            fontSize: 11, color: 'rgba(203,213,225,0.45)',
            textDecoration: 'none', fontFamily: "'Pretendard', sans-serif",
          }}
            onMouseEnter={e => e.target.style.color = 'rgba(203,213,225,0.8)'}
            onMouseLeave={e => e.target.style.color = 'rgba(203,213,225,0.45)'}
          >
            이용약관
          </a>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
