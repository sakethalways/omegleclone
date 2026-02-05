# Testing Guide for Omegle Platform Fixes

## Quick Start Testing (5 minutes)

### Basic Setup
1. Open terminal and navigate to project: `cd c:\Users\SAKETH\Downloads\chatting`
2. Start dev server: `npm run dev`
3. Open http://localhost:3000 in two separate browser windows (or use incognito)

### Test 1: Message Sending (2 minutes)
```
Browser 1 [User A]:
- Enter username "Alice"
- Select interests (e.g., "Gaming", "Movies")
- Click "Find Match"
- Wait for match...

Browser 2 [User B]:
- Enter username "Bob"
- Select same interests
- Click "Find Match"
- Wait for match...

Both users should see match confirmation with:
✓ Matched user name
✓ Common interests displayed
✓ Chat window opens

User A: Type "Hello" → Press Enter
Expected: Message appears in User A's chat immediately
Expected: Message appears in User B's chat within 1 second
Expected: No duplicate messages

User B: Type "Hi there!" → Press Enter
Expected: Message appears in User B's chat immediately
Expected: Message appears in User A's chat within 1 second
```

### Test 2: Queue Position (2 minutes)
```
Open 3 browser windows with different incognito/cookie sessions

Window 1: Join queue with interests → See "Position 1 of 1"
Window 2: Join queue with interests → Window 1 updates to "1 of 2", Window 2 shows "2 of 2"
Window 3: Join queue with interests → All update accordingly
  - Window 1: "1 of 3"
  - Window 2: "2 of 3"
  - Window 3: "3 of 3"

Window 1: Click Cancel
Expected: Windows 2 and 3 update to:
  - Window 2: "1 of 2"
  - Window 3: "2 of 2"
```

### Test 3: User Disconnect (1 minute)
```
After Test 1 - Both users in chat:

User A: Click "Skip" button
Expected in User A: Returns to interest selection
Expected in User B: 
  - Error message "User disconnected (skip)"
  - Auto-redirects to interest selection
  - Messages disappear

Both can now rejoin and find new matches
```

---

## Detailed Test Cases

### Test Case 1: Message Delivery
**Objective**: Verify messages are delivered bidirectionally without duplication

**Setup**: 
- 2 users in chat

**Steps**:
1. User A sends: "Test message 1"
2. User B sends: "Response 1"
3. User A sends: "Test message 2"
4. User B sends: "Response 2"
5. User A sends: "Final test"

**Expected Results**:
- Messages appear in order
- No duplicate messages
- Messages show in both directions immediately
- Sender name is correct
- Timestamps are present

**Failure Indicators**:
- ✗ Messages don't appear
- ✗ Duplicate messages appear
- ✗ Messages only go one direction
- ✗ Wrong sender name

---

### Test Case 2: Queue Management
**Objective**: Verify queue position updates correctly

**Setup**: 
- Multiple users joining queue simultaneously

**Steps**:
1. User 1 joins → Shows "Position 1 of 1"
2. User 2 joins → User 1 updates to "1 of 2", User 2 shows "2 of 2"
3. User 3 joins → All update: 1 of 3, 2 of 3, 3 of 3
4. User 1 cancels → User 2 becomes "1 of 2", User 3 becomes "2 of 2"
5. User 2 cancels → User 3 becomes "1 of 1"

**Expected Results**:
- Positions always show actual count
- Numbers never go backward (unless canceling)
- Total count is accurate
- Updates are within 1-2 seconds

**Failure Indicators**:
- ✗ Shows "Position 1 of 11" when only 1 person waiting
- ✗ Position doesn't update when others leave
- ✗ Total shows old count (cache issue)
- ✗ Positions are off by one

---

### Test Case 3: User Disconnection Handling
**Objective**: Verify both users are properly notified when one leaves

**Setup**:
- 2 matched users in chat

**Steps**:
1. User A sends message: "Hi Bob"
2. User B sees message and responds: "Hi Alice"
3. User A clicks "Skip"
4. Observe User B's response

**Expected Results**:
- User A immediately returns to interest selection
- User B receives "User disconnected (skip)" message
- User B is redirected to interest selection
- Both can rejoin independently and find new matches
- Messages stop flowing once one user leaves

**Failure Indicators**:
- ✗ User B doesn't see disconnect message
- ✗ User B is stuck in chat view
- ✗ User B can still send messages (they go nowhere)
- ✗ Error messages don't appear

---

### Test Case 4: Reconnection Logic
**Objective**: Verify users can keep chatting with different people

**Setup**:
- 3+ users available

**Steps**:
1. User A matches with User B
2. User A clicks "Skip"
3. User A should rejoin queue
4. User A should match with User C
5. User A can chat with User C
6. Repeat skip and match

**Expected Results**:
- Users can match multiple times
- Each new match has fresh message history
- Queue positions update correctly after each skip
- All users stay in sync

**Failure Indicators**:
- ✗ User A gets stuck in waiting forever
- ✗ User A rematches with same person
- ✗ Old messages appear in new chat
- ✗ Queue positions become inconsistent

---

### Test Case 5: Typing Indicator
**Objective**: Verify typing indicators work

**Setup**:
- 2 users in chat

**Steps**:
1. User A starts typing but doesn't send
2. Observe User B's screen
3. User A stops typing
4. Observe User B's screen

**Expected Results**:
- Typing dots appear in User B's chat when User A types
- Typing dots disappear after 2 seconds of inactivity
- No false positives

**Failure Indicators**:
- ✗ Typing indicator never appears
- ✗ Typing indicator never disappears

---

### Test Case 6: Block User
**Objective**: Verify blocked users don't rematch

**Setup**:
- 2 matched users

**Steps**:
1. User A and User B in chat
2. User A clicks "Block"
3. User A returns to interest selection and rejoins
4. Have User B also rejoin queue
5. Repeat matching test with 3+ users to see if A and B rematch

**Expected Results**:
- User A and User B do not rematch
- Either get matched with different users
- Block persists for session

**Failure Indicators**:
- ✗ Blocked users rematch with each other

---

### Test Case 7: Session Cleanup
**Objective**: Verify old session data doesn't cause issues

**Setup**:
- Repeated joins and leaves

**Steps**:
1. Create 10 users, have them join and immediately leave
2. Have 5 new users join queue
3. Check queue positions
4. Have matches occur

**Expected Results**:
- Queue shows only current users
- No "ghost" positions
- Old user data is cleaned up
- Performance is normal

**Failure Indicators**:
- ✗ Queue shows 15 when only 5 are active
- ✗ Performance degrades
- ✗ Stale user data causes errors

---

## Automated Browser Testing Script

### For Chrome DevTools Console Testing:

```javascript
// Test 1: Monitor message delivery
const messageTest = async () => {
  console.log("Monitoring messages from event handlers...");
  const originalLog = console.log;
  let messageCount = 0;
  console.log = function(...args) {
    if (args[0]?.includes?.("Message received")) {
      messageCount++;
      console.log(`Message ${messageCount}: ${args}`);
    }
    originalLog.apply(console, args);
  };
};

// Test 2: Check polling rate
const pollingTest = () => {
  let pollCount = 0;
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    if (args[0]?.includes?.("poll")) {
      pollCount++;
    }
    return originalFetch.apply(window, args);
  };
  setInterval(() => {
    console.log(`Polls per 10s: ${pollCount}`);
    pollCount = 0;
  }, 10000);
};
```

---

## Common Issues and Troubleshooting

### Issue: Messages show in one direction only
**Solution**: 
- Check browser DevTools → Network tab
- Verify `send_message` POST request returns 200
- Check if message appears in room.messages on server
- Ensure polling interval is running (every 500ms)

### Issue: Queue position shows wrong number
**Solution**:
- Hard refresh page (Ctrl+Shift+R)
- Check that localStorage/cache isn't holding old data
- Verify totalWaiting is being sent from backend
- Check that updateQueuePositions() is called on join/leave

### Issue: User gets stuck after disconnect
**Solution**:
- Check if user is still in queue on backend
- Verify sessions and users Maps are cleaned up
- Check if polling interval is cleared
- Check browser console for errors

### Issue: Same user keeps matching twice
**Solution**:
- Verify recent matches aren't being cleared
- Check if matching engine recordMatch() is called
- Ensure blocked list is persistent during session

---

## Performance Benchmarks

### Expected Metrics:
- Message delivery: < 1 second
- Queue update: < 2 seconds
- Poll frequency: 500ms (every poll returns in < 100ms)
- Heartbeat frequency: 30 seconds
- Memory usage: < 50MB for 100 users in queue
- No memory leaks after 1000 joins/disconnects

---

## Debug Commands

```bash
# Build and test locally
npm run build

# Run in development mode with logging
npm run dev

# Check for type errors
npx tsc --noEmit

# Running specific tests (add test suite if created)
npm test
```

---

## Rollback Plan

If issues occur after deployment:

1. Revert chat route: `git checkout app/api/chat/route.ts`
2. Revert components: `git checkout components/chat/omegle-app.tsx`
3. Revert hooks: `git checkout hooks/use-chat.ts`
4. Rebuild: `npm run build`
5. Redeploy

---

## Success Criteria

✅ All tests pass without errors
✅ No duplicate messages
✅ Queue count always matches actual users
✅ Users disconnect properly and don't hang
✅ Reconnection works seamlessly
✅ No memory leaks after extended use
✅ Performance metrics within expected range
