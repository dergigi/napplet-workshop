import '@napplet/shim';
import {
  relay,
  resource,
  themeGet,
  themeOnChanged,
  type NostrEvent,
  type Theme,
} from '@napplet/sdk';
import './styles.css';

const HIGHLIGHT_KIND = 9802;
const LIMIT = 5;
const DWELL_MS = 6500;

type Highlight = {
  id: string;
  content: string;
  context: string | null;
  source: string | null;
  author: string;
  createdAt: number;
};

type Profile = {
  name: string;
  picture: string | null;
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
let profiles = new Map<string, Profile>();
const avatarUrls = new Set<string>();
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

function unwrapEvent(value: unknown): NostrEvent | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = 'event' in value ? value.event : value;
  if (!candidate || typeof candidate !== 'object') return null;

  const event = candidate as Partial<NostrEvent>;
  if (
    typeof event.id !== 'string' ||
    typeof event.pubkey !== 'string' ||
    typeof event.created_at !== 'number' ||
    typeof event.content !== 'string' ||
    !Array.isArray(event.tags)
  ) {
    return null;
  }

  return event as NostrEvent;
}

function toHighlight(value: unknown): Highlight | null {
  const event = unwrapEvent(value);
  if (!event) return null;
  const content = event.content.trim();
  if (!content) return null;
  return {
    id: event.id,
    content,
    context: tagValue(event, 'context'),
    source: sourceFrom(event),
    author: event.pubkey,
    createdAt: event.created_at,
  };
}

function parseProfile(event: NostrEvent): Profile | null {
  try {
    const metadata = JSON.parse(event.content) as Record<string, unknown>;
    const name = [metadata.display_name, metadata.displayName, metadata.name].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    const picture =
      typeof metadata.picture === 'string' && metadata.picture.startsWith('https://')
        ? metadata.picture
        : null;
    return {
      name: name?.trim() ?? shortHex(event.pubkey),
      picture,
    };
  } catch {
    return null;
  }
}

function normalizeWithMap(value: string): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (/\s/.test(character)) {
      if (text.length > 0 && !text.endsWith(' ')) {
        text += ' ';
        map.push(index);
      }
      continue;
    }
    text += character.toLocaleLowerCase();
    map.push(index);
  }

  if (text.endsWith(' ')) {
    text = text.slice(0, -1);
    map.pop();
  }

  return { text, map };
}

function findHighlightRange(passage: string, selection: string): [number, number] | null {
  const normalizedPassage = normalizeWithMap(passage);
  const normalizedSelection = normalizeWithMap(selection).text;
  const start = normalizedPassage.text.indexOf(normalizedSelection);
  if (start < 0 || normalizedSelection.length === 0) return null;

  const originalStart = normalizedPassage.map[start];
  const originalEnd =
    normalizedPassage.map[start + normalizedSelection.length - 1] + 1;
  return [originalStart, originalEnd];
}

function buildPassage(highlight: Highlight): HTMLQuoteElement {
  const quote = document.createElement('blockquote');
  quote.className = 'quote';
  const passage = highlight.context?.trim() || highlight.content;
  const range = findHighlightRange(passage, highlight.content);

  if (!range) {
    const marker = document.createElement('mark');
    marker.textContent = highlight.content;
    quote.append(marker);
    if (highlight.context) quote.append(' ', highlight.context);
    return quote;
  }

  const [start, end] = range;
  const marker = document.createElement('mark');
  marker.textContent = passage.slice(start, end);
  quote.append(passage.slice(0, start), marker, passage.slice(end));
  return quote;
}

async function loadProfiles(items: Highlight[]): Promise<Map<string, Profile>> {
  const authors = [...new Set(items.map((item) => item.author))];
  const events = await relay.query([{ kinds: [0], authors, limit: authors.length }]);
  const latest = new Map<string, NostrEvent>();

  for (const value of events) {
    const event = unwrapEvent(value);
    if (!event || event.kind !== 0 || !authors.includes(event.pubkey)) continue;
    const current = latest.get(event.pubkey);
    if (!current || event.created_at > current.created_at) latest.set(event.pubkey, event);
  }

  return new Map(
    authors.map((author) => {
      const event = latest.get(author);
      return [
        author,
        (event && parseProfile(event)) ?? { name: shortHex(author), picture: null },
      ];
    }),
  );
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

  card.append(buildPassage(highlight));

  const footer = document.createElement('footer');
  footer.className = 'footer';

  const profile = profiles.get(highlight.author);
  const author = document.createElement('div');
  author.className = 'author';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.dataset.author = highlight.author;
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = (profile?.name ?? highlight.author).slice(0, 1).toUpperCase();

  const byline = document.createElement('p');
  byline.className = 'byline';
  const who = document.createElement('strong');
  who.textContent = profile?.name ?? shortHex(highlight.author);
  byline.append('highlighted by ', who);

  author.append(avatar, byline);
  footer.append(author);

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

async function loadAvatars(items: Highlight[]): Promise<void> {
  const entries = [...new Set(items.map((item) => item.author))]
    .map((author) => [author, profiles.get(author)?.picture] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));

  await Promise.allSettled(
    entries.map(async ([author, picture]) => {
      const blob = await resource.bytes(picture);
      const url = URL.createObjectURL(blob);
      avatarUrls.add(url);
      document.querySelectorAll<HTMLElement>(`.avatar[data-author="${author}"]`).forEach(
        (avatar) => {
          const image = document.createElement('img');
          image.alt = '';
          image.src = url;
          avatar.replaceChildren(image);
        },
      );
    }),
  );
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
  const events = await relay.query([{ kinds: [HIGHLIGHT_KIND], limit: LIMIT }]);

  const items = events
    .map(toHighlight)
    .filter((item): item is Highlight => item !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, LIMIT);

  if (items.length === 0) {
    setState('No recent highlights found.');
    return;
  }

  try {
    profiles = await loadProfiles(items);
  } catch {
    profiles = new Map(
      items.map((item) => [item.author, { name: shortHex(item.author), picture: null }]),
    );
  }

  renderCarousel(items);
  void loadAvatars(items);
}

wireTheme();
loadHighlights().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected load failure.';
  setState(message, 'error');
});

window.addEventListener('beforeunload', () => {
  window.clearTimeout(timer);
  avatarUrls.forEach((url) => URL.revokeObjectURL(url));
});
