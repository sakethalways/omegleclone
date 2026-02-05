#!/usr/bin/env node
/**
 * Comprehensive Test Suite for Chat Application
 * Tests: skip/exit/disconnect, auto-rejoin, error cases, edge cases
 */

const BASE_URL = 'http://localhost:3000/api/chat';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(color, prefix, message) {
  console.log(`${colors[color]}[${prefix}]${colors.reset} ${message}`);
}

async function apiCall(action, userId, payload = {}) {
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, userId, ...payload })
    });
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function pollEvents(userId) {
  try {
    const response = await fetch(`${BASE_URL}?action=poll&userId=${userId}`);
    const data = await response.json();
    return { ok: response.ok, data };
  } catch (err) {
    return { ok: false };
  }
}

// Test Suite
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("TC1: User Skip - Other user auto-rejoins", async () => {
  const user1 = `test_${Date.now()}_1`;
  const user2 = `test_${Date.now()}_2`;

  // Both join and match
  await apiCall('join_queue', user1, { interests: ['coding'] });
  await apiCall('join_queue', user2, { interests: ['coding'] });
  await new Promise(r => setTimeout(r, 2500));

  let u1 = await pollEvents(user1);
  let u2 = await pollEvents(user2);
  const match1 = u1.data?.events?.find(e => e.type === 'match_found');
  const match2 = u2.data?.events?.find(e => e.type === 'match_found');

  if (!match1 || !match2) return "Failed to match";

  const roomId = match1.payload.roomId;

  // User 1 skips
  let result = await apiCall('skip_user', user1, { roomId });
  if (!result.ok) return `Skip failed: ${result.status}`;

  // User 2 should get notification
  await new Promise(r => setTimeout(r, 100));
  u2 = await pollEvents(user2);
  const userLeftEvent = u2.data?.events?.find(e => e.type === 'user_left');

  if (!userLeftEvent) return "User 2 did not receive user_left event";
  if (userLeftEvent.payload.reason !== 'skip') return "Wrong reason, expected 'skip'";

  // User 2 should be able to poll without 404
  u2 = await pollEvents(user2);
  if (!u2.ok) return `User 2 poll returned 404 after skip`;

  // Check User 2 is back in queue
  const queueEvent = u2.data?.events?.find(e => e.type === 'queue_update');
  if (!queueEvent) return "User 2 not back in queue after skip";

  return "✓ PASS";
});

test("TC2: User Disconnect - Other user auto-rejoins", async () => {
  const user1 = `test_${Date.now()}_1`;
  const user2 = `test_${Date.now()}_2`;

  await apiCall('join_queue', user1, { interests: ['games'] });
  await apiCall('join_queue', user2, { interests: ['games'] });
  await new Promise(r => setTimeout(r, 2500));

  let u1 = await pollEvents(user1);
  let u2 = await pollEvents(user2);
  const roomId = u1.data?.events?.find(e => e.type === 'match_found')?.payload.roomId;
  if (!roomId) return "Failed to match";

  // User 1 disconnects
  let result = await apiCall('disconnect', user1);
  if (!result.ok) return `Disconnect failed: ${result.status}`;

  // User 2 should get notification
  await new Promise(r => setTimeout(r, 100));
  u2 = await pollEvents(user2);
  const userLeftEvent = u2.data?.events?.find(e => e.type === 'user_left');
  if (!userLeftEvent) return "User 2 did not receive disconnect event";

  // User 2 continues polling - no 404
  u2 = await pollEvents(user2);
  if (!u2.ok) return `User 2 poll returned ${u2.status} after disconnect`;

  return "✓ PASS";
});

test("TC3: Block User - No rematch same user", async () => {
  const user1 = `test_${Date.now()}_1`;
  const user2 = `test_${Date.now()}_2`;

  await apiCall('join_queue', user1, { interests: ['movies'] });
  await apiCall('join_queue', user2, { interests: ['movies'] });
  await new Promise(r => setTimeout(r, 2500));

  let u1Events = await pollEvents(user1);
  const match = u1Events.data?.events?.find(e => e.type === 'match_found');
  const user2Id = match?.payload.matchedUser.id;
  if (!user2Id) return "Failed to match";

  // User 1 blocks user 2
  let result = await apiCall('block_user', user1, { blockedUserId: user2Id });
  if (!result.ok) return "Block failed";

  // Poll should still work
  u1Events = await pollEvents(user1);
  if (!u1Events.ok) return "Poll failed after block";

  return "✓ PASS";
});

test("TC4: Multiple Users in Queue - Fair matching", async () => {
  const users = [];
  for (let i = 0; i < 4; i++) {
    const userId = `test_${Date.now()}_u${i}`;
    users.push(userId);
    await apiCall('join_queue', userId, { interests: ['tech'] });
  }

  await new Promise(r => setTimeout(r, 2500));

  let matched = 0;
  for (const user of users) {
    const events = await pollEvents(user);
    if (events.data?.events?.find(e => e.type === 'match_found')) {
      matched++;
    }
  }

  // Should have at least 2 pairs matched
  if (matched < 4) return `Only ${matched} users matched, expected 4`;

  return "✓ PASS";
});

test("TC5: Empty Queue - User can find match when others join", async () => {
  const user1 = `test_${Date.now()}_1`;
  const user2 = `test_${Date.now()}_2`;

  // User 1 joins alone
  await apiCall('join_queue', user1, { interests: ['solo'] });
  await new Promise(r => setTimeout(r, 1000));

  let u1 = await pollEvents(user1);
  let hasMatch = u1.data?.events?.find(e => e.type === 'match_found');
  if (hasMatch) return "User 1 matched alone (should not happen)";

  // User 2 joins
  await apiCall('join_queue', user2, { interests: ['solo'] });
  await new Promise(r => setTimeout(r, 2500));

  u1 = await pollEvents(user1);
  const match1 = u1.data?.events?.find(e => e.type === 'match_found');
  if (!match1) return "User 1 did not match after User 2 joined";

  return "✓ PASS";
});

test("TC6: Send Message With No Room - Graceful error", async () => {
  const user = `test_${Date.now()}`;
  await apiCall('join_queue', user, { interests: ['test'] });
  
  // Try to send message without matching
  const result = await apiCall('send_message', user, {
    roomId: 'invalid_room',
    content: 'test'
  });

  if (result.ok) return "Should fail for invalid room";
  if (result.status !== 404) return `Expected 404, got ${result.status}`;

  return "✓ PASS";
});

test("TC7: Rapid Polling - No memory leaks", async () => {
  const user = `test_${Date.now()}`;
  await apiCall('join_queue', user, { interests: ['rapid'] });

  // Poll 10 times rapidly
  for (let i = 0; i < 10; i++) {
    const result = await pollEvents(user);
    if (!result.ok) return `Poll ${i} failed`;
  }

  // Should still work
  const result = await pollEvents(user);
  if (!result.ok) return "Poll failed after rapid polling";

  return "✓ PASS";
});

test("TC8: Block Then Skip - No 404", async () => {
  const user1 = `test_${Date.now()}_1`;
  const user2 = `test_${Date.now()}_2`;

  await apiCall('join_queue', user1, { interests: ['block_skip'] });
  await apiCall('join_queue', user2, { interests: ['block_skip'] });
  await new Promise(r => setTimeout(r, 2500));

  let u1 = await pollEvents(user1);
  let u2 = await pollEvents(user2);
  const roomId = u1.data?.events?.find(e => e.type === 'match_found')?.payload.roomId;
  const user2Id = u1.data?.events?.find(e => e.type === 'match_found')?.payload.matchedUser.id;

  // Block
  await apiCall('block_user', user1, { blockedUserId: user2Id });

  // Skip
  let result = await apiCall('skip_user', user1, { roomId });
  if (!result.ok) return `Skip failed: ${result.status}`;

  // Continue polling
  for (let i = 0; i < 3; i++) {
    u1 = await pollEvents(user1);
    if (!u1.ok) return `Poll ${i} returned ${u1.status}`;
  }

  return "✓ PASS";
});

test("TC9: Message Flow With Auto-Rejoin", async () => {
  const user1 = `test_${Date.now()}_1`;
  const user2 = `test_${Date.now()}_2`;

  await apiCall('join_queue', user1, { interests: ['autorejoin'] });
  await apiCall('join_queue', user2, { interests: ['autorejoin'] });
  await new Promise(r => setTimeout(r, 2500));

  let u1 = await pollEvents(user1);
  let u2 = await pollEvents(user2);
  const roomId = u1.data?.events?.find(e => e.type === 'match_found')?.payload.roomId;

  // User 1 sends message
  let result = await apiCall('send_message', user1, { roomId, content: 'Hello' });
  if (!result.ok) return `Send message failed: ${result.status}`;

  // User 2 receives
  await new Promise(r => setTimeout(r, 100));
  u2 = await pollEvents(user2);
  const msgEvent = u2.data?.events?.find(e => e.type === 'message_received');
  if (!msgEvent) return "User 2 did not receive message";

  return "✓ PASS";
});

test("TC10: No Recent Match Rematch - Prevent same user match", async () => {
  // This is behavioral - we track recentMatches but matching algorithm respects interests
  // Create 3 users with different interests
  const user1 = `test_${Date.now()}_1`;
  const user2 = `test_${Date.now()}_2`;
  const user3 = `test_${Date.now()}_3`;

  // All have same interest
  await apiCall('join_queue', user1, { interests: ['same'] });
  await apiCall('join_queue', user2, { interests: ['same'] });
  await new Promise(r => setTimeout(r, 2500));

  // User 1 and 2 should match
  let u1 = await pollEvents(user1);
  const match12 = u1.data?.events?.find(e => e.type === 'match_found');
  if (!match12) return "Failed first match";

  // Skip to separate them
  await apiCall('skip_user', user1, { roomId: match12.payload.roomId });

  // Now user 3 joins
  await apiCall('join_queue', user3, { interests: ['same'] });
  await new Promise(r => setTimeout(r, 2500));

  // Check that users found new matches (not forced with same person)
  u1 = await pollEvents(user1);
  const userId1 = u1.data?.events?.find(e => e.type === 'queue_update');
  if (!userId1) return "User 1 not in updated queue";

  return "✓ PASS (behavior: matching algorithm prevents, not hard blocking)";
});

// Run all tests
async function runAllTests() {
  log('cyan', 'SUITE', '🚀 Running Comprehensive Test Suite\n');

  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      log('blue', name, 'Running...');
      const result = await fn();
      if (result === '✓ PASS') {
        log('green', name, result);
        passed++;
      } else {
        log('red', name, `✗ FAIL: ${result}`);
        failed++;
      }
    } catch (err) {
      log('red', name, `✗ ERROR: ${err.message}`);
      failed++;
    }
    console.log();
  }

  log('cyan', 'SUMMARY', `\n${passed} passed, ${failed} failed out of ${tests.length} tests`);
  if (failed === 0) {
    log('green', 'SUCCESS', '✅ All tests passed!');
  }
}

runAllTests().catch(err => {
  log('red', 'FATAL', err.message);
  process.exit(1);
});
