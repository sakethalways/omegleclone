'use client'

import { User, PerformanceMetrics, Operation } from '@/lib/drawing-types'
import { Users, Wifi, WifiOff, Activity, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'

interface UsersPanelProps {
  users: Map<string, User>
  currentUserId: string
  isConnected: boolean
  metrics: PerformanceMetrics
  operations: Operation[]
}

export function UsersPanel({ users, currentUserId, isConnected, metrics, operations }: UsersPanelProps) {
  const usersList = Array.from(users.values())
  const recentOperations = operations.slice(-10).reverse()

  return (
    <div className="flex flex-col gap-4 p-4 bg-card rounded-lg border border-border shadow-sm h-full">
      {/* Connection Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-500" />
          )}
          <span className="text-sm font-medium">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div
          className={cn(
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
          )}
        />
      </div>

      {/* Users List */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Online ({usersList.length})
          </span>
        </div>
        <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
          {usersList.map((user) => (
            <div
              key={user.id}
              className={cn(
                'flex items-center gap-2 p-2 rounded-md',
                user.id === currentUserId ? 'bg-accent' : 'bg-background'
              )}
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: user.color }}
              />
              <span className="text-sm truncate flex-1">
                {user.name}
                {user.id === currentUserId && (
                  <span className="text-muted-foreground ml-1">(You)</span>
                )}
              </span>
            </div>
          ))}
          {usersList.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No users online
            </p>
          )}
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Performance
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between p-2 bg-background rounded">
            <span className="text-muted-foreground">FPS</span>
            <span
              className={cn(
                'font-mono font-medium',
                metrics.fps >= 30
                  ? 'text-green-600'
                  : metrics.fps >= 15
                    ? 'text-yellow-600'
                    : 'text-red-600'
              )}
            >
              {metrics.fps}
            </span>
          </div>
          <div className="flex justify-between p-2 bg-background rounded">
            <span className="text-muted-foreground">Latency</span>
            <span
              className={cn(
                'font-mono font-medium',
                metrics.latency <= 100
                  ? 'text-green-600'
                  : metrics.latency <= 300
                    ? 'text-yellow-600'
                    : 'text-red-600'
              )}
            >
              {metrics.latency}ms
            </span>
          </div>
          <div className="flex justify-between p-2 bg-background rounded">
            <span className="text-muted-foreground">Strokes</span>
            <span className="font-mono font-medium">{metrics.strokesCount}</span>
          </div>
          <div className="flex justify-between p-2 bg-background rounded">
            <span className="text-muted-foreground">Users</span>
            <span className="font-mono font-medium">{metrics.usersCount}</span>
          </div>
        </div>
      </div>

      {/* Operation History */}
      <div className="space-y-2 flex-1 min-h-0">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            History ({operations.length})
          </span>
        </div>
        <ScrollArea className="h-[150px]">
          <div className="space-y-1.5 pr-2">
            {recentOperations.length > 0 ? (
              recentOperations.map((op) => (
                <div
                  key={op.id}
                  className="flex items-center gap-2 p-2 bg-background rounded text-xs"
                >
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      op.type === 'stroke_add'
                        ? 'bg-green-500'
                        : op.type === 'stroke_remove'
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    )}
                  />
                  <span className="truncate flex-1">
                    <span className="font-medium">{op.userName}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      {op.type === 'stroke_add'
                        ? 'added stroke'
                        : op.type === 'stroke_remove'
                          ? 'removed stroke'
                          : 'cleared canvas'}
                    </span>
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                No operations yet
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
