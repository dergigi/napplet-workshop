import '@napplet/shim';
import { outbox } from '@napplet/sdk';
import './styles.css';

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const form = requireElement<HTMLFormElement>('#compose');
const note = requireElement<HTMLTextAreaElement>('#note');
const send = requireElement<HTMLButtonElement>('#send');

let resetTimer = 0;

function setButton(label: string, disabled = false): void {
  send.textContent = label;
  send.disabled = disabled;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const content = note.value.trim();
  if (!content) {
    note.focus();
    return;
  }

  window.clearTimeout(resetTimer);
  setButton('sending…', true);

  void outbox
    .publish({
      kind: 1,
      content,
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    })
    .then((result) => {
      if (!result.ok) throw new Error(result.error ?? 'Publish failed');
      note.value = '';
      setButton('sent', true);
      resetTimer = window.setTimeout(() => setButton('send tweet'), 1400);
    })
    .catch(() => {
      setButton('try again');
    });
});

window.addEventListener('beforeunload', () => {
  window.clearTimeout(resetTimer);
});
