import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { nip5aManifest } from '@napplet/vite-plugin';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    cors: {
      origin: true,
    },
  },
  plugins: [
    viteSingleFile(),
    nip5aManifest({
      nappletType: 'send-tweet',
      artifactMode: 'single-file',
      requires: ['outbox'],
    }),
  ],
});
