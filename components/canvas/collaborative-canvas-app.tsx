'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCollaborativeCanvas } from '@/hooks/use-collaborative-canvas'
import { DrawingCanvas } from './drawing-canvas'
import { Toolbar } from './toolbar'
import { UsersPanel } from './users-panel'
import { JoinRoomDialog } from './join-room-dialog'
import { Notifications } from './notifications'
import { ToolSettings, ToolType, SavedSession } from '@/lib/drawing-types'
import { Button } from '@/components/ui/button'
import { Copy, Check, LogOut, RefreshCw } from 'lucide-react'

export function CollaborativeCanvasApp() {
  const [joined, setJoined] = useState(false)
  const [userName, setUserName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [copied, setCopied] = useState(false)
  const [fps, setFps] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [toolSettings, setToolSettings] = useState<ToolSettings>({
    tool: 'brush',
    color: '#000000',
    width: 4,
    filled: false,
  })

  const {
    strokes,
    activeStrokes,
    cursors,
    users,
    currentUser,
    isConnected,
    connectionError,
    metrics,
    operations,
    canUndo,
    canRedo,
    notifications,
    userId,
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
  } = useCollaborativeCanvas({
    roomId: joined ? roomId : '',
    userName: joined ? userName : '',
  })

  // Handle join
  const handleJoin = useCallback((name: string, room: string) => {
    setUserName(name)
    setRoomId(room)
    setJoined(true)
  }, [])

  // Handle leave
  const handleLeave = useCallback(() => {
    setJoined(false)
    window.location.reload() // Simple way to disconnect SSE
  }, [])

  // Copy room code
  const copyRoomCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textArea = document.createElement('textarea')
      textArea.value = roomId
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [roomId])

  // Handle download
  const handleDownload = useCallback(() => {
    if (canvasRef.current) {
      downloadCanvas(canvasRef.current)
    }
  }, [downloadCanvas])

  // Handle load session
  const handleLoadSession = useCallback(
    async (file: File) => {
      try {
        const text = await file.text()
        const session: SavedSession = JSON.parse(text)
        loadSession(session)
      } catch {
        console.error('[v0] Failed to load session')
      }
    },
    [loadSession]
  )

  // Keyboard shortcuts
  useEffect(() => {
    if (!joined) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // Check for undo/redo shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        redo()
      }

      // Save shortcut
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveSession()
      }

      // Tool shortcuts
      const toolMap: Record<string, ToolType> = {
        b: 'brush',
        e: 'eraser',
        l: 'line',
        r: 'rectangle',
        c: 'circle',
      }

      const tool = toolMap[e.key.toLowerCase()]
      if (tool) {
        setToolSettings((prev) => ({ ...prev, tool }))
      }

      // Size shortcuts
      if (e.key === '[') {
        setToolSettings((prev) => ({ ...prev, width: Math.max(2, prev.width - 2) }))
      }
      if (e.key === ']') {
        setToolSettings((prev) => ({ ...prev, width: Math.min(32, prev.width + 2) }))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [joined, undo, redo, saveSession])

  // Start stroke handler
  const handleStartStroke = useCallback(
    (point: { x: number; y: number }) => {
      startStroke(point, toolSettings)
    },
    [startStroke, toolSettings]
  )

  // Show join dialog if not joined
  if (!joined) {
    return <JoinRoomDialog onJoin={handleJoin} />
  }

  return (
    <div className="h-screen flex flex-col bg-muted">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Collaborative Canvas</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Room:</span>
            <code className="px-2 py-1 bg-muted rounded text-sm font-mono">{roomId}</code>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyRoomCode}>
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {connectionError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <RefreshCw className="h-4 w-4 animate-spin" />
              {connectionError}
            </div>
          )}
          <div className="flex items-center gap-2">
            {currentUser && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: currentUser.color }} />
                <span className="text-sm font-medium">{currentUser.name}</span>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={handleLeave}>
              <LogOut className="h-4 w-4 mr-2" />
              Leave
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        {/* Left Sidebar - Tools */}
        <aside className="w-[220px] shrink-0 overflow-y-auto">
          <Toolbar
            settings={toolSettings}
            onSettingsChange={setToolSettings}
            onUndo={undo}
            onRedo={redo}
            onClear={clearCanvas}
            onDownload={handleDownload}
            onSaveSession={saveSession}
            onLoadSession={handleLoadSession}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        </aside>

        {/* Canvas Area */}
        <main className="flex-1 min-w-0">
          <DrawingCanvas
            strokes={strokes}
            activeStrokes={activeStrokes}
            cursors={cursors}
            currentUserId={userId}
            toolSettings={toolSettings}
            onStartStroke={handleStartStroke}
            onUpdateStroke={updateStroke}
            onEndStroke={endStroke}
            onCursorMove={updateCursor}
            onFpsUpdate={setFps}
            canvasRef={canvasRef}
          />
        </main>

        {/* Right Sidebar - Users */}
        <aside className="w-[220px] shrink-0">
          <UsersPanel
            users={users}
            currentUserId={userId}
            isConnected={isConnected}
            metrics={{ ...metrics, fps }}
            operations={operations}
          />
        </aside>
      </div>

      {/* Footer - Keyboard Shortcuts Help */}
      <footer className="px-4 py-2 bg-card border-t border-border">
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">B</kbd> Brush
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">E</kbd> Eraser
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">L</kbd> Line
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">R</kbd> Rectangle
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">C</kbd> Circle
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">[</kbd>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">]</kbd> Size
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Ctrl+Z</kbd> Undo
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Ctrl+Y</kbd> Redo
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Ctrl+S</kbd> Save
          </span>
        </div>
      </footer>

      {/* Notifications */}
      <Notifications notifications={notifications} onDismiss={dismissNotification} />
    </div>
  )
}
