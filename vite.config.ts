import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // 기본 타깃은 최신 브라우저라, CSS 최적화기가 "이미 지원되는 기능"으로 판단한
    // 폴백 선언(height:100vh 뒤의 100dvh)과 -webkit- 접두사를 지워버린다.
    // 구형 iOS 사파리가 실제 대상이므로 타깃을 낮춰 폴백을 남긴다.
    cssTarget: ['chrome87', 'edge88', 'firefox78', 'safari14'],
  },
})
