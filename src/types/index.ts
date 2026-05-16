// User types
export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  bio: string;
  followers: number;
  following: number;
  posts: number;
  isVerified: boolean;
  isOnline?: boolean;
}

// Story for stories section
export interface Story {
  id: string;
  user: User;
  hasViewed: boolean;
  imageUrl?: string;
}

// Post with all interactions
export interface Post {
  id: string;
  user: User;
  content: string;
  images?: string[];
  likes: number;
  comments: number;
  shares: number;
  isLiked: boolean;
  isSaved: boolean;
  createdAt: string;
  location?: string;
}

// Message conversation
export interface Message {
  id: string;
  user: User;
  lastMessage: string;
  unreadCount: number;
  lastActive: string;
}

// Notification
export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention';
  user: User;
  content: string;
  createdAt: string;
  isRead: boolean;
}

// Navigation item
export interface NavItem {
  href: string;
  label: string;
  icon: string;
}