'use client'

import React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Stroke, Point, UserCursor, ToolSettings, ToolType } from '@/lib/drawing-types'

interface DrawingCanvasProps {
  strokes: Stroke[]
  activeStrokes: Map<string, Stroke>
  cursors: Map<string, UserCursor>
  currentUserId: string
  toolSettings: ToolSettings
  onStartStroke: (point: Point) => void
  onUpdateStroke: (point: Point) => void
  onEndStroke: () => void
  onCursorMove: (x: number, y: number, isDrawing: boolean) => void
  onFpsUpdate?: (fps: number) => void
  canvasRef?: React.RefObject<HTMLCanvasElement | null>
}

export function DrawingCanvas({
  strokes,
  activeStrokes,
  cursors,
  currentUserId,
  toolSettings,
  onStartStroke,
  onUpdateStroke,
  onEndStroke,
  onCursorMove,
  onFpsUpdate,
  canvasRef: externalCanvasRef,
}: DrawingCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const internalCanvasRef = useRef<HTMLCanvasElement>(null)
  const mainCanvasRef = externalCanvasRef || internalCanvasRef
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  // FPS tracking
  const frameCountRef = useRef(0)
  const lastTimeRef = useRef(Date.now())

  // For smooth path rendering
  const lastPointRef = useRef<Point | null>(null)

  // Resize handler
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({
          width: Math.floor(rect.width),
          height: Math.floor(rect.height),
        })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Draw a smooth path through points using quadratic curves
  const drawSmoothPath = useCallback(
    (ctx: CanvasRenderingContext2D, points: Point[], color: string, width: number, isEraser: boolean) => {
      if (points.length < 2) {
        // Single point - draw a dot
        if (points.length === 1) {
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2)
          ctx.fill()
        }
        return
      }

      ctx.save()

      if (isEraser) {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.strokeStyle = 'rgba(0,0,0,1)'
      } else {
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = color
      }

      ctx.lineWidth = width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)

      // Use quadratic curves for smoother lines
      for (let i = 1; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2
        const midY = (points[i].y + points[i + 1].y) / 2
        ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY)
      }

      // Last point
      const lastPoint = points[points.length - 1]
      ctx.lineTo(lastPoint.x, lastPoint.y)

      ctx.stroke()
      ctx.restore()
    },
    []
  )

  // Draw shape (line, rectangle, circle)
  const drawShape = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      tool: ToolType,
      startPoint: Point,
      endPoint: Point,
      color: string,
      width: number,
      filled?: boolean
    ) => {
      ctx.save()
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      switch (tool) {
        case 'line': {
          ctx.beginPath()
          ctx.moveTo(startPoint.x, startPoint.y)
          ctx.lineTo(endPoint.x, endPoint.y)
          ctx.stroke()
          break
        }
        case 'rectangle': {
          const x = Math.min(startPoint.x, endPoint.x)
          const y = Math.min(startPoint.y, endPoint.y)
          const w = Math.abs(endPoint.x - startPoint.x)
          const h = Math.abs(endPoint.y - startPoint.y)
          
          if (filled) {
            ctx.fillRect(x, y, w, h)
          }
          ctx.strokeRect(x, y, w, h)
          break
        }
        case 'circle': {
          const centerX = (startPoint.x + endPoint.x) / 2
          const centerY = (startPoint.y + endPoint.y) / 2
          const radiusX = Math.abs(endPoint.x - startPoint.x) / 2
          const radiusY = Math.abs(endPoint.y - startPoint.y) / 2
          
          ctx.beginPath()
          ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2)
          if (filled) {
            ctx.fill()
          }
          ctx.stroke()
          break
        }
      }

      ctx.restore()
    },
    []
  )

  // Render a single stroke
  const renderStroke = useCallback(
    (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
      const { tool, points, color, width, startPoint, endPoint, filled } = stroke

      if (tool === 'line' || tool === 'rectangle' || tool === 'circle') {
        if (startPoint && endPoint) {
          drawShape(ctx, tool, startPoint, endPoint, color, width, filled)
        }
      } else {
        drawSmoothPath(ctx, points, color, width, tool === 'eraser')
      }
    },
    [drawShape, drawSmoothPath]
  )

  // Render all strokes on main canvas
  const renderMainCanvas = useCallback(() => {
    const canvas = mainCanvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, dimensions.width, dimensions.height)

    // Draw all completed strokes
    for (const stroke of strokes) {
      renderStroke(ctx, stroke)
    }

    // Draw active strokes (being drawn by users)
    activeStrokes.forEach((stroke) => {
      renderStroke(ctx, stroke)
    })

    // FPS tracking
    frameCountRef.current++
    const now = Date.now()
    if (now - lastTimeRef.current >= 1000) {
      onFpsUpdate?.(frameCountRef.current)
      frameCountRef.current = 0
      lastTimeRef.current = now
    }
  }, [strokes, activeStrokes, dimensions, renderStroke, onFpsUpdate, mainCanvasRef])

  // Render cursors on separate canvas for performance
  const renderCursors = useCallback(() => {
    const canvas = cursorCanvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear cursor canvas
    ctx.clearRect(0, 0, dimensions.width, dimensions.height)

    // Draw other users' cursors
    cursors.forEach((cursor) => {
      if (cursor.userId === currentUserId) return

      const { x, y, color, name, isDrawing: cursorDrawing } = cursor

      // Draw cursor circle
      ctx.beginPath()
      ctx.arc(x, y, 8, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 2
      ctx.stroke()

      // Draw inner dot if drawing
      if (cursorDrawing) {
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#FFFFFF'
        ctx.fill()
      }

      // Draw name label
      ctx.font = '12px sans-serif'
      ctx.fillStyle = color
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 3
      ctx.strokeText(name, x + 12, y + 4)
      ctx.fillText(name, x + 12, y + 4)
    })
  }, [cursors, currentUserId, dimensions])

  // Animation loop
  useEffect(() => {
    let animationId: number

    const render = () => {
      renderMainCanvas()
      renderCursors()
      animationId = requestAnimationFrame(render)
    }

    animationId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animationId)
  }, [renderMainCanvas, renderCursors])

  // Get point from event
  const getPoint = useCallback((e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = mainCanvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    let clientX: number, clientY: number

    if ('touches' in e) {
      clientX = e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0
      clientY = e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY ?? 0
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }, [mainCanvasRef])

  // Mouse/Touch handlers
  const handlePointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault()
      const point = getPoint(e)
      setIsDrawing(true)
      lastPointRef.current = point
      onStartStroke(point)
      onCursorMove(point.x, point.y, true)
    },
    [getPoint, onStartStroke, onCursorMove]
  )

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const point = getPoint(e)

      onCursorMove(point.x, point.y, isDrawing)

      if (!isDrawing) return

      // For shapes, always update (no distance threshold)
      if (toolSettings.tool === 'line' || toolSettings.tool === 'rectangle' || toolSettings.tool === 'circle') {
        onUpdateStroke(point)
        return
      }

      // Only add point if it moved enough (reduces jitter and network load)
      if (lastPointRef.current) {
        const dx = point.x - lastPointRef.current.x
        const dy = point.y - lastPointRef.current.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance < 2) return // Minimum distance threshold
      }

      lastPointRef.current = point
      onUpdateStroke(point)
    },
    [getPoint, isDrawing, onCursorMove, onUpdateStroke, toolSettings.tool]
  )

  const handlePointerUp = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false)
      lastPointRef.current = null
      onEndStroke()
    }
  }, [isDrawing, onEndStroke])

  const handlePointerLeave = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false)
      lastPointRef.current = null
      onEndStroke()
    }
  }, [isDrawing, onEndStroke])

  // Get cursor style based on tool
  const getCursorStyle = () => {
    const tool = toolSettings.tool
    
    if (tool === 'eraser') {
      const size = toolSettings.width
      return `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="white" stroke="black" strokeWidth="1"/></svg>') ${size / 2} ${size / 2}, crosshair`
    }
    
    if (tool === 'line' || tool === 'rectangle' || tool === 'circle') {
      return 'crosshair'
    }
    
    const size = Math.max(8, toolSettings.width)
    const color = encodeURIComponent(toolSettings.color)
    return `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${color}" stroke="white" strokeWidth="1"/></svg>') ${size / 2} ${size / 2}, crosshair`
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-white rounded-lg overflow-hidden shadow-inner"
      style={{ touchAction: 'none' }}
    >
      {/* Main drawing canvas */}
      <canvas
        ref={mainCanvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="absolute inset-0"
        style={{ cursor: getCursorStyle() }}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerLeave}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        onTouchCancel={handlePointerLeave}
      />

      {/* Cursor overlay canvas */}
      <canvas
        ref={cursorCanvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="absolute inset-0 pointer-events-none"
      />
    </div>
  )
}
