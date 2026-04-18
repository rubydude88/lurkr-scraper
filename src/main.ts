import { initTheme, toggleTheme } from './modules/theme';
import { toggleKeys, refreshKeyStatuses, saveKey, clearKey, toggleEye } from './modules/keys';
import { switchPlatform, ytSwitchTab, ytSyncChannelInput, ttSwitchTab, igSwitchTab } from './modules/nav';
import { ttFetchVideos, ttFetchComments, ttExportVideosCSV, ttExportVideosXLSX, ttExportCommentsCSV, ttExportCommentsXLSX } from './modules/tiktok';
import { ttGenerateWordCloud, ttDownloadWordCloud, ttRegenerateWordCloud, _wcUpdateSliderFill, _wcLiveUpdate } from './modules/wordcloud';
import { ytFetchChannelAndVideos, ytFetchVideos, ytFetchStats, ytExportVideosCSV, ytExportVideosXLSX, ytExportStatsCSV, ytExportStatsXLSX, ytFetchComments, ytExportCommentsCSV, ytExportCommentsXLSX } from './modules/youtube';
import { ytGenerateWordCloud, ytRegenerateWordCloud, ytDownloadWordCloud, _ytWcLiveUpdate } from './modules/yt-wordcloud';
import { igFetchPosts, igFetchComments, igExportPostsCSV, igExportPostsXLSX, igExportCommentsCSV, igExportCommentsXLSX } from './modules/instagram';
import { igGenerateWordCloud, igRegenerateWordCloud, igDownloadWordCloud, _igWcLiveUpdate } from './modules/ig-wordcloud';

const w = window as any;
w.switchPlatform        = switchPlatform;
w.toggleKeys            = toggleKeys;
w.toggleTheme           = toggleTheme;
w.toggleEye             = toggleEye;
w.saveKey               = saveKey;
w.clearKey              = clearKey;

w.ttSwitchTab           = ttSwitchTab;
w.ttFetchVideos         = ttFetchVideos;
w.ttFetchComments       = ttFetchComments;
w.ttExportVideosCSV     = ttExportVideosCSV;
w.ttExportVideosXLSX    = ttExportVideosXLSX;
w.ttExportCommentsCSV   = ttExportCommentsCSV;
w.ttExportCommentsXLSX  = ttExportCommentsXLSX;
w.ttGenerateWordCloud   = ttGenerateWordCloud;
w.ttRegenerateWordCloud = ttRegenerateWordCloud;
w.ttDownloadWordCloud   = ttDownloadWordCloud;

w.ytSwitchTab              = ytSwitchTab;
w.ytSyncChannelInput       = ytSyncChannelInput;
w.ytFetchChannelAndVideos  = ytFetchChannelAndVideos;
w.ytFetchVideos            = ytFetchVideos;
w.ytFetchStats             = ytFetchStats;
w.ytExportVideosCSV        = ytExportVideosCSV;
w.ytExportVideosXLSX       = ytExportVideosXLSX;
w.ytExportStatsCSV         = ytExportStatsCSV;
w.ytExportStatsXLSX        = ytExportStatsXLSX;
w.ytFetchComments          = ytFetchComments;
w.ytExportCommentsCSV      = ytExportCommentsCSV;
w.ytExportCommentsXLSX     = ytExportCommentsXLSX;
w.ytGenerateWordCloud      = ytGenerateWordCloud;
w.ytRegenerateWordCloud    = ytRegenerateWordCloud;
w.ytDownloadWordCloud      = ytDownloadWordCloud;

w.igSwitchTab           = igSwitchTab;
w.igFetchPosts          = igFetchPosts;
w.igFetchComments       = igFetchComments;
w.igExportPostsCSV      = igExportPostsCSV;
w.igExportPostsXLSX     = igExportPostsXLSX;
w.igExportCommentsCSV   = igExportCommentsCSV;
w.igExportCommentsXLSX  = igExportCommentsXLSX;
w.igGenerateWordCloud   = igGenerateWordCloud;
w.igRegenerateWordCloud = igRegenerateWordCloud;
w.igDownloadWordCloud   = igDownloadWordCloud;

function syncTopbarPadding(): void {
  const topbar = document.querySelector('.topbar') as HTMLElement | null;
  const appShell = document.querySelector('.app-shell') as HTMLElement | null;
  if (!topbar || !appShell) return;
  appShell.style.paddingTop = topbar.getBoundingClientRect().height + 'px';
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  refreshKeyStatuses();
  switchPlatform('tiktok');
  ytSwitchTab('videos');
  ttSwitchTab('videos');
  igSwitchTab('posts');

  _wcUpdateSliderFill(document.getElementById('tt-wc-words') as HTMLInputElement);
  _wcUpdateSliderFill(document.getElementById('tt-wc-font') as HTMLInputElement);
  document.getElementById('tt-wc-words')?.addEventListener('input', _wcLiveUpdate);
  document.getElementById('tt-wc-font')?.addEventListener('input', _wcLiveUpdate);
  document.getElementById('tt-wc-bigram')?.addEventListener('change', _wcLiveUpdate);
  document.getElementById('tt-wc-trigram')?.addEventListener('change', _wcLiveUpdate);

  _wcUpdateSliderFill(document.getElementById('yt-wc-words') as HTMLInputElement);
  _wcUpdateSliderFill(document.getElementById('yt-wc-font') as HTMLInputElement);
  document.getElementById('yt-wc-words')?.addEventListener('input', _ytWcLiveUpdate);
  document.getElementById('yt-wc-font')?.addEventListener('input', _ytWcLiveUpdate);
  document.getElementById('yt-wc-bigram')?.addEventListener('change', _ytWcLiveUpdate);
  document.getElementById('yt-wc-trigram')?.addEventListener('change', _ytWcLiveUpdate);

  _wcUpdateSliderFill(document.getElementById('ig-wc-words') as HTMLInputElement);
  _wcUpdateSliderFill(document.getElementById('ig-wc-font') as HTMLInputElement);
  document.getElementById('ig-wc-words')?.addEventListener('input', _igWcLiveUpdate);
  document.getElementById('ig-wc-font')?.addEventListener('input', _igWcLiveUpdate);
  document.getElementById('ig-wc-bigram')?.addEventListener('change', _igWcLiveUpdate);
  document.getElementById('ig-wc-trigram')?.addEventListener('change', _igWcLiveUpdate);

  document.getElementById('btn-theme')?.addEventListener('click', toggleTheme);
  document.getElementById('btn-keys')?.addEventListener('click', toggleKeys);
  document.getElementById('keys-overlay')?.addEventListener('click', toggleKeys);

  document.querySelectorAll('.platform-tab').forEach(btn => {
    btn.addEventListener('click', () => switchPlatform((btn as HTMLElement).dataset['platform'] as any));
  });

  // TikTok
  document.getElementById('tt-tab-videos')?.addEventListener('click', () => ttSwitchTab('videos'));
  document.getElementById('tt-tab-comments')?.addEventListener('click', () => ttSwitchTab('comments'));
  document.getElementById('tt-btn-fetch-videos')?.addEventListener('click', ttFetchVideos);
  document.getElementById('tt-btn-fetch-comments')?.addEventListener('click', ttFetchComments);
  document.getElementById('tt-btn-wordcloud')?.addEventListener('click', () => ttGenerateWordCloud());
  document.getElementById('tt-btn-download-wordcloud')?.addEventListener('click', ttDownloadWordCloud);
  document.getElementById('tt-export-videos-csv')?.addEventListener('click', ttExportVideosCSV);
  document.getElementById('tt-export-videos-xlsx')?.addEventListener('click', ttExportVideosXLSX);
  document.getElementById('tt-export-comments-csv')?.addEventListener('click', ttExportCommentsCSV);
  document.getElementById('tt-export-comments-xlsx')?.addEventListener('click', ttExportCommentsXLSX);

  // YouTube
  document.getElementById('yt-tab-videos')?.addEventListener('click', () => ytSwitchTab('videos'));
  document.getElementById('yt-tab-stats')?.addEventListener('click', () => ytSwitchTab('stats'));
  document.getElementById('yt-tab-comments')?.addEventListener('click', () => ytSwitchTab('comments'));
  document.getElementById('yt-btn-channel')?.addEventListener('click', ytFetchChannelAndVideos);
  document.getElementById('yt-btn-videos')?.addEventListener('click', ytFetchVideos);
  document.getElementById('yt-btn-stats')?.addEventListener('click', ytFetchStats);
  document.getElementById('yt-btn-comments')?.addEventListener('click', ytFetchComments);
  document.getElementById('yt-btn-wordcloud')?.addEventListener('click', () => ytGenerateWordCloud());
  document.getElementById('yt-btn-download-wordcloud')?.addEventListener('click', ytDownloadWordCloud);
  document.getElementById('yt-export-videos-csv')?.addEventListener('click', ytExportVideosCSV);
  document.getElementById('yt-export-videos-xlsx')?.addEventListener('click', ytExportVideosXLSX);
  document.getElementById('yt-export-stats-csv')?.addEventListener('click', ytExportStatsCSV);
  document.getElementById('yt-export-stats-xlsx')?.addEventListener('click', ytExportStatsXLSX);
  document.getElementById('yt-export-comments-csv')?.addEventListener('click', ytExportCommentsCSV);
  document.getElementById('yt-export-comments-xlsx')?.addEventListener('click', ytExportCommentsXLSX);
  document.getElementById('yt-channel-id')?.addEventListener('input', e => ytSyncChannelInput((e.target as HTMLInputElement).value));

  // Instagram
  document.getElementById('ig-tab-posts')?.addEventListener('click', () => igSwitchTab('posts'));
  document.getElementById('ig-tab-comments')?.addEventListener('click', () => igSwitchTab('comments'));
  document.getElementById('ig-btn-fetch-posts')?.addEventListener('click', igFetchPosts);
  document.getElementById('ig-btn-fetch-comments')?.addEventListener('click', igFetchComments);
  document.getElementById('ig-btn-wordcloud')?.addEventListener('click', () => igGenerateWordCloud());
  document.getElementById('ig-btn-download-wordcloud')?.addEventListener('click', igDownloadWordCloud);
  document.getElementById('ig-export-posts-csv')?.addEventListener('click', igExportPostsCSV);
  document.getElementById('ig-export-posts-xlsx')?.addEventListener('click', igExportPostsXLSX);
  document.getElementById('ig-export-comments-csv')?.addEventListener('click', igExportCommentsCSV);
  document.getElementById('ig-export-comments-xlsx')?.addEventListener('click', igExportCommentsXLSX);

  // API Keys
  document.getElementById('save-tiktok-key')?.addEventListener('click', () => saveKey('tiktok'));
  document.getElementById('clear-tiktok-key')?.addEventListener('click', () => clearKey('tiktok'));
  document.getElementById('save-youtube-key')?.addEventListener('click', () => saveKey('youtube'));
  document.getElementById('clear-youtube-key')?.addEventListener('click', () => clearKey('youtube'));
  document.getElementById('save-ig-session-key')?.addEventListener('click', () => saveKey('ig-session'));
  document.getElementById('clear-ig-session-key')?.addEventListener('click', () => clearKey('ig-session'));
  document.getElementById('toggle-tiktok-key-eye')?.addEventListener('click', function (this: HTMLElement) {
    toggleEye('tiktok-key-input', this);
  });
  document.getElementById('toggle-youtube-key-eye')?.addEventListener('click', function (this: HTMLElement) {
    toggleEye('youtube-key-input', this);
  });
  document.getElementById('toggle-ig-session-key-eye')?.addEventListener('click', function (this: HTMLElement) {
    toggleEye('ig-session-key-input', this);
  });

  syncTopbarPadding();
  window.addEventListener('resize', syncTopbarPadding);
  document.fonts?.ready.then(syncTopbarPadding);
});
