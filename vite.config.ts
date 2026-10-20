import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages 部署在 /Sky-Testament/ 子路径下，构建时用 BASE_PATH 覆盖
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
