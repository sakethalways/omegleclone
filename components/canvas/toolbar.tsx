'use client'

import React from "react"

import { ToolSettings, BRUSH_COLORS, BRUSH_SIZES, ToolType } from '@/lib/drawing-types'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { 
  Paintbrush, 
  Eraser, 
  Undo2, 
  Redo2, 
  Trash2,
  Minus,
  Square,
  Circle,
  Download,
  Save,
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRef } from 'react'

interface ToolbarProps {
  settings: ToolSettings
  onSettingsChange: (settings: ToolSettings) => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onDownload: () => void
  onSaveSession: () => void
  onLoadSession: (file: File) => void
  canUndo: boolean
  canRedo: boolean
}

const TOOLS: { tool: ToolType; icon: React.ElementType; label: string; shortcut: string }[] = [
  { tool: 'brush', icon: Paintbrush, label: 'Brush', shortcut: 'B' },
  { tool: 'eraser', icon: Eraser, label: 'Eraser', shortcut: 'E' },
  { tool: 'line', icon: Minus, label: 'Line', shortcut: 'L' },
  { tool: 'rectangle', icon: Square, label: 'Rectangle', shortcut: 'R' },
  { tool: 'circle', icon: Circle, label: 'Circle', shortcut: 'C' },
]

export function Toolbar({
  settings,
  onSettingsChange,
  onUndo,
  onRedo,
  onClear,
  onDownload,
  onSaveSession,
  onLoadSession,
  canUndo,
  canRedo,
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onLoadSession(file)
      e.target.value = '' // Reset input
    }
  }

  const isShapeTool = settings.tool === 'line' || settings.tool === 'rectangle' || settings.tool === 'circle'

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-4 p-4 bg-card rounded-lg border border-border shadow-sm">
        {/* Tool Selection */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Tools
          </span>
          <div className="grid grid-cols-3 gap-2">
            {TOOLS.map(({ tool, icon: Icon, label, shortcut }) => (
              <Tooltip key={tool}>
                <TooltipTrigger asChild>
                  <Button
                    variant={settings.tool === tool ? 'default' : 'outline'}
                    size="icon"
                    onClick={() => onSettingsChange({ ...settings, tool })}
                    className="w-10 h-10"
                  >
                    <Icon className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{label} ({shortcut})</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* Fill option for shapes */}
        {(settings.tool === 'rectangle' || settings.tool === 'circle') && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="filled"
              checked={settings.filled}
              onCheckedChange={(checked) => 
                onSettingsChange({ ...settings, filled: checked === true })
              }
            />
            <Label htmlFor="filled" className="text-sm">Filled shape</Label>
          </div>
        )}

        {/* Color Selection */}
        {settings.tool !== 'eraser' && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Color
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {BRUSH_COLORS.map((color) => (
                <Tooltip key={color}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onSettingsChange({ ...settings, color })}
                      className={cn(
                        'w-8 h-8 rounded-md border-2 transition-all hover:scale-110',
                        settings.color === color
                          ? 'border-primary ring-2 ring-primary ring-offset-2'
                          : 'border-border'
                      )}
                      style={{ backgroundColor: color }}
                      aria-label={`Select color ${color}`}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{color}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        )}

        {/* Stroke Width */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {isShapeTool ? 'Stroke Width' : 'Size'}: {settings.width}px
          </span>
          <Slider
            value={[settings.width]}
            onValueChange={([value]) => onSettingsChange({ ...settings, width: value })}
            min={BRUSH_SIZES[0]}
            max={BRUSH_SIZES[BRUSH_SIZES.length - 1]}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between gap-1">
            {BRUSH_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => onSettingsChange({ ...settings, width: size })}
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded border text-xs font-medium transition-colors',
                  settings.width === size
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-accent'
                )}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Actions
          </span>
          <div className="grid grid-cols-3 gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={onUndo} 
                  disabled={!canUndo}
                  className="w-10 h-10 bg-transparent"
                >
                  <Undo2 className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Undo (Ctrl+Z)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={onRedo} 
                  disabled={!canRedo}
                  className="w-10 h-10 bg-transparent"
                >
                  <Redo2 className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Redo (Ctrl+Y)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={onClear} 
                  className="w-10 h-10 text-destructive hover:text-destructive bg-transparent"
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Clear Canvas</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Save/Load/Download */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Save / Export
          </span>
          <div className="grid grid-cols-3 gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={onDownload}
                  className="w-10 h-10 bg-transparent"
                >
                  <Download className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Download as PNG</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={onSaveSession}
                  className="w-10 h-10 bg-transparent"
                >
                  <Save className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Save Session</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-10 h-10 bg-transparent"
                >
                  <Upload className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Load Session</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>
    </TooltipProvider>
  )
}
