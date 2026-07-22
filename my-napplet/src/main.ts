import '@napplet/shim';
import {
  CONFIG_DOMAIN,
  IDENTITY_DOMAIN,
  NOTIFY_DOMAIN,
  RELAY_DOMAIN,
  RESOURCE_DOMAIN,
  STORAGE_DOMAIN,
  config,
  identity,
  notify,
  relay,
  resource,
  storage,
  type NostrEvent,
  type Subscription,
} from '@napplet/sdk';
import './styles.css';

type StatusKind = 'idle' | 'ok' | 'warn' | 'error';

type ShellShape = {
  napplet?: {
    shell?: {
      supports?: (capability: string, protocol?: string) => boolean;
    };
  };
};

const elements = {
  status: requireElement<HTMLOutputElement>('#status'),
  capabilities: requireElement<HTMLDListElement>('#capabilities'),
  identityValue: requireElement<HTMLParagraphElement>('#identityValue'),
  noteInput: requireElement<HTMLTextAreaElement>('#noteInput'),
  storageValue: requireElement<HTMLParagraphElement>('#storageValue'),
  output: requireElement<HTMLPreElement>('#output'),
  identityButton: requireElement<HTMLButtonElement>('#identityButton'),
  storageButton: requireElement<HTMLButtonElement>('#storageButton'),
  relayButton: requireElement<HTMLButtonElement>('#relayButton'),
  resourceButton: requireElement<HTMLButtonElement>('#resourceButton'),
  notifyButton: requireElement<HTMLButtonElement>('#notifyButton'),
  settingsButton: requireElement<HTMLButtonElement>('#settingsButton'),
};

let identitySubscription: Subscription | null = null;
let configSubscription: Subscription | null = null;

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

function setStatus(kind: StatusKind, message: string): void {
  elements.status.className = `status status-${kind}`;
  elements.status.textContent = message;
}

function setOutput(value: unknown): void {
  elements.output.textContent =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function getShellSupports(capability: string, protocol?: string): boolean {
  const shell = (window as Window & ShellShape).napplet?.shell;
  try {
    return Boolean(shell?.supports?.(capability, protocol));
  } catch {
    return false;
  }
}

function featureStatus(capability: string): 'yes' | 'no' {
  return getShellSupports(capability) || getShellSupports(`nap:${capability}`)
    ? 'yes'
    : 'no';
}

function renderCapabilities(): void {
  const rows = [
    ['relay', featureStatus(RELAY_DOMAIN)],
    ['storage', featureStatus(STORAGE_DOMAIN)],
    ['identity', featureStatus(IDENTITY_DOMAIN)],
    ['config', featureStatus(CONFIG_DOMAIN)],
    ['resource', featureStatus(RESOURCE_DOMAIN)],
    ['notify', featureStatus(NOTIFY_DOMAIN)],
  ];

  elements.capabilities.replaceChildren(
    ...rows.flatMap(([label, value]) => {
      const term = document.createElement('dt');
      term.textContent = label;
      const description = document.createElement('dd');
      description.textContent = value;
      description.dataset.state = value === 'no' ? 'off' : 'on';
      return [term, description];
    }),
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = 5000,
): Promise<T> {
  let timer = 0;
  const timeout = new Promise<T>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`${label} did not resolve within ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}

function summarizeEvent(event: NostrEvent): {
  id: string;
  kind: number;
  created_at: number;
  content: string;
} {
  return {
    id: event.id,
    kind: event.kind,
    created_at: event.created_at,
    content: event.content.slice(0, 160),
  };
}

function shortPubkey(pubkey: string): string {
  if (!pubkey) return 'not connected';
  if (pubkey.length <= 16) return pubkey;
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
}

async function refreshIdentity(): Promise<void> {
  setStatus('idle', 'Reading identity');
  const pubkey = await withTimeout(identity.getPublicKey(), 'identity.getPublicKey');
  elements.identityValue.textContent = shortPubkey(pubkey);
  setStatus(pubkey ? 'ok' : 'warn', pubkey ? 'Identity loaded' : 'No user identity');
}

async function saveNote(): Promise<void> {
  setStatus('idle', 'Saving note');
  const value = elements.noteInput.value.trim();
  await withTimeout(storage.setItem('draft-note', value), 'storage.setItem');
  const saved = await withTimeout(storage.getItem('draft-note'), 'storage.getItem');
  elements.storageValue.textContent = saved ?? 'missing';
  setStatus('ok', 'Note saved');
}

async function queryRelay(): Promise<void> {
  setStatus('idle', 'Querying relay');
  const values = await readConfigValues();
  const configuredLimit = Number(values.defaultRelayLimit ?? 5);
  const limit = Number.isFinite(configuredLimit) ? configuredLimit : 5;
  const events = await withTimeout(
    relay.query({ kinds: [1], limit }),
    'relay.query',
    8000,
  );
  setOutput(events.map(summarizeEvent));
  setStatus('ok', `Loaded ${events.length} relay event${events.length === 1 ? '' : 's'}`);
}

async function loadResource(): Promise<void> {
  setStatus('idle', 'Loading resource');
  const blob = await withTimeout(
    resource.bytes('data:text/plain;base64,TmFwcGxldCByZXNvdXJjZSBjaGVjaw=='),
    'resource.bytes',
  );
  const text = await blob.text();
  setOutput({ resource: text, bytes: blob.size, type: blob.type || 'unknown' });
  setStatus('ok', 'Resource loaded');
}

async function sendNotification(): Promise<void> {
  setStatus('idle', 'Sending notification');
  const result = await withTimeout(
    notify.send({
      title: 'Napplet ready',
      body: 'The starter app can talk to the shell notification surface.',
      priority: 'normal',
    }),
    'notify.send',
  );
  setOutput(result);
  setStatus('ok', 'Notification sent');
}

async function readConfigValues(): Promise<Record<string, unknown>> {
  try {
    return await withTimeout(config.get(), 'config.get', 3000);
  } catch {
    return {};
  }
}

function subscribeToIdentityChanges(): void {
  try {
    identitySubscription = identity.onChanged((pubkey) => {
      elements.identityValue.textContent = shortPubkey(pubkey);
      setStatus(pubkey ? 'ok' : 'warn', pubkey ? 'Identity changed' : 'Identity cleared');
    });
  } catch (error) {
    setOutput(error instanceof Error ? error.message : error);
  }
}

function subscribeToConfigChanges(): void {
  try {
    configSubscription = config.subscribe((values) => {
      document.documentElement.dataset.accent = String(values.accentColor ?? 'blue');
    });
  } catch {
    document.documentElement.dataset.accent = 'blue';
  }
}

function handleAction(action: () => Promise<void>): void {
  action().catch((error: unknown) => {
    setStatus('error', 'Action failed');
    setOutput(error instanceof Error ? error.message : error);
  });
}

elements.identityButton.addEventListener('click', () => handleAction(refreshIdentity));
elements.storageButton.addEventListener('click', () => handleAction(saveNote));
elements.relayButton.addEventListener('click', () => handleAction(queryRelay));
elements.resourceButton.addEventListener('click', () => handleAction(loadResource));
elements.notifyButton.addEventListener('click', () => handleAction(sendNotification));
elements.settingsButton.addEventListener('click', () => {
  try {
    config.openSettings({ section: 'appearance' });
    setStatus('ok', 'Settings requested');
  } catch (error) {
    setStatus('error', 'Settings failed');
    setOutput(error instanceof Error ? error.message : error);
  }
});

window.addEventListener('beforeunload', () => {
  identitySubscription?.close();
  configSubscription?.close();
});

renderCapabilities();
subscribeToIdentityChanges();
subscribeToConfigChanges();
setOutput('Napplet ready. Use the actions above to exercise each shell surface.');

