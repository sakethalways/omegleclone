// User and Session Types
export interface ChatUser {
  id: string;
  name: string;
  interests: string[];
  status: "waiting" | "matched" | "chatting" | "offline";
  connectedAt: number;
  lastHeartbeat: number;
  blockedUsers: string[];
  color: string;
}

export interface ChatRoom {
  id: string;
  user1Id: string;
  user2Id: string;
  user1Name: string;
  user2Name: string;
  commonInterests: string[];
  messages: ChatMessage[];
  createdAt: number;
  lastActivity: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  delivered: boolean;
}

export interface UserSession {
  userId: string;
  userName: string;
  interests: string[];
  sessionToken: string;
  roomId: string | null;
  queuePosition: number;
  matchedUserId: string | null;
  blockedUsers: string[];
  recentMatches: string[];
}

export interface MatchEvent {
  eventType:
    | "user_joined_queue"
    | "match_found"
    | "match_started"
    | "user_disconnected"
    | "user_blocked"
    | "user_skipped";
  userId: string;
  matchedUserId?: string;
  roomId?: string;
  timestamp: number;
}

export interface TypingStatus {
  userId: string;
  isTyping: boolean;
}

export interface UserCursor {
  userId: string;
  userName: string;
  isTyping: boolean;
  color: string;
}

// WebSocket Message Types
export interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
}

export interface QueueUpdate {
  position: number;
  totalWaiting: number;
}

export interface MatchFoundPayload {
  matchedUser: {
    id: string;
    name: string;
    interests: string[];
    color: string;
  };
  roomId: string;
  commonInterests: string[];
}

export interface MessagePayload {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
}

export interface UserLeftPayload {
  reason: "disconnect" | "skip" | "block";
  userLeftId: string;
}

export const INTEREST_TAGS = [
  "Gaming",
  "Music",
  "Movies",
  "Sports",
  "Art",
  "Technology",
  "Travel",
  "Food",
  "Reading",
  "Photography",
  "Fitness",
  "Fashion",
  "Business",
  "Science",
  "History",
  "Comedy",
  "Anime",
  "Mental Health",
  "DIY",
  "Pets",
  "Politics",
  "Philosophy",
  "Nature",
  "Learning",
  "Books",
  "Cooking",
  "Design",
  "Education",
];

export const USER_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#FFA07A",
  "#98D8C8",
  "#F7DC6F",
  "#BB8FCE",
  "#85C1E2",
  "#F8B88B",
  "#AED6F1",
];

export function generateUserColor(): string {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

export function generateUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateRoomId(): string {
  return `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
