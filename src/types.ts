export interface User {
  uid: string;
  username?: string;
  displayName: string;
  photoURL: string;
  bio?: string;
  followersCount: number;
  followingCount: number;
  createdAt: any; // Firestore Timestamp
  closeFriends?: string[];
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  imageUrl: string;
  videoUrl?: string;
  mediaType?: 'image' | 'video';
  mediaUrls?: { url: string; type: 'image' | 'video' }[];
  caption: string;
  tags?: string[];
  mentions?: string[];
  likesCount: number;
  commentsCount?: number;
  createdAt: any; // Firestore Timestamp
  isReel?: boolean;
  audience?: 'all' | 'close_friends';
}

export interface Like {
  id: string;
  postId: string;
  userId: string;
  createdAt: any; // Firestore Timestamp
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  text: string;
  likesCount?: number;
  createdAt: any; // Firestore Timestamp
  replyToId?: string;
}

export interface CommentLike {
  id: string;
  commentId: string;
  postId: string;
  userId: string;
  createdAt: any; // Firestore Timestamp
}

export interface Notification {
  id: string;
  userId: string;
  type: 'like' | 'comment' | 'follow' | 'message' | 'admin_delete' | 'reel_like' | 'reel_comment';
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  postId?: string;
  reelId?: string;
  commentId?: string;
  storyId?: string;
  contentPreview?: string;
  read: boolean;
  createdAt: any; // Firestore Timestamp
}

export interface SavedPost {
  id: string;
  userId: string;
  postId: string;
  createdAt: any; // Firestore Timestamp
}

export interface Story {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  imageUrl: string;
  videoUrl?: string;
  mediaType?: 'image' | 'video';
  createdAt: any; // Firestore Timestamp
  expiresAt: any; // Firestore Timestamp
  viewsCount?: number;
  viewers?: string[];
  likesCount?: number;
  likedBy?: string[];
  audience?: 'all' | 'close_friends';
}

export interface Chat {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastMessageTime?: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
  readStatus?: Record<string, boolean>;
  typingStatus?: Record<string, boolean>;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  attachmentUrl?: string;
  sharedPostId?: string;
  sharedPostSlideIndex?: number;
  sharedPostPreviewUrl?: string;
  sharedPostMediaType?: 'image' | 'video';
  sharedProfileId?: string;
  sharedStoryId?: string;
  sharedStoryPreviewUrl?: string;
  sharedStoryMediaType?: 'image' | 'video';
  sharedReelId?: string;
  createdAt: any; // Firestore Timestamp
  editedAt?: any; // Firestore Timestamp
  isEdited?: boolean;
  deletedFor?: string[];
}

export interface Reel {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  videoUrl: string;
  caption?: string;
  tags?: string[];
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  createdAt: any; // Firestore Timestamp
}

export interface ReelLike {
  id: string;
  reelId: string;
  userId: string;
  createdAt: any; // Firestore Timestamp
}

export interface ReelComment {
  id: string;
  reelId: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  text: string;
  likesCount: number;
  createdAt: any; // Firestore Timestamp
  replyToId?: string;
}

export interface Highlight {
  id: string;
  userId: string;
  label: string;
  imageUrl: string;
  mediaUrls: string[];
  createdAt: any; // Firestore Timestamp
  viewsCount?: number;
  viewers?: string[];
}
