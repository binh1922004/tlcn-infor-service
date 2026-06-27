/**
 * elo.service.js
 *
 * Dịch vụ tính toán điểm Elo cho hệ thống Online Judge.
 *
 * Công thức chuẩn:
 *   ExpectedScore(A vs B) = 1 / (1 + 10^((B.elo - A.elo) / 400))
 *   ActualScore: 1 nếu thắng, 0.5 nếu hoà, 0 nếu thua
 *   EloChange = K * (ActualScore - ExpectedScore)
 *
 * Với nhiều người trong contest:
 *   totalChange(A) = sum của tất cả eloChange(A vs từng đối thủ) / (N - 1)
 *   NewElo(A) = OldElo(A) + round(totalChange(A))
 */

const DEFAULT_K = 32;

/**
 * Lấy K-factor dựa trên Elo hiện tại.
 * Thiết kế hàm riêng để dễ mở rộng động về sau.
 *
 * @param {number} elo - Điểm Elo hiện tại của player
 * @returns {number} K-factor
 */
export const getKFactor = (elo) => {
  // Phase 1: K cố định = 32
  // Mở rộng sau:
  // if (elo >= 2000) return 16;
  // if (elo >= 1400) return 24;
  return DEFAULT_K;
};

/**
 * Tính Expected Score của player khi đối đầu với opponent.
 *
 * @param {number} playerElo
 * @param {number} opponentElo
 * @returns {number} expected score trong khoảng (0, 1)
 */
export const computeExpectedScore = (playerElo, opponentElo) => {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
};

/**
 * Tính Actual Score dựa trên thứ hạng trong contest.
 *
 * @param {number} playerRank  - Thứ hạng của player (1 = nhất)
 * @param {number} opponentRank - Thứ hạng của opponent
 * @returns {number} 1 | 0.5 | 0
 */
export const computeActualScore = (playerRank, opponentRank) => {
  if (playerRank < opponentRank) return 1;    // player thứ hạng cao hơn (số nhỏ hơn)
  if (playerRank === opponentRank) return 0.5; // hoà (hiếm gặp, nhưng an toàn)
  return 0;                                    // player thứ hạng thấp hơn
};

/**
 * Tính Elo mới cho tất cả participants trong một contest.
 *
 * Thuật toán:
 * 1. Với mỗi cặp (A, B), tính eloChange của A khi đối đầu B
 * 2. Tổng hợp tất cả eloChange của A từ N-1 đối thủ
 * 3. Lấy trung bình để tránh bias khi contest có nhiều/ít người
 * 4. Round về số nguyên
 *
 * @param {Array<{userId: string, elo: number, rankPosition: number}>} participants
 *   Mảng thông tin của từng người tham gia
 *
 * @returns {Array<{userId: string, oldElo: number, eloChange: number, newElo: number}>}
 */
export const calculateEloChanges = (participants) => {
  const n = participants.length;

  if (n < 2) {
    // Không đủ đối thủ để tính Elo — trả về không thay đổi
    return participants.map((p) => ({
      userId: p.userId,
      oldElo: p.elo,
      eloChange: 0,
      newElo: p.elo,
    }));
  }

  return participants.map((player) => {
    const oldElo = player.elo;
    const K = getKFactor(oldElo);

    // Tính tổng eloChange khi đối đầu với từng đối thủ khác
    let totalEloChange = 0;

    for (const opponent of participants) {
      if (opponent.userId.toString() === player.userId.toString()) continue;

      const expectedScore = computeExpectedScore(oldElo, opponent.elo);
      const actualScore = computeActualScore(
        player.rankPosition,
        opponent.rankPosition
      );

      totalEloChange += K * (actualScore - expectedScore);
    }

    // Trung bình hoá để tránh bias (chia cho số đối thủ)
    const avgEloChange = totalEloChange / (n - 1);
    const eloChange = Math.round(avgEloChange);
    const newElo = Math.max(0, oldElo + eloChange); // Elo không âm

    return {
      userId: player.userId,
      oldElo,
      eloChange,
      newElo,
    };
  });
};
