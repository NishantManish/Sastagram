import { User, Post, Chat } from '../types';

interface SearchCache {
  suggestedUsers: User[];
  lastSearchQuery: string;
  lastResults: User[];
  lastPostResults: Post[];
}

interface MessagesCache {
  chats: Chat[];
  chatUsers: Record<string, User>;
}

class CacheService {
  private searchCache: SearchCache = {
    suggestedUsers: [],
    lastSearchQuery: '',
    lastResults: [],
    lastPostResults: [],
  };

  private messagesCache: MessagesCache = {
    chats: [],
    chatUsers: {},
  };

  // Search Cache
  setSearchCache(cache: Partial<SearchCache>) {
    this.searchCache = { ...this.searchCache, ...cache };
  }

  getSearchCache(): SearchCache {
    return this.searchCache;
  }

  // Messages Cache
  setMessagesCache(cache: Partial<MessagesCache>) {
    this.messagesCache = { ...this.messagesCache, ...cache };
  }

  getMessagesCache(): MessagesCache {
    return this.messagesCache;
  }

  updateChatUser(userId: string, user: User) {
    this.messagesCache.chatUsers[userId] = user;
  }

  getChatUser(userId: string): User | undefined {
    return this.messagesCache.chatUsers[userId];
  }
}

export const cacheService = new CacheService();
