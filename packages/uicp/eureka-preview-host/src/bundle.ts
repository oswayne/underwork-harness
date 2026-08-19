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

export * from './index.ts'
