# Omegle Chat Platform - Architecture Documentation

## System Overview

This is a real-time anonymous chat platform designed for instant user matching based on shared interests. The system uses Server-Sent Events (SSE) for real-time server-to-client updates and HTTP POST for client-to-server actions.

```
┌─────────────┐                    ┌──────────────────┐
│  Browser 1  │◄──────SSE────────►│                  │
│  (User 1)   │                    │                  │
└─────────────┘                    │  Next.js Server  │
     │                             │  (In-Memory DB)  │
     │ HTTP POST                   │                  │
     └──────────────────────────────────────────────┐ │
                                   │                │ │
┌─────────────┐                    │ ┌─────────────┘ │
│  Browser 2  │◄──────SSE────────►│ │               │
│  (User 2)   │                    │ │ Users Map     │
└─────────────┘                    │ │ Rooms Map     │
     │                             │ │ Queue List    │
     │ HTTP POST                   │ │ Sessions      │
     └──────────────────────────────────────────────────┘
                                   │
                          Matching Engine
                      (Interest-based scoring)
```

## Data Structures

### ChatUser
```typescript
{
  id: string;              // "user_1234567890_abc123"
  name: string;            // "Alice" or auto-generated
  interests: string[];     // ["Gaming", "Music"]
  status: "waiting" | "matched" | "chatting" | "offline";
  connectedAt: number;     // Timestamp when joined queue
  lastHeartbeat: number;   // Last heartbeat time
  blockedUsers: string[];  // User IDs this user blocked
  color: string;           // "#FF6B6B" (display color)
}
```

### ChatRoom
```typescript
{
  id: string;              // "room_1234567890_def456"
  user1Id: string;         // First matched user ID
  user2Id: string;         // Second matched user ID
  user1Name: string;       // Display name
  user2Name: string;       // Display name
  commonInterests: string[]; // Interests both share
  messages: ChatMessage[]; // Chat history for session
  createdAt: number;       // Match timestamp
  lastActivity: number;    // Last message time
}
```

### ChatMessage
```typescript
{
  id: string;              // "msg_1234567890_ghi789"
  senderId: string;        // Sender user ID
  senderName: string;      // Sender display name
  content: string;         // Message text
  timestamp: number;       // When sent
  delivered: boolean;      // Delivery status
}
```

### UserSession
```typescript
{
  userId: string;          // Unique user identifier
  userName: string;        // Display name
  interests: string[];     // Selected interests
  sessionToken: string;    // Temporary auth token
  roomId: string | null;   // Current chat room
  queuePosition: number;   // Position in matching queue
  matchedUserId: string | null; // Current match
  blockedUsers: string[];  // Block list for session
}
```

## User Flow Diagram

```
        START
          │
          ▼
  ┌─────────────────────┐
  │ Interest Selection  │ ← Users enter name (optional)
  │ Select 1+ interests │
  └──────────┬──────────┘
             │ POST /api/chat?action=join_queue
             │ (userName, interests[])
             ▼
  ┌─────────────────────┐
  │  Matching Queue     │
  │                     │
  │ Queue Position: N   │ ← Real-time position updates via SSE
  │ Total Waiting: M    │
  │                     │
  │ Wait for match...   │
  └──────────┬──────────┘
             │ Matching engine runs every 2 seconds
             │ (calculateScore for all pairs)
             ▼
  ┌──────────match_found event──────┐
  │                                 │
  ├─────────────────────────────────┤
  │ ChatWindow Created              │
  │ - User info & common interests  │
  │ - Message history               │
  │ - Typing indicators             │
  │                                 │
  │ Controls:                       │
  │ [Skip] [Block] [Exit]           │
  └──────────┬──────────┬───────────┘
             │          │
        Skip │          │ Exit/Disconnect
             │          │
    ┌────────▼──────┐   └───────────────────┐
    │ Return to     │                       │
    │ Queue         │              Cleanup & Disconnect
    │ (if interests │              - Remove from room
    │  still same)  │              - Return to interests
    │               │
    └───────────────┘
```

## Matching Algorithm

### Scoring System

```
Score = (common_interests * 10)
       - (wait_time_difference / 1000)
       - (recently_matched ? 50% penalty : 0)
```

**Algorithm Flow:**

```
Input: User queue [Alice, Bob, Carol, David]
       with interests and last heartbeat times

Step 1: Calculate pairwise scores
  ┌────────────────────────────────────┐
  │ Alice (Gaming, Music)              │
  │ vs Bob (Music, Sports)             │
  │ Common: Music                      │
  │ Score: 10 - 0 - 0 = 10 ✓           │
  │                                    │
  │ Alice vs Carol (Gaming, Art)       │
  │ Common: Gaming                     │
  │ Score: 10 - 50 - 0 = -40           │
  │ (recently matched, penalty)        │
  │                                    │
  │ Bob vs Carol (Music, Art)          │
  │ Common: None                       │
  │ Score: -1 ✗                        │
  │                                    │
  │ Bob vs David (Music, Tech)         │
  │ Common: Music                      │
  │ Score: 10 - 5 - 0 = 5              │
  │                                    │
  │ Carol vs David (Gaming, Tech)      │
  │ Common: None                       │
  │ Score: -1 ✗                        │
  └────────────────────────────────────┘

Step 2: Select best pair
  Alice ↔ Bob (Score: 10)

Step 3: Create room, remove from queue
  Queue now: [Carol, David]

Step 4: Send match_found to both
  Alice: { matchedUser: Bob, ... }
  Bob: { matchedUser: Alice, ... }

Step 5: Update remaining queue positions
  Carol: position = 1
  David: position = 2
```

### Preventing Re-matches

```
When users are matched:
├─► Record in recentMatches map
│   recentMatches.set(Alice.id, Set(Bob.id))
│   recentMatches.set(Bob.id, Set(Alice.id))
│
└─► Auto-expire after 1 hour
    setTimeout(() => {
      recentMatches.delete(Alice.id, Bob.id)
    }, 60 * 60 * 1000)

If users skip and rejoin:
├─► Alice skips Bob
├─► Both return to queue
├─► Within 1 hour: Won't re-match (penalty kicks in)
└─► After 1 hour: Can match again
```

## Real-Time Communication Flow

### Message Sending Sequence

```
User types message, clicks Send
        │
        ▼
JavaScript fetch() to POST /api/chat
  - action: "send_message"
  - userId: "user_123"
  - roomId: "room_456"
  - content: "Hello!"
        │
        ▼
    API Route Handler
        │
        ├─► Validate roomId exists
        │
        ├─► Store in ChatRoom.messages
        │   room.messages.push({
        │     id, senderId, senderName,
        │     content, timestamp, delivered
        │   })
        │
        ├─► Find both users' SSE connections
        │
        ├─► Broadcast to User 1
        │   controller.enqueue("data: {...}\n\n")
        │
        └─► Broadcast to User 2
            controller.enqueue("data: {...}\n\n")
        │
        ▼
Client SSE Listeners
  - EventSource.onmessage
  - Parse JSON message event
  - setMessages(prev => [...prev, msg])
  - Scroll to bottom
  - Re-render chat UI
```

### Server-Sent Events (SSE) Protocol

**Connection Establishment:**
```
1. Client opens SSE stream
   GET /api/chat?action=stream&userId=user_123
   
2. Server creates readable stream
   └─► Start handler:
       ├─ Save controller to clientConnections map
       ├─ Send "connected" confirmation
       └─ Send current queue position (if in queue)
   
3. Connection persists until:
   - User disconnects
   - Network fails (client auto-reconnects)
   - Server closes (cleanup)
```

**Event Format:**
```
Format: "data: {JSON}\n\n"

Example messages:

data: {"type":"match_found","payload":{"matchedUser":{"id":"user_456","name":"Bob","interests":["Music","Gaming"],"color":"#4ECDC4"},"roomId":"room_789","commonInterests":["Music"]}}

data: {"type":"message_received","payload":{"id":"msg_001","senderId":"user_456","senderName":"Bob","content":"Hi there!","timestamp":1702345678901,"delivered":true}}

data: {"type":"typing_update","payload":{"isTyping":true}}

data: {"type":"user_left","payload":{"reason":"disconnect","userLeftId":"user_456"}}

data: {"type":"queue_update","payload":{"position":3,"totalWaiting":5}}
```

**Event Types:**
```
Server → Client Events:

1. match_found
   Payload: { matchedUser, roomId, commonInterests }
   When: Users matched by algorithm

2. message_received
   Payload: { id, senderId, senderName, content, timestamp }
   When: New message arrives

3. typing_update
   Payload: { isTyping: boolean }
   When: User types or stops typing

4. queue_update
   Payload: { position, totalWaiting }
   When: Queue changes (join/match/disconnect)

5. user_left
   Payload: { reason: "disconnect"|"skip"|"block", userLeftId }
   When: Other user leaves conversation

6. connection_error
   Payload: { message }
   When: Fatal error occurs
```

## Room Lifecycle

```
┌───────────────────────────────────────────────────────────┐
│                    ROOM LIFECYCLE                         │
└───────────────────────────────────────────────────────────┘

CREATION:
  ├─ Matching algorithm selects best pair
  │
  └─► Create ChatRoom
      ├─ id = generateRoomId()
      ├─ user1Id = Alice.id
      ├─ user2Id = Bob.id
      ├─ commonInterests = ["Music"]
      ├─ messages = []
      ├─ createdAt = Date.now()
      └─ lastActivity = Date.now()

ACTIVE:
  ├─ Users exchange messages
  ├─ room.messages array grows
  ├─ room.lastActivity updated on each message
  └─ Both users can skip/block/disconnect

END CONDITIONS:

  User A disconnects
           ↓
  Room cleanup triggered
           ↓
  ├─ Send "user_left" to User B via SSE
  ├─ User B status → "waiting"
  ├─ User B added back to queue
  ├─ Delete room from rooms map
  └─ Free memory

Similar for:
- User A clicks "Skip"
- User A clicks "Block"
- User B disconnects
- Connection timeout (no heartbeat for 60s)
```

## Queue Management System

```
Queue Operations:

1. JOIN_QUEUE
   ├─ Create new ChatUser
   ├─ Create new UserSession
   ├─ queue.push(user)
   └─ updateQueuePositions()
   
   Result: User added to end of queue

2. PERFORM_MATCHING (every 2 seconds)
   ├─ Get all users in queue
   ├─ For each pair:
   │  └─ if (calculateScore() > 0)
   │     ├─ Create ChatRoom
   │     ├─ Remove both from queue
   │     └─ Send match_found events
   └─ updateQueuePositions()
   
   Result: Matched pairs removed, others move up

3. SKIP_USER
   ├─ Find room by roomId
   ├─ Notify other user: "user_left" (reason: skip)
   ├─ Reset both users status → "waiting"
   ├─ Add both back to queue
   ├─ Delete room
   └─ updateQueuePositions()
   
   Result: Both rejoin queue, queue reordered

4. DISCONNECT
   ├─ If in room:
   │  ├─ Notify other user: "user_left" (reason: disconnect)
   │  ├─ Reset other user to queue
   │  └─ Delete room
   ├─ If in queue:
   │  └─ Remove from queue
   ├─ Delete session
   ├─ Close SSE connection
   └─ updateQueuePositions()
   
   Result: Clean removal from system

Queue Position Update:
  For each user in queue (index by index):
    Send SSE event: queue_update
      position: index + 1
      totalWaiting: queue.length
```

## Heartbeat System

```
Client Side:
┌──────────────────────────────────────────┐
│ Heartbeat Timer (every 30 seconds)      │
│                                          │
│ fetch(/api/chat, {                       │
│   method: "POST",                        │
│   body: JSON.stringify({                 │
│     action: "heartbeat",                 │
│     userId: session.userId               │
│   })                                      │
│ })                                        │
│                                          │
│ Purpose: Keep connection alive,          │
│ signal server user is still active       │
└──────────────────────────────────────────┘
                │
                ▼
Server Side:
┌──────────────────────────────────────────┐
│ On heartbeat received:                  │
│                                          │
│ user = users.get(userId)                │
│ user.lastHeartbeat = Date.now()         │
│                                          │
│ Purpose: Track active users,            │
│ identify stale/dead connections         │
└──────────────────────────────────────────┘

Optional: Periodic Cleanup
  Every 5 minutes:
    For each user:
      if (Date.now() - user.lastHeartbeat > 60000):
        - Assume connection dropped
        - Clean up orphaned room
        - Notify other user
        - Remove from queue
```

## Typing Indicator Flow

```
User starts typing
        │
        ▼
handleInputChange() triggered
        │
        ├─► If NOT isTyping:
        │   ├─ setIsTyping(true)
        │   └─ POST /api/chat { action: "typing", isTyping: true }
        │
        └─► Always: clear 2-second timeout & restart
            └─ setTimeout(() => {
                 if (still no input for 2s):
                   ├─ setIsTyping(false)
                   └─ POST /api/chat { action: "typing", isTyping: false }
               }, 2000)

Server receives typing=true:
        │
        ├─ Find ChatRoom by roomId
        ├─ Identify other user
        └─ Broadcast SSE event: typing_update
           {"type":"typing_update","payload":{"isTyping":true}}

Remote user receives typing_update event:
        │
        ├─ setIsRemoteTyping(true)
        └─ Render animation:
           <div className="animate-bounce">
             • • •
           </div>

After 2 seconds of no input:
        │
        └─ Client sends typing=false
           └─ Server broadcasts isTyping: false
              └─ Remote user removes animation
```

## Block List Implementation

```
Block Mechanism:

1. User clicks "Block" button
   │
   └─► fetch(/api/chat, {
         method: "POST",
         body: {
           action: "block_user",
           userId: Alice.id,
           blockedUserId: Bob.id
         }
       })

2. Server receives block_user action
   │
   ├─► user = users.get(Alice.id)
   ├─► if (!user.blockedUsers.includes(Bob.id))
   │   └─► user.blockedUsers.push(Bob.id)
   │
   └─► session = sessions.get(Alice.id)
       └─► session.blockedUsers.push(Bob.id)

3. Effect on future matching
   │
   └─► When calculating next match for Alice:
       │
       └─► for (candidate of availableUsers):
             if (Alice.blockedUsers.includes(candidate.id))
               continue; // Skip blocked user
             
             calculateScore(Alice, candidate)

4. Skip to next match
   │
   └─► After blocking:
       ├─ Return other user to queue
       ├─ Delete room
       ├─ Return Alice to queue
       └─ Both will re-enter matching pool

5. Session persistence
   │
   └─► Block list stored in:
       ├─ ChatUser.blockedUsers (in-memory)
       └─ UserSession.blockedUsers (session)
   
   Duration: Until user disconnects
   
   Future enhancement: Store in database for 
   permanent block list across sessions
```

## Conflict Resolution Strategy

### Simultaneous User Disconnections

```
Scenario: Both users disconnect at exactly same time

Time T0: User A sends POST /api/chat
         { action: "disconnect", userId: A }
         
Time T0: User B sends POST /api/chat
         { action: "disconnect", userId: B }

Server processes A's disconnect:
├─ Find room with A and B
├─ Delete room from rooms map
├─ Send "user_left" SSE to B (if connected)
└─ Remove B from any collection

Server processes B's disconnect:
├─ Try to find room with B
│  └─ Already deleted, so room = null
├─ Skip room cleanup (already done)
├─ Try to find A in queue
│  └─ Not in queue, skip
└─ Remove B from collections
   (second time, but safe - already gone)

Result: Both properly cleaned up, no errors
```

### Both Users Skip Simultaneously

```
Scenario: Alice clicks "Skip" and Bob clicks "Skip"
          in same 1ms window

Room state: { user1Id: Alice.id, user2Id: Bob.id }

Time T0: Alice's skip received
├─ Remove Alice from room
├─ Add Alice back to queue
├─ Notify Bob: "user_left" (skip)
└─ room still exists

Time T0+1ms: Bob's skip received
├─ Remove Bob from room
├─ Add Bob back to queue
├─ Try to notify Alice: (already left)
│  └─ Safe - SSE controller cleanup handles
└─ Delete room

Result: Both in queue, room deleted, safe
```

### Message Ordering

```
User A sends 3 rapid messages:
- "Hey" at T0
- "How are you?" at T0+50ms
- "What's up?" at T0+100ms

Server receives in order (TCP guarantees):
T0:     -> store msg1 in room.messages
T0+50:  -> store msg2 in room.messages
T0+100: -> store msg3 in room.messages

Broadcasting via SSE:
- msg1 event enqueued first
- msg2 event enqueued second
- msg3 event enqueued third

Client receives in order:
- msg1 received first
- msg2 received second
- msg3 received third

UI renders chronologically:
messages = [msg1, msg2, msg3]

Result: Perfect ordering maintained
```

## Scalability Path

### Phase 1: Current (MVP - In-Memory)

```
Characteristics:
├─ Single server instance
├─ In-memory data structures (Maps, Arrays)
├─ ~50-100 concurrent users max
├─ Data lost on server restart
└─ No horizontal scaling

Suitable for:
- Development/testing
- MVP launch
- < 1000 daily users
```

### Phase 2: Add Redis

```
Transition:
├─ Replace Map with Redis
├─ Store sessions with TTL
├─ Use pub/sub for room broadcasts
└─ Enable horizontal scaling

Architecture:
  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │ Server1 │  │ Server2 │  │ Server3 │
  └────┬────┘  └────┬────┘  └────┬────┘
       │            │            │
       └────────────┼────────────┘
                    │
              ┌─────▼─────┐
              │   Redis   │
              │ Pub/Sub   │
              └───────────┘

Benefits:
- Scale to 10k+ concurrent users
- Persistent sessions (TTL)
- Cross-server room coordination
```

### Phase 3: Add Database

```
Architecture:
  ┌─────────────────────────────┐
  │     Load Balancer           │
  └────┬───────────────┬────────┘
       │               │
  ┌────▼────┐      ┌───▼────┐
  │ Server 1 │      │ Server2 │
  └────┬────┘      └───┬────┘
       │               │
       └───────┬───────┘
               │
         ┌─────▼──────┐
         │   Redis    │
         │  Session   │
         │   Store    │
         └────┬───────┘
              │
         ┌────▼────────┐
         │ PostgreSQL  │
         │             │
         │ - Users     │
         │ - Messages  │
         │ - History   │
         │ - Analytics │
         └─────────────┘

Benefits:
- Persistent message history
- User profiles
- Analytics & metrics
- Audit trails
```

## Error Handling

### Client-Side Errors

```
1. Network Timeout
   ├─ Detect: fetch() times out
   ├─ Action: Show "Connection lost"
   ├─ Recovery: Auto-retry with exponential backoff
   └─ UI: Display reconnecting spinner

2. SSE Connection Drop
   ├─ Detect: EventSource.onerror
   ├─ Action: Close and re-establish
   ├─ Recovery: Reconnect with fresh stream
   └─ UI: Show connection status

3. Invalid Input
   ├─ Detect: No interests selected
   ├─ Action: Show validation message
   ├─ Recovery: Highlight required field
   └─ UI: Disable "Start" button

4. Room Not Found
   ├─ Detect: API returns 404
   ├─ Action: Return to interests screen
   ├─ Recovery: User can try again
   └─ UI: Show error modal

5. Message Send Failure
   ├─ Detect: fetch() fails
   ├─ Action: Keep message in input
   ├─ Recovery: Retry when connection restored
   └─ UI: Show "Failed to send" indicator
```

### Server-Side Errors

```
1. Room Not Found
   ├─ Detect: rooms.get(roomId) returns null
   ├─ Response: Return 404
   ├─ Logging: Log missing room
   └─ Client: Shows "User disconnected"

2. User Not Found
   ├─ Detect: users.get(userId) returns null
   ├─ Response: Return 400
   ├─ Action: Remove dead session
   └─ Client: Prompts to reconnect

3. Malformed Request
   ├─ Detect: Missing required fields
   ├─ Response: Return 400 + error message
   ├─ Logging: Log invalid request
   └─ Client: Shows generic error

4. SSE Connection Died
   ├─ Detect: controller.enqueue() throws
   ├─ Action: Remove from clientConnections
   ├─ Cleanup: Remove orphaned session (heartbeat)
   └─ Effect: Other user sees "User disconnected"
```

## Performance Optimizations

### Matching Algorithm

```
Current: O(n²) comparison every 2 seconds
For 50 users: 50 × 49 / 2 = 1225 comparisons

Optimization: Interest-based bucketing
├─ Pre-bucket users by interests
├─ Only compare users with overlapping interests
└─ Complexity: O(n × m) where m = avg bucket size

Example:
  Gaming users: [Alice, Carol, David]
  Music users: [Bob, Eve]
  
  Compare within game group: O(3²)
  Compare across groups: O(2×3) for Music-Gaming overlap
  
  Result: ~30% reduction in comparisons
```

### Message Broadcasting

```
Current: Synchronous broadcast
└─ find() → enqueue() → return
  Latency: 10-50ms per message

Optimization: Async queue with batching
├─ Add message to queue
├─ Return to client immediately
├─ Background worker batches messages
├─ Send batch every 16ms or 10 messages
└─ Latency: < 5ms perceived

Benefit: Handles burst traffic better
```

### Connection Pooling

```
Current: One SSE connection per user
├─ ~1KB memory per connection
├─ Clean up on disconnect
└─ OK for < 100 users

Scaling: Use WebSocket instead
├─ Lower overhead than SSE
├─ True bidirectional
├─ Better reconnection handling
└─ Supports 1000+ concurrent
```

## Testing Strategy

### Unit Tests

```
✓ Matching algorithm scoring
  - Common interest counting
  - Wait time fairness
  - Recent match penalty
  
✓ Interest matching
  - Overlap detection
  - Empty interest handling
  
✓ Block list logic
  - Add to block list
  - Prevent matching
  - Prevent duplicate blocks
```

### Integration Tests

```
✓ Queue operations
  - Join queue
  - Get matched
  - Skip user
  - Disconnect
  
✓ Message flow
  - Send message
  - Receive message
  - Message ordering
  - Room history
  
✓ Typing indicators
  - Send typing start
  - Auto-stop after 2 seconds
  - Remote receives updates
  
✓ Connection lifecycle
  - Initial connection
  - SSE stream events
  - Heartbeat
  - Graceful disconnect
```

### E2E Tests (Manual or Automated)

```
Test 1: Basic Chat Flow
├─ Open 2 browser tabs
├─ User 1: Select "Gaming, Music"
├─ User 2: Select "Music, Sports"
├─ Both join queue
├─ Match within 5 seconds
├─ Send messages back and forth
├─ Verify message order
└─ Disconnect both

Test 2: Skip and Re-queue
├─ Match 2 users
├─ User 1 skips
├─ Both return to queue
├─ Can match again if interests align

Test 3: Block Prevention
├─ Match 2 users
├─ User 1 blocks User 2
├─ User 2 can match with others
├─ User 1 never matched with User 2

Test 4: Typing Indicators
├─ User 1 starts typing
├─ User 2 sees "typing..."
├─ User 1 types for 3 seconds
├─ User 2 still sees indicator
├─ User 1 stops (2s timeout)
├─ User 2 sees indicator disappear

Test 5: Disconnect Handling
├─ Match 2 users
├─ User 1 closes browser
├─ User 2 sees "User disconnected"
└─ User 2 returns to queue
```

## Future Enhancements

1. **WebRTC Integration**
   - Video/audio calls between matched users
   - Screen sharing support

2. **Message Encryption**
   - End-to-end encryption
   - Privacy-first architecture

3. **Moderation System**
   - Toxicity detection (ML model)
   - Keyword filtering
   - User reports & review queue

4. **User Reputation**
   - Rating system (1-5 stars)
   - Block user feedback
   - Account warnings

5. **Persistent Storage**
   - PostgreSQL integration
   - Optional message history
   - User preferences

6. **Mobile App**
   - Native iOS/Android
   - Push notifications
   - Better UX for chat

7. **Interest Recommendations**
   - ML suggestions based on conversations
   - Popular interest trends

8. **Chat Rooms**
   - Group conversations (3+ users)
   - Interest-based public rooms
   - Private room creation

9. **File Sharing**
   - Image uploads
   - Attachment support
   - Virus scanning

10. **Analytics Dashboard**
    - Real-time user metrics
    - Match success rates
    - Latency monitoring
