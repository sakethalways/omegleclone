'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Stroke,
  User,
  UserCursor,
  WSMessage,
  ToolSettings,
  Point,
  Operation,
  ToolType,
  generateId,
  PerformanceMetrics,
  SavedSession,
  NotificationPayload,
} from '@/lib/drawing-types'

interface UseCollaborativeCanvasOptions {
  roomId: string
  userName: string
}

interface Notification {
  id: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  timestamp: number
}

interface CollaborativeCanvasState {
  strokes: Stroke[]
  activeStrokes: Map<string, Stroke>
  cursors: Map<string, UserCursor>
  users: Map<string, User>
  currentUser: User | null
  isConnected: boolean
  connectionError: string | null
  metrics: PerformanceMetrics
  operations: Operation[]
  canUndo: boolean
  canRedo: boolean
  notifications: Notification[]
}

export function useCollaborativeCanvas({ roomId, userName }: UseCollaborativeCanvasOptions) {
  const [state, setState] = useState<CollaborativeCanvasState>({
    strokes: [],
    activeStrokes: new Map(),
    cursors: new Map(),
    users: new Map(),
    currentUser: null,
    isConnected: false,
    connectionError: null,
    metrics: { fps: 0, latency: 0, strokesCount: 0, usersCount: 0 },
    operations: [],
    canUndo: false,
    canRedo: false,
    notifications: [],
  })

  const userIdRef = useRef<string>(generateId())
  const eventSourceRef = useRef<EventSource | null>(null)
  const currentStrokeRef = useRef<Stroke | null>(null)
  const pointBatchRef = useRef<Point[]>([])
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const latencyRef = useRef<number>(0)
  const lastPingRef = useRef<number>(Date.now())
  const reconnectAttemptRef = useRef<number>(0)

  // Add notification
  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp'>) => {
    const id = generateId()
    setState((prev) => ({
      ...prev,
      notifications: [
        ...prev.notifications.slice(-4), // Keep last 5
        { ...notification, id, timestamp: Date.now() },
      ],
    }))

    // Auto-remove after 5 seconds
    setTimeout(() => {
      setState((prev) => ({
        ...prev,
        notifications: prev.notifications.filter((n) => n.id !== id),
      }))
    }, 5000)
  }, [])

  // Send message to server
  const sendMessage = useCallback(
    async (type: WSMessage['type'], payload: unknown) => {
      const startTime = Date.now()
      try {
        const response = await fetch('/api/ws', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            roomId,
            userId: userIdRef.current,
            payload,
            timestamp: Date.now(),
          }),
        })
        latencyRef.current = Date.now() - startTime
        return response.json()
      } catch (error) {
        console.error('[v0] Failed to send message:', error)
        return null
      }
    },
    [roomId]
  )

  // Batch send points for efficiency (reduces network calls)
  const flushPointBatch = useCallback(() => {
    if (pointBatchRef.current.length > 0 && currentStrokeRef.current) {
      sendMessage('stroke_update', {
        strokeId: currentStrokeRef.current.id,
        points: pointBatchRef.current,
        endPoint: pointBatchRef.current[pointBatchRef.current.length - 1],
      })
      pointBatchRef.current = []
    }
  }, [sendMessage])

  // Handle incoming messages
  const handleMessage = useCallback((message: WSMessage) => {
    const { type, payload, userId: messageUserId } = message

    setState((prev) => {
      const newState = { ...prev }

      switch (type) {
        case 'sync_state': {
          const { strokes, users, cursors, yourUser, operations, canUndo, canRedo } = payload as {
            strokes: Stroke[]
            users: User[]
            cursors: UserCursor[]
            yourUser: User
            operations?: Operation[]
            canUndo?: boolean
            canRedo?: boolean
          }
          newState.strokes = strokes
          newState.users = new Map(users.map((u) => [u.id, u]))
          newState.cursors = new Map(cursors.map((c) => [c.userId, c]))
          newState.currentUser = yourUser
          newState.operations = operations || []
          newState.canUndo = canUndo ?? false
          newState.canRedo = canRedo ?? false
          newState.metrics = {
            ...prev.metrics,
            strokesCount: strokes.length,
            usersCount: users.length,
          }
          break
        }

        case 'stroke_start': {
          const stroke = payload as Stroke
          const newActiveStrokes = new Map(prev.activeStrokes)
          newActiveStrokes.set(stroke.id, stroke)
          newState.activeStrokes = newActiveStrokes
          break
        }

        case 'stroke_update': {
          const { strokeId, points, endPoint } = payload as { 
            strokeId: string
            points: Point[]
            endPoint?: Point
          }
          const newActiveStrokes = new Map(prev.activeStrokes)
          const stroke = newActiveStrokes.get(strokeId)
          if (stroke) {
            newActiveStrokes.set(strokeId, {
              ...stroke,
              points: [...stroke.points, ...points],
              endPoint: endPoint || stroke.endPoint,
            })
            newState.activeStrokes = newActiveStrokes
          }
          break
        }

        case 'stroke_end': {
          const { strokeId, stroke, operation, canUndo, canRedo } = payload as { 
            strokeId: string
            stroke: Stroke
            operation?: Operation
            canUndo?: boolean
            canRedo?: boolean
          }
          const newActiveStrokes = new Map(prev.activeStrokes)
          newActiveStrokes.delete(strokeId)
          newState.activeStrokes = newActiveStrokes
          newState.strokes = [...prev.strokes, stroke]
          newState.metrics = { ...prev.metrics, strokesCount: prev.strokes.length + 1 }
          if (operation) {
            newState.operations = [...prev.operations, operation]
          }
          newState.canUndo = canUndo ?? true
          newState.canRedo = canRedo ?? false
          break
        }

        case 'cursor_move': {
          const cursor = payload as UserCursor
          // Don't update our own cursor from server
          if (cursor.userId !== userIdRef.current) {
            const newCursors = new Map(prev.cursors)
            newCursors.set(cursor.userId, cursor)
            newState.cursors = newCursors
          }
          break
        }

        case 'user_joined': {
          const { user } = payload as { user: User }
          const newUsers = new Map(prev.users)
          newUsers.set(user.id, user)
          newState.users = newUsers
          newState.metrics = { ...prev.metrics, usersCount: newUsers.size }
          break
        }

        case 'user_left': {
          const { userId } = payload as { userId: string }
          const newUsers = new Map(prev.users)
          const newCursors = new Map(prev.cursors)
          newUsers.delete(userId)
          newCursors.delete(userId)
          newState.users = newUsers
          newState.cursors = newCursors
          newState.metrics = { ...prev.metrics, usersCount: newUsers.size }
          break
        }

        case 'undo': {
          const { strokes, canUndo, canRedo } = payload as { 
            operation: Operation
            undoneBy: string
            strokes: Stroke[]
            canUndo: boolean
            canRedo: boolean
          }
          newState.strokes = strokes
          newState.operations = prev.operations.slice(0, -1)
          newState.canUndo = canUndo
          newState.canRedo = canRedo
          newState.metrics = { ...prev.metrics, strokesCount: strokes.length }
          break
        }

        case 'redo': {
          const { operation, strokes, canUndo, canRedo } = payload as { 
            operation: Operation
            redoneBy: string
            strokes: Stroke[]
            canUndo: boolean
            canRedo: boolean
          }
          newState.strokes = strokes
          newState.operations = [...prev.operations, operation]
          newState.canUndo = canUndo
          newState.canRedo = canRedo
          newState.metrics = { ...prev.metrics, strokesCount: strokes.length }
          break
        }

        case 'clear': {
          newState.strokes = []
          newState.activeStrokes = new Map()
          const { canUndo, canRedo } = payload as { clearedBy: string; canUndo: boolean; canRedo: boolean }
          newState.canUndo = canUndo
          newState.canRedo = canRedo
          newState.metrics = { ...prev.metrics, strokesCount: 0 }
          break
        }

        case 'notification': {
          const notif = payload as NotificationPayload
          // Will be handled separately to avoid re-render issues
          break
        }
      }

      return newState
    })

    // Handle notifications separately
    if (type === 'notification') {
      const notif = payload as NotificationPayload
      addNotification({
        message: notif.message,
        type: notif.type,
      })
    }
  }, [addNotification])

  // Connect to SSE stream
  useEffect(() => {
    if (!roomId || !userName) return

    const userId = userIdRef.current
    const url = `/api/ws?roomId=${encodeURIComponent(roomId)}&userName=${encodeURIComponent(userName)}&userId=${userId}`

    const connect = () => {
      const eventSource = new EventSource(url)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        setState((prev) => ({ ...prev, isConnected: true, connectionError: null }))
        reconnectAttemptRef.current = 0
      }

      eventSource.onerror = () => {
        setState((prev) => ({
          ...prev,
          isConnected: false,
          connectionError: 'Connection lost. Reconnecting...',
        }))

        // Auto-reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000)
        reconnectAttemptRef.current++
        
        eventSource.close()
        setTimeout(connect, delay)
      }

      eventSource.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data)
          handleMessage(message)
        } catch (error) {
          console.error('[v0] Failed to parse message:', error)
        }
      }
    }

    connect()

    return () => {
      eventSourceRef.current?.close()
      eventSourceRef.current = null
    }
  }, [roomId, userName, handleMessage])

  // Drawing actions
  const startStroke = useCallback(
    (point: Point, settings: ToolSettings) => {
      const strokeId = generateId()
      const stroke: Stroke = {
        id: strokeId,
        userId: userIdRef.current,
        points: [point],
        color: settings.tool === 'eraser' ? '#FFFFFF' : settings.color,
        width: settings.width,
        tool: settings.tool,
        timestamp: Date.now(),
        startPoint: point,
        filled: settings.filled,
      }

      currentStrokeRef.current = stroke

      // Optimistic update
      setState((prev) => {
        const newActiveStrokes = new Map(prev.activeStrokes)
        newActiveStrokes.set(strokeId, stroke)
        return { ...prev, activeStrokes: newActiveStrokes }
      })

      sendMessage('stroke_start', {
        strokeId,
        point,
        color: stroke.color,
        width: settings.width,
        tool: settings.tool,
      })

      return strokeId
    },
    [sendMessage]
  )

  const updateStroke = useCallback(
    (point: Point) => {
      if (!currentStrokeRef.current) return

      const tool = currentStrokeRef.current.tool

      // For shapes, we only need start and end points
      if (tool === 'line' || tool === 'rectangle' || tool === 'circle') {
        currentStrokeRef.current.endPoint = point
        
        // Update local state
        setState((prev) => {
          const newActiveStrokes = new Map(prev.activeStrokes)
          const stroke = newActiveStrokes.get(currentStrokeRef.current!.id)
          if (stroke) {
            newActiveStrokes.set(stroke.id, {
              ...stroke,
              endPoint: point,
            })
          }
          return { ...prev, activeStrokes: newActiveStrokes }
        })

        // Send update less frequently for shapes
        pointBatchRef.current = [point]
        if (!batchTimeoutRef.current) {
          batchTimeoutRef.current = setTimeout(() => {
            flushPointBatch()
            batchTimeoutRef.current = null
          }, 50)
        }
      } else {
        // For brush/eraser, add points
        setState((prev) => {
          const newActiveStrokes = new Map(prev.activeStrokes)
          const stroke = newActiveStrokes.get(currentStrokeRef.current!.id)
          if (stroke) {
            newActiveStrokes.set(stroke.id, {
              ...stroke,
              points: [...stroke.points, point],
            })
          }
          return { ...prev, activeStrokes: newActiveStrokes }
        })

        currentStrokeRef.current.points.push(point)
        pointBatchRef.current.push(point)

        // Send batched points every 16ms (60fps) or after 5 points
        if (pointBatchRef.current.length >= 5) {
          flushPointBatch()
        } else if (!batchTimeoutRef.current) {
          batchTimeoutRef.current = setTimeout(() => {
            flushPointBatch()
            batchTimeoutRef.current = null
          }, 16)
        }
      }
    },
    [flushPointBatch]
  )

  const endStroke = useCallback(() => {
    if (!currentStrokeRef.current) return

    // Flush any remaining points
    flushPointBatch()

    const completedStroke = { ...currentStrokeRef.current }

    // Move from active to completed
    setState((prev) => {
      const newActiveStrokes = new Map(prev.activeStrokes)
      newActiveStrokes.delete(completedStroke.id)
      return {
        ...prev,
        activeStrokes: newActiveStrokes,
        strokes: [...prev.strokes, completedStroke],
      }
    })

    sendMessage('stroke_end', {
      strokeId: completedStroke.id,
      stroke: completedStroke,
    })

    currentStrokeRef.current = null
  }, [flushPointBatch, sendMessage])

  const updateCursor = useCallback(
    (x: number, y: number, isDrawing: boolean) => {
      // Throttle cursor updates to 30fps
      const now = Date.now()
      if (now - lastPingRef.current < 33) return
      lastPingRef.current = now

      sendMessage('cursor_move', { x, y, isDrawing })
    },
    [sendMessage]
  )

  const undo = useCallback(() => {
    sendMessage('undo', {})
  }, [sendMessage])

  const redo = useCallback(() => {
    sendMessage('redo', {})
  }, [sendMessage])

  const clearCanvas = useCallback(() => {
    sendMessage('clear', {})
  }, [sendMessage])

  // Save session
  const saveSession = useCallback(async () => {
    const result = await sendMessage('save_session', {})
    if (result?.session) {
      // Trigger download
      const blob = new Blob([JSON.stringify(result.session, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `canvas-session-${result.session.id}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      addNotification({ message: 'Session saved successfully!', type: 'success' })
    }
  }, [sendMessage, addNotification])

  // Load session
  const loadSession = useCallback(async (session: SavedSession) => {
    await sendMessage('load_session', { session })
  }, [sendMessage])

  // Download canvas as image
  const downloadCanvas = useCallback((canvas: HTMLCanvasElement) => {
    const link = document.createElement('a')
    link.download = `canvas-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    addNotification({ message: 'Canvas downloaded!', type: 'success' })
  }, [addNotification])

  // Update metrics periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setState((prev) => ({
        ...prev,
        metrics: {
          ...prev.metrics,
          latency: latencyRef.current,
        },
      }))
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // Dismiss notification
  const dismissNotification = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.filter((n) => n.id !== id),
    }))
  }, [])

  return {
    ...state,
    userId: userIdRef.current,
    startStroke,
    updateStroke,
    endStroke,
    updateCursor,
    undo,
    redo,
    clearCanvas,
    saveSession,
    loadSession,
    downloadCanvas,
    dismissNotification,
  }
}
