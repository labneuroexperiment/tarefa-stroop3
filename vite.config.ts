import type { UserConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'
import { vitePrerenderPlugin } from "vite-prerender-plugin";
import * as path from "node:path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  let build: UserConfig['build'], esbuild: UserConfig['esbuild'], define: UserConfig['define']

  if (mode === 'development') {
    build = {
      minify: false,
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    }

    esbuild = {
      jsxDev: true,
      keepNames: true,
      minifyIdentifiers: false,
    }

    define = {
      'process.env.NODE_ENV': '"development"',
      '__DEV__': 'true',
    }
  }

  return {
    // Descomente a linha abaixo se estiver usando GitHub Pages
    // base: '/stroop-ufpa/', // Substitua pelo nome do seu repositório
    plugins: [
      react(),
      vitePrerenderPlugin({
        renderTarget: '#root',
        prerenderScript: path.resolve(__dirname, 'src/prerender.tsx'),
      }),
    ],
    build,
    esbuild,
    define,
    resolve: {
      alias: {
        '@': '/src',
      }
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  }
})