# NIP-5D Reference

This repository does not contain normative protocol text.

Authoritative pinned source:

`https://raw.githubusercontent.com/dskvr/nips/d80d7b25f9c4331acbeb40dbeb3b077caa80e885/5D.md`

Pinned source commit:

`d80d7b25f9c4331acbeb40dbeb3b077caa80e885`

Related upstream discussion:

`https://github.com/nostr-protocol/nips/pull/2303`

## What To Use This For

- Confirm the JSON envelope shape for napplet-shell postMessage transport.
- Confirm iframe sandbox assumptions.
- Confirm how a shell advertises NAP capability support.
- Confirm that shell-owned services, not the napplet, hold privileged access.

## What Not To Do

- Do not copy protocol requirements into app code as hardcoded shell policy.
- Do not treat this template as the spec.
- Do not infer missing shell behavior from browser side effects.

When protocol behavior appears to conflict with a package README, check the
pinned NIP-5D source and then the current `@napplet` package source.

