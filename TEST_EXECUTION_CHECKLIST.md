# Test Execution Checklist - 1000+ User Scale

## Pre-Execution Checklist

- [x] Build passes without errors
- [x] No TypeScript compilation errors
- [x] All critical fixes implemented
- [x] Code reviewed for correctness
- [ ] Local environment setup
- [ ] Test database/Redis available

---

## Phase 1: Unit Tests (Component Level)

### 1.1 Atomic Join Queue Test

**Test ID**: `atomic-join-queue-001`
**Objective**: Verify join queue is atomic and prevents duplicates

```bash
# Simulate: 100 concurrent requests with same userId
Test Setup:
  - Clear Redis
  - Create test user ID: "test_user_123"
  
# Concurrent requests (100 simultaneous):
POST /api/chat
  action: "join_queue"
  userId: "test_user_123"
  userName: "TestUser"
  interests: ["Gaming"]
  
Expected Results:
  ✅ Queue contains exactly 1 entry for test_user_123
  ✅ All 100 requests return success (some may get isDuplicate=true)
  ✅ No duplicate entries in queue
  ✅ No exceptions in logs
  
Assertion Code:
  const queue = await RedisService.getQueue();
  const userEntries = queue.filter(u => u.id === "test_user_123");
  assert.equal(userEntries.length, 1, "User should be in queue exactly once");
```

**Status**: Not yet tested ❌

---

### 1.2 Heartbeat Timeout Consistency Test

**Test ID**: `heartbeat-consistency-001`
**Objective**: Verify all heartbeat timeouts are standardized to 60s

```bash
# Test 1: Redis expiry
- Set heartbeat for user
- Verify Redis key expires in 60 seconds (not 120)
- Check: redis.ttl("heartbeat:userId") === 60

Expected Results:
  ✅ Redis TTL is exactly 60 seconds
  ✅ Offline detection runs at 60s
  ✅ User cleanup happens at 60s
  ✅ No inconsistency between checks

# Test 2: Double-check HEARTBEAT_TIMEOUT constant
  const HEARTBEAT_TIMEOUT = 60000; // 60 seconds
  ✅ Appears in all cleanup logic
  ✅ Not hardcoded as different value elsewhere

# Test 3: Integration - simulate offline user
  - User joins queue
  - Stop sending heartbeats for 60+ seconds
  - Run cleanup
  - User should be removed from queue
  
Expected: User removed exactly at 60 second mark
```

**Status**: Not yet tested ❌

---

### 1.3 Event Queue Limits Test

**Test ID**: `event-queue-limits-001`
**Objective**: Verify event queue doesn't exceed 100 events per user

```bash
# Test Setup:
  - Create user
  - Queue 150 events (exceeds limit of 100)
  
# Expected Results:
  ✅ Queue size never exceeds 100
  ✅ First 50 events discarded (FIFO when full)
  ✅ Last 100 events retained
  ✅ Log warning: "Event queue full for user..."
  
Assertion:
  const events = await redisClient.lLen(`events:${userId}`);
  assert.lessOrEqual(events, 100, "Event queue should not exceed 100");
```

**Status**: Not yet tested ❌

---

### 1.4 Match Tracking Persistence Test

**Test ID**: `match-tracking-persistence-001`
**Objective**: Verify match tracking survives server restart

```bash
# Test Setup:
  - Start server
  - User A and User B match (recorded via RedisService.recordMatch)
  - Restart server (simulate: in-memory tracker cleared)
  - Try to match same users again
  
# Expected Results Before Fix:
  ❌ Users could be re-matched immediately (in-memory lost)
  
# Expected Results After Fix:
  ✅ Match record persists in Redis
  ✅ Trying to find match returns 50% score penalty
  ✅ Match prevented for 1 hour
  
Test Code:
  const recentlyMatched = await RedisService.haveRecentlyMatched("A", "B");
  assert.true(recentlyMatched, "Recent match should be tracked in Redis");
```

**Status**: Not yet tested ❌

---

### 1.5 Rollback on Match Failure Test

**Test ID**: `rollback-on-match-failure-001`
**Objective**: Verify partial failure doesn't corrupt state

```bash
# Test Setup:
  - Mock RedisService.pushEvent to fail on 3rd call
  - Call performDirectMatch(user1, user2)
  
# Expected Results:
  ❌ Before fix: Room created, users updated, but matches not queued (state corrupted)
  ✅ After fix:
    - Try to create room → Success
    - Try to update users → Success
    - Try to queue events → FAILS
    - Rollback: Delete room
    - Result: No room exists, users safe
    
Test Code:
  const roomBefore = await RedisService.getRoom(roomId);
  assert.null(roomBefore, "Room should not exist after rollback");
```

**Status**: Not yet tested ❌

---

### 1.6 Session Cleanup Test

**Test ID**: `session-cleanup-001`
**Objective**: Verify stale sessions are cleaned up

```bash
# Test Setup:
  - Create user and session
  - Delete user (simulate crash)
  - Session still exists in Redis (TTL = 24h)
  - Call RedisService.cleanupExpiredSessions()
  
# Expected Results:
  Before cleanup:
    ❌ Stale session still in Redis
  
  After cleanup:
    ✅ Stale session deleted
    ✅ Log: "Cleaned up stale session for user..."
    
Test Code:
  const sessionBefore = await RedisService.getSession(userId);
  const cleaned = await RedisService.cleanupExpiredSessions();
  const sessionAfter = await RedisService.getSession(userId);
  
  assert.exists(sessionBefore, "Session should exist before cleanup");
  assert.greater(cleaned, 0, "At least one session should be cleaned");
  assert.null(sessionAfter, "Session should be deleted after cleanup");
```

**Status**: Not yet tested ❌

---

## Phase 2: Integration Tests (System Level)

### 2.1 100 Concurrent Users Join Test

**Test ID**: `integration-100-users-join-001`
**Objective**: Verify 100 users can join queue simultaneously without issues

```bash
Test Parameters:
  - Concurrent users: 100
  - Execution method: Parallel HTTP requests
  - Timeout: 10 seconds
  
Expected Results:
  ✅ All 100 requests succeed (status 200)
  ✅ Queue length = 100 (no duplicates)
  ✅ Response time < 1 second per request
  ✅ No errors in logs
  ✅ Memory used < 10MB
  
Test Code:
  const promises = Array(100).fill(null).map((_, i) => 
    fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        action: 'join_queue',
        userName: `User${i}`,
        interests: ['Gaming']
      })
    })
  );
  
  const results = await Promise.all(promises);
  const failures = results.filter(r => !r.ok);
  assert.equal(failures.length, 0, "All joins should succeed");
```

**Status**: Not yet tested ❌

---

### 2.2 1000 Users Queue & Match Test

**Test ID**: `integration-1000-users-match-001`
**Objective**: Verify system can match 1000 users

```bash
Test Parameters:
  - Sequential join: 1000 users over 10 seconds (100/sec)
  - Automatic matching triggered after each user
  - Measure: Match completion time, accuracy
  
Expected Results:
  ✅ All 1000 users join successfully
  ✅ Matching finds ~500 pairs
  ✅ All 500 pairs visible in Redis rooms
  ✅ No queue corruption
  ✅ Matching completes in < 2000ms per cycle
  
Performance Targets:
  - Join 1000 users: < 10 seconds
  - Match 1000 users: < 500ms per cycle
  - Queue size check: < 100ms
  - Memory peak: < 50MB
```

**Status**: Not yet tested ❌

---

### 2.3 User Chat Flow Test

**Test ID**: `integration-chat-flow-001`
**Objective**: Verify complete chat workflow

```bash
Test Flow:
  1. User1 and User2 join queue
  2. Match found (match_found event)
  3. User1 sends message
  4. User2 receives message (message_received event)
  5. User1 skips
  6. Both returned to queue with delay
  7. Both rejoin and match with new partners
  
Expected Results:
  ✅ Match found within 1 second
  ✅ Messages delivered within 500ms
  ✅ Skip works correctly
  ✅ No users lost
  ✅ No duplicate matches
  
Test Duration: ~10 seconds
```

**Status**: Not yet tested ❌

---

## Phase 3: Load & Performance Tests

### 3.1 Queue Operations Performance

**Test ID**: `performance-queue-ops-001`
**Objective**: Benchmark queue operations at scale

```bash
Test Configuration:
  - Queue size: 1000 users
  - Iterations: 100 each
  
Benchmarks:
  ✅ getQueue() - Target: < 100ms
  ✅ isUserInQueue() - Target: < 50ms
  ✅ removeFromQueue() - Target: < 100ms
  ✅ pushToQueue() - Target: < 50ms
  ✅ popFromQueue() - Target: < 50ms
  
Reporting:
  - Average time
  - P95/P99 latency
  - Memory usage
  - GC pauses
```

**Status**: Not yet tested ❌

---

### 3.2 Matching Performance

**Test ID**: `performance-matching-001`
**Objective**: Benchmark matching algorithm

```bash
Test: findMatches() with 1000 users
  - Initial: 1000 users in queue
  - Expected pairs: ~500
  - Target: Complete in < 500ms
  
Metrics to track:
  ✅ Total execution time
  ✅ CPU usage (should be < 50%)
  ✅ Memory peak
  ✅ Pairs found
  ✅ Score distribution
```

**Status**: Not yet tested ❌

---

### 3.3 Polling at Scale

**Test ID**: `performance-polling-1000-001`
**Objective**: Verify system handles 1000 concurrent polling users

```bash
Test Setup:
  - 1000 users connected and polling every 500ms
  - Duration: 60 seconds
  
Expected Results:
  ✅ All polls return in < 500ms
  ✅ P99 latency < 200ms
  ✅ No errors
  ✅ Memory stable (no growth > 10MB)
  ✅ CPU < 60%
  
Load Calculation:
  - 1000 users × 2 polls/second = 2000 RPS
  - Each poll: getUser + getEvents = 2 Redis ops
  - Total: 4000 Redis ops/sec
  - This should be easily handled by Redis
```

**Status**: Not yet tested ❌

---

## Phase 4: Chaos & Resilience Tests

### 4.1 Redis Failure During Match

**Test ID**: `chaos-redis-failure-match-001`
**Objective**: Verify system recovers from Redis failure

```bash
Test Steps:
  1. Start matching process with 100 users
  2. Kill Redis mid-match
  3. System should:
    ✅ Fall back to in-memory storage
    ✅ Not crash
    ✅ Log the failure
    ✅ Users should be recoverable
    
Test Code:
  // Simulate Redis failure
  await killRedis();
  await performMatching(); // This should not crash
  
  // Verify fallback worked
  const user = await RedisService.getUser(userId);
  assert.exists(user, "User should be recoverable from fallback");
```

**Status**: Not yet tested ❌

---

### 4.2 Random User Disconnects

**Test ID**: `chaos-random-disconnects-001`
**Objective**: Verify system handles random disconnects

```bash
Test Setup:
  - 500 users in various states (waiting, matched, chatting)
  - Randomly disconnect 10% every 2 seconds
  - Duration: 5 minutes
  
Expected Results:
  ✅ No data corruption
  ✅ Partners notified (user_left event)
  ✅ Platform recovers automatically
  ✅ Memory stable
  ✅ No cascading failures
```

**Status**: Not yet tested ❌

---

### 4.3 Network Latency Simulation

**Test ID**: `chaos-network-latency-001`
**Objective**: Verify system handles slow network

```bash
Test Setup:
  - Inject 500ms latency on all Redis operations
  - Run standard chat flow with 100 users
  
Expected Results:
  ✅ Matching works (takes longer but succeeds)
  ✅ Messages delivered (delayed but intact)
  ✅ No timeout errors
  ✅ No data corruption
```

**Status**: Not yet tested ❌

---

## Test Execution Summary

| Phase | Test ID | Status | Notes |
|-------|---------|--------|-------|
| **Phase 1** |  |  |  |
| | atomic-join-queue-001 | ❌ | Not tested |
| | heartbeat-consistency-001 | ❌ | Not tested |
| | event-queue-limits-001 | ❌ | Not tested |
| | match-tracking-persistence-001 | ❌ | Not tested |
| | rollback-on-match-failure-001 | ❌ | Not tested |
| | session-cleanup-001 | ❌ | Not tested |
| **Phase 2** |  |  |  |
| | integration-100-users-join-001 | ❌ | Not tested |
| | integration-1000-users-match-001 | ❌ | Not tested |
| | integration-chat-flow-001 | ❌ | Not tested |
| **Phase 3** |  |  |  |
| | performance-queue-ops-001 | ❌ | Not tested |
| | performance-matching-001 | ❌ | Not tested |
| | performance-polling-1000-001 | ❌ | Not tested |
| **Phase 4** |  |  |  |
| | chaos-redis-failure-match-001 | ❌ | Not tested |
| | chaos-random-disconnects-001 | ❌ | Not tested |
| | chaos-network-latency-001 | ❌ | Not tested |

**Overall Progress**: 0/15 tests executed (0%)

---

## Test Run Instructions

### Setup
```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Start Redis (if using local)
redis-cli

# Terminal 3: Run tests
npm run test:load  # (once test suite is created)
```

### Execute Phase 1
```bash
npm run test:unit -- --grep "atomic-|heartbeat-|event-queue|match-tracking|rollback|session-cleanup"
```

### Execute Phase 2
```bash
npm run test:integration -- --timeout 60000
```

### Execute Phase 3
```bash
K6_VUS=1000 npm run test:load
```

### Execute Phase 4
```bash
npm run test:chaos -- --duration 300
```

---

## Success Criteria

**All tests must pass before deploying to production with 1000+ users**

- [ ] All Phase 1 tests pass
- [ ] All Phase 2 tests pass
- [ ] Phase 3 performance targets met
- [ ] All Phase 4 chaos scenarios handled gracefully
- [ ] No memory leaks detected
- [ ] No data corruption incidents
- [ ] P99 latency < 500ms
- [ ] Error rate < 0.1%

---

## Failure Handling

If any test fails:
1. Document failure with error logs
2. Identify root cause
3. Create fix with self-contained test
4. Re-run failing test
5. Verify fix doesn't break other tests
6. Update this checklist

---

**Last Updated**: 2026-02-06
**Test Plan Version**: 1.0
**System Version**: v1.1.0-scale-improvements
