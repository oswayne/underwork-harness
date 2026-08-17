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
  define: {
    // Vite lib mode does not apply its default env defines; without this the
    // bundle references process.env.NODE_ENV at load and throws in the browser.
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    // Inline every asset (icon/KaTeX fonts) as data URIs so the emitted CSS
    // is self-contained and the preview seam only serves bundle.js/.css.
    assetsInlineLimit: 20 * 1024 * 1024,
    lib: {
      entry: 'src/bundle.ts',
      name: 'UicpEurekaPreview',
      formats: ['iife'],
      fileName: () => 'uicp-eureka-preview.js',
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: 'uicp-eureka-preview.[ext]',
        // Residual process.* references (emit/nextTick/versions/browser) come
        // from bundled libraries; a minimal global shim keeps them inert in
        // the browser instead of crashing the IIFE at load.
        banner: [
          'var process = process || {',
          '  env: {}, browser: true, platform: "", version: "", versions: {}, type: "",',
          '  nextTick: function (fn) { fn() }, emit: function () { return true },',
          '  getBuiltinModule: function () { return undefined }',
          '};',
        ].join('\n'),
      },
    },
  },
})
