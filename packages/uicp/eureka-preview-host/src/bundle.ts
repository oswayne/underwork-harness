/**
 * Vite lib entry: eureka styling plus the mount API. The CSS lives here (not
 * in `index.ts`) because the host TypeScript build must not see CSS imports;
 * all assets are inlined into the bundle CSS by the vite build
 * (assetsInlineLimit), so the preview depends only on bundle.js + bundle.css.
 * Relative paths sidestep the eureka exports map, which does not expose its
 * css assets.
 * @module
 */

import '../node_modules/@fortawesome/fontawesome-free/css/all.min.css'
import '../node_modules/eureka/dist/themes/cxd.css'
import '../node_modules/eureka/dist/helper.css'

export * from './index.ts'
