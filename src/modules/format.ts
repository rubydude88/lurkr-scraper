import type { YouTubeVideo, VideoFormat } from './types';

export function formatBadge(fmt: VideoFormat): string {
  if (fmt === 'shorts') return `<span class="badge badge-vertical">📱 Shorts</span>`;
  if (fmt === 'horizontal') return `<span class="badge badge-horizontal">⬜ Horizontal</span>`;
  return `<span class="badge badge-unknown">—</span>`;
}

export function inferVideoFormat(video: YouTubeVideo): VideoFormat {
  const url = (video.url || '').toLowerCase();
  const secs = video.durationSeconds ?? video.durationSecs ?? null;
  if (url.includes('/shorts/')) return 'shorts';
  if (secs != null) return Number(secs) <= 60 ? 'shorts' : 'horizontal';
  if (video.isShort === true) return 'shorts';
  return 'unknown';
}

export function detectFormatAsync(video: YouTubeVideo, tdEl: HTMLElement): void {
  const fmt = inferVideoFormat(video);
  video._formatDetected = fmt;
  if (tdEl) tdEl.innerHTML = formatBadge(fmt);
}
