'use strict';

// ── State ─────────────────────────────────────────────────────────
let currentPlatform = 'tiktok';
let ttVideosData    = [];
let ttCommentsData  = [];
let ytVideosData    = [];
let ytStatsData     = [];
let ytSharedChannelInput = '';

// ── Theme ─────────────────────────────────────────────────────────
function initTheme() {
  applyTheme(localStorage.getItem('scraperkit_theme') || 'dark');
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('scraperkit_theme', theme);
  const dark = theme === 'dark';
  document.getElementById('icon-sun')?.classList.toggle('hidden', dark);
  document.getElementById('icon-moon')?.classList.toggle('hidden', !dark);
}
function toggleTheme() {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

// ── API Key Storage ───────────────────────────────────────────────
const KEY_STORE = { tiktok: 'scraperkit_apify_key', youtube: 'scraperkit_youtube_key' };
function getKey(p) { return localStorage.getItem(KEY_STORE[p]) || ''; }
function requireKey(p) {
  const k = getKey(p);
  if (!k) {
    showError(`No ${{ tiktok: 'Apify', youtube: 'YouTube Data API v3' }[p]} key set. Click "API Keys" to add one.`);
    return null;
  }
  return k;
}

// ── Keys drawer ───────────────────────────────────────────────────
let keysOpen = false;
function toggleKeys() {
  keysOpen = !keysOpen;
  document.getElementById('keys-drawer')?.classList.toggle('hidden', !keysOpen);
  document.getElementById('keys-overlay')?.classList.toggle('hidden', !keysOpen);
  document.getElementById('btn-keys')?.classList.toggle('active', keysOpen);
  if (keysOpen) refreshKeyStatuses();
}
function refreshKeyStatuses() {
  for (const p of ['tiktok', 'youtube']) {
    const el = document.getElementById(`${p}-key-status`);
    if (!el) continue;
    if (getKey(p)) {
      el.className = 'key-status ok';
      el.textContent = '✓ Key saved';
    } else {
      el.className = 'key-status warn';
      el.textContent = '✗ No key set';
    }
  }
}
function toggleEye(id, btn) {
  const inp = document.getElementById(id);
  if (!inp || !btn) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}
function saveKey(p) {
  const inp = document.getElementById(`${p}-key-input`);
  const fb  = document.getElementById(`${p}-key-feedback`);
  if (!inp || !fb) return;
  const k = inp.value.trim();
  if (!k) {
    setFeedback(fb, 'err', 'Enter a key first.');
    return;
  }
  localStorage.setItem(KEY_STORE[p], k);
  inp.value = '';
  setFeedback(fb, 'ok', 'Saved!');
  refreshKeyStatuses();
  setTimeout(() => {
    fb.textContent = '';
    fb.className = 'key-feedback';
  }, 2500);
}
function clearKey(p) {
  localStorage.removeItem(KEY_STORE[p]);
  const fb = document.getElementById(`${p}-key-feedback`);
  if (!fb) return;
  setFeedback(fb, 'ok', 'Cleared.');
  refreshKeyStatuses();
  setTimeout(() => {
    fb.textContent = '';
    fb.className = 'key-feedback';
  }, 2000);
}
function setFeedback(el, type, msg) {
  el.className = `key-feedback ${type}`;
  el.textContent = msg;
}

// ── Platform switching ────────────────────────────────────────────
function switchPlatform(p) {
  currentPlatform = p;
  document.querySelectorAll('.platform-tab').forEach(b => b.classList.toggle('active', b.dataset.platform === p));
  document.querySelectorAll('.platform-panel').forEach(s => s.classList.toggle('hidden', s.id !== `platform-${p}`));
}

function ytSyncChannelInput(val) {
  ytSharedChannelInput = val;
  const ch = document.getElementById('yt-channel-id');
  if (ch && ch.value !== val) ch.value = val;
}
function ytSwitchTab(tab) {
  ['videos', 'stats'].forEach(t => {
    document.getElementById(`yt-panel-${t}`)?.classList.toggle('hidden', t !== tab);
    document.getElementById(`yt-tab-${t}`)?.classList.toggle('active', t === tab);
  });
  if (ytSharedChannelInput) {
    const ch = document.getElementById('yt-channel-id');
    if (ch) ch.value = ytSharedChannelInput;
  }
}

// Combined channel + videos fetch
async function ytFetchChannelAndVideos() {
  const channelId = document.getElementById('yt-channel-id')?.value.trim();
  if (!channelId) { showError('Enter a Channel ID, @handle, or URL.'); return; }
  const api_key = requireKey('youtube'); if (!api_key) return;
  const maxResults = parseInt(document.getElementById('yt-max-results')?.value, 10) || 25;

  setBtnLoading('yt-btn-channel', true);
  showLoading('yt-videos-tbody', 9);
  document.getElementById('yt-channel-card')?.classList.add('hidden');
  const exportRow = document.getElementById('yt-videos-export-row');
  if (exportRow) exportRow.style.display = 'none';
  document.getElementById('error-banner')?.classList.add('hidden');
  ytSharedChannelInput = channelId;

  try {
    const [chRes, vidRes] = await Promise.all([
      fetch('/scrape/youtube/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId, api_key }),
      }),
      fetch('/scrape/youtube/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId, api_key, max_results: maxResults }),
      }),
    ]);

    const chData = await safeJson(chRes);
    const vidData = await safeJson(vidRes);

    if (chData.error) showError(chData.error);
    else ytRenderChannelCard(chData);

    if (vidData.error) {
      showError(vidData.error);
      ytRenderVideosEmpty();
    } else {
      ytVideosData = vidData.videos || [];
      ytRenderVideosTable();
      const countEl = document.getElementById('yt-videos-count');
      if (countEl) countEl.textContent = `${ytVideosData.length} videos fetched`;
      if (exportRow) exportRow.style.display = ytVideosData.length ? 'flex' : 'none';
    }
  } catch (e) {
    showError('Connection error: ' + sanitizeErrorMessage(e?.message || String(e)));
    ytRenderVideosEmpty();
  } finally {
    setBtnLoading('yt-btn-channel', false);
  }
}

// ── Shared helpers ────────────────────────────────────────────────
function getTimestamp() {
  const n = new Date();
  const p = x => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}_${p(n.getHours())}-${p(n.getMinutes())}`;
}
function formatNum(n) {
  n = Number(n);
  if (!n && n !== 0) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en', { month: 'short' })} ${d.getFullYear()}`;
  } catch {
    return iso;
  }
}
function formatDuration(secs) {
  secs = Number(secs) || 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function relativeTime(iso) {
  if (!iso) return '—';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);  if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);  if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);  if (d < 30) return `${d}d ago`;
    const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
  } catch {
    return '—';
  }
}
function truncate(str, len) {
  return str && str.length > len ? str.slice(0, len) + '…' : (str || '');
}
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function sanitizeErrorMessage(msg) {
  let text = String(msg || 'Unknown error');

  text = text.replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[REDACTED_API_KEY]');
  text = text.replace(/\b(sk|pk)_[A-Za-z0-9\-_]{16,}\b/g, '[REDACTED_API_KEY]');
  text = text.replace(/\b[A-Za-z0-9_\-]{24,}\b/g, token => {
    const looksLikeKey =
      /[A-Z]/.test(token) &&
      /[a-z]/.test(token) &&
      /\d/.test(token);
    return looksLikeKey ? '[REDACTED]' : token;
  });

  text = text.replace(/([?&](?:api_key|apikey|key|token|access_token)=)[^&\s]+/gi, '$1[REDACTED]');
  text = text.replace(/((?:api_key|apikey|key|token|access_token)\s*[:=]\s*)[^\s,]+/gi, '$1[REDACTED]');
  text = text.replace(/("(?:api_key|apikey|key|token|access_token)"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2');

  return text;
}
async function safeJson(res) {
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
function showError(msg) {
  const el = document.getElementById('error-banner');
  if (!el) return;
  el.textContent = sanitizeErrorMessage(msg);
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 8000);
}
function showLoading(tbodyId, cols) {
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
function setBtnLoading(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = loading;
  btn._orig = btn._orig || btn.textContent;
  btn.textContent = loading ? 'Loading…' : btn._orig;
}
function numCell(val, extra = '') {
  const td = document.createElement('td');
  td.className = ('num-cell ' + extra).trim();
  td.textContent = formatNum(val);
  return td;
}
function emptyRow(cols, msg) {
  return `<tr class="empty-row"><td colspan="${cols}"><div class="empty-state"><div class="empty-icon">◌</div><div>${msg}</div></div></td></tr>`;
}
function thumbPlaceholder(icon) {
  const d = document.createElement('div');
  d.className = 'thumb-placeholder';
  d.textContent = icon;
  return d;
}
function avatarPlaceholder(username, small = false) {
  const d = document.createElement('div');
  d.className = small ? 'avatar-placeholder avatar-placeholder-sm' : 'avatar-placeholder';
  d.textContent = username ? username[0].toUpperCase() : '?';
  return d;
}

// ── Format detection (YouTube) ────────────────────────────────────
function formatBadge(fmt) {
  if (fmt === 'shorts') return `<span class="badge badge-vertical">📱 Shorts</span>`;
  if (fmt === 'horizontal') return `<span class="badge badge-horizontal">⬜ Horizontal</span>`;
  return `<span class="badge badge-unknown">—</span>`;
}

function inferVideoFormat(video) {
  const url  = (video.url || '').toLowerCase();
  const secs = video.durationSeconds ?? video.durationSecs ?? null;
  if (url.includes('/shorts/')) return 'shorts';
  if (secs != null) return Number(secs) <= 60 ? 'shorts' : 'horizontal';
  if (video.isShort === true) return 'shorts';
  return 'unknown';
}

function detectFormatAsync(video, tdEl) {
  const fmt = inferVideoFormat(video);
  video._formatDetected = fmt;
  if (tdEl) tdEl.innerHTML = formatBadge(fmt);
}

// ── CSV / XLSX export ─────────────────────────────────────────────
function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const v = row[h] == null ? '' : String(row[h]);
        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(',')
    )
  ].join('\n');
}
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function exportXLSX(data, sheetName, filename) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

// ══════════════════════════════════════════════════════════════════
//  TIKTOK
// ══════════════════════════════════════════════════════════════════
function ttSwitchTab(tab) {
  ['videos', 'comments'].forEach(t => {
    document.getElementById(`tt-panel-${t}`)?.classList.toggle('hidden', t !== tab);
    document.getElementById(`tt-tab-${t}`)?.classList.toggle('active', t === tab);
  });
}

async function ttFetchVideos() {
  const username = document.getElementById('tt-username')?.value.trim();
  if (!username) { showError('Enter a TikTok username first.'); return; }
  const api_key = requireKey('tiktok'); if (!api_key) return;
  const limit = parseInt(document.getElementById('tt-limit')?.value, 10) || 30;
  const date_from = document.getElementById('tt-date-from')?.value || null;
  const date_to   = document.getElementById('tt-date-to')?.value || null;

  setBtnLoading('tt-btn-fetch-videos', true);
  showLoading('tt-videos-tbody', 9);
  const exportRow = document.getElementById('tt-videos-export-row');
  if (exportRow) exportRow.style.display = 'none';
  document.getElementById('error-banner')?.classList.add('hidden');

  try {
    const res = await fetch('/scrape/tiktok/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, api_key, limit, date_from, date_to }),
    });
    const data = await safeJson(res);
    if (data.error) { showError(data.error); ttRenderVideosEmpty(); return; }

    ttVideosData = data.videos || [];
    ttRenderVideosTable();
    ttPopulateDropdown();

    const countEl = document.getElementById('tt-videos-count');
    if (countEl) countEl.textContent = `${ttVideosData.length} videos found`;
    if (exportRow) exportRow.style.display = ttVideosData.length ? 'flex' : 'none';
  } catch (e) {
    showError('Connection error: ' + sanitizeErrorMessage(e?.message || String(e)));
    ttRenderVideosEmpty();
  } finally {
    setBtnLoading('tt-btn-fetch-videos', false);
  }
}
function ttRenderVideosEmpty() {
  const el = document.getElementById('tt-videos-tbody');
  if (el) el.innerHTML = emptyRow(9, 'No videos found.');
}
function ttRenderVideosTable() {
  const tbody = document.getElementById('tt-videos-tbody');
  if (!tbody) return;
  if (!ttVideosData.length) { ttRenderVideosEmpty(); return; }

  tbody.innerHTML = '';
  ttVideosData.forEach(v => {
    const tr = document.createElement('tr');
    tr.addEventListener('click', () => tr.classList.toggle('selected'));

    const tdThumb = document.createElement('td');
    if (v.thumbnail) {
      const img = document.createElement('img');
      img.src = v.thumbnail;
      img.alt = '';
      img.className = 'thumbnail';
      img.onerror = () => img.replaceWith(thumbPlaceholder('▶'));
      tdThumb.appendChild(img);
    } else {
      tdThumb.appendChild(thumbPlaceholder('▶'));
    }
    tr.appendChild(tdThumb);

    const tdCap = document.createElement('td');
    const div = document.createElement('div');
    div.className = 'caption-cell';
    div.textContent = v.caption || '—';
    div.title = v.caption || '';
    tdCap.appendChild(div);
    tr.appendChild(tdCap);

    const tdPub = document.createElement('td');
    tdPub.className = 'date-cell hide-mobile';
    tdPub.textContent = formatDate(v.published);
    tr.appendChild(tdPub);

    const tdDur = document.createElement('td');
    tdDur.className = 'num-cell hide-mobile';
    tdDur.textContent = formatDuration(v.duration);
    tr.appendChild(tdDur);

    tr.appendChild(numCell(v.views));
    tr.appendChild(numCell(v.likes));
    tr.appendChild(numCell(v.comments));

    const tdS = numCell(v.shares);
    tdS.classList.add('hide-mobile');
    tr.appendChild(tdS);

    const tdLink = document.createElement('td');
    tdLink.className = 'link-cell';
    if (v.url) {
      const a = document.createElement('a');
      a.href = v.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = '↗';
      tdLink.appendChild(a);
    }
    tr.appendChild(tdLink);

    tbody.appendChild(tr);
  });
}
function ttPopulateDropdown() {
  const sel = document.getElementById('tt-video-select');
  if (!sel) return;
  sel.innerHTML = '';
  if (!ttVideosData.length) {
    sel.innerHTML = '<option value="">— no videos —</option>';
    return;
  }
  ttVideosData.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = v.url || '';
    opt.textContent = truncate(v.caption || v.url || `Video ${i + 1}`, 60);
    sel.appendChild(opt);
  });
}

async function ttFetchComments() {
  const video_url = document.getElementById('tt-video-select')?.value;
  if (!video_url) { showError('Select a video first.'); return; }
  const api_key = requireKey('tiktok'); if (!api_key) return;
  const count = parseInt(document.getElementById('tt-comment-count')?.value, 10) || 50;

  setBtnLoading('tt-btn-fetch-comments', true);
  showLoading('tt-comments-tbody', 6);
  const exportRow = document.getElementById('tt-comments-export-row');
  if (exportRow) exportRow.style.display = 'none';
  document.getElementById('error-banner')?.classList.add('hidden');

  try {
    const res = await fetch('/scrape/tiktok/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_url, api_key, count }),
    });
    const data = await safeJson(res);
    if (data.error) { showError(data.error); ttRenderCommentsEmpty(); return; }

    ttCommentsData = data.comments || [];
    ttRenderCommentsTable();

    const countEl = document.getElementById('tt-comments-count');
    if (countEl) countEl.textContent = `${ttCommentsData.length} comments found`;
    if (exportRow) exportRow.style.display = ttCommentsData.length ? 'flex' : 'none';
  } catch (e) {
    showError('Connection error: ' + sanitizeErrorMessage(e?.message || String(e)));
    ttRenderCommentsEmpty();
  } finally {
    setBtnLoading('tt-btn-fetch-comments', false);
  }
}
function ttRenderCommentsEmpty() {
  const el = document.getElementById('tt-comments-tbody');
  if (el) el.innerHTML = emptyRow(6, 'No comments found.');
}
function ttRenderCommentsTable() {
  const tbody = document.getElementById('tt-comments-tbody');
  if (!tbody) return;
  if (!ttCommentsData.length) { ttRenderCommentsEmpty(); return; }
  tbody.innerHTML = '';
  ttCommentsData.forEach(c => tbody.appendChild(ttMakeCommentRow(c)));
}
function ttMakeCommentRow(c) {
  const tr = document.createElement('tr');
  tr.dataset.commentId = c.id;
  tr.className = 'comment-row';

  const tdAv = document.createElement('td');
  if (c.avatar) {
    const img = document.createElement('img');
    img.src = c.avatar;
    img.alt = c.username?.[0] || '?';
    img.className = 'avatar';
    img.onerror = () => img.replaceWith(avatarPlaceholder(c.username));
    tdAv.appendChild(img);
  } else {
    tdAv.appendChild(avatarPlaceholder(c.username));
  }
  tr.appendChild(tdAv);

  const tdUser = document.createElement('td');
  tdUser.className = 'username-cell';
  tdUser.textContent = c.username || '—';
  tr.appendChild(tdUser);

  const tdCmt = document.createElement('td');
  const d = document.createElement('div');
  d.className = 'comment-cell';
  d.textContent = truncate(c.text, 120);
  d.title = c.text || '';
  tdCmt.appendChild(d);
  tr.appendChild(tdCmt);

  tr.appendChild(numCell(c.likes));
  tr.appendChild(numCell(c.replies != null && c.replies > 0 ? c.replies : null, 'hide-mobile'));

  const tdPost = document.createElement('td');
  tdPost.className = 'date-cell hide-mobile';
  tdPost.textContent = relativeTime(c.posted);
  tdPost.title = c.posted || '';
  tr.appendChild(tdPost);

  return tr;
}

function ttExportVideosCSV() {
  if (!ttVideosData.length) return;
  downloadBlob(
    toCSV(ttVideosData.map(v => ({
      url: v.url,
      caption: v.caption,
      published: v.published,
      duration_seconds: v.duration,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      shares: v.shares
    }))),
    `tiktok_videos_${getTimestamp()}.csv`,
    'text/csv'
  );
}
function ttExportVideosXLSX() {
  if (!ttVideosData.length) return;
  exportXLSX(
    ttVideosData.map(v => ({
      url: v.url,
      caption: v.caption,
      published: v.published,
      duration_seconds: v.duration,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      shares: v.shares
    })),
    'Videos',
    `tiktok_videos_${getTimestamp()}.xlsx`
  );
}
function ttExportCommentsCSV() {
  if (!ttCommentsData.length) return;
  downloadBlob(
    toCSV(ttCommentsData.map(c => ({
      username: c.username,
      text: c.text,
      likes: c.likes,
      replies: c.replies,
      posted: c.posted
    }))),
    `tiktok_comments_${getTimestamp()}.csv`,
    'text/csv'
  );
}
function ttExportCommentsXLSX() {
  if (!ttCommentsData.length) return;
  exportXLSX(
    ttCommentsData.map(c => ({
      username: c.username,
      text: c.text,
      likes: c.likes,
      replies: c.replies,
      posted: c.posted
    })),
    'Comments',
    `tiktok_comments_${getTimestamp()}.xlsx`
  );
}


// ─────────────────────────────────────────
// WORD CLOUD
// ─────────────────────────────────────────

let _wcDebounce = null;

function ttGetWordCount() {
  const el = document.getElementById('tt-wc-words');
  const val = Number(el?.value || 120);
  document.getElementById('tt-wc-words-value').textContent = val;
  return val;
}

function ttGetFontScale() {
  const el = document.getElementById('tt-wc-font');
  const val = Number(el?.value || 100);
  document.getElementById('tt-wc-font-value').textContent = val;
  return val / 100;
}

function ttRegenerateWordCloud() {
  ttGenerateWordCloud(true);
}

// ── normalize repeated chars: enak / enakk / enakkk → enak
function normalizeWord(w) {
  // collapse 3+ consecutive identical chars to 1: "hahaha" untouched but "enakkk" → "enak"
  // more precisely: collapse runs of 3+ same char
  return w.replace(/(.)\1{2,}/g, '$1');
}

// ── build freq
function ttBuildWordFreq(limit) {
  const freq = new Map();

  const STOPWORDS = new Set([
    // english
    'the','is','are','am','was','were','be','been','being',
    'a','an','and','or','but','if','then','so','than','not','no',
    'of','to','in','on','for','with','as','by','at','from','into',
    'this','that','these','those','it','its','they','them','their',
    'you','your','we','our','i','me','my','he','she','his','her',
    'have','has','had','do','does','did','will','would','could','should',
    'can','may','might','shall','very','just','also','even','more',
    'some','any','all','each','both','too','up','out','now','here',
    'there','where','when','how','what','who','which','why','about',
    'like','get','got','let','make','made','good','really','much','many',

    // indonesian stopwords & particles
    'yang','dan','di','ke','dari','untuk','dengan','ini','itu','ada',
    'aku','kamu','dia','mereka','kita','kami','saya','lo','gue','lu',
    'ya','ga','nggak','gak','ngga','enggak','engga','nah','wah',
    'aja','kok','nih','deh','sih','lho','tuh','kan','tau','mau',
    'udah','sudah','lagi','masih','jadi','juga','pun','pun','itu',
    'banget','bgt','tp','tapi','kalo','kalau','biar','bikin','sama',
    'si','lah','dong','kayak','kaya','kayaknya','seperti','kayanya',
    'nya','loh','yah','iya','iyaa','bisa','perlu','harus','terus',
    'gitu','gini','nih','situ','sini','sana','cara','hal','banyak',
    'emang','memang','bakal','akan','belum','sudah','pernah','selalu',
    'kadang','mungkin','itu','ini','tapi','atau','karena','supaya',
    'soal','hal','pas','buat','lebih','sangat','sekali','cuma','hanya',
    'semua','setiap','beberapa','namun','jika','apakah','gimana','kenapa',
    'makanya','padahal','walaupun','meskipun','setelah','sebelum','ketika',
    'terimakasih','makasih','thanks','thank','pliss','plis','please',
    'haha','hahaha','wkwk','wkwkwk','wkwkwkwk','hehe','hihi','xixi',
    'lol','omg','btw','fyi','asw','oke','ok','okay','yep','yup',
    'hai','hei','hey','hi','hello','bye','ciao',
    'www','http','https','com','org','net',
  ]);

  ttCommentsData.forEach(c => {
    const words = (c.text || '')
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, '')      // strip URLs
      .replace(/[^\w\s]/g, ' ')            // strip punctuation
      .replace(/_/g, ' ')
      .split(/\s+/);

    words.forEach(raw => {
      const w = normalizeWord(raw);
      if (!w || w.length < 3) return;
      if (STOPWORDS.has(w)) return;
      if (/^\d+$/.test(w)) return;         // skip pure numbers

      freq.set(w, (freq.get(w) || 0) + 1);
    });
  });

  const all = [...freq.entries()].sort((a, b) => b[1] - a[1]);

  // adaptive min-freq: only filter repeats if dataset large enough
  const minFreq = all.length > 200 ? 2 : 1;
  const filtered = all.filter(([, v]) => v >= minFreq);

  return filtered
    .slice(0, limit)
    .map(([text, value]) => ({ text, value }));
}

// ── generate
function ttGenerateWordCloud(force = false) {
  if (!ttCommentsData.length) {
    showError('Fetch comments first.');
    return;
  }

  const wrap = document.getElementById('tt-wordcloud-wrap');
  const canvas = document.getElementById('tt-wordcloud-canvas');

  const wordLimit = ttGetWordCount();
  const fontScale = ttGetFontScale();

  const words = ttBuildWordFreq(wordLimit);

  wrap.classList.remove('hidden');

  // update slider fills
  _wcUpdateSliderFill(document.getElementById('tt-wc-words'));
  _wcUpdateSliderFill(document.getElementById('tt-wc-font'));

  // smooth scroll
  wrap.scrollIntoView({ behavior: 'smooth' });

  const W = 1200;
  const H = 650;
  const DPR = window.devicePixelRatio || 2;

  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = '100%';
  canvas.style.background = '#ffffff';

  const ctx = canvas.getContext('2d');

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(DPR, DPR);

  const maxF = words[0].value;
  const minF = words[words.length - 1].value;

  const sizeScale = d3.scaleSqrt()
    .domain([minF, maxF])
    .range([14 * fontScale, 72 * fontScale]);

  const colorScale = d3.scaleLinear()
    .domain([minF, maxF])
    .range([0, 1]);

  function pickColor(v, text) {
    const t = colorScale(v);

    // curated modern palette (safe on white)
    const palette = [
      '#0f172a', // near black (anchor)
      '#1e293b', // slate
      '#334155',

      '#1d4ed8', // blue
      '#2563eb',
      '#3b82f6',

      '#7c3aed', // violet
      '#8b5cf6',

      '#0f766e', // teal
      '#14b8a6',

      '#15803d', // green
      '#22c55e'
    ];

    // weight → pick range (important = darker)
    let pool;

    if (t > 0.8) {
      pool = palette.slice(0, 3); // dark
    } else if (t > 0.6) {
      pool = palette.slice(2, 6); // blue range
    } else if (t > 0.4) {
      pool = palette.slice(4, 9); // mix
    } else {
      pool = palette.slice(6); // colorful
    }

    // phrases → slightly bias to violet/teal (looks premium)
    if (text.includes(' ') && t > 0.4) {
      pool = ['#7c3aed', '#8b5cf6', '#14b8a6'];
    }

    return pool[Math.floor(Math.random() * pool.length)];
  }

  function pickWeight(v) {
    const t = colorScale(v);
    if (t > 0.8) return 800;
    if (t > 0.5) return 700;
    return 600;
  }

  const layoutWords = words.map(w => ({
    ...w,
    size: Math.round(sizeScale(w.value)),
    rotate: Math.random() < 0.1 ? (Math.random() < 0.5 ? -20 : 20) : 0
  }));

  const sprite = document.createElement('canvas');

  d3.layout.cloud()
    .size([W, H])
    .canvas(() => sprite)
    .words(layoutWords)
    .padding(2)
    .rotate(d => d.rotate)
    .font('Inter')
    .fontSize(d => d.size)
    .on('end', draw)
    .start();

  function draw(words) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    ctx.translate(W / 2, H / 2);

    words.forEach(w => {
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.rotate * Math.PI / 180);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = pickColor(w.value, w.text);
      ctx.font = `${pickWeight(w.value)} ${w.size}px Inter`;

      ctx.fillText(w.text, 0, 0);
      ctx.restore();
    });

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

// ── download
function ttDownloadWordCloud() {
  const canvas = document.getElementById('tt-wordcloud-canvas');
  const link = document.createElement('a');
  link.download = `wordcloud_${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ── copy
function ttCopyWordCloud() {
  const canvas = document.getElementById('tt-wordcloud-canvas');

  canvas.toBlob(blob => {
    const item = new ClipboardItem({ 'image/png': blob });
    navigator.clipboard.write([item]);
  });

  showError('Copied!');
}

// ── live update (debounced for smooth drag)
function _wcUpdateSliderFill(el) {
  if (!el) return;
  const min = Number(el.min || 0);
  const max = Number(el.max || 100);
  const val = Number(el.value);
  const pct = ((val - min) / (max - min) * 100).toFixed(1);
  el.style.background = 'linear-gradient(to right, rgba(16,185,129,0.85) 0%, rgba(16,185,129,0.85) ' + pct + '%, rgba(255,255,255,0.12) ' + pct + '%, rgba(255,255,255,0.12) 100%)';
}

function _wcLiveUpdate() {
  if (!ttCommentsData.length) return;
  ttGetWordCount();
  ttGetFontScale();
  _wcUpdateSliderFill(document.getElementById('tt-wc-words'));
  _wcUpdateSliderFill(document.getElementById('tt-wc-font'));
  clearTimeout(_wcDebounce);
  _wcDebounce = setTimeout(() => ttGenerateWordCloud(), 280);
}

document.addEventListener('DOMContentLoaded', () => {
  // init fill on load
  _wcUpdateSliderFill(document.getElementById('tt-wc-words'));
  _wcUpdateSliderFill(document.getElementById('tt-wc-font'));
  document.getElementById('tt-wc-words')?.addEventListener('input', _wcLiveUpdate);
  document.getElementById('tt-wc-font')?.addEventListener('input', _wcLiveUpdate);
});


// ══════════════════════════════════════════════════════════════════
//  YOUTUBE
// ══════════════════════════════════════════════════════════════════
async function ytFetchChannel() {
  const channelId = document.getElementById('yt-channel-id')?.value.trim();
  if (!channelId) { showError('Enter a Channel ID, @handle, or URL.'); return; }
  const api_key = requireKey('youtube'); if (!api_key) return;

  setBtnLoading('yt-btn-channel', true);
  document.getElementById('yt-channel-card')?.classList.add('hidden');
  document.getElementById('error-banner')?.classList.add('hidden');

  try {
    const res = await fetch('/scrape/youtube/channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId, api_key }),
    });
    const data = await safeJson(res);
    if (data.error) { showError(data.error); return; }
    ytRenderChannelCard(data);
  } catch (e) {
    showError('Connection error: ' + sanitizeErrorMessage(e?.message || String(e)));
  } finally {
    setBtnLoading('yt-btn-channel', false);
  }
}
function ytRenderChannelCard(ch) {
  const card = document.getElementById('yt-channel-card');
  const thumbWrap = document.getElementById('yt-channel-thumb');
  if (!card || !thumbWrap) return;

  const proxiedThumb = ch.thumbnailUrl
    ? `/image-proxy?url=${encodeURIComponent(ch.thumbnailUrl)}`
    : '';

  thumbWrap.innerHTML = proxiedThumb
    ? `<img src="${proxiedThumb}" alt="" class="channel-avatar" onerror="this.parentElement.innerHTML='<div class=&quot;channel-avatar-placeholder&quot;>📺</div>'" />`
    : `<div class="channel-avatar-placeholder">📺</div>`;

  document.getElementById('yt-channel-title').textContent = ch.title || '—';
  document.getElementById('yt-channel-handle').textContent = ch.customUrl || ch.id || '—';
  document.getElementById('yt-channel-subs').textContent = formatNum(ch.subscriberCount) + ' subscribers';
  document.getElementById('yt-channel-videos').textContent = formatNum(ch.videoCount) + ' videos';
  document.getElementById('yt-channel-desc').textContent = ch.description || '';

  const link = document.getElementById('yt-channel-link');
  if (link) {
    if (ch.customUrl || ch.id) {
      link.href = `https://www.youtube.com/${ch.customUrl ? ch.customUrl : 'channel/' + ch.id}`;
      link.classList.remove('hidden');
    } else {
      link.classList.add('hidden');
    }
  }

  card.classList.remove('hidden');
}

async function ytFetchVideos() {
  const channelId = document.getElementById('yt-channel-id')?.value.trim();
  if (!channelId) { showError('Enter a Channel ID, @handle, or URL.'); return; }
  const api_key = requireKey('youtube'); if (!api_key) return;
  const maxResults = parseInt(document.getElementById('yt-max-results')?.value, 10) || 25;

  setBtnLoading('yt-btn-videos', true);
  showLoading('yt-videos-tbody', 9);
  const exportRow = document.getElementById('yt-videos-export-row');
  if (exportRow) exportRow.style.display = 'none';
  document.getElementById('error-banner')?.classList.add('hidden');

  try {
    const res = await fetch('/scrape/youtube/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId, api_key, max_results: maxResults }),
    });
    const data = await safeJson(res);
    if (data.error) { showError(data.error); ytRenderVideosEmpty(); return; }

    ytVideosData = data.videos || [];
    ytRenderVideosTable();

    const countEl = document.getElementById('yt-videos-count');
    if (countEl) countEl.textContent = `${ytVideosData.length} videos fetched`;
    if (exportRow) exportRow.style.display = ytVideosData.length ? 'flex' : 'none';
  } catch (e) {
    showError('Connection error: ' + sanitizeErrorMessage(e?.message || String(e)));
    ytRenderVideosEmpty();
  } finally {
    setBtnLoading('yt-btn-videos', false);
  }
}
function ytRenderVideosEmpty() {
  const el = document.getElementById('yt-videos-tbody');
  if (el) el.innerHTML = emptyRow(9, 'No videos found.');
}
function ytRenderVideosTable() {
  const tbody = document.getElementById('yt-videos-tbody');
  if (!tbody) return;
  if (!ytVideosData.length) { ytRenderVideosEmpty(); return; }

  tbody.innerHTML = '';
  ytVideosData.forEach(v => {
    const tr = document.createElement('tr');
    tr.addEventListener('click', () => tr.classList.toggle('selected'));

    const tdThumb = document.createElement('td');
    if (v.thumbnailUrl) {
      const img = document.createElement('img');
      img.src = v.thumbnailUrl;
      img.alt = '';
      img.className = inferVideoFormat(v) === 'shorts' ? 'thumbnail thumbnail-short' : 'thumbnail';
      img.onerror = () => img.replaceWith(thumbPlaceholder('▶'));
      tdThumb.appendChild(img);
    } else {
      tdThumb.appendChild(thumbPlaceholder('▶'));
    }
    tr.appendChild(tdThumb);

    const tdTitle = document.createElement('td');
    const d = document.createElement('div');
    d.className = 'caption-cell';
    d.textContent = v.title || '—';
    d.title = v.title || '';
    tdTitle.appendChild(d);
    tr.appendChild(tdTitle);

    const tdPub = document.createElement('td');
    tdPub.className = 'date-cell hide-mobile';
    tdPub.textContent = formatDate(v.publishedAt);
    tr.appendChild(tdPub);

    const tdDur = document.createElement('td');
    tdDur.className = 'num-cell hide-mobile';
    tdDur.textContent = v.durationSeconds != null ? formatDuration(v.durationSeconds) : '—';
    tr.appendChild(tdDur);

    const tdFmt = document.createElement('td');
    if (v._formatDetected) tdFmt.innerHTML = formatBadge(v._formatDetected);
    else detectFormatAsync(v, tdFmt);
    tr.appendChild(tdFmt);

    tr.appendChild(numCell(v.viewCount != null ? v.viewCount : ''));
    tr.appendChild(numCell(v.likeCount != null ? v.likeCount : ''));
    tr.appendChild(numCell(v.commentCount != null ? v.commentCount : ''));

    const tdLink = document.createElement('td');
    tdLink.className = 'link-cell';
    if (v.url) {
      const a = document.createElement('a');
      a.href = v.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = '↗';
      tdLink.appendChild(a);
    }
    tr.appendChild(tdLink);

    tbody.appendChild(tr);
  });
}

async function ytFetchStats() {
  const videoIds = document.getElementById('yt-video-ids')?.value.trim();
  if (!videoIds) { showError('Enter at least one video ID.'); return; }
  const api_key = requireKey('youtube'); if (!api_key) return;

  setBtnLoading('yt-btn-stats', true);
  showLoading('yt-stats-tbody', 6);
  const exportRow = document.getElementById('yt-stats-export-row');
  if (exportRow) exportRow.style.display = 'none';
  document.getElementById('error-banner')?.classList.add('hidden');

  try {
    const res = await fetch('/scrape/youtube/video-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_ids: videoIds, api_key }),
    });
    const data = await safeJson(res);
    if (data.error) { showError(data.error); ytRenderStatsEmpty(); return; }

    ytStatsData = data.stats || [];
    ytRenderStatsTable();

    const countEl = document.getElementById('yt-stats-count');
    if (countEl) countEl.textContent = `${ytStatsData.length} videos`;
    if (exportRow) exportRow.style.display = ytStatsData.length ? 'flex' : 'none';
  } catch (e) {
    showError('Connection error: ' + sanitizeErrorMessage(e?.message || String(e)));
    ytRenderStatsEmpty();
  } finally {
    setBtnLoading('yt-btn-stats', false);
  }
}
function ytRenderStatsEmpty() {
  const el = document.getElementById('yt-stats-tbody');
  if (el) el.innerHTML = emptyRow(6, 'No stats found.');
}
function ytRenderStatsTable() {
  const tbody = document.getElementById('yt-stats-tbody');
  if (!tbody) return;
  if (!ytStatsData.length) { ytRenderStatsEmpty(); return; }

  tbody.innerHTML = '';
  ytStatsData.forEach(s => {
    const tr = document.createElement('tr');
    tr.addEventListener('click', () => tr.classList.toggle('selected'));

    const tdId = document.createElement('td');
    tdId.innerHTML = `<a href="https://www.youtube.com/watch?v=${escHtml(s.id)}" target="_blank" rel="noopener" style="font-family:var(--font-mono);font-size:12px;">${escHtml(s.id)}</a>`;
    tr.appendChild(tdId);

    tr.appendChild(numCell(s.viewCount));
    tr.appendChild(numCell(s.likeCount));
    tr.appendChild(numCell(s.commentCount));

    const tdDur = document.createElement('td');
    tdDur.className = 'num-cell hide-mobile';
    tdDur.textContent = s.durationSeconds != null ? formatDuration(s.durationSeconds) : '—';
    tr.appendChild(tdDur);

    const tdPub = document.createElement('td');
    tdPub.className = 'date-cell hide-mobile';
    tdPub.textContent = formatDate(s.publishedAt);
    tr.appendChild(tdPub);

    const tdTitle = document.createElement('td');
    const d = document.createElement('div');
    d.className = 'caption-cell';
    d.textContent = s.title || '—';
    d.title = s.title || '';
    tdTitle.appendChild(d);
    tr.appendChild(tdTitle);

    tbody.appendChild(tr);
  });
}

function ytExportVideosCSV() {
  if (!ytVideosData.length) return;
  downloadBlob(
    toCSV(ytVideosData.map(v => ({
      id: v.id,
      title: v.title,
      published_at: v.publishedAt,
      duration_seconds: v.durationSeconds,
      format: v._formatDetected || inferVideoFormat(v),
      view_count: v.viewCount,
      like_count: v.likeCount,
      comment_count: v.commentCount,
      url: v.url
    }))),
    `youtube_videos_${getTimestamp()}.csv`,
    'text/csv'
  );
}
function ytExportVideosXLSX() {
  if (!ytVideosData.length) return;
  exportXLSX(
    ytVideosData.map(v => ({
      id: v.id,
      title: v.title,
      published_at: v.publishedAt,
      duration_seconds: v.durationSeconds,
      format: v._formatDetected || inferVideoFormat(v),
      view_count: v.viewCount,
      like_count: v.likeCount,
      comment_count: v.commentCount,
      url: v.url
    })),
    'Videos',
    `youtube_videos_${getTimestamp()}.xlsx`
  );
}
function ytExportStatsCSV() {
  if (!ytStatsData.length) return;
  downloadBlob(
    toCSV(ytStatsData.map(s => ({
      id: s.id,
      title: s.title,
      published_at: s.publishedAt,
      duration_seconds: s.durationSeconds,
      view_count: s.viewCount,
      like_count: s.likeCount,
      comment_count: s.commentCount,
      url: s.id ? `https://www.youtube.com/watch?v=${s.id}` : ''
    }))),
    `youtube_video_stats_${getTimestamp()}.csv`,
    'text/csv'
  );
}
function ytExportStatsXLSX() {
  if (!ytStatsData.length) return;
  exportXLSX(
    ytStatsData.map(s => ({
      id: s.id,
      title: s.title,
      published_at: s.publishedAt,
      duration_seconds: s.durationSeconds,
      view_count: s.viewCount,
      like_count: s.likeCount,
      comment_count: s.commentCount,
      url: s.id ? `https://www.youtube.com/watch?v=${s.id}` : ''
    })),
    'Stats',
    `youtube_video_stats_${getTimestamp()}.xlsx`
  );
}

// ── Init / bindings ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  refreshKeyStatuses();
  switchPlatform('tiktok');
  ytSwitchTab('videos');
  ttSwitchTab('videos');

  document.getElementById('btn-theme')?.addEventListener('click', toggleTheme);
  document.getElementById('btn-keys')?.addEventListener('click', toggleKeys);
  document.getElementById('keys-overlay')?.addEventListener('click', toggleKeys);

  document.getElementById('tt-tab-videos')?.addEventListener('click', () => ttSwitchTab('videos'));
  document.getElementById('tt-tab-comments')?.addEventListener('click', () => ttSwitchTab('comments'));

  document.getElementById('yt-tab-videos')?.addEventListener('click', () => ytSwitchTab('videos'));
  document.getElementById('yt-tab-stats')?.addEventListener('click', () => ytSwitchTab('stats'));

  document.querySelectorAll('.platform-tab').forEach(btn => {
    btn.addEventListener('click', () => switchPlatform(btn.dataset.platform));
  });

  document.getElementById('tt-btn-fetch-videos')?.addEventListener('click', ttFetchVideos);
  document.getElementById('tt-btn-fetch-comments')?.addEventListener('click', ttFetchComments);
  document.getElementById('tt-btn-wordcloud')?.addEventListener('click', ttGenerateWordCloud);
  document.getElementById('tt-btn-download-wordcloud')?.addEventListener('click', ttDownloadWordCloud);

  document.getElementById('tt-export-videos-csv')?.addEventListener('click', ttExportVideosCSV);
  document.getElementById('tt-export-videos-xlsx')?.addEventListener('click', ttExportVideosXLSX);
  document.getElementById('tt-export-comments-csv')?.addEventListener('click', ttExportCommentsCSV);
  document.getElementById('tt-export-comments-xlsx')?.addEventListener('click', ttExportCommentsXLSX);

  document.getElementById('yt-btn-channel')?.addEventListener('click', ytFetchChannelAndVideos);
  document.getElementById('yt-btn-videos')?.addEventListener('click', ytFetchVideos);
  document.getElementById('yt-btn-stats')?.addEventListener('click', ytFetchStats);

  document.getElementById('yt-export-videos-csv')?.addEventListener('click', ytExportVideosCSV);
  document.getElementById('yt-export-videos-xlsx')?.addEventListener('click', ytExportVideosXLSX);
  document.getElementById('yt-export-stats-csv')?.addEventListener('click', ytExportStatsCSV);
  document.getElementById('yt-export-stats-xlsx')?.addEventListener('click', ytExportStatsXLSX);

  document.getElementById('yt-channel-id')?.addEventListener('input', e => ytSyncChannelInput(e.target.value));

  document.getElementById('save-tiktok-key')?.addEventListener('click', () => saveKey('tiktok'));
  document.getElementById('clear-tiktok-key')?.addEventListener('click', () => clearKey('tiktok'));
  document.getElementById('save-youtube-key')?.addEventListener('click', () => saveKey('youtube'));
  document.getElementById('clear-youtube-key')?.addEventListener('click', () => clearKey('youtube'));

  document.getElementById('toggle-tiktok-key-eye')?.addEventListener('click', function () {
    toggleEye('tiktok-key-input', this);
  });
  document.getElementById('toggle-youtube-key-eye')?.addEventListener('click', function () {
    toggleEye('youtube-key-input', this);
  });
});