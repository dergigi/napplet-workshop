# Highlights

A NIP-5D napplet that displays the five latest Nostr highlights (kind 9802).
Each card shows the surrounding passage, marked selection, author profile, and
source.

## Run

```bash
pnpm install
kehto paja --target-url http://127.0.0.1:5173 -- pnpm vite --host 127.0.0.1
```

Open the Paja runtime URL printed in the terminal.

## Check

```bash
pnpm verify
pnpm test:conformance
```

## License

MIT
