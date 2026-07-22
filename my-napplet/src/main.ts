import { outbox, themeGet, themeOnChanged, type NostrEvent, type Theme } from '@napplet/sdk';
import './styles.css';

const HIGHLIGHT_KIND = 9802;
const LIMIT = 5;
const DWELL_MS = 6500;

type Highlight = {
  id: string;
  content: string;
  context: string | null;
  source: string | null;
  author: string | null;
  createdAt: number;
};

const els = {
  carousel: requireElement<HTMLElement>('#carousel'),
  state: requireElement<HTMLParagraphElement>('#state'),
  dots: requireElement<HTMLOListElement>('#dots'),
  progress: requireElement<HTMLDivElement>('#progress'),
  progressBar: requireElement<HTMLDivElement>('#progressBar'),
  meta: requireElement<HTMLParagraphElement>('#meta'),
};

let activeIndex = 0;
let timer = 0;
let highlights: Highlight[] = [];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function tagValue(event: NostrEvent, name: string): string | null {
  const tag = event.tags.find((entry) => entry[0] === name && entry[1]);
  return tag?.[1] ?? null;
}

function sourceFrom(event: NostrEvent): string | null {
  return tagValue(event, 'r') ?? tagValue(event, 'a') ?? tagValue(event, 'e');
}

function authorFrom(event: NostrEvent): string | null {
  const tagged = event.tags.find((entry) => entry[0] === 'p' && entry[1]);
  return tagged?.[1] ?? event.pubkey;
}

function shortHex(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function compactSource(value: string): string {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const url = new URL(value);
      const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
      const compact = `${url.host}${path}`;
      return compact.length > 42 ? `${compact.slice(0, 39)}…` : compact;
    } catch {
      return shortHex(value);
    }
  }
  return shortHex(value);
}

function toHighlight(event: NostrEvent): Highlight | null {
  const content = event.content.trim();
  if (!content) return null;
  return {
    id: event.id,
    content,
    context: tagValue(event, 'context'),
    source: sourceFrom(event),
    author: authorFrom(event),
    createdAt: event.created_at,
  };
}

function setState(message: string, kind: 'idle' | 'error' = 'idle'): void {
  els.carousel.replaceChildren();
  els.state.textContent = message;
  els.state.dataset.kind = kind;
  els.carousel.append(els.state);
  els.dots.hidden = true;
  els.progress.hidden = true;
  window.clearTimeout(timer);
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const body = document.body;
  root.style.setProperty('--bg', theme.colors.background);
  root.style.setProperty('--ink', theme.colors.text);
  root.style.setProperty('--quote', theme.colors.text);
  root.style.setProperty('--accent', theme.colors.primary);
  root.style.backgroundColor = theme.colors.background;
  body.style.backgroundColor = theme.colors.background;
  body.style.color = theme.colors.text;
}

function hasThemeDomain(): boolean {
  return Boolean((window as Window & { napplet?: { theme?: unknown } }).napplet?.theme);
}

function wireTheme(): void {
  if (!hasThemeDomain()) return;
  themeGet()
    .then(applyTheme)
    .catch(() => undefined);
  themeOnChanged(applyTheme);
}

function buildSlide(highlight: Highlight, index: number): HTMLElement {
  const slide = document.createElement('article');
  slide.className = 'slide';
  slide.dataset.index = String(index);
  slide.setAttribute('aria-hidden', 'true');

  const card = document.createElement('div');
  card.className = 'card';

  const mark = document.createElement('span');
  mark.className = 'mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = '“';

  const quote = document.createElement('blockquote');
  quote.className = 'quote';
  quote.textContent = highlight.content;

  card.append(mark, quote);

  if (highlight.context) {
    const context = document.createElement('p');
    context.className = 'context';
    context.textContent = highlight.context;
    card.append(context);
  }

  const footer = document.createElement('footer');
  footer.className = 'footer';

  const byline = document.createElement('p');
  byline.className = 'byline';
  const who = document.createElement('strong');
  who.textContent = highlight.author ? shortHex(highlight.author) : 'unknown';
  byline.append('highlighted · ', who);

  footer.append(byline);

  if (highlight.source) {
    const source = document.createElement('p');
    source.className = 'source';
    source.textContent = compactSource(highlight.source);
    footer.append(source);
  }

  card.append(footer);
  slide.append(card);
  return slide;
}

function renderCarousel(items: Highlight[]): void {
  highlights = items;
  activeIndex = 0;

  els.carousel.replaceChildren();
  for (const [index, item] of items.entries()) {
    els.carousel.append(buildSlide(item, index));
  }

  els.dots.replaceChildren();
  for (let i = 0; i < items.length; i += 1) {
    const dot = document.createElement('li');
    if (i === 0) dot.classList.add('is-active');
    els.dots.append(dot);
  }
  els.dots.hidden = items.length <= 1;
  els.progress.hidden = items.length <= 1;
  els.meta.textContent = `${items.length} recent · kind ${HIGHLIGHT_KIND}`;

  showSlide(0);
  if (items.length > 1) scheduleAdvance();
}

function showSlide(index: number): void {
  activeIndex = index;
  const slides = els.carousel.querySelectorAll<HTMLElement>('.slide');
  slides.forEach((slide, i) => {
    const active = i === index;
    slide.classList.toggle('is-active', active);
    slide.setAttribute('aria-hidden', active ? 'false' : 'true');
  });

  els.dots.querySelectorAll('li').forEach((dot, i) => {
    dot.classList.toggle('is-active', i === index);
  });

  restartProgress();
}

function restartProgress(): void {
  els.progressBar.classList.remove('is-running');
  void els.progressBar.offsetWidth;
  if (!els.progress.hidden && !reduceMotion) {
    els.progressBar.classList.add('is-running');
  }
}

function scheduleAdvance(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const next = (activeIndex + 1) % highlights.length;
    showSlide(next);
    scheduleAdvance();
  }, DWELL_MS);
}

async function loadHighlights(): Promise<void> {
  const { events, error, incomplete } = await outbox.query(
    [{ kinds: [HIGHLIGHT_KIND], limit: LIMIT }],
    { limit: LIMIT, timeoutMs: 8000 },
  );

  const items = events
    .map(toHighlight)
    .filter((item): item is Highlight => item !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, LIMIT);

  if (items.length === 0) {
    setState(
      error
        ? `Could not load highlights. ${error}`
        : incomplete
          ? 'No highlights came back yet. The shell may still be finding relays.'
          : 'No recent highlights found.',
      error ? 'error' : 'idle',
    );
    return;
  }

  renderCarousel(items);
}

wireTheme();
loadHighlights().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected load failure.';
  setState(message, 'error');
});

window.addEventListener('beforeunload', () => {
  window.clearTimeout(timer);
});
