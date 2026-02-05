// Drawing Types for Real-Time Collaborative Canvas

export interface Point {
  x: number
  y: number
  pressure?: number // For pressure-sensitive devices
}

export type ToolType = 'brush' | 'eraser' | 'line' | 'rectangle' | 'circle' | 'fill'

export interface Stroke {
  id: string
  userId: string
  points: Point[]
  color: string
  width: number
  tool: ToolType
  timestamp: number
  // For shapes
  startPoint?: Point
  endPoint?: Point
  filled?: boolean
}

// Global operation for undo/redo across all users
export interface Operation {
  id: string
  type: 'stroke_add' | 'stroke_remove' | 'clear'
  stroke?: Stroke
  affectedStrokeIds?: string[] // For clear operation
  userId: string
  userName: string
  timestamp: number
}

export interface UserCursor {
  userId: string
  x: number
  y: number
  color: string
  name: string
  isDrawing: boolean
  lastUpdate: number
}

export interface User {
  id: string
  name: string
  color: string
  joinedAt: number
  isOnline: boolean
}

export interface Room {
  id: string
  name: string
  users: Map<string, User>
  strokes: Stroke[]
  operations: Operation[] // Global operation history
  redoStack: Operation[] // Global redo stack
  createdAt: number
}

// WebSocket Message Types
export type WSMessageType =
  | 'join'
  | 'leave'
  | 'stroke_start'
  | 'stroke_update'
  | 'stroke_end'
  | 'cursor_move'
  | 'undo'
  | 'redo'
  | 'clear'
  | 'sync_state'
  | 'user_joined'
  | 'user_left'
  | 'error'
  | 'save_session'
  | 'load_session'
  | 'notification'

export interface WSMessage {
  type: WSMessageType
  roomId: string
  userId?: string
  payload?: unknown
  timestamp: number
}

export interface JoinPayload {
  userName: string
  roomId: string
}

export interface StrokeStartPayload {
  strokeId: string
  point: Point
  color: string
  width: number
  tool: ToolType
}

export interface StrokeUpdatePayload {
  strokeId: string
  points: Point[] // Batched points for efficiency
}

export interface StrokeEndPayload {
  strokeId: string
  startPoint?: Point
  endPoint?: Point
}

export interface CursorMovePayload {
  x: number
  y: number
  isDrawing: boolean
}

export interface SyncStatePayload {
  strokes: Stroke[]
  users: User[]
  cursors: UserCursor[]
  operations: Operation[]
}

export interface UserJoinedPayload {
  user: User
}

export interface UserLeftPayload {
  userId: string
}

// Notification payload
export interface NotificationPayload {
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  fromUser?: string
}

// Canvas State for client-side management
export interface CanvasState {
  strokes: Stroke[]
  activeStrokes: Map<string, Stroke> // Strokes being drawn by users
  cursors: Map<string, UserCursor>
  users: Map<string, User>
  operations: Operation[] // Global operation history
  redoStack: Operation[] // Global redo stack
}

// Drawing Tool Settings
export interface ToolSettings {
  tool: ToolType
  color: string
  width: number
  filled?: boolean // For shapes
}

// Performance Metrics
export interface PerformanceMetrics {
  fps: number
  latency: number
  strokesCount: number
  usersCount: number
}

// Saved Session
export interface SavedSession {
  id: string
  roomId: string
  strokes: Stroke[]
  operations: Operation[]
  savedAt: number
  savedBy: string
}

// Predefined colors for users
export const USER_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Purple
  '#85C1E9', // Sky Blue
]

// Brush colors
export const BRUSH_COLORS = [
  '#000000', // Black
  '#FFFFFF', // White
  '#FF0000', // Red
  '#00FF00', // Green
  '#0000FF', // Blue
  '#FFFF00', // Yellow
  '#FF00FF', // Magenta
  '#00FFFF', // Cyan
  '#FF6B6B', // Coral
  '#4ECDC4', // Teal
  '#45B7D1', // Sky
  '#96CEB4', // Sage
  '#8B4513', // Brown
  '#FFA500', // Orange
  '#800080', // Purple
  '#808080', // Gray
]

// Brush sizes
export const BRUSH_SIZES = [2, 4, 8, 12, 16, 24, 32]

// Generate unique ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Get random user color
export function getRandomUserColor(): string {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
}

// Tool display names
export const TOOL_NAMES: Record<ToolType, string> = {
  brush: 'Brush',
  eraser: 'Eraser',
  line: 'Line',
  rectangle: 'Rectangle',
  circle: 'Circle',
  fill: 'Fill',
}
