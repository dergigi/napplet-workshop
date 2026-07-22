import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { nip5aManifest } from '@napplet/vite-plugin';
import type { NappletConfigSchema } from '@napplet/sdk';

const configSchema = {
  type: 'object',
  properties: {
    accentColor: {
      type: 'string',
      enum: ['blue', 'green', 'amber'],
      default: 'blue',
      'x-napplet-section': 'appearance',
      'x-napplet-order': 1,
    },
    defaultRelayLimit: {
      type: 'integer',
      minimum: 1,
      maximum: 50,
      default: 5,
      'x-napplet-section': 'relay',
      'x-napplet-order': 1,
    },
  },
  required: ['accentColor'],
} satisfies NappletConfigSchema;

export default defineConfig({
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
      nappletType: 'my-napplet',
      requires: ['relay', 'storage', 'identity', 'config', 'resource', 'notify'],
      configSchema,
    }),
  ],
});

