import { defineConfig } from 'vite';

export default defineConfig({
  // 相対パス。GitHub Pages のサブパス(/game-danmaku-sim/)でも配信できる。
  base: './',
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
