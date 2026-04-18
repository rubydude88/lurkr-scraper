import type { Platform } from './types';
import { showError } from './ui';

// Keys are stored in httpOnly cookies server-side — never in JS or localStorage.
// The frontend only knows whether a key is set (boolean), not the value itself.

const keyStatus: Record<string, boolean> = { tiktok: false, youtube: false, instagram: false, 'ig-session': false };

export function getKeyIsSet(p: string): boolean {
  return keyStatus[p] ?? false;
}

export function requireKey(p: Platform): true | null {
  if (!keyStatus[p]) {
    const label: Record<string, string> = {
      tiktok: 'Apify',
      youtube: 'YouTube Data API v3',
      instagram: 'Apify',
      'ig-session': 'Instagram Session ID',
    };
    showError(`No ${label[p]} key set. Click "API Keys" to add one.`);
    return null;
  }
  return true;
}

let keysOpen = false;

export function toggleKeys(): void {
  keysOpen = !keysOpen;
  document.getElementById('keys-drawer')?.classList.toggle('hidden', !keysOpen);
  document.getElementById('keys-overlay')?.classList.toggle('hidden', !keysOpen);
  document.getElementById('btn-keys')?.classList.toggle('active', keysOpen);
  if (keysOpen) refreshKeyStatuses();
}

export async function refreshKeyStatuses(): Promise<void> {
  try {
    const res = await fetch('/keys/status');
    const data = await res.json();
    for (const p of ['tiktok', 'youtube', 'instagram'] as const) {
      keyStatus[p] = !!data[p];
    }
  } catch {
    // silently fail — statuses stay false
  }
  renderKeyStatuses();
}

function renderKeyStatuses(): void {
  for (const p of ['tiktok', 'youtube', 'ig-session']) {
    const el = document.getElementById(`${p}-key-status`);
    if (!el) continue;
    if (keyStatus[p]) {
      el.className = 'key-status ok';
      el.textContent = p === 'ig-session' ? '✓ Session saved (more comments enabled)' : '✓ Key saved';
    } else {
      el.className = 'key-status warn';
      el.textContent = p === 'ig-session' ? '✗ Not set (max ~5 comments)' : '✗ No key set';
    }
  }
}

export function toggleEye(id: string, btn: HTMLElement): void {
  const inp = document.getElementById(id) as HTMLInputElement | null;
  if (!inp || !btn) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

function setFeedback(el: HTMLElement, type: string, msg: string): void {
  el.className = `key-feedback ${type}`;
  el.textContent = msg;
}

export async function saveKey(p: Platform | 'ig-session'): Promise<void> {
  const inp = document.getElementById(`${p}-key-input`) as HTMLInputElement | null;
  const fb = document.getElementById(`${p}-key-feedback`);
  if (!inp || !fb) return;
  const k = inp.value.trim();
  if (!k) { setFeedback(fb, 'err', 'Enter a key first.'); return; }

  try {
    const res = await fetch('/keys/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: p, key: k }),
    });
    if (!res.ok) throw new Error();
    inp.value = '';
    keyStatus[p] = true;
    setFeedback(fb, 'ok', 'Saved!');
    renderKeyStatuses();
    setTimeout(() => { fb.textContent = ''; fb.className = 'key-feedback'; }, 2500);
  } catch {
    setFeedback(fb, 'err', 'Failed to save key.');
  }
}

export async function clearKey(p: Platform | 'ig-session'): Promise<void> {
  const fb = document.getElementById(`${p}-key-feedback`);
  try {
    await fetch('/keys/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: p }),
    });
    keyStatus[p] = false;
    if (fb) {
      setFeedback(fb, 'ok', 'Cleared.');
      renderKeyStatuses();
      setTimeout(() => { fb.textContent = ''; fb.className = 'key-feedback'; }, 2000);
    }
  } catch {
    if (fb) setFeedback(fb, 'err', 'Failed to clear.');
  }
}
