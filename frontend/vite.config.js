import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// dev 서버 전용 백엔드 proxy 타겟. 운영 빌드에는 적용되지 않음.
const DEV_BACKEND = process.env.VITE_DEV_BACKEND || 'http://localhost:9091'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // dev에서만 proxy 활성화 (vite build에서는 무시됨)
  server: command === 'serve' ? {
    proxy: {
      '/api': {
        target: DEV_BACKEND,
        changeOrigin: true,
        secure: false,
      },
      '/files': {
        target: DEV_BACKEND,
        changeOrigin: true,
        secure: false,
      },
      // 로컬 터미널 WebSocket (Developer Studio 콘솔) — ws:true 로 WS 업그레이드 프록시
      '/ws': {
        target: DEV_BACKEND,
        changeOrigin: true,
        ws: true,
        secure: false,
      },
    },
  } : undefined,
  build: {
    sourcemap: false, // 운영 번들에 소스맵 노출 방지
    chunkSizeWarningLimit: 1700, // stream-chat SDK 자체가 ~1.6MB — lazy load로 초기 번들에서 제외됨
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Stream Chat SDK — 가장 큰 번들, 별도 chunk로 지연 로드
          if (id.includes('stream-chat') || id.includes('stream_chat')) {
            return 'vendor-stream-chat';
          }
          // React + React-DOM core
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          // 라우팅
          if (id.includes('react-router-dom') || id.includes('react-router/')) {
            return 'vendor-router';
          }
          // HTTP 클라이언트
          if (id.includes('node_modules/axios/')) {
            return 'vendor-axios';
          }
          // 차트/시각화
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'vendor-charts';
          }
          // lucide 아이콘
          if (id.includes('node_modules/lucide-react/')) {
            return 'vendor-icons';
          }
        },
      },
    },
  },
  // 운영 빌드에서 console.* / debugger 자동 제거 — PII/디버그 정보 노출 방지.
  esbuild: {
    drop: command === 'build' ? ['console', 'debugger'] : [],
  },
}))
