import type { YouTubeChannel, YouTubeVideo, YouTubeVideoStat, YouTubeComment } from './types';
import { ytVideosData, ytStatsData, ytCommentsData, setYtVideosData, setYtStatsData, setYtCommentsData, setYtSharedChannelInput } from './state';
import { requireKey } from './keys';
import {
  safeJson, showError, showLoading, setBtnLoading,
  numCell, emptyRow, thumbPlaceholder, avatarPlaceholder, formatDate, formatDuration,
  relativeTime, truncate, getTimestamp, escHtml,
  showProfileCardSkeleton, hideProfileCardSkeleton,
} from './ui';
import { toCSV, downloadBlob, exportXLSX } from './export';
import { formatBadge, inferVideoFormat, detectFormatAsync } from './format';
import { ytSyncChannelInput } from './nav';

export async function ytFetchChannelAndVideos(): Promise<void> {
  const channelId = (document.getElementById('yt-channel-id') as HTMLInputElement)?.value.trim();
  if (!channelId) { showError('Enter a Channel ID, @handle, or URL.'); return; }
  if (!requireKey('youtube')) return;
  const maxResults = parseInt((document.getElementById('yt-max-results') as HTMLInputElement)?.value, 10) || 25;

  setBtnLoading('yt-btn-channel', true);
  showLoading('yt-videos-tbody', 9);
  showProfileCardSkeleton('yt-channel-card');
  const exportRow = document.getElementById('yt-videos-export-row');
  if (exportRow) exportRow.style.display = 'none';
  document.getElementById('error-banner')?.classList.add('hidden');
  setYtSharedChannelInput(channelId);

  try {
    const [chRes, vidRes] = await Promise.all([
      fetch('/scrape/youtube/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId }),
      }),
      fetch('/scrape/youtube/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId, max_results: maxResults }),
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
      setYtVideosData(vidData.videos || []);
      ytRenderVideosTable();
      const countEl = document.getElementById('yt-videos-count');
      if (countEl) countEl.textContent = `${ytVideosData.length} videos fetched`;
      if (exportRow) exportRow.style.display = ytVideosData.length ? 'flex' : 'none';
    }
  } catch (e: any) {
    showError('Connection error: ' + (e?.message || String(e)));
    ytRenderVideosEmpty();
  } finally {
    setBtnLoading('yt-btn-channel', false);
    hideProfileCardSkeleton('yt-channel-card');
  }
}

export async function ytFetchChannel(): Promise<void> {
  const channelId = (document.getElementById('yt-channel-id') as HTMLInputElement)?.value.trim();
  if (!channelId) { showError('Enter a Channel ID, @handle, or URL.'); return; }
  if (!requireKey('youtube')) return;

  setBtnLoading('yt-btn-channel', true);
  document.getElementById('yt-channel-card')?.classList.add('hidden');
  document.getElementById('error-banner')?.classList.add('hidden');

  try {
    const res = await fetch('/scrape/youtube/channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId }),
    });
    const data = await safeJson(res);
    if (data.error) { showError(data.error); return; }
    ytRenderChannelCard(data);
  } catch (e: any) {
    showError('Connection error: ' + (e?.message || String(e)));
  } finally {
    setBtnLoading('yt-btn-channel', false);
    hideProfileCardSkeleton('yt-channel-card');
  }
}

export function ytRenderChannelCard(ch: YouTubeChannel): void {
  const card = document.getElementById('yt-channel-card');
  const thumbWrap = document.getElementById('yt-channel-thumb');
  if (!card || !thumbWrap) return;

  const proxiedThumb = ch.thumbnailUrl
    ? `/image-proxy?url=${encodeURIComponent(ch.thumbnailUrl)}`
    : '';

  thumbWrap.innerHTML = proxiedThumb
    ? `<img src="${proxiedThumb}" alt="" class="channel-avatar" onerror="this.parentElement.innerHTML='<div class=&quot;channel-avatar-placeholder&quot;>📺</div>'" />`
    : `<div class="channel-avatar-placeholder">📺</div>`;

  const titleEl = document.getElementById('yt-channel-title');
  const handleEl = document.getElementById('yt-channel-handle');
  const subsEl = document.getElementById('yt-channel-subs');
  const videosEl = document.getElementById('yt-channel-videos');
  const descEl = document.getElementById('yt-channel-desc');

  if (titleEl) titleEl.textContent = ch.title || '—';
  if (handleEl) handleEl.textContent = ch.customUrl || ch.id || '—';
  if (subsEl) subsEl.textContent = formatNum(ch.subscriberCount) + ' subscribers';
  if (videosEl) videosEl.textContent = formatNum(ch.videoCount) + ' videos';
  if (descEl) descEl.textContent = ch.description || '';

  const link = document.getElementById('yt-channel-link') as HTMLAnchorElement | null;
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

function formatNum(n: any): string {
  n = Number(n);
  if (!n && n !== 0) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export async function ytFetchVideos(): Promise<void> {
  const channelId = (document.getElementById('yt-channel-id') as HTMLInputElement)?.value.trim();
  if (!channelId) { showError('Enter a Channel ID, @handle, or URL.'); return; }
  if (!requireKey('youtube')) return;
  const maxResults = parseInt((document.getElementById('yt-max-results') as HTMLInputElement)?.value, 10) || 25;

  setBtnLoading('yt-btn-videos', true);
  showLoading('yt-videos-tbody', 9);
  const exportRow = document.getElementById('yt-videos-export-row');
  if (exportRow) exportRow.style.display = 'none';
  document.getElementById('error-banner')?.classList.add('hidden');

  try {
    const res = await fetch('/scrape/youtube/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId, max_results: maxResults }),
    });
    const data = await safeJson(res);
    if (data.error) { showError(data.error); ytRenderVideosEmpty(); return; }

    setYtVideosData(data.videos || []);
    ytRenderVideosTable();

    const countEl = document.getElementById('yt-videos-count');
    if (countEl) countEl.textContent = `${ytVideosData.length} videos fetched`;
    if (exportRow) exportRow.style.display = ytVideosData.length ? 'flex' : 'none';
  } catch (e: any) {
    showError('Connection error: ' + (e?.message || String(e)));
    ytRenderVideosEmpty();
  } finally {
    setBtnLoading('yt-btn-videos', false);
  }
}

export function ytRenderVideosEmpty(): void {
  const el = document.getElementById('yt-videos-tbody');
  if (el) el.innerHTML = emptyRow(9, 'No videos found.');
}

export function ytRenderVideosTable(): void {
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
    if (v._formatDetected) tdFmt.innerHTML = formatBadge(v._formatDetected as any);
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

export async function ytFetchStats(): Promise<void> {
  const videoIds = (document.getElementById('yt-video-ids') as HTMLTextAreaElement)?.value.trim();
  if (!videoIds) { showError('Enter at least one video ID.'); return; }
  if (!requireKey('youtube')) return;

  setBtnLoading('yt-btn-stats', true);
  showLoading('yt-stats-tbody', 6);
  const exportRow = document.getElementById('yt-stats-export-row');
  if (exportRow) exportRow.style.display = 'none';
  document.getElementById('error-banner')?.classList.add('hidden');

  try {
    const res = await fetch('/scrape/youtube/video-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_ids: videoIds }),
    });
    const data = await safeJson(res);
    if (data.error) { showError(data.error); ytRenderStatsEmpty(); return; }

    setYtStatsData(data.stats || []);
    ytRenderStatsTable();

    const countEl = document.getElementById('yt-stats-count');
    if (countEl) countEl.textContent = `${ytStatsData.length} videos`;
    if (exportRow) exportRow.style.display = ytStatsData.length ? 'flex' : 'none';
  } catch (e: any) {
    showError('Connection error: ' + (e?.message || String(e)));
    ytRenderStatsEmpty();
  } finally {
    setBtnLoading('yt-btn-stats', false);
  }
}

export function ytRenderStatsEmpty(): void {
  const el = document.getElementById('yt-stats-tbody');
  if (el) el.innerHTML = emptyRow(6, 'No stats found.');
}

export function ytRenderStatsTable(): void {
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

export function ytExportVideosCSV(): void {
  if (!ytVideosData.length) return;
  downloadBlob(
    toCSV(ytVideosData.map(v => ({
      id: v.id, title: v.title, published_at: v.publishedAt,
      duration_seconds: v.durationSeconds, format: v._formatDetected || inferVideoFormat(v),
      view_count: v.viewCount, like_count: v.likeCount, comment_count: v.commentCount, url: v.url,
    }))),
    `youtube_videos_${getTimestamp()}.csv`, 'text/csv'
  );
}

export function ytExportVideosXLSX(): void {
  if (!ytVideosData.length) return;
  exportXLSX(
    ytVideosData.map(v => ({
      id: v.id, title: v.title, published_at: v.publishedAt,
      duration_seconds: v.durationSeconds, format: v._formatDetected || inferVideoFormat(v),
      view_count: v.viewCount, like_count: v.likeCount, comment_count: v.commentCount, url: v.url,
    })),
    'Videos', `youtube_videos_${getTimestamp()}.xlsx`
  );
}

export function ytExportStatsCSV(): void {
  if (!ytStatsData.length) return;
  downloadBlob(
    toCSV(ytStatsData.map(s => ({
      id: s.id, title: s.title, published_at: s.publishedAt, duration_seconds: s.durationSeconds,
      view_count: s.viewCount, like_count: s.likeCount, comment_count: s.commentCount,
      url: s.id ? `https://www.youtube.com/watch?v=${s.id}` : '',
    }))),
    `youtube_video_stats_${getTimestamp()}.csv`, 'text/csv'
  );
}

export function ytExportStatsXLSX(): void {
  if (!ytStatsData.length) return;
  exportXLSX(
    ytStatsData.map(s => ({
      id: s.id, title: s.title, published_at: s.publishedAt, duration_seconds: s.durationSeconds,
      view_count: s.viewCount, like_count: s.likeCount, comment_count: s.commentCount,
      url: s.id ? `https://www.youtube.com/watch?v=${s.id}` : '',
    })),
    'Stats', `youtube_video_stats_${getTimestamp()}.xlsx`
  );
}

// ── YouTube Comments ──────────────────────────────────────────────────────────

export async function ytFetchComments(): Promise<void> {
  const videoIdRaw = (document.getElementById('yt-comment-video-id') as HTMLInputElement)?.value.trim();
  if (!videoIdRaw) { showError('Enter a YouTube Video ID first.'); return; }
  if (!requireKey('youtube')) return;
  const count = parseInt((document.getElementById('yt-comment-count') as HTMLInputElement)?.value, 10) || 100;

  // Extract just the video ID if a full URL was pasted
  let video_id = videoIdRaw;
  const ytUrlMatch = videoIdRaw.match(/(?:v=|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  if (ytUrlMatch) video_id = ytUrlMatch[1];

  setBtnLoading('yt-btn-comments', true);
  showLoading('yt-comments-tbody', 6);
  const exportRow = document.getElementById('yt-comments-export-row');
  if (exportRow) exportRow.style.display = 'none';
  document.getElementById('error-banner')?.classList.add('hidden');

  try {
    const res = await fetch('/scrape/youtube/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id, count }),
    });
    const data = await safeJson(res);
    if (data.error) { showError(data.error); ytRenderCommentsEmpty(); return; }

    setYtCommentsData(data.comments || []);
    ytRenderCommentsTable();

    const countEl = document.getElementById('yt-comments-count');
    if (countEl) countEl.textContent = `${ytCommentsData.length} comments found`;
    if (exportRow) exportRow.style.display = ytCommentsData.length ? 'flex' : 'none';
  } catch (e: any) {
    showError('Connection error: ' + (e?.message || String(e)));
    ytRenderCommentsEmpty();
  } finally {
    setBtnLoading('yt-btn-comments', false);
  }
}

export function ytRenderCommentsEmpty(): void {
  const el = document.getElementById('yt-comments-tbody');
  if (el) el.innerHTML = emptyRow(6, 'No comments found.');
}

export function ytRenderCommentsTable(): void {
  const tbody = document.getElementById('yt-comments-tbody');
  if (!tbody) return;
  if (!ytCommentsData.length) { ytRenderCommentsEmpty(); return; }
  tbody.innerHTML = '';
  ytCommentsData.forEach(c => tbody.appendChild(ytMakeCommentRow(c)));
}

function ytMakeCommentRow(c: YouTubeComment): HTMLTableRowElement {
  const tr = document.createElement('tr');
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

export function ytExportCommentsCSV(): void {
  if (!ytCommentsData.length) return;
  downloadBlob(
    toCSV(ytCommentsData.map(c => ({
      username: c.username, text: c.text,
      likes: c.likes, replies: c.replies, posted: c.posted,
    }))),
    `youtube_comments_${getTimestamp()}.csv`, 'text/csv'
  );
}

export function ytExportCommentsXLSX(): void {
  if (!ytCommentsData.length) return;
  exportXLSX(
    ytCommentsData.map(c => ({
      username: c.username, text: c.text,
      likes: c.likes, replies: c.replies, posted: c.posted,
    })),
    'Comments', `youtube_comments_${getTimestamp()}.xlsx`
  );
}
