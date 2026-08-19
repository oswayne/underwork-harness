/**
 * Vite lib entry: eureka styling plus the mount API. The CSS lives here (not
 * in `index.ts`) because the host TypeScript build must not see CSS imports;
 * all assets are inlined into the bundle CSS by the vite build
 * (assetsInlineLimit), so the preview depends only on bundle.js + bundle.css.
 * The `eureka` css assets sit outside its exports map (relative paths reach
 * them); `eureka-editor-core` exposes its stylesheet through the exports map
 * (`./lib/style.css` -> `./dist/style.css`) like uicp-web-editor imports it.
 * @module
 */

import '../node_modules/@fortawesome/fontawesome-free/css/all.min.css'
import '../node_modules/eureka/dist/themes/cxd.css'
import '../node_modules/eureka/dist/helper.css'
import 'eureka-editor-core/lib/style.css'

// Relative paths sidestep the monaco bare-import alias (worker subpaths must
// not hit the editor.main.js replacement).
import EditorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker&inline'
import JsonWorker from '../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker&inline'
import CssWorker from '../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker&inline'
import HtmlWorker from '../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker&inline'
import TsWorker from '../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker&inline'

// Moncao language services need a worker factory; inline workers keep the
// IIFE self-contained (no extra assets to serve), mirroring uicp-web-editor's
// MonacoEnvironment wiring.
(globalThis as typeof globalThis & { MonacoEnvironment?: unknown }).MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    return new EditorWorker()
  },
}

export * from './index.ts'
