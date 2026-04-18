export interface InstagramPost {
  id: string;
  shortCode: string;
  url: string;
  thumbnail: string;
  caption: string;
  type: string;
  timestamp: string;
  likes: number | null;
  comments: number | null;
  videoViews: number | null;
  shares: number | null;
}

export interface InstagramComment {
  id: string;
  username: string;
  avatar: string;
  text: string;
  likes: number;
  replies: number;
  posted: string;
}
