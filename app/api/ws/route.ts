// WebSocket-like API Route using Server-Sent Events for real-time updates
// Note: True WebSocket requires a custom server. This uses SSE + POST for bidirectional communication

import { NextRequest } from 'next/server'
import {
  Stroke,
  User,
  UserCursor,
  WSMessage,
  Operation,
  ToolType,
  generateId,
  getRandomUserColor,
} from '@/lib/drawing-types'

// In-memory room state (in production, use Redis or similar)
interface RoomState {
  strokes: Stroke[]
  operations: Operation[] // Global operation history
  redoStack: Operation[] // Global redo stack
  users: Map<string, User>
  cursors: Map<string, UserCursor>
  clients: Map<string, ReadableStreamDefaultController<Uint8Array>>
  activeStrokes: Map<string, Stroke> // Track in-progress strokes
}

const rooms = new Map<string, RoomState>()

function getOrCreateRoom(roomId: string): RoomState {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      strokes: [],
      operations: [],
      redoStack: [],
      users: new Map(),
      cursors: new Map(),
      clients: new Map(),
      activeStrokes: new Map(),
    })
  }
  return rooms.get(roomId)!
}

function broadcastToRoom(roomId: string, message: WSMessage, excludeUserId?: string) {
  const room = rooms.get(roomId)
  if (!room) return

  const data = `data: ${JSON.stringify(message)}\n\n`
  const encoder = new TextEncoder()
  const encoded = encoder.encode(data)

  room.clients.forEach((controller, userId) => {
    if (excludeUserId && userId === excludeUserId) return
    try {
      controller.enqueue(encoded)
    } catch {
      // Client disconnected, will be cleaned up
    }
  })
}

// SSE endpoint for receiving real-time updates
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const roomId = searchParams.get('roomId') || 'default'
  const userName = searchParams.get('userName') || 'Anonymous'
  const userId = searchParams.get('userId') || generateId()

  const room = getOrCreateRoom(roomId)

  // Create new user
  const user: User = {
    id: userId,
    name: userName,
    color: getRandomUserColor(),
    joinedAt: Date.now(),
    isOnline: true,
  }
  room.users.set(userId, user)

  // Create SSE stream
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      room.clients.set(userId, controller)

      // Send initial sync state
      const syncMessage: WSMessage = {
        type: 'sync_state',
        roomId,
        userId,
        payload: {
          strokes: room.strokes,
          users: Array.from(room.users.values()),
          cursors: Array.from(room.cursors.values()),
          yourUser: user,
          operations: room.operations,
          canUndo: room.operations.length > 0,
          canRedo: room.redoStack.length > 0,
        },
        timestamp: Date.now(),
      }

      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(syncMessage)}\n\n`))

      // Notify others of new user
      broadcastToRoom(
        roomId,
        {
          type: 'user_joined',
          roomId,
          userId,
          payload: { user },
          timestamp: Date.now(),
        },
        userId
      )

      // Send notification to all users
      broadcastToRoom(roomId, {
        type: 'notification',
        roomId,
        userId,
        payload: {
          message: `${userName} joined the room`,
          type: 'info',
          fromUser: userName,
        },
        timestamp: Date.now(),
      })
    },
    cancel() {
      const leavingUser = room.users.get(userId)
      
      // Clean up when client disconnects
      room.clients.delete(userId)
      room.users.delete(userId)
      room.cursors.delete(userId)

      // Notify others of user leaving
      broadcastToRoom(roomId, {
        type: 'user_left',
        roomId,
        userId,
        payload: { userId },
        timestamp: Date.now(),
      })

      // Send notification
      if (leavingUser) {
        broadcastToRoom(roomId, {
          type: 'notification',
          roomId,
          userId,
          payload: {
            message: `${leavingUser.name} left the room`,
            type: 'info',
            fromUser: leavingUser.name,
          },
          timestamp: Date.now(),
        })
      }

      // Clean up empty rooms
      if (room.clients.size === 0) {
        rooms.delete(roomId)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// POST endpoint for sending drawing events
export async function POST(request: NextRequest) {
  const message: WSMessage = await request.json()
  const { roomId, userId, type, payload } = message

  const room = getOrCreateRoom(roomId)
  const user = room.users.get(userId!)

  switch (type) {
    case 'stroke_start': {
      const { strokeId, point, color, width, tool } = payload as {
        strokeId: string
        point: { x: number; y: number }
        color: string
        width: number
        tool: ToolType
      }

      // Start tracking this stroke
      const newStroke: Stroke = {
        id: strokeId,
        userId: userId!,
        points: [point],
        color,
        width,
        tool,
        timestamp: Date.now(),
        startPoint: point,
      }

      room.activeStrokes.set(strokeId, newStroke)

      // Broadcast to all clients immediately for real-time feel
      broadcastToRoom(roomId, {
        type: 'stroke_start',
        roomId,
        userId,
        payload: newStroke,
        timestamp: Date.now(),
      })
      break
    }

    case 'stroke_update': {
      const { strokeId, points, endPoint } = payload as {
        strokeId: string
        points: { x: number; y: number }[]
        endPoint?: { x: number; y: number }
      }

      // Update active stroke
      const activeStroke = room.activeStrokes.get(strokeId)
      if (activeStroke) {
        activeStroke.points = [...activeStroke.points, ...points]
        if (endPoint) {
          activeStroke.endPoint = endPoint
        }
      }

      // Broadcast points update to all clients
      broadcastToRoom(roomId, {
        type: 'stroke_update',
        roomId,
        userId,
        payload: { strokeId, points, endPoint },
        timestamp: Date.now(),
      })
      break
    }

    case 'stroke_end': {
      const { strokeId, stroke } = payload as {
        strokeId: string
        stroke: Stroke
      }

      // Remove from active, add to completed
      room.activeStrokes.delete(strokeId)
      room.strokes.push(stroke)

      // Create operation for global undo/redo
      const operation: Operation = {
        id: generateId(),
        type: 'stroke_add',
        stroke,
        userId: userId!,
        userName: user?.name || 'Unknown',
        timestamp: Date.now(),
      }
      room.operations.push(operation)

      // Clear redo stack when new action is performed
      room.redoStack = []

      // Broadcast stroke completion
      broadcastToRoom(roomId, {
        type: 'stroke_end',
        roomId,
        userId,
        payload: { 
          strokeId, 
          stroke, 
          operation,
          canUndo: true,
          canRedo: false,
        },
        timestamp: Date.now(),
      })
      break
    }

    case 'cursor_move': {
      const { x, y, isDrawing } = payload as {
        x: number
        y: number
        isDrawing: boolean
      }

      if (user) {
        const cursor: UserCursor = {
          userId: userId!,
          x,
          y,
          color: user.color,
          name: user.name,
          isDrawing,
          lastUpdate: Date.now(),
        }
        room.cursors.set(userId!, cursor)

        // Broadcast cursor movement (exclude sender to reduce latency)
        broadcastToRoom(
          roomId,
          {
            type: 'cursor_move',
            roomId,
            userId,
            payload: cursor,
            timestamp: Date.now(),
          },
          userId
        )
      }
      break
    }

    case 'undo': {
      // GLOBAL UNDO - undo the last operation from ANY user
      if (room.operations.length > 0) {
        const lastOp = room.operations.pop()!
        
        if (lastOp.type === 'stroke_add' && lastOp.stroke) {
          // Remove the stroke
          room.strokes = room.strokes.filter((s) => s.id !== lastOp.stroke!.id)
        } else if (lastOp.type === 'stroke_remove' && lastOp.stroke) {
          // Re-add the stroke
          room.strokes.push(lastOp.stroke)
        } else if (lastOp.type === 'clear' && lastOp.affectedStrokeIds) {
          // This is complex - would need to store all cleared strokes
          // For now, we just note that clear cannot be undone
        }

        // Add to redo stack
        room.redoStack.push(lastOp)

        // Broadcast global undo to all clients
        broadcastToRoom(roomId, {
          type: 'undo',
          roomId,
          userId,
          payload: { 
            operation: lastOp,
            undoneBy: user?.name || 'Unknown',
            strokes: room.strokes, // Send full state for consistency
            canUndo: room.operations.length > 0,
            canRedo: true,
          },
          timestamp: Date.now(),
        })

        // Notify users about who undid what
        broadcastToRoom(roomId, {
          type: 'notification',
          roomId,
          userId,
          payload: {
            message: `${user?.name || 'Someone'} undid ${lastOp.userName}'s ${lastOp.type === 'stroke_add' ? 'stroke' : 'action'}`,
            type: 'info',
          },
          timestamp: Date.now(),
        })
      }
      break
    }

    case 'redo': {
      // GLOBAL REDO - redo the last undone operation
      if (room.redoStack.length > 0) {
        const opToRedo = room.redoStack.pop()!
        
        if (opToRedo.type === 'stroke_add' && opToRedo.stroke) {
          // Re-add the stroke
          room.strokes.push(opToRedo.stroke)
        } else if (opToRedo.type === 'stroke_remove' && opToRedo.stroke) {
          // Remove the stroke again
          room.strokes = room.strokes.filter((s) => s.id !== opToRedo.stroke!.id)
        }

        // Add back to operations
        room.operations.push(opToRedo)

        // Broadcast global redo to all clients
        broadcastToRoom(roomId, {
          type: 'redo',
          roomId,
          userId,
          payload: { 
            operation: opToRedo,
            redoneBy: user?.name || 'Unknown',
            strokes: room.strokes,
            canUndo: true,
            canRedo: room.redoStack.length > 0,
          },
          timestamp: Date.now(),
        })

        // Notify users
        broadcastToRoom(roomId, {
          type: 'notification',
          roomId,
          userId,
          payload: {
            message: `${user?.name || 'Someone'} redid ${opToRedo.userName}'s ${opToRedo.type === 'stroke_add' ? 'stroke' : 'action'}`,
            type: 'info',
          },
          timestamp: Date.now(),
        })
      }
      break
    }

    case 'clear': {
      // Store all stroke IDs for potential undo
      const clearedStrokeIds = room.strokes.map(s => s.id)
      const clearedStrokes = [...room.strokes]
      
      // Create clear operation
      const clearOp: Operation = {
        id: generateId(),
        type: 'clear',
        affectedStrokeIds: clearedStrokeIds,
        userId: userId!,
        userName: user?.name || 'Unknown',
        timestamp: Date.now(),
      }

      // Clear all strokes
      room.strokes = []
      room.activeStrokes.clear()
      room.operations.push(clearOp)
      room.redoStack = []

      broadcastToRoom(roomId, {
        type: 'clear',
        roomId,
        userId,
        payload: {
          clearedBy: user?.name || 'Unknown',
          canUndo: true,
          canRedo: false,
        },
        timestamp: Date.now(),
      })

      // Notify users
      broadcastToRoom(roomId, {
        type: 'notification',
        roomId,
        userId,
        payload: {
          message: `${user?.name || 'Someone'} cleared the canvas`,
          type: 'warning',
        },
        timestamp: Date.now(),
      })
      break
    }

    case 'save_session': {
      // Return current state for saving
      return Response.json({
        success: true,
        session: {
          id: generateId(),
          roomId,
          strokes: room.strokes,
          operations: room.operations,
          savedAt: Date.now(),
          savedBy: user?.name || 'Unknown',
        },
      })
    }

    case 'load_session': {
      const { session } = payload as { session: { strokes: Stroke[]; operations: Operation[] } }
      
      // Load session data
      room.strokes = session.strokes || []
      room.operations = session.operations || []
      room.redoStack = []

      // Broadcast loaded state to all clients
      broadcastToRoom(roomId, {
        type: 'sync_state',
        roomId,
        userId,
        payload: {
          strokes: room.strokes,
          users: Array.from(room.users.values()),
          cursors: Array.from(room.cursors.values()),
          operations: room.operations,
          canUndo: room.operations.length > 0,
          canRedo: false,
        },
        timestamp: Date.now(),
      })

      // Notify users
      broadcastToRoom(roomId, {
        type: 'notification',
        roomId,
        userId,
        payload: {
          message: `${user?.name || 'Someone'} loaded a saved session`,
          type: 'success',
        },
        timestamp: Date.now(),
      })
      break
    }
  }

  return Response.json({ success: true })
}
