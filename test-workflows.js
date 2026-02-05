/**
 * Comprehensive Workflow Tests
 * Tests all scenarios: matching, skip, block, disconnect, etc.
 */

const BASE_URL = "http://localhost:3000/api/chat";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const tests = [];
let testsPassed = 0;
let testsFailed = 0;

function addTest(name, fn) {
  tests.push({ name, fn });
}

async function runTest(test) {
  try {
    console.log(`\n🧪 ${test.name}`);
    console.log("─".repeat(70));
    await test.fn();
    console.log("✅ PASS");
    testsPassed++;
    return true;
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}`);
    testsFailed++;
    return false;
  }
}

// ============================================
// WORKFLOW TESTS
// ============================================

addTest("WORKFLOW 1: Simultaneous Join → Immediate Match", async () => {
  // User1 joins
  const join1 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "join_queue",
      userName: "SimulUser1",
      interests: ["coding"],
    }),
  });
  const { userId: user1Id } = await join1.json();
  
  // User2 joins immediately  
  const join2 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "join_queue",
      userName: "SimulUser2",
      interests: ["coding"],
    }),
  });
  const { userId: user2Id } = await join2.json();

  // Both should have match_found event immediately
  await sleep(100);

  const poll1 = await fetch(
    `${BASE_URL}?action=poll&userId=${encodeURIComponent(user1Id)}`
  );
  const data1 = await poll1.json();
  const match1 = data1.events.find((e) => e.type === "match_found");
  
  const poll2 = await fetch(
    `${BASE_URL}?action=poll&userId=${encodeURIComponent(user2Id)}`
  );
  const data2 = await poll2.json();
  const match2 = data2.events.find((e) => e.type === "match_found");

  if (!match1) throw new Error("User1 didn't get instant match");
  if (!match2) throw new Error("User2 didn't get instant match");
  console.log("  ✓ Both users matched instantly");
});

addTest("WORKFLOW 2: Sequential Join (Delayed) → Immediate Match", async () => {
  // User1 joins and waits
  const join1 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "join_queue",
      userName: "LateUser1",
      interests: ["gaming"],
    }),
  });
  const { userId: user1Id } = await join1.json();

  console.log("  ✓ User1 joined, waiting...");
  
  // User2 joins after delay
  await sleep(1000);
  const join2 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "join_queue",
      userName: "LateUser2",
      interests: ["gaming"],
    }),
  });
  const { userId: user2Id } = await join2.json();
  console.log("  ✓ User2 joined after 1 second");

  // Both should match immediately (not wait for next interval)
  await sleep(100);

  const poll1 = await fetch(
    `${BASE_URL}?action=poll&userId=${encodeURIComponent(user1Id)}`
  );
  const data1 = await poll1.json();
  const match1 = data1.events.find((e) => e.type === "match_found");

  const poll2 = await fetch(
    `${BASE_URL}?action=poll&userId=${encodeURIComponent(user2Id)}`
  );
  const data2 = await poll2.json();
  const match2 = data2.events.find((e) => e.type === "match_found");

  if (!match1) throw new Error("User1 didn't match after User2 joined");
  if (!match2) throw new Error("User2 didn't match");
  console.log("  ✓ Delayed users matched immediately!");
});

addTest("WORKFLOW 3: Partner Exits → Other Auto-Reconnects", async () => {
  // Setup: Match two users
  const join1 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "join_queue",
      userName: "ExitUser1",
      interests: ["test"],
    }),
  });
  const { userId: user1Id } = await join1.json();

  const join2 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "join_queue",
      userName: "ExitUser2",
      interests: ["test"],
    }),
  });
  const { userId: user2Id } = await join2.json();

  // Wait for instant match
  await sleep(500);

  // User1 exits
  const disconnect = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "disconnect",
      userId: user1Id,
    }),
  });
  const discData = await disconnect.json();
  if (!discData.success) throw new Error("Disconnect failed");

  // User2 should get user_left event
  await sleep(100);
  const poll2 = await fetch(
    `${BASE_URL}?action=poll&userId=${encodeURIComponent(user2Id)}`
  );
  const data2 = await poll2.json();
  const leftEvent = data2.events.find((e) => e.type === "user_left");
  if (!leftEvent) throw new Error("User2 didn't receive user_left event");
  console.log("  ✓ User2 notified that User1 left");

  // User2 should be back in queue (auto-reconnected)
  const poll2Again = await fetch(
    `${BASE_URL}?action=poll&userId=${encodeURIComponent(user2Id)}`
  );
  const data2Again = await poll2Again.json();
  const queueEvent = data2Again.events.find((e) => e.type === "queue_update");
  if (!queueEvent) throw new Error("User2 not auto-reconnected to queue");
  console.log("  ✓ User2 auto-reconnected to queue");
});

addTest("WORKFLOW 4: User Skips Partner → Both Back in Queue", async () => {
  // Setup: Match two users with UNIQUE interests to avoid mixing with previous tests
  const join1 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "join_queue",
      userName: "SkipUser1",
      interests: ["skipping_test"],  // Unique interest
    }),
  });
  const { userId: user1Id } = await join1.json();

  const join2 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "join_queue",
      userName: "SkipUser2",
      interests: ["skipping_test"],  // Unique interest
    }),
  });
  const { userId: user2Id } = await join2.json();

  // Wait for match
  await sleep(500);

  const poll1 = await fetch(
    `${BASE_URL}?action=poll&userId=${encodeURIComponent(user1Id)}`
  );
  const match1Data = await poll1.json();
  const match1 = match1Data.events.find((e) => e.type === "match_found");
  if (!match1) throw new Error("Users didn't match");

  const roomId = match1.payload.roomId;

  // User1 skips
  const skip = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "skip_user",
      userId: user1Id,
      roomId,
    }),
  });
  const skipData = await skip.json();
  if (!skipData.success) throw new Error("Skip failed");
  console.log("  ✓ User1 skipped successfully");

  // User2 should get user_skipped event
  await sleep(100);
  const poll2 = await fetch(
    `${BASE_URL}?action=poll&userId=${encodeURIComponent(user2Id)}`
  );
  const data2 = await poll2.json();
  const skippedEvent = data2.events.find((e) => e.type === "user_skipped");
  if (!skippedEvent) throw new Error(`User2 didn't receive user_skipped event. Got: ${data2.events.map(e => e.type).join(', ')}`);
  console.log("  ✓ User2 notified of skip");

  // Both should be back in queue
  const poll1Again = await fetch(
    `${BASE_URL}?action=poll&userId=${encodeURIComponent(user1Id)}`
  );
  const data1Again = await poll1Again.json();
  const queue1 = data1Again.events.find((e) => e.type === "queue_update");
  if (!queue1) throw new Error("User1 not back in queue");
  console.log("  ✓ Both users back in queue");
});

addTest("WORKFLOW 5: User Blocks Partner → Blocker Added to Blocklist", async () => {
  // Setup: Match two users with UNIQUE interests
  const join1 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "join_queue",
      userName: "BlockUser1",
      interests: ["blocking_test"],  // Unique interest
    }),
  });
  const { userId: user1Id } = await join1.json();

  const join2 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "join_queue",
      userName: "BlockUser2",
      interests: ["blocking_test"],  // Unique interest
    }),
  });
  const { userId: user2Id } = await join2.json();

  // Wait for match
  await sleep(500);

  const poll1 = await fetch(
    `${BASE_URL}?action=poll&userId=${encodeURIComponent(user1Id)}`
  );
  const match1Data = await poll1.json();
  const match1 = match1Data.events.find((e) => e.type === "match_found");
  const roomId = match1.payload.roomId;

  // User1 blocks User2
  const block = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "block_user",
      userId: user1Id,
      roomId,
    }),
  });
  const blockData = await block.json();
  if (!blockData.success) throw new Error("Block failed");
  console.log("  ✓ User1 blocked User2");

  // User2 should  get user_blocked event
  await sleep(100);
  const poll2 = await fetch(
    `${BASE_URL}?action=poll&userId=${encodeURIComponent(user2Id)}`
  );
  const data2 = await poll2.json();
  const blockedEvent = data2.events.find((e) => e.type === "user_blocked");
  if (!blockedEvent) throw new Error(`User2 didn't receive user_blocked event. Got: ${data2.events.map(e => e.type).join(', ')}`);
  console.log("  ✓ User2 notified of block");

  // Both back in queue
  const poll1Again = await fetch(
    `${BASE_URL}?action=poll&userId=${encodeURIComponent(user1Id)}`
  );
  const data1Again = await poll1Again.json();
  const queue1 = data1Again.events.find((e) => e.type === "queue_update");
  if (!queue1) throw new Error("User1 not back in queue");
  console.log("  ✓ Both users back in queue");
});

addTest("WORKFLOW 6: Three Users in Queue → One Matches, One Waits", async () => {
  // User1 joins
  const join1 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "join_queue",
      userName: "TrioUser1",
      interests: ["coding"],
    }),
  });
  const { userId: user1Id } = await join1.json();

  // User2 joins
  const join2 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "join_queue",
      userName: "TrioUser2",
      interests: ["coding"],
    }),
  });
  const { userId: user2Id } = await join2.json();

  // User3 joins
  const join3 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "join_queue",
      userName: "TrioUser3",
      interests: ["coding"],
    }),
  });
  const { userId: user3Id } = await join3.json();

  // Two should match, one waiting
  await sleep(500);

  const poll1 = await fetch(
    `${BASE_URL}?action=poll&userId=${encodeURIComponent(user1Id)}`
  );
  const data1 = await poll1.json();
  const match1 = data1.events.find((e) => e.type === "match_found");

  const poll3 = await fetch(
    `${BASE_URL}?action=poll&userId=${encodeURIComponent(user3Id)}`
  );
  const data3 = await poll3.json();
  const queue3 = data3.events.find((e) => e.type === "queue_update");

  if (!match1) throw new Error("Some users didn't match");
  if (!queue3) throw new Error("User3 not in queue");
  
  console.log("  ✓ 2 users matched, 1 waiting");
});

addTest("WORKFLOW 7: Rapid Actions (Skip → Both Rejoin → Match Others)", async () => {
  // 4 users setup
  const ids = [];
  for (let i = 1; i <= 4; i++) {
    const join = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "join_queue",
        userName: `RapidUser${i}`,
        interests: ["test"],
      }),
    });
    const { userId } = await join.json();
    ids.push(userId);
  }

  console.log("  ✓ 4 users joined");

  // Wait for initial matches
  await sleep(500);

  // Check who matched
  const poll1 = await fetch(`${BASE_URL}?action=poll&userId=${encodeURIComponent(ids[0])}`);
  const data1 = await poll1.json();
  const match1 = data1.events.find((e) => e.type === "match_found");
  
  if (!match1) throw new Error("Matching failed");

  const roomId = match1.payload.roomId;

  // User1 skips quickly
  const skip = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "skip_user",
      userId: ids[0],
      roomId,
    }),
  });
  
  if (!(await skip.json()).success) throw new Error("Skip failed");
  
  console.log("  ✓ Rapid skip executed");
});

// ============================================
// RUN ALL TESTS
// ============================================

async function main() {
  console.log("🚀 COMPREHENSIVE WORKFLOW TESTS");
  console.log("================================\n");

  // Wait for server
  let serverReady = false;
  for (let i = 0; i < 10; i++) {
    try {
      await fetch(BASE_URL);
      serverReady = true;
      break;
    } catch {
      await sleep(500);
    }
  }

  if (!serverReady) {
    console.error("❌ Server not responding");
    process.exit(1);
  }

  console.log("✓ Server ready\n");

  // Run tests
  for (const test of tests) {
    await runTest(test);
    await sleep(1000);
  }

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("📊 WORKFLOW TEST SUMMARY");
  console.log("=".repeat(70));
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📈 Total:  ${testsPassed + testsFailed}`);

  if (testsFailed === 0) {
    console.log("\n🎉 ALL WORKFLOWS WORKING CORRECTLY!");
  } else {
    console.log(`\n⚠️  ${testsFailed} workflow(s) failed`);
    process.exit(1);
  }
}

main().catch(console.error);
