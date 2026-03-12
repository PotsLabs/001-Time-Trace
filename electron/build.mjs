import { build } from 'esbuild';

// Polyfill for import.meta.url when outputting CJS (used in server/db.ts for __dirname)
const importMetaPolyfill = {
  define: { 'import.meta.url': '__importMetaUrl' },
  banner: { js: 'const __importMetaUrl = require("url").pathToFileURL(__filename).href;' },
};

// Both bundles are independent — build in parallel
const [, ] = await Promise.all([
  build({
    entryPoints: ['server/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: 'dist-electron/server.cjs',
    external: ['better-sqlite3'],
    sourcemap: false,
    ...importMetaPolyfill,
  }).then(() => console.log('✓ Server bundled → dist-electron/server.cjs')),

  build({
    entryPoints: ['electron/main.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: 'dist-electron/main.cjs',
    external: ['electron', 'better-sqlite3', './server.cjs'],
    sourcemap: false,
    ...importMetaPolyfill,
  }).then(() => console.log('✓ Electron main bundled → dist-electron/main.cjs')),
]);
