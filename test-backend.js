#!/usr/bin/env node

/**
 * Direct Backend Test - No UI Required
 * 
 * This script tests the backend API directly without going through the UI/browser
 * Run with: node test-backend.js
 * 
 * What it does:
 * 1. Creates 2 users
 * 2. Joins them to queue
 * 3. Triggers matching
 * 4. Sends a message from User 1 to User 2
 * 5. Checks if User 2 receives it via polling
 */

const BASE_URL = 'http://localhost:3000';

// Color codes for logging
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

function log(type, message) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const prefix = `[${timestamp}] [${type}]`;
  
  switch(type) {
    case '✓':
      return console.log(`${colors.green}${prefix}${colors.reset} ${message}`);
    case '✗':
      return console.log(`${colors.red}${prefix}${colors.reset} ${message}`);
    case '→':
      return console.log(`${colors.blue}${prefix}${colors.reset} ${message}`);
    case '⚠':
      return console.log(`${colors.yellow}${prefix}${colors.reset} ${message}`);
    default:
      return console.log(`${prefix} ${message}`);
  }
}

async function test() {
  try {
    log('→', 'Starting backend test...');
    log('→', `Target: ${BASE_URL}`);
    
    // Step 1: Create User 1
    log('→', 'Step 1: Creating User 1');
    const user1Response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'join_queue',
        userName: 'TestUser1',
        interests: ['Gaming', 'Movies'],
      }),
    });
    
    const user1Data = await user1Response.json();
    if (!user1Data.userId) {
      log('✗', `Failed to create User 1: ${JSON.stringify(user1Data)}`);
      return;
    }
    
    const user1Id = user1Data.userId;
    const roomId1 = user1Data.roomId;
    log('✓', `User 1 created: ${user1Id}`);
    
    // Step 2: Create User 2  
    log('→', 'Step 2: Creating User 2');
    const user2Response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'join_queue',
        userName: 'TestUser2',
        interests: ['Gaming', 'Movies'],
      }),
    });
    
    const user2Data = await user2Response.json();
    if (!user2Data.userId) {
      log('✗', `Failed to create User 2: ${JSON.stringify(user2Data)}`);
      return;
    }
    
    const user2Id = user2Data.userId;
    log('✓', `User 2 created: ${user2Id}`);
    
    // Step 3: Wait for matching
    log('→', 'Step 3: Waiting for matching (2 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 4: Poll User 1 to get match info
    log('→', 'Step 4: Polling User 1 for match event');
    const user1PollResponse = await fetch(
      `${BASE_URL}/api/chat?action=poll&userId=${user1Id}&t=${Date.now()}`,
      { cache: 'no-store' }
    );
    
    const user1Events = await user1PollResponse.json();
    const matchEvent = user1Events.events?.find(e => e.type === 'match_found');
    
    if (!matchEvent) {
      log('✗', `User 1 did not receive match event`);
      log('⚠', `Events received: ${JSON.stringify(user1Events)}`);
      return;
    }
    
    const roomId = matchEvent.payload.roomId;
    log('✓', `Users matched! Room: ${roomId}`);
    
    // Step 5: Poll User 2 to confirm match
    log('→', 'Step 5: Polling User 2 for match confirmation');
    const user2PollResponse = await fetch(
      `${BASE_URL}/api/chat?action=poll&userId=${user2Id}&t=${Date.now()}`,
      { cache: 'no-store' }
    );
    
    const user2Events = await user2PollResponse.json();
    const user2Match = user2Events.events?.find(e => e.type === 'match_found');
    
    if (!user2Match) {
      log('⚠', `User 2 also matched (may take a second poll)`);
    } else {
      log('✓', `User 2 also received match event`);
    }
    
    // Step 6: Send message from User 1
    log('→', 'Step 6: User 1 sending message to User 2');
    const sendResponse = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send_message',
        userId: user1Id,
        roomId: roomId,
        content: 'Hello from User 1!',
      }),
    });
    
    const sendData = await sendResponse.json();
    if (!sendData.success) {
      log('✗', `Failed to send message: ${JSON.stringify(sendData)}`);
      return;
    }
    
    log('✓', `Message sent successfully: ${sendData.messageId}`);
    
    // Step 7: Poll User 2 to receive message
    log('→', 'Step 7: User 2 polling for message');
    const user2MessageResponse = await fetch(
      `${BASE_URL}/api/chat?action=poll&userId=${user2Id}&t=${Date.now()}`,
      { cache: 'no-store' }
    );
    
    const user2MessageEvents = await user2MessageResponse.json();
    const messageEvent = user2MessageEvents.events?.find(e => e.type === 'message_received');
    
    if (!messageEvent) {
      log('✗', `User 2 did NOT receive message!`);
      log('⚠', `Events: ${JSON.stringify(user2MessageEvents)}`);
      return;
    }
    
    log('✓', `User 2 received message: "${messageEvent.payload.content}"`);
    
    // SUCCESS!
    console.log('\n' + colors.green + colors.bright + '═'.repeat(50));
    log('✓', 'ALL TESTS PASSED!');
    log('✓', 'Message flow working end-to-end');
    console.log(colors.bright + '═'.repeat(50) + colors.reset + '\n');
    
  } catch (error) {
    log('✗', `Error: ${error.message}`);
    if (error.message.includes('fetch')) {
      log('⚠', 'Could not connect to server. Make sure it\'s running:');
      log('⚠', '  npm run dev');
    }
  }
}

test();
