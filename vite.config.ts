import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string;
};

/**
 * Emits `sw.js` from `src/pwa/sw.js` with the list of every built file as its precache (NFR-04),
 * so the first visit already stores the whole app and the next start works offline.
 */
function pwa(): Plugin {
  return {
    name: 'pwa',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle);
      const shell = [
        './',
        ...files,
        'manifest.webmanifest',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/maskable-512.png',
      ];
      const version = createHash('sha256')
        .update(files.join('|'))
        .update(
          files
            .map((f) => String((bundle[f] as { code?: string }).code ?? ''))
            .join(''),
        )
        .digest('hex')
        .slice(0, 10);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: readFileSync('src/pwa/sw.js', 'utf8')
          .replace('__VERSION__', version)
          .replace('__PRECACHE__', JSON.stringify(shell)),
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [pwa()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: { environment: 'jsdom' },
});
