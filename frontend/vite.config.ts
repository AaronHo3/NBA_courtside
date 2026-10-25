/// <reference types="vitest/config" />
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import prefixSelector from 'postcss-prefix-selector'

// Scope the fantasy copilot's stylesheets (copied verbatim from the standalone app) to its mount
// point so its element-level rules (`body`, `h1`, `button`, ...) cannot leak into analytics pages.
const FANTASY_ROOT = '.fantasy-root'
const fantasyScope = prefixSelector({
  prefix: FANTASY_ROOT,
  includeFiles: [/[\\/]src[\\/]fantasy[\\/]styles[\\/]/],
  transform(prefix, selector, prefixedSelector) {
    // Document-level selectors become the container itself.
    if (selector === ':root' || selector === 'html' || selector === 'body' || selector === '#root') return prefix
    if (selector.startsWith('html ') || selector.startsWith('body ')) return selector.replace(/^(html|body) /, `${prefix} `)
    return prefixedSelector
  },
})

// Courtside runs two backends. The browser only ever talks to this dev server, which forwards:
//   /api/analytics/*  ->  analytics service (services/analytics, default :8001)  as /api/*
//   /api/fantasy/*    ->  fantasy service   (services/fantasy,   default :8002)  as /api/*
// Both services keep their original `/api/...` routes; only the prefix is rewritten here.
const analyticsBackend = process.env.ANALYTICS_BACKEND ?? 'http://127.0.0.1:8001'
const fantasyBackend = process.env.FANTASY_BACKEND ?? 'http://127.0.0.1:8002'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: { postcss: { plugins: [fantasyScope] } },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      // The browser never talks to the NBA provider; it only talks to our FastAPI backends.
      '/api/analytics': {
        target: analyticsBackend,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/analytics/, '/api'),
      },
      '/api/fantasy': {
        target: fantasyBackend,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/fantasy/, '/api'),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('plotly.js')) return 'plotly'
          if (id.includes('/d3')) return 'd3'
          if (/node_modules\/(react|react-dom|react-router|@tanstack)/.test(id)) return 'vendor'
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
