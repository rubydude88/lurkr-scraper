import type { TikTokVideo, TikTokComment } from './types';
import { ttVideosData, ttCommentsData, setTtVideosData, setTtCommentsData } from './state';
import { requireKey } from './keys';
import {
  safeJson, showError, showLoading, setBtnLoading,
  numCell, emptyRow, thumbPlaceholder, avatarPlaceholder,
  formatDate, formatDuration, relativeTime, truncate, getTimestamp, formatNum,
  showProfileCardSkeleton, hideProfileCardSkeleton,
} from './ui';
import { toCSV, downloadBlob, exportXLSX } from './export';

export function ttRenderProfile(profile: any): void {
  const card = document.getElementById('tt-profile-card');
  if (!card) return;
  if (!profile || (!profile.username && !profile.nickname)) {
    card.classList.add('hidden');
    return;
  }

  const thumbWrap = document.getElementById('tt-profile-thumb');
  if (thumbWrap) {
    if (profile.avatar) {
      thumbWrap.innerHTML = `<img src="${profile.avatar}" alt="" class="channel-avatar" onerror="this.parentElement.innerHTML='<div class=\\"channel-avatar-placeholder\\">🎵</div>'" />`;
    } else {
      thumbWrap.innerHTML = '<div class="channel-avatar-placeholder">🎵</div>';
    }
  }

  const nickname = document.getElementById('tt-profile-nickname');
  if (nickname) nickname.textContent = profile.nickname || profile.username || '—';

  const usernameEl = document.getElementById('tt-profile-username');
  if (usernameEl) usernameEl.textContent = profile.username ? `@${profile.username}` : '—';

  const followersEl = document.getElementById('tt-profile-followers');
  if (followersEl) followersEl.textContent = `${formatNum(profile.followers)} followers`;

  const likesEl = document.getElementById('tt-profile-likes');
  if (likesEl) likesEl.textContent = `${formatNum(profile.likes)} likes`;

  const bioEl = document.getElementById('tt-profile-bio');
  if (bioEl) bioEl.textContent = profile.bio || '';

  const linkEl = document.getElementById('tt-profile-link') as HTMLAnchorElement | null;
  if (linkEl && profile.username) {
    linkEl.href = `https://www.tiktok.com/@${profile.username}`;
    linkEl.classList.remove('hidden');
  }

  card.classList.remove('hidden');
}

export async function ttFetchVideos(): Promise<void> {
  const username = (document.getElementById('tt-username') as HTMLInputElement)?.value.trim();
  if (!username) { showError('Enter a TikTok username first.'); return; }
  if (!requireKey('tiktok')) return;
  const limit = parseInt((document.getElementById('tt-limit') as HTMLInputElement)?.value, 10) || 30;
  const date_from = (document.getElementById('tt-date-from') as HTMLInputElement)?.value || null;
  const date_to = (document.getElementById('tt-date-to') as HTMLInputElement)?.value || null;

  setBtnLoading('tt-btn-fetch-videos', true);
  showLoading('tt-videos-tbody', 9);
  showProfileCardSkeleton('tt-profile-card');
  const exportRow = document.getElementById('tt-videos-export-row');
  if (exportRow) exportRow.style.display = 'none';
  document.getElementById('error-banner')?.classList.add('hidden');

  try {
    const res = await fetch('/scrape/tiktok/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, limit, date_from, date_to }),
    });
    const data = await safeJson(res);
    if (data.error) { showError(data.error); ttRenderVideosEmpty(); return; }

    setTtVideosData(data.videos || []);
    ttRenderProfile(data.profile || null);
    ttRenderVideosTable();
    ttPopulateDropdown();

    const countEl = document.getElementById('tt-videos-count');
    if (countEl) countEl.textContent = `${ttVideosData.length} videos found`;
    if (exportRow) exportRow.style.display = ttVideosData.length ? 'flex' : 'none';
  } catch (e: any) {
    showError('Connection error: ' + (e?.message || String(e)));
    ttRenderVideosEmpty();
  } finally {
    setBtnLoading('tt-btn-fetch-videos', false);
    hideProfileCardSkeleton('tt-profile-card');
  }
}

export function ttRenderVideosEmpty(): void {
  const el = document.getElementById('tt-videos-tbody');
  if (el) el.innerHTML = emptyRow(9, 'No videos found.');
}

export function ttRenderVideosTable(): void {
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

export function ttPopulateDropdown(): void {
  const sel = document.getElementById('tt-video-select') as HTMLSelectElement | null;
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

export async function ttFetchComments(): Promise<void> {
  const video_url = (document.getElementById('tt-video-select') as HTMLSelectElement)?.value;
  if (!video_url) { showError('Select a video first.'); return; }
  if (!requireKey('tiktok')) return;
  const count = parseInt((document.getElementById('tt-comment-count') as HTMLInputElement)?.value, 10) || 50;

  setBtnLoading('tt-btn-fetch-comments', true);
  showLoading('tt-comments-tbody', 6);
  const exportRow = document.getElementById('tt-comments-export-row');
  if (exportRow) exportRow.style.display = 'none';
  document.getElementById('error-banner')?.classList.add('hidden');

  try {
    const res = await fetch('/scrape/tiktok/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_url, count }),
    });
    const data = await safeJson(res);
    if (data.error) { showError(data.error); ttRenderCommentsEmpty(); return; }

    setTtCommentsData(data.comments || []);
    ttRenderCommentsTable();

    const countEl = document.getElementById('tt-comments-count');
    if (countEl) countEl.textContent = `${ttCommentsData.length} comments found`;
    if (exportRow) exportRow.style.display = ttCommentsData.length ? 'flex' : 'none';
  } catch (e: any) {
    showError('Connection error: ' + (e?.message || String(e)));
    ttRenderCommentsEmpty();
  } finally {
    setBtnLoading('tt-btn-fetch-comments', false);
  }
}

export function ttRenderCommentsEmpty(): void {
  const el = document.getElementById('tt-comments-tbody');
  if (el) el.innerHTML = emptyRow(6, 'No comments found.');
}

export function ttRenderCommentsTable(): void {
  const tbody = document.getElementById('tt-comments-tbody');
  if (!tbody) return;
  if (!ttCommentsData.length) { ttRenderCommentsEmpty(); return; }
  tbody.innerHTML = '';
  ttCommentsData.forEach(c => tbody.appendChild(ttMakeCommentRow(c)));
}

function ttMakeCommentRow(c: TikTokComment): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.dataset['commentId'] = c.id;
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

export function ttExportVideosCSV(): void {
  if (!ttVideosData.length) return;
  downloadBlob(
    toCSV(ttVideosData.map(v => ({
      url: v.url, caption: v.caption, published: v.published,
      duration_seconds: v.duration, views: v.views, likes: v.likes,
      comments: v.comments, shares: v.shares,
    }))),
    `tiktok_videos_${getTimestamp()}.csv`, 'text/csv'
  );
}

export function ttExportVideosXLSX(): void {
  if (!ttVideosData.length) return;
  exportXLSX(
    ttVideosData.map(v => ({
      url: v.url, caption: v.caption, published: v.published,
      duration_seconds: v.duration, views: v.views, likes: v.likes,
      comments: v.comments, shares: v.shares,
    })),
    'Videos', `tiktok_videos_${getTimestamp()}.xlsx`
  );
}

export function ttExportCommentsCSV(): void {
  if (!ttCommentsData.length) return;
  downloadBlob(
    toCSV(ttCommentsData.map(c => ({
      username: c.username, text: c.text, likes: c.likes,
      replies: c.replies, posted: c.posted,
    }))),
    `tiktok_comments_${getTimestamp()}.csv`, 'text/csv'
  );
}

export function ttExportCommentsXLSX(): void {
  if (!ttCommentsData.length) return;
  exportXLSX(
    ttCommentsData.map(c => ({
      username: c.username, text: c.text, likes: c.likes,
      replies: c.replies, posted: c.posted,
    })),
    'Comments', `tiktok_comments_${getTimestamp()}.xlsx`
  );
}
