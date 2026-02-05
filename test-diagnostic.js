/**
 * Diagnostic Test: Debug skip/block event delivery
 */

const BASE_URL = "http://localhost:3000/api/chat";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function test() {
  console.log("🔍 DIAGNOSTIC TEST: Skip/Block Event Delivery\n");

  // Setup: Two users match
  const j1 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "join_queue",
      userName: "DiagUser1",
      interests: ["test"],
    }),
  });
  const { userId: u1 } = await j1.json();
  console.log(`✓ User1 joined: ${u1}`);

  const j2 = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "join_queue",
      userName: "DiagUser2",
      interests: ["test"],
    }),
  });
  const { userId: u2 } = await j2.json();
  console.log(`✓ User2 joined: ${u2}`);

  // Wait for matching
  await sleep(500);

  // Poll U1 to get room info
  const p1 = await fetch(`${BASE_URL}?action=poll&userId=${encodeURIComponent(u1)}`);
  const d1 = await p1.json();
  const m1 = d1.events.find((e) => e.type === "match_found");
  const roomId = m1?.payload?.roomId;
  console.log(`✓ User1 matched, roomId: ${roomId}`);
  console.log(`  Events for User1:`, d1.events.map((e) => e.type));

  // Check User2's events BEFORE skip
  console.log("\n📊 User2 pending events before skip:");
  const p2_before = await fetch(`${BASE_URL}?action=poll&userId=${encodeURIComponent(u2)}`);
  const d2_before = await p2_before.json();
  console.log(`  Events:`, d2_before.events.map((e) => e.type));
  const hasMatchBefore = d2_before.events.some((e) => e.type === "match_found");
  console.log(`  Has match_found:`, hasMatchBefore);

  // Now User1 skips
  console.log("\n⏭️  User1 is skipping...");
  const skip = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "skip_user",
      userId: u1,
      roomId,
    }),
  });
  const skipData = await skip.json();
  console.log(`  Skip response:`, skipData);

  // Check User2's events AFTER skip
  console.log("\n📊 User2 pending events after skip (should have user_skipped):");
  await sleep(100);
  const p2_after = await fetch(`${BASE_URL}?action=poll&userId=${encodeURIComponent(u2)}`);
  const d2_after = await p2_after.json();
  console.log(`  Events:`, d2_after.events.map((e) => e.type));
  const skipEvent = d2_after.events.find((e) => e.type === "user_skipped");
  console.log(`  Has user_skipped:`, !!skipEvent);

  if (skipEvent) {
    console.log("\n✅ SUCCESS: Skip event properly delivered!");
  } else {
    console.log("\n❌ FAIL: Skip event NOT found!");
    console.log("  Raw events:", d2_after.events);
  }
}

test().catch(console.error);
