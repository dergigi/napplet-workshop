# Highlights

A read-only NIP-5D napplet that shows an auto-playing carousel of the five most
recent Nostr highlights ([kind 9802](https://nostrbook.dev/kinds/9802) / NIP-84).

It loads events through the shell-mediated `relay.query` and never signs,
stores, or opens relay sockets itself. There are no controls; the carousel
advances on its own. Highlight authors are resolved from kind-0 profile events;
profile images are loaded through the shell's `resource` interface.

Napplets are sandboxed iframe apps. The shell injects `window.napplet`; this app
uses `@napplet/sdk` for the outbox boundary.

## Start

```bash
pnpm install
pnpm dev
```

Build and verify the production artifact:

```bash
pnpm verify
```

`pnpm build` uses `@napplet/vite-plugin` to inject napplet metadata and, when
`VITE_DEV_PRIVKEY_HEX` is set, write a local `.nip5a-manifest.json` for hash
workflow testing.

## Conformance Testing

Verify the napplet conforms to the NAP protocol before publishing. Two variants,
mirroring `vitest` vs `vitest --ui`:

```bash
pnpm test:conformance      # headless: build + check; non-zero exit on failure (CI)
pnpm test:conformance:ui   # live web runtime; re-runs on every source change
```

It loads the build into a real `sandbox="allow-scripts"` iframe, drives the
protocol with a reference shell, and fails on a malformed envelope, a manifest
problem, a boot failure, or a forbidden-global reference (e.g. `window.nostr`).

Exacting requirements for a passing build:

- Build to a **single self-contained `index.html`** (`vite-plugin-singlefile` in
  `vite.config.ts`). NIP-5D loads a napplet via `iframe.srcdoc` with
  `sandbox="allow-scripts"` and no `allow-same-origin` (an opaque origin) — there
  is no served origin from which to fetch an external `<script src>`, so the JS
  must be inlined into the one file. External-asset builds do not boot.
- Import `@napplet/shim` once at the entry point — the shim's `shell.ready`
  handshake is how conformance detects a successful boot.
- Emit only well-formed envelopes via `@napplet/sdk`; declare every NAP you use in
  `vite.config.ts` `requires`.
- Do not reference `window.nostr` or use direct `fetch`/`WebSocket`/`localStorage`.

The napplet does **not** carry an aggregate hash: a file cannot contain a hash that
covers itself, so the shell computes it from the served files. Conformance does not
check for one.

## Included

- Vanilla Vite + TypeScript napplet app.
- `@napplet/shim` side-effect install and typed `@napplet/sdk` helpers.
- Build-time `@napplet/vite-plugin` wiring with a manifest-declared config
  schema.
- Default app-chrome text selection disabled in `src/styles.css`, with
  opt-in controls for copyable or editable regions.
- Context documents for NIP-5D, shell boundaries, package surfaces, and authoring
  patterns.
- Guidance for handling missing NAP interfaces or numbered wire formats without
  submitting unnecessary protocol PRs.
- Local Codex skills for napplet authoring and verification.

## Authoring Context

Read these before changing protocol-facing behavior:

- `docs/nip-5d.md`
- `docs/boundaries.md`
- `docs/design-patterns.md`
- `docs/package-surfaces.md`
- `docs/new-nap-proposals.md`
- `docs/authoring-checklist.md`

The pinned NIP-5D source is referenced from `docs/nip-5d.md`; this template does
not treat its local notes as normative protocol text.

## Text Selection

The starter disables accidental text selection by default. To change the whole
napplet, set `--napplet-text-selection: text` in `src/styles.css`. To opt in one
region, add `data-napplet-select="text"` or `data-napplet-select="all"`.

## Package Scripts

```bash
pnpm dev          # local Vite dev server
pnpm type-check   # TypeScript strict-mode check
pnpm build        # Vite production build
pnpm preview      # preview dist/
pnpm verify       # type-check + build
pnpm test:conformance     # headless NAP conformance (build + check, CI exit code)
pnpm test:conformance:ui  # live conformance web runtime, re-runs on change
```
