import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: mode === 'library' ? {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AIChatReact',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'esm.js' : 'js'}`
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-draggable', '@heroicons/react/24/outline', 'openai', 'uuid'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react-draggable': 'Draggable',
          '@heroicons/react/24/outline': 'HeroiconsOutline',
          'openai': 'OpenAI',
          'uuid': 'uuid'
        }
      }
    },
    outDir: 'dist',
    sourcemap: true,
  } : {
    outDir: 'dist',
    sourcemap: true,
  },
}))