/**
 * Test runner - Executes all test suites
 * Run with: npx ts-node tests/run-tests.ts
 */

import { runAllPhase1Tests } from "./phase1.test";

async function main() {
  console.log("\n🚀 Starting Test Suite...\n");
  
  try {
    // Run Phase 1
    console.log("Running Phase 1 Tests...");
    const phase1Results = await runAllPhase1Tests();
    
    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("🎯 OVERALL RESULTS");
    console.log("=".repeat(60));
    
    if (phase1Results.success) {
      console.log("✅ ALL TESTS PASSED!");
      process.exit(0);
    } else {
      console.log("❌ SOME TESTS FAILED");
      process.exit(1);
    }
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
