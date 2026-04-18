import type { TikTokVideo, TikTokComment, YouTubeVideo, YouTubeVideoStat, YouTubeComment, Platform } from './types';
import type { InstagramPost, InstagramComment } from './ig-types';

export let currentPlatform: Platform = 'tiktok';
export let ttVideosData: TikTokVideo[] = [];
export let ttCommentsData: TikTokComment[] = [];
export let ytVideosData: YouTubeVideo[] = [];
export let ytStatsData: YouTubeVideoStat[] = [];
export let ytCommentsData: YouTubeComment[] = [];
export let ytSharedChannelInput: string = '';
export let igPostsData: InstagramPost[] = [];
export let igCommentsData: InstagramComment[] = [];

export function setCurrentPlatform(p: Platform): void { currentPlatform = p; }
export function setTtVideosData(d: TikTokVideo[]): void { ttVideosData = d; }
export function setTtCommentsData(d: TikTokComment[]): void { ttCommentsData = d; }
export function setYtVideosData(d: YouTubeVideo[]): void { ytVideosData = d; }
export function setYtStatsData(d: YouTubeVideoStat[]): void { ytStatsData = d; }
export function setYtCommentsData(d: YouTubeComment[]): void { ytCommentsData = d; }
export function setYtSharedChannelInput(v: string): void { ytSharedChannelInput = v; }
export function setIgPostsData(d: InstagramPost[]): void { igPostsData = d; }
export function setIgCommentsData(d: InstagramComment[]): void { igCommentsData = d; }
