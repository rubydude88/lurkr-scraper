export function sanitizeErrorMessage(msg: string): string {
  let text = String(msg || 'Unknown error');
  text = text.replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[REDACTED_API_KEY]');
  text = text.replace(/\b(sk|pk)_[A-Za-z0-9\-_]{16,}\b/g, '[REDACTED_API_KEY]');
  text = text.replace(/\b[A-Za-z0-9_\-]{24,}\b/g, token => {
    const looksLikeKey = /[A-Z]/.test(token) && /[a-z]/.test(token) && /\d/.test(token);
    return looksLikeKey ? '[REDACTED]' : token;
  });
  text = text.replace(/([?&](?:api_key|apikey|key|token|access_token)=)[^&\s]+/gi, '$1[REDACTED]');
  text = text.replace(/((?:api_key|apikey|key|token|access_token)\s*[:=]\s*)[^\s,]+/gi, '$1[REDACTED]');
  text = text.replace(/(\"(?:api_key|apikey|key|token|access_token)\"\s*:\s*\")[^\"]+(\")\/gi/, '$1[REDACTED]$2');
  return text;
}

export async function safeJson(res: Response): Promise<any> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string') {
      data.error = sanitizeErrorMessage(data.error);
    }
    return data;
  } catch {
    return { error: `Request failed with status ${res.status}` };
  }
}

export function showError(msg: string): void {
  const el = document.getElementById('error-banner');
  if (!el) return;
  el.textContent = sanitizeErrorMessage(msg);
  el.classList.remove('hidden');
  clearTimeout((el as any)._t);
  (el as any)._t = setTimeout(() => el.classList.add('hidden'), 8000);
}

export function showLoading(tbodyId: string, cols: number): void {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const tr = document.createElement('tr');
    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td');
      if (c === 0) td.innerHTML = '<span class="skeleton skeleton-thumb"></span>';
      else if (c === 1) td.innerHTML = '<span class="skeleton skeleton-text-long"></span>';
      else td.innerHTML = '<span class="skeleton skeleton-text-short"></span>';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

export function setBtnLoading(id: string, loading: boolean): void {
  const btn = document.getElementById(id) as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = loading;
  (btn as any)._orig = (btn as any)._orig || btn.textContent;
  btn.textContent = loading ? 'Loading…' : (btn as any)._orig;
}

export function numCell(val: any, extra = ''): HTMLTableCellElement {
  const td = document.createElement('td');
  td.className = ('num-cell ' + extra).trim();
  td.textContent = formatNum(val);
  return td;
}

export function emptyRow(cols: number, msg: string): string {
  return `<tr class="empty-row"><td colspan="${cols}"><div class="empty-state"><div class="empty-icon">◌</div><div>${msg}</div></div></td></tr>`;
}

export function thumbPlaceholder(icon: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'thumb-placeholder';
  d.textContent = icon;
  return d;
}

export function avatarPlaceholder(username: string, small = false): HTMLDivElement {
  const d = document.createElement('div');
  d.className = small ? 'avatar-placeholder avatar-placeholder-sm' : 'avatar-placeholder';
  d.textContent = username ? username[0].toUpperCase() : '?';
  return d;
}

export function getTimestamp(): string {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}_${p(n.getHours())}-${p(n.getMinutes())}`;
}

export function formatNum(n: any): string {
  n = Number(n);
  if (!n && n !== 0) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en', { month: 'short' })} ${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

export function formatDuration(secs: any): string {
  secs = Number(secs) || 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function relativeTime(iso: string): string {
  if (!iso) return '—';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
    const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
  } catch {
    return '—';
  }
}

export function truncate(str: string, len: number): string {
  return str && str.length > len ? str.slice(0, len) + '…' : (str || '');
}

export function escHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function showProfileCardSkeleton(cardId: string): void {
  const card = document.getElementById(cardId);
  if (!card) return;
  card.classList.remove('hidden');
  card.classList.add('loading');
}

export function hideProfileCardSkeleton(cardId: string): void {
  const card = document.getElementById(cardId);
  if (!card) return;
  card.classList.remove('loading');
}
