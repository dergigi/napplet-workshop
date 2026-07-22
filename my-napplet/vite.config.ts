import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { nip5aManifest } from '@napplet/vite-plugin';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    // Paja injects the Vite HTML into a sandboxed srcdoc iframe (opaque/`null`
    // origin). ES modules only load from that iframe when the dev server answers
    // CORS for Origin: null.
    cors: {
      origin: true,
    },
  },
  plugins: [
    // Inline all JS/CSS into a single `index.html`. NIP-5D loads a napplet as a
    // single self-contained `/index.html` via `iframe.srcdoc` with
    // `sandbox="allow-scripts"` and no `allow-same-origin` (an opaque origin):
    // there is no served origin from which the shell could fetch an external
    // `<script src>`/`<link href>`, so the whole napplet must be one inlined
    // file. `vite-plugin-singlefile` produces that artifact; `nip5aManifest`
    // then content-addresses it for the NIP-5A manifest.
    viteSingleFile(),
    nip5aManifest({
      nappletType: 'highlights',
      artifactMode: 'single-file',
      requires: ['outbox'],
    }),
  ],
});
