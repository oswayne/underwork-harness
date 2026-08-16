import { defineConfig } from 'vite'

/**
 * Standalone preview bundle: one IIFE with its own React 19 runtime, mounted
 * into a caller-provided DOM node by the dsh Web UI (no iframe). The dsh app
 * stays on React 18; this bundle never shares React with it.
 */
export default defineConfig({
  resolve: {
    alias: {
      // monaco-editor 0.53 ships only a `module` field; pin the bare import to
      // its ESM entry so vite's resolver can reach it.
      'monaco-editor': 'monaco-editor/esm/vs/editor/editor.main.js',
    },
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'UicpEurekaPreview',
      formats: ['iife'],
      fileName: () => 'uicp-eureka-preview.js',
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: 'uicp-eureka-preview.[ext]',
      },
    },
  },
})
