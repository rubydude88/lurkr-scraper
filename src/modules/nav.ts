import type { Platform } from './types';
import { setCurrentPlatform, setYtSharedChannelInput, ytSharedChannelInput } from './state';

export function switchPlatform(p: Platform): void {
  setCurrentPlatform(p);
  document.querySelectorAll('.platform-tab').forEach(b => {
    (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset['platform'] === p);
  });
  document.querySelectorAll('.platform-panel').forEach(s => {
    (s as HTMLElement).classList.toggle('hidden', s.id !== `platform-${p}`);
  });
}

export function ytSyncChannelInput(val: string): void {
  setYtSharedChannelInput(val);
  const ch = document.getElementById('yt-channel-id') as HTMLInputElement | null;
  if (ch && ch.value !== val) ch.value = val;
}

export function ytSwitchTab(tab: string): void {
  ['videos', 'stats', 'comments'].forEach(t => {
    document.getElementById(`yt-panel-${t}`)?.classList.toggle('hidden', t !== tab);
    document.getElementById(`yt-tab-${t}`)?.classList.toggle('active', t === tab);
  });
  if (ytSharedChannelInput) {
    const ch = document.getElementById('yt-channel-id') as HTMLInputElement | null;
    if (ch) ch.value = ytSharedChannelInput;
  }
}

export function igSwitchTab(tab: string): void {
  ['posts', 'comments'].forEach(t => {
    document.getElementById(`ig-panel-${t}`)?.classList.toggle('hidden', t !== tab);
    document.getElementById(`ig-tab-${t}`)?.classList.toggle('active', t === tab);
  });
}

export function ttSwitchTab(tab: string): void {
  ['videos', 'comments'].forEach(t => {
    document.getElementById(`tt-panel-${t}`)?.classList.toggle('hidden', t !== tab);
    document.getElementById(`tt-tab-${t}`)?.classList.toggle('active', t === tab);
  });
}
