# Comprehensive Test Plan for 1000+ Users

## Overview
This document outlines testing strategy for validating the system with 1000+ concurrent users, identifying potential failure modes, race conditions, and fallback scenarios.

---

## Test Execution Strategy

### Phase 1: Unit Tests (Individual Components)
#### 1.1 Queue Operations (CRITICAL)
**Test: Duplicate User Prevention**
```
✓ User joins queue
✓ User calls join_queue twice rapidly (network latency)
✗ Expected: User only appears once in queue
✗ Current: Could have duplicates (FIXED in pushToQueue)
```
- **Status**: FIXED - Added `isDuplicate` check
- **Test Case**: Load test with 100 rapid duplicate joins

**Test: removeFromQueue Atomicity**
```
✓ Queue has 100 users
✓ 20 concurrent skip operations
✗ Expected: Queue has exactly 80 remaining
✗ Current: Using Lua script (ATOMIC)
```
- **Status**: FIXED - Now using Lua script
- **Test Case**: Simulate 1000 users, 200 concurrent removes

**Test: Queue Size Performance**
```
✗ Queue with 1000 users
✗ getQueue() operation
✗ Expected: < 100ms response time
✗ Current: Unknown - NEEDS TESTING
```
- **Test Case**: Benchmark getQueue with 1000+ users
- **Issue**: Full queue iteration inefficient at scale
- **Solution Needed**: Pagination or cursor-based iteration

---

### Phase 2: Concurrency Tests (Race Conditions)

#### 2.1 Simultaneous Match Operations
**Scenario**: 500 users in queue, matching engine creates 250 matches simultaneously
```
User1 ─┐
       ├─→ Match
User2 ─┘

User3 ─┐
       ├─→ Match
User4 ─┘
...
```
**Issues to Test**:
1. User appears in multiple matches
2. User in queue AND matched simultaneously
3. Session not updated when room created
4. Events queued out of order

**Test Steps**:
- Add 500 users to queue
- Trigger matching algorithm
- Verify: Each user matched exactly once
- Verify: No user in queue AND matched
- Verify: Sessions correctly reference rooms
- **Expected Result**: All 250 matches successful, zero conflicts

---

#### 2.2 Duplicate Join Prevention (Race Condition)

**Scenario**: Network latency causes double-tap of "join queue" button
```
Time 1: POST /api/chat?action=join_queue
  │
  ├─ Check isUserInQueue (returns false)
  ├─ Create user object
  │
Time 2 (overlapping): POST /api/chat?action=join_queue (same userId)
  │
  ├─ Check isUserInQueue (still returns false, hasn't committed yet!)
  ├─ Create user object (DUPLICATE!)
  │
Time 1 continues:
  ├─ pushToQueue(user1)
Time 2 continues:
  ├─ pushToQueue(user2) ← DUPLICATE!
```

**Status**: PARTIALLY FIXED
- `pushToQueue` now checks for duplicates before adding
- But: Race condition window exists between check and push
- **Solution**: Use atomic Redis operation (WATCH/MULTI or Lua script)

**Test Case**:
- Send 10 concurrent requests with same userId
- Expected: User appears in queue exactly once
- Current: May have 1-10 entries due to race window

---

#### 2.3 Heartbeat & Timeout Inconsistency

**Test: Heartbeat Timeout Standardization**
```
Current state:
- Heartbeat expires: 120 seconds (Redis expiry)
- Offline detection: 30 seconds (hardcoded in validateUserConnection)
- Heartbeat age check: 30 seconds (in handler)
- Offline cleanup: 60 seconds (now standardized)

Issue: Inconsistent timeouts cause:
1. User offline but still has valid heartbeat key in Redis
2. User removed from queue but websocket still considers online
3. Duplicate cleanup attempts
```

**Status**: PARTIALLY FIXED
- Standardized to 60 seconds for most checks
- But: Heartbeat expires in 120 seconds (INCONSISTENT)
- **Fix Needed**: Make all timeouts 60 seconds, or 120 seconds

---

### Phase 3: Load Tests (Scale Testing)

#### 3.1 Queue Operations at Scale

**Test 3.1.1: Add 1000 Users to Queue**
```
Metrics:
- Time to add 1000 users sequentially: ___ms
- Target: < 5 seconds (5ms per user)
- Redis memory usage: ___MB
- Network bandwidth: ___Mbps
```

**Test 3.1.2: Match 1000 Users (500 pairs)**
```
Metrics:
- Time to match all 500 pairs: ___ms
- Target: < 1 second
- Redis operations: 500 × N ops per match
- Queue rebuild time: ___ms
```

**Test 3.1.3: Get Queue (1000 users)**
```
Metrics:
- Time: ___ms
- Target: < 100ms (currently O(N) - slow!)
- Memory peak: ___MB
- Network: ___MB
```

**Issues Identified**:
1. `getQueue()` loads entire queue into memory
2. `findMatches()` iterates entire queue
3. Multiple full queue traversals per matching cycle
4. No pagination or cursors for large datasets

---

#### 3.2 Memory Management at Scale

**Fallback Storage Issue**:
```javascript
const fallbackStorage = {
  users: new Map<string, ChatUser>(),        // 1000 × ChatUser
  rooms: new Map<string, ChatRoom>(),        // 500 × ChatRoom (500 matches)
  sessions: new Map<string, UserSession>(),  // 1000 × UserSession
  queue: [] as ChatUser[],                   // 1000 × ChatUser (dup!)
  userEvents: new Map<...>(),                // 1000 × Event[]
  userHeartbeat: new Map<...>(),             // 1000 × number
};
```

**Calculation**:
- ChatUser: ~500 bytes × 2 (in queue + users map) = 1000KB per 1000 users
- ChatRoom: ~1000 bytes × 500 = 500KB
- UserSession: ~600 bytes × 1000 = 600KB
- Events: ~200 bytes × 1000 × avg 5 events = 1MB
- **Total**: ~3-5 MB for 1000 users (acceptable but duplicative)

**Issue**: Queue stored twice (in fallback: rooms map AND queue array)

---

#### 3.3 Event Queue Overflow

**Scenario**: User misses 10 poll requests, events pile up
```
User1 receives 10 events per second
User1 goes offline for 5 seconds
Events queued: 10 × 5 = 50 events in memory
Total for 1000 users: 50,000 events in memory!
```

**Issue**:
- Events expire in 300 seconds (5 minutes)
- But events can pile up faster than polled
- No queue size limits

**Fix Needed**: Events per user limit, or streaming delivery

---

### Phase 4: Fallback & Error Scenarios

#### 4.1 Redis Connection Loss

**Test 4.1.1: Redis Unavailable on Startup**
```
✓ Server starts without Redis
✓ Users join queue (using fallback)
✓ Matching works (in-memory)
✓ Users can chat
✗ Only works for single server instance
```
- **Status**: WORKS but LIMITED
- **Issue**: Multi-server deployments fail
- **Fallback**: In-memory only (acceptable for dev)

**Test 4.1.2: Redis Loses Connection Mid-Operation**
```
Operation sequence:
1. GET room from Redis (success)
2. Modify room local
3. SET room back → REDIS DOWN!
4. Fallback storage has stale data
```
- **Status**: RISKY
- **Issue**: State inconsistency
- **Test**: Simulate Redis crash during heavy load

---

#### 4.2 Partial Operation Failures

**Test 4.2.1: Match Created, But Event Queue Fails**
```
1. performDirectMatch() creates room
2. Updates user statuses
3. Removes from queue
4. pushEvent() fails for user1
5. Result: User1 thinks waiting, actually matched!
```
- **Status**: POSSIBLE
- **Test**: Mock RedisService.pushEvent to fail
- **Fix Needed**: Wrap operations in transactions or add rollback

---

#### 4.3 Timeout & Cleanup Failures

**Test 4.3.1: User Session Expires While in Queue**
```
User joins → Session created → User goes AFK for 24 hours
Session expires (24h expiry)
User still in queue (no expiry)
Backend tries to process user but session is gone
```
- **Status**: POSSIBLE
- **Issue**: Queue and Sessions have different TTLs
- **Fix Needed**: Match TTLs or verify session before queue ops

---

### Phase 5: Performance Tests

#### 5.1 Polling at Scale

**Test 5.1.1: 1000 Users Polling Every 500ms**
```
Requests per second: 1000 / 0.5 = 2000 RPS
Each request: getEvents(), getUser(), getQueue() (if waiting)
Redis operations: ~3000 ops/sec
Total: 2000 × 3 = 6000 ops/sec
```
- **Target**: Handle 2000 RPS with < 100ms p99 latency
- **Server resource**: < 500MB memory, < 50% CPU
- **Test Tool**: Apache Bench or K6

---

#### 5.2 Matching Performance

**Test 5.2.1: Match 1000 Users Every 500ms**
```
Queue size: 1000
Matching cycle time: 500ms
Pairs found: ~500 (assuming good match distribution)
Operations per cycle:
  - getQueue: 1
  - findMatches: O(N²) computation
  - For each match: 4 SET (users, rooms, sessions×2), 2 LPUSH (events), 1 LREM (queue)
  - Total: 1 + computation + (500 × 9) = 4500+ operations
```
- **Target**: Complete in < 500ms
- **Current**: Likely exceeds limit
- **Issue**: O(N²) matching algorithm
- **Fix**: Optimize matching or increase cycle time

---

### Phase 6: Integration Tests

#### 6.1 Full User Journey - 1000 Concurrent

**Test 6.1.1: All-In Scenario**
```
1. 1000 users join queue simultaneously
2. Users get matched into 500 pairs
3. Each pair exchanges 10 messages
4. First user skips (goes back to waiting)
5. 2nd user ends chat (goes offline)
6. Repeat twice
```

**Metrics**:
- Total time: ___s
- Errors: ___
- Users in inconsistent state: ___
- Memory peak: ___MB
- Redis operations: ___count

---

#### 6.2 Chaos Injection

**Test 6.2.1: Random Disconnects**
```
- 10% of users randomly disconnect
- Repeat every 2 seconds
- Duration: 5 minutes
```
**Expected**: System recovers, no data loss

---

## Issues Found & Fixes Applied

### ✅ Issue #1: Duplicate Users in Queue
**Location**: `app/api/chat/route.ts` - join_queue action
**Status**: FIXED
- Added `isUserInQueue` check before pushing
- Added duplicate check in `pushToQueue` itself

### ⚠️ Issue #2: Race Condition in Join Queue
**Location**: `app/api/chat/route.ts` - join_queue action
**Status**: PARTIALLY FIXED
- Check and push are not atomic
- Solution: Use Redis WATCH/MULTI or atomic Lua script
- **Fix Required**: Implement atomic join_queue operation

### ✅ Issue #3: removeFromQueue Corruption
**Location**: `lib/redis-client.ts`
**Status**: FIXED - Using Lua script (atomic operation)

### ⚠️ Issue #4: Heartbeat Timeout Inconsistency
**Location**: Multiple locations
**Status**: PARTIALLY FIXED
- Standardized most timeouts to 60 seconds
- **Issue**: Redis heartbeat expires in 120 seconds
- **Fix Required**: Change to 60 seconds for consistency

### ⚠️ Issue #5: Queue Performance at Scale
**Location**: `lib/redis-client.ts` - getQueue()
**Status**: NOT FIXED
- Current: O(N) full queue load
- **Fix Required**: Implement pagination or cursor-based iteration
- **Impact**: Will cause latency with 1000+ users

### ⚠️ Issue #6: Matching Algorithm Complexity
**Location**: `lib/matching-algorithm.ts`
**Status**: NEEDS REVIEW
- Likely O(N²) or worse
- **Fix Required**: Optimize for 1000+ users

### ⚠️ Issue #7: Event Queue Overflow
**Location**: `lib/redis-client.ts` - pushEvent()
**Status**: NOT FIXED
- Events accumulate if polling is slow
- **Fix Required**: Add max queue size limit or implement streaming

### ⚠️ Issue #8: Session/User TTL Mismatch
**Location**: `lib/redis-client.ts`
**Status**: NOT FIXED
- Session: 24h expiry
- User/Queue: No explicit expiry (cleans on 60s heartbeat timeout)
- **Fix Required**: Align TTLs

### ⚠️ Issue #9: No Rollback on Partial Failures
**Location**: `app/api/chat/route.ts` - performDirectMatch
**Status**: NOT FIXED
- If one operation fails, state becomes inconsistent
- **Fix Required**: Implement transaction-like behavior

---

## Test Case Checklist

- [ ] 1000 users join sequentially
- [ ] 100 users join concurrently
- [ ] 500 one-tap duplicate joins
- [ ] Queue size benchmark (1000 users)
- [ ] Matching performance (1000 users, 500 pairs)
- [ ] Message delivery under load
- [ ] Offline user cleanup
- [ ] Redis failover
- [ ] Memory usage baseline
- [ ] Polling rate at 2000 RPS
- [ ] Heartbeat timeout consistency
- [ ] Session/User TTL consistency
- [ ] Event queue overflow protection
- [ ] Queue position accuracy
- [ ] Room cleanup after chat ends
- [ ] Block list persistence across sessions
- [ ] Blocked user prevents matching

---

## Critical Path Fixes (Priority Order)

### P0: Critical (System Breaking)
1. ✅ Fix duplicate queue entries (pushToQueue)
2. ⚠️ Make join_queue atomic (use Lua script)
3. ⚠️ Standardize all timeouts (use 60s everywhere)

### P1: High (Data Integrity)
4. ⚠️ Add transaction support for performDirectMatch
5. ⚠️ Implement event queue overflow protection
6. ⚠️ Align Session/User/Queue TTLs

### P2: Medium (Performance)
7. ⚠️ Optimize getQueue() with pagination
8. ⚠️ Profile and optimize matching algorithm
9. ⚠️ Add batch Redis operations

### P3: Low (Nice to Have)
10. Implement Redis connection pooling
11. Add rate limiting per user
12. Optimize memory usage in fallback

---

## Next Steps

1. Run Phase 1 tests (unit tests)
2. Fix identified issues in priority order
3. Run Phase 2 tests (concurrency)
4. Run Phase 3 tests (load tests with monitoring)
5. Run Phase 6 tests (integration and chaos)
6. Document results and create performance baseline
