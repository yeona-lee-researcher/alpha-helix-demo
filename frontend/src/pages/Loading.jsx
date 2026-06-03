import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import loadingVideo from '../assets/loading.mp4';

function Loading() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/login', { replace: true });
    }, 7000);
    return () => clearTimeout(timer);
  }, [navigate]);
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      overflow: 'hidden',
    }}>
      {/* 배경 영상 */}
      <video
        src={loadingVideo}
        autoPlay
        muted
        loop
        playsInline
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      {/* 어두운 오버레이 */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.01)',
      }} />

      {/* 중앙 텍스트 */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        textAlign: 'center',
        userSelect: 'none',
      }}>
        <style>{`
          @keyframes loading-fadein {
            from { opacity: 0; transform: translateY(18px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
        <h1 style={{
          fontSize: '52px',
          fontWeight: '300',
          fontStyle: 'italic',
          color: 'rgba(255, 255, 255, 0.93)',
          fontFamily: "'Georgia', 'Times New Roman', serif",
          letterSpacing: '2px',
          lineHeight: 1.5,
          margin: 0,
          textShadow: '0 2px 24px rgba(0,0,0,0.55)',
          animation: 'loading-fadein 1.2s ease-out both',
        }}>
          Soaring toward
          <br />
          <span style={{
            background: 'linear-gradient(90deg, #60a5fa, #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontWeight: '600',
            fontStyle: 'normal',
          }}>
            new opportunities.
          </span>
        </h1>
        <p style={{
          marginTop: 22,
          fontSize: '15px',
          color: 'rgba(255,255,255,0.6)',
          fontFamily: "'Pretendard', sans-serif",
          fontWeight: 400,
          letterSpacing: '0.5px',
          animation: 'loading-fadein 1.6s ease-out 0.3s both',
        }}>
          새로운 기회를 찾아 날아가고 있습니다
        </p>
      </div>
    </div>
  );
}

export default Loading;
