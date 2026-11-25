import { fileURLToPath } from 'node:url';
import { type Plugin, defineConfig } from 'vite';

/**
 * Builds BrickBuilder.html: one self-contained file that runs by double-clicking it,
 * without a web server or an internet connection.
 */
function inlineEverything(): Plugin {
  return {
    name: 'inline-everything',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = Object.values(bundle).find((f) => f.fileName.endsWith('.html'));
      if (!html || html.type !== 'asset') return;
      let out = String(html.source);
      let js = '';
      let css = '';
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk') js += file.code;
        else if (name.endsWith('.css')) css += String(file.source);
        if (file !== html) delete bundle[name];
      }
      const icon = `data:image/svg+xml,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#f5c518"/><rect x="10" y="26" width="44" height="26" rx="3" fill="#d6291f"/><rect x="15" y="17" width="12" height="10" rx="2" fill="#d6291f"/><rect x="37" y="17" width="12" height="10" rx="2" fill="#d6291f"/></svg>',
      )}`;
      out = out
        .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>\s*/g, '')
        .replace(/<link[^>]*rel="(stylesheet|modulepreload|manifest)"[^>]*>\s*/g, '')
        .replace(/href="\.?\/?icon\.svg"/g, `href="${icon}"`)
        .replace('</head>', () => `<style>${css}</style>\n</head>`)
        // Classic script at the end of <body>: runs from file:// where module scripts are blocked.
        .replace('</body>', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>\n</body>`);
      html.source = out;
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  resolve: {
    alias: [{ find: /^\.\/pdfWorker$/, replacement: fileURLToPath(new URL('./src/pdfWorker.standalone.ts', import.meta.url)) }],
  },
  build: {
    outDir: 'dist-standalone',
    target: 'es2022',
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    chunkSizeWarningLimit: 5000,
    rolldownOptions: { output: { format: 'iife', codeSplitting: false } },
  },
  plugins: [inlineEverything()],
});
