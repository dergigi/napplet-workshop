import '@napplet/shim';
import { outbox } from '@napplet/sdk';
import './styles.css';

const FALLBACK_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
];
const PUBLISH_OPTIONS = {
  relays: FALLBACK_RELAYS,
  toOutbox: false,
} as NonNullable<Parameters<typeof outbox.publish>[1]> & { toOutbox: false };

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const note = requireElement<HTMLTextAreaElement>('#note');
const send = requireElement<HTMLButtonElement>('#send');
const status = requireElement<HTMLOutputElement>('#status');

let resetTimer = 0;

function setButton(label: string, disabled = false): void {
  send.textContent = label;
  send.disabled = disabled;
}

function setStatus(kind: 'idle' | 'success' | 'error', message = ''): void {
  status.dataset.kind = kind;
  status.textContent = message;
}

function publishErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /signer|signing|identity/i.test(message)
    ? 'connect a signer in the shell'
    : 'could not send';
}

send.addEventListener('click', () => {
  const content = note.value.trim();
  if (!content) {
    note.focus();
    return;
  }

  window.clearTimeout(resetTimer);
  setStatus('idle');
  setButton('sending…', true);

  void outbox
    .publish(
      {
        kind: 1,
        content,
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      },
      PUBLISH_OPTIONS,
    )
    .then((result) => {
      if (!result.ok) throw new Error(result.error ?? 'Publish failed');
      note.value = '';
      setStatus('success', 'posted');
      setButton('sent', true);
      resetTimer = window.setTimeout(() => setButton('send tweet'), 1400);
    })
    .catch((error: unknown) => {
      setStatus('error', publishErrorMessage(error));
      setButton('send tweet');
    });
});

window.addEventListener('beforeunload', () => {
  window.clearTimeout(resetTimer);
});
