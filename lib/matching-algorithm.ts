import type { ChatUser } from "./chat-types";
import { RedisService } from "./redis-client";

export interface MatchResult {
  user1: ChatUser;
  user2: ChatUser;
  commonInterests: string[];
  score: number;
}

export class MatchingEngine {
  // Note: Recent matches are now tracked in Redis, not in-memory
  // This allows server restarts without losing match history

  /**
   * Calculate similarity score between two users based on common interests
   * Higher score = better match
   */
  private async calculateMatchScore(user1: ChatUser, user2: ChatUser): Promise<number> {
    const interests1 = new Set(user1.interests);
    const interests2 = new Set(user2.interests);

    const commonInterests = [...interests1].filter((i) =>
      interests2.has(i)
    ).length;

    // Check Redis for recently matched status
    const recentlyMatched = await RedisService.haveRecentlyMatched(user1.id, user2.id);

    if (commonInterests === 0) return -1;

    let score = commonInterests * 10;

    if (recentlyMatched) {
      score = score * 0.5; // 50% penalty for recent matches
    }

    // Bonus for longer wait time (fairness)
    const user1WaitTime = Date.now() - user1.connectedAt;
    const user2WaitTime = Date.now() - user2.connectedAt;
    const waitTimeDiff = Math.abs(user1WaitTime - user2WaitTime);

    score -= waitTimeDiff / 1000; // Small penalty for wait time difference

    return score;
  }

  /**
   * Find best match for a user from available queue
   */
  public async findMatch(
    targetUser: ChatUser,
    availableUsers: ChatUser[]
  ): Promise<ChatUser | null> {
    if (availableUsers.length === 0) return null;

    let bestMatch: ChatUser | null = null;
    let bestScore = -Infinity;

    for (const candidate of availableUsers) {
      if (candidate.id === targetUser.id) continue;
      if (targetUser.blockedUsers.includes(candidate.id)) continue;
      if (candidate.blockedUsers.includes(targetUser.id)) continue;

      const score = await this.calculateMatchScore(targetUser, candidate);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    return bestScore > 0 ? bestMatch : null;
  }

  /**
   * Find matches for multiple users efficiently
   * Returns pairs of matched users
   * WARNING: O(N²) algorithm - optimize for 1000+ users in future
   */
  public async findMatches(users: ChatUser[]): Promise<Array<[ChatUser, ChatUser]>> {
    const pairs: Array<[ChatUser, ChatUser]> = [];
    const remaining = new Set(users);

    while (remaining.size >= 2) {
      let bestPair: [ChatUser, ChatUser] | null = null;
      let bestScore = -Infinity;

      const userArray = Array.from(remaining);

      for (let i = 0; i < userArray.length; i++) {
        for (let j = i + 1; j < userArray.length; j++) {
          const user1 = userArray[i]!;
          const user2 = userArray[j]!;

          // Skip if either user has blocked the other
          if (user1.blockedUsers.includes(user2.id) || user2.blockedUsers.includes(user1.id)) {
            continue;
          }

          const score = await this.calculateMatchScore(user1, user2);

          if (score > bestScore) {
            bestScore = score;
            bestPair = [user1, user2];
          }
        }
      }

      if (bestPair && bestScore > 0) {
        pairs.push(bestPair);
        remaining.delete(bestPair[0]);
        remaining.delete(bestPair[1]);

        // Track recent match in Redis (server-agnostic, survives restarts)
        await RedisService.recordMatch(bestPair[0].id, bestPair[1].id);
      } else {
        break;
      }
    }

    return pairs;
  }

  /**
   * Get common interests between two users
   */
  public getCommonInterests(user1: ChatUser, user2: ChatUser): string[] {
    const interests1 = new Set(user1.interests);
    return user2.interests.filter((i) => interests1.has(i));
  }
}

// Export singleton instance
export const matchingEngine = new MatchingEngine();
