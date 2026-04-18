import type { InstagramPost, InstagramComment } from './ig-types';
import { igPostsData, igCommentsData, setIgPostsData, setIgCommentsData } from './state';
import { requireKey } from './keys';
import {
  safeJson, showError, showLoading, setBtnLoading,
  numCell, emptyRow, thumbPlaceholder, avatarPlaceholder,
  formatDate, relativeTime, truncate, getTimestamp, formatNum,
  showProfileCardSkeleton, hideProfileCardSkeleton,
} from './ui';
import { toCSV, downloadBlob, exportXLSX } from './export';

export function igRenderProfile(profile: any): void {
  const card = document.getElementById('ig-profile-card');
  if (!card) return;
  if (!profile || (!profile.username && !profile.fullName)) {
    card.classList.add('hidden');
    return;
  }

  const thumbWrap = document.getElementById('ig-profile-thumb');
  if (thumbWrap) {
    if (profile.profilePic) {
      const proxied = `/image-proxy?url=${encodeURIComponent(profile.profilePic)}`;
      thumbWrap.innerHTML = `<img src="${proxied}" alt="" class="channel-avatar" onerror="this.parentElement.innerHTML='<div class=\\"channel-avatar-placeholder\\">📷</div>'" />`;
    } else {
      thumbWrap.innerHTML = '<div class="channel-avatar-placeholder">📷</div>';
    }
  }

  const fullnameEl = document.getElementById('ig-profile-fullname');
  if (fullnameEl) fullnameEl.textContent = profile.fullName || profile.username || '—';

  const usernameEl = document.getElementById('ig-profile-username');
  if (usernameEl) usernameEl.textContent = profile.username ? `@${profile.username}` : '—';

  const followersEl = document.getElementById('ig-profile-followers');
  if (followersEl) followersEl.textContent = `${formatNum(profile.followers)} followers`;

  const postsEl = document.getElementById('ig-profile-posts');
  if (postsEl) postsEl.textContent = `${formatNum(profile.postsCount)} posts`;

  const bioEl = document.getElementById('ig-profile-bio');
  if (bioEl) bioEl.textContent = profile.biography || '';

  const linkEl = document.getElementById('ig-profile-link') as HTMLAnchorElement | null;
  if (linkEl && profile.username) {
    linkEl.href = `https://www.instagram.com/${profile.username}`;
    linkEl.classList.remove('hidden');
  }

  card.classList.remove('hidden');
}

export async function igFetchPosts(): Promise<void> {
  const username = (document.getElementById('ig-username') as HTMLInputElement)?.value.trim();
  if (!username) { showError('Enter an Instagram username first.'); return; }
  if (!requireKey('instagram')) return;
  const limit = parseInt((document.getElementById('ig-limit') as HTMLInputElement)?.value, 10) || 20;

  setBtnLoading('ig-btn-fetch-posts', true);
  showLoading('ig-posts-tbody', 8);
  showProfileCardSkeleton('ig-profile-card');
  const exportRow = document.getElementById('ig-posts-export-row');
  if (exportRow) exportRow.style.display = 'none';
  document.getElementById('error-banner')?.classList.add('hidden');

  try {
    const res = await fetch('/scrape/instagram/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, limit }),
    });
    const data = await safeJson(res);
    if (data.error) { showError(data.error); igRenderPostsEmpty(); return; }

    setIgPostsData(data.posts || []);
    igRenderProfile(data.profile || null);
    igRenderPostsTable();
    igPopulateDropdown();

    const countEl = document.getElementById('ig-posts-count');
    if (countEl) countEl.textContent = `${igPostsData.length} posts found`;
    if (exportRow) exportRow.style.display = igPostsData.length ? 'flex' : 'none';
  } catch (e: any) {
    showError('Connection error: ' + (e?.message || String(e)));
    igRenderPostsEmpty();
  } finally {
    setBtnLoading('ig-btn-fetch-posts', false);
    hideProfileCardSkeleton('ig-profile-card');
  }
}

export function igRenderPostsEmpty(): void {
  const el = document.getElementById('ig-posts-tbody');
  if (el) el.innerHTML = emptyRow(8, 'No posts found.');
}

export function igRenderPostsTable(): void {
  const tbody = document.getElementById('ig-posts-tbody');
  if (!tbody) return;
  if (!igPostsData.length) { igRenderPostsEmpty(); return; }

  tbody.innerHTML = '';
  igPostsData.forEach(p => {
    const tr = document.createElement('tr');
    tr.addEventListener('click', () => tr.classList.toggle('selected'));

    // Thumbnail
    const tdThumb = document.createElement('td');
    if (p.thumbnail) {
      const img = document.createElement('img');
      img.src = `/image-proxy?url=${encodeURIComponent(p.thumbnail)}`;
      img.alt = '';
      img.className = 'thumbnail';
      img.onerror = () => img.replaceWith(thumbPlaceholder('📷'));
      tdThumb.appendChild(img);
    } else {
      tdThumb.appendChild(thumbPlaceholder('📷'));
    }
    tr.appendChild(tdThumb);

    // Caption
    const tdCap = document.createElement('td');
    const div = document.createElement('div');
    div.className = 'caption-cell';
    div.textContent = p.caption || '—';
    div.title = p.caption || '';
    tdCap.appendChild(div);
    tr.appendChild(tdCap);

    // Type badge
    const tdType = document.createElement('td');
    tdType.className = 'hide-mobile';
    tdType.innerHTML = igTypeBadge(p.type);
    tr.appendChild(tdType);

    // Date
    const tdDate = document.createElement('td');
    tdDate.className = 'date-cell hide-mobile';
    tdDate.textContent = formatDate(p.timestamp);
    tr.appendChild(tdDate);

    tr.appendChild(numCell(p.likes));
    tr.appendChild(numCell(p.comments));

    const tdViews = numCell(p.videoViews, 'hide-mobile');
    tr.appendChild(tdViews);

    // Link
    const tdLink = document.createElement('td');
    tdLink.className = 'link-cell';
    if (p.url) {
      const a = document.createElement('a');
      a.href = p.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = '↗';
      tdLink.appendChild(a);
    }
    tr.appendChild(tdLink);

    tbody.appendChild(tr);
  });
}

function igTypeBadge(type: string): string {
  const t = (type || '').toLowerCase();
  if (t === 'video') return '<span class="badge badge-vertical">🎬 Video</span>';
  if (t === 'sidecar' || t === 'album') return '<span class="badge badge-horizontal">🖼 Album</span>';
  return '<span class="badge badge-unknown">📷 Image</span>';
}

export function igPopulateDropdown(): void {
  const sel = document.getElementById('ig-post-select') as HTMLSelectElement | null;
  if (!sel) return;
  sel.innerHTML = '';
  if (!igPostsData.length) {
    sel.innerHTML = '<option value="">— no posts —</option>';
    return;
  }
  igPostsData.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = p.url || '';
    opt.textContent = truncate(p.caption || p.url || `Post ${i + 1}`, 60);
    sel.appendChild(opt);
  });
}

export async function igFetchComments(): Promise<void> {
  const post_url = (document.getElementById('ig-post-select') as HTMLSelectElement)?.value;
  if (!post_url) { showError('Select a post first.'); return; }
  if (!requireKey('instagram')) return;
  const count = parseInt((document.getElementById('ig-comment-count') as HTMLInputElement)?.value, 10) || 50;

  setBtnLoading('ig-btn-fetch-comments', true);
  showLoading('ig-comments-tbody', 6);
  const exportRow = document.getElementById('ig-comments-export-row');
  if (exportRow) exportRow.style.display = 'none';
  document.getElementById('error-banner')?.classList.add('hidden');

  try {
    const res = await fetch('/scrape/instagram/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_url, count }),
    });
    const data = await safeJson(res);
    if (data.error) { showError(data.error); igRenderCommentsEmpty(); return; }
    if (data.warning) showError(data.warning);

    setIgCommentsData(data.comments || []);
    igRenderCommentsTable();

    const countEl = document.getElementById('ig-comments-count');
    if (countEl) countEl.textContent = `${igCommentsData.length} comments found`;
    if (exportRow) exportRow.style.display = igCommentsData.length ? 'flex' : 'none';
  } catch (e: any) {
    showError('Connection error: ' + (e?.message || String(e)));
    igRenderCommentsEmpty();
  } finally {
    setBtnLoading('ig-btn-fetch-comments', false);
  }
}

export function igRenderCommentsEmpty(): void {
  const el = document.getElementById('ig-comments-tbody');
  if (el) el.innerHTML = emptyRow(6, 'No comments found.');
}

export function igRenderCommentsTable(): void {
  const tbody = document.getElementById('ig-comments-tbody');
  if (!tbody) return;
  if (!igCommentsData.length) { igRenderCommentsEmpty(); return; }
  tbody.innerHTML = '';
  igCommentsData.forEach(c => tbody.appendChild(igMakeCommentRow(c)));
}

function igMakeCommentRow(c: InstagramComment): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'comment-row';

  const tdAv = document.createElement('td');
  if (c.avatar) {
    const img = document.createElement('img');
    img.src = `/image-proxy?url=${encodeURIComponent(c.avatar)}`;
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

// ── Exports ───────────────────────────────────────────────────────────────────

export function igExportPostsCSV(): void {
  if (!igPostsData.length) return;
  downloadBlob(
    toCSV(igPostsData.map(p => ({
      url: p.url, caption: p.caption, type: p.type,
      timestamp: p.timestamp, likes: p.likes,
      comments: p.comments, video_views: p.videoViews,
    }))),
    `instagram_posts_${getTimestamp()}.csv`, 'text/csv'
  );
}

export function igExportPostsXLSX(): void {
  if (!igPostsData.length) return;
  exportXLSX(
    igPostsData.map(p => ({
      url: p.url, caption: p.caption, type: p.type,
      timestamp: p.timestamp, likes: p.likes,
      comments: p.comments, video_views: p.videoViews,
    })),
    'Posts', `instagram_posts_${getTimestamp()}.xlsx`
  );
}

export function igExportCommentsCSV(): void {
  if (!igCommentsData.length) return;
  downloadBlob(
    toCSV(igCommentsData.map(c => ({
      username: c.username, text: c.text,
      likes: c.likes, replies: c.replies, posted: c.posted,
    }))),
    `instagram_comments_${getTimestamp()}.csv`, 'text/csv'
  );
}

export function igExportCommentsXLSX(): void {
  if (!igCommentsData.length) return;
  exportXLSX(
    igCommentsData.map(c => ({
      username: c.username, text: c.text,
      likes: c.likes, replies: c.replies, posted: c.posted,
    })),
    'Comments', `instagram_comments_${getTimestamp()}.xlsx`
  );
}
