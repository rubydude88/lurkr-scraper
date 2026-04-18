export interface TikTokVideo {
  id: string;
  url: string;
  thumbnail: string;
  published: string;
  duration: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  caption: string;
}

export interface TikTokComment {
  id: string;
  username: string;
  avatar: string;
  text: string;
  likes: number;
  replies: number;
  posted: string;
}

export interface YouTubeVideo {
  id: string;
  channelId: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  url: string;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  duration: string;
  durationSecs: number | null;
  durationSeconds: number | null;
  isShort: boolean;
  tags: string[];
  categoryId: string;
  liveStatus: string;
  _formatDetected?: string;
}

export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  customUrl: string;
  thumbnailUrl: string;
  subscriberCount: number | null;
  videoCount: number | null;
  viewCount: number | null;
  publishedAt: string;
  country: string;
}

export interface YouTubeVideoStat {
  id: string;
  title: string;
  publishedAt: string;
  durationSeconds: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
}

export interface YouTubeComment {
  id: string;
  username: string;
  avatar: string;
  text: string;
  likes: number;
  replies: number;
  posted: string;
}

export type Platform = 'tiktok' | 'youtube' | 'instagram';
export type VideoFormat = 'shorts' | 'horizontal' | 'unknown';
