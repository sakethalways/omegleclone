'use client'

import React from "react"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Paintbrush, Users } from 'lucide-react'

interface JoinRoomDialogProps {
  onJoin: (userName: string, roomId: string) => void
}

export function JoinRoomDialog({ onJoin }: JoinRoomDialogProps) {
  const [userName, setUserName] = useState('')
  const [roomId, setRoomId] = useState('default')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (userName.trim()) {
      onJoin(userName.trim(), roomId.trim() || 'default')
    }
  }

  const generateRoomId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let id = ''
    for (let i = 0; i < 6; i++) {
      id += chars[Math.floor(Math.random() * chars.length)]
    }
    setRoomId(id)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Paintbrush className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Collaborative Canvas</CardTitle>
          <CardDescription>
            Draw together in real-time with others
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="userName">Your Name</Label>
              <Input
                id="userName"
                type="text"
                placeholder="Enter your name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                required
                maxLength={20}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="roomId">Room Code</Label>
              <div className="flex gap-2">
                <Input
                  id="roomId"
                  type="text"
                  placeholder="default"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  maxLength={10}
                  className="font-mono uppercase"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={generateRoomId}
                  className="shrink-0 bg-transparent"
                >
                  New Room
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this code with others to draw together
              </p>
            </div>

            <Button type="submit" className="w-full" size="lg">
              <Users className="mr-2 h-4 w-4" />
              Join Canvas
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
