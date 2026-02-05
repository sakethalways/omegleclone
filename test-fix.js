#!/usr/bin/env node
/**
 * Test Script: Message Flow Verification After roomId Fix
 * Tests the complete flow: join → match → send message → receive message
 */

const BASE_URL = 'http://localhost:3000/api/chat';

// Colors for logging
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(color, prefix, message) {
  console.log(`${colors[color]}[${prefix}]${colors.reset} ${message}`);
}

const user1Id = `test_user_${Date.now()}_u1`;
const user2Id = `test_user_${Date.now()}_u2`;
let room1Id = null;
let room2Id = null;

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
    return { ok: false, error: err.message };
  }
}

async function runTest() {
  log('blue', 'TEST', '🚀 Starting Message Flow Test\n');

  // Step 1: User 1 joins queue
  log('blue', 'STEP1', `User 1 (${user1Id}) joining queue...`);
  let result = await apiCall('join_queue', user1Id, {
    interests: ['coding', 'gaming']
  });
  if (!result.ok) {
    log('red', 'ERROR', `Failed to join: ${result.error}`);
    return;
  }
  log('green', 'OK', `User 1 joined queue`);

  // Step 2: User 2 joins queue
  log('blue', 'STEP2', `User 2 (${user2Id}) joining queue...`);
  result = await apiCall('join_queue', user2Id, {
    interests: ['coding', 'gaming']
  });
  if (!result.ok) {
    log('red', 'ERROR', `Failed to join: ${result.error}`);
    return;
  }
  log('green', 'OK', `User 2 joined queue`);

  // Step 3: Wait for matching
  log('blue', 'STEP3', 'Waiting for users to match...');
  await new Promise(resolve => setTimeout(resolve, 2500));

  // Step 4: Poll for match events
  log('blue', 'STEP4', 'Polling for match events...');
  
  let user1Events = await pollEvents(user1Id);
  let user2Events = await pollEvents(user2Id);
  
  log('gray', 'DEBUG', `User 1 events: ${JSON.stringify(user1Events.data)}`);
  log('gray', 'DEBUG', `User 2 events: ${JSON.stringify(user2Events.data)}`);

  // Extract roomId from match_found events
  const user1EventsArray = user1Events.data?.events || [];
  const user2EventsArray = user2Events.data?.events || [];
  const matchEvent1 = user1EventsArray.find(e => e.type === 'match_found');
  const matchEvent2 = user2EventsArray.find(e => e.type === 'match_found');

  if (!matchEvent1 || !matchEvent2) {
    log('red', 'ERROR', 'No match_found events received');
    return;
  }

  room1Id = matchEvent1.payload?.roomId;
  room2Id = matchEvent2.payload?.roomId;

  if (!room1Id || !room2Id) {
    log('red', 'ERROR', `🚨 roomId is null! User1: ${room1Id}, User2: ${room2Id}`);
    return;
  }

  if (room1Id !== room2Id) {
    log('red', 'ERROR', `Room IDs don't match! User1: ${room1Id}, User2: ${room2Id}`);
    return;
  }

  log('green', 'OK', `✅ Both users matched! roomId: ${room1Id}`);

  // Step 5: User 1 sends message
  log('blue', 'STEP5', `User 1 sending message in room ${room1Id}...`);
  result = await apiCall('send_message', user1Id, {
    roomId: room1Id,
    content: 'Hello from User 1!',
    timestamp: Date.now()
  });
  
  if (!result.ok) {
    log('red', 'ERROR', `Failed to send message (status ${result.status}): ${JSON.stringify(result.data)}`);
    return;
  }
  log('green', 'OK', `Message sent`);

  // Step 6: Poll for message on User 2's side
  log('blue', 'STEP6', 'User 2 polling for message...');
  await new Promise(resolve => setTimeout(resolve, 100));
  
  user2Events = await pollEvents(user2Id);
  const user2EventsArray2 = user2Events.data?.events || [];
  log('gray', 'DEBUG', `User 2 events: ${JSON.stringify(user2Events.data)}`);
  
  const messageEvent = user2EventsArray2.find(e => e.type === 'message_received');
  
  if (!messageEvent) {
    log('red', 'ERROR', '🚨 Message event not received by User 2');
    return;
  }

  log('green', 'OK', `✅ Message received! Content: "${messageEvent.payload?.content}"`);

  // Step 7: User 2 sends reply
  log('blue', 'STEP7', `User 2 sending reply...`);
  result = await apiCall('send_message', user2Id, {
    roomId: room2Id,
    content: 'Hello from User 2!',
    timestamp: Date.now()
  });
  
  if (!result.ok) {
    log('red', 'ERROR', `Failed to send reply (status ${result.status}): ${JSON.stringify(result.data)}`);
    return;
  }
  log('green', 'OK', `Reply sent`);

  // Step 8: Poll for reply on User 1's side
  log('blue', 'STEP8', 'User 1 polling for reply...');
  await new Promise(resolve => setTimeout(resolve, 100));
  
  user1Events = await pollEvents(user1Id);
  const user1EventsArray2 = user1Events.data?.events || [];
  log('gray', 'DEBUG', `User 1 events: ${JSON.stringify(user1Events.data)}`);
  
  const replyEvent = user1EventsArray2.find(e => e.type === 'message_received');
  
  if (!replyEvent) {
    log('red', 'ERROR', '🚨 Reply event not received by User 1');
    return;
  }

  log('green', 'OK', `✅ Reply received! Content: "${replyEvent.payload?.content}"`);

  // Success!
  log('green', 'SUCCESS', '✅ ALL TESTS PASSED! Message flow working end-to-end');
}

runTest().catch(err => {
  log('red', 'FATAL', err.message);
  process.exit(1);
});
