import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// `base` is set so the GitHub Pages build resolves assets under `/<repo>/`
// (project pages). Override via `VITE_BASE` for forks or custom domains
// (e.g. `VITE_BASE=/ npm run build`).
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
})
