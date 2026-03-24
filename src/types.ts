export interface User {
  uid: string;
  username?: string;
  displayName: string;
  photoURL: string;
  bio?: string;
  followersCount: number;
  followingCount: number;
  createdAt: any; // Firestore Timestamp
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  imageUrl: string;
  caption: string;
  likesCount: number;
  createdAt: any; // Firestore Timestamp
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
  type: 'like' | 'comment' | 'follow' | 'message';
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  postId?: string;
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
  createdAt: any; // Firestore Timestamp
  expiresAt: any; // Firestore Timestamp
  viewsCount?: number;
  viewers?: string[];
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
  createdAt: any; // Firestore Timestamp
}

export interface Highlight {
  id: string;
  userId: string;
  label: string;
  imageUrl: string;
  mediaUrls: string[];
  createdAt: any; // Firestore Timestamp
}
