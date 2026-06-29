/**
 * rating.job.js
 *
 * Cron job tự động tính Elo sau khi contest kết thúc.
 *
 * Chạy mỗi 5 phút — tìm các contest thỏa điều kiện:
 *   - endTime <= now
 *   - isActive = true  (contest public, không phải classroom)
 *   - ratingCalculated = false
 *
 * Cơ chế anti-duplicate (an toàn với multiple server instances):
 *   - rating.service.js dùng findOneAndUpdate atomic để "claim" contest
 *   - Instance nào claim được mới tính, instance khác bỏ qua (AlreadyCalculatedError)
 */

import cron from 'node-cron';
import Contest from '../models/contest.model.js';
import {
  calculateRatingForContest,
  AlreadyCalculatedError,
  ContestNotEndedError,
  NotEnoughParticipantsError,
} from '../service/rating.service.js';
import { log, logError } from '../utils/logger.js';

// ─────────────────────────────────────────────────────────────
// Core job logic (export riêng để có thể test độc lập)
// ─────────────────────────────────────────────────────────────
export const runRatingJob = async () => {
  const now = new Date();

  // Tìm contest cần tính Elo:
  //   - đã kết thúc (endTime <= now)
  //   - chưa tính (ratingCalculated = false)
  //   - không phải contest của classroom (classRoom = null)
  //     → comment dòng này nếu muốn tính cả classroom contest
  const pendingContests = await Contest.find({
    endTime: { $lte: now },
    ratingCalculated: false,
    classRoom: null,            // chỉ tính public contest
    isActive: true,             // contest đã được publish
  })
    .select('_id title endTime')
    .lean();

  if (pendingContests.length === 0) {
    return; // không log gì nếu không có contest để tránh spam log
  }

  log(`[RatingJob] Found ${pendingContests.length} contest(s) pending Elo calculation`);

  for (const contest of pendingContests) {
    try {
      const result = await calculateRatingForContest(contest._id.toString());
      log(
        `[RatingJob] ✅ Contest "${result.contestTitle}" — ` +
        `${result.participantCount} participants rated`
      );
    } catch (err) {
      if (err instanceof AlreadyCalculatedError) {
        // Đã được instance khác tính → bỏ qua, không phải lỗi
        log(`[RatingJob] ⏭️  Contest "${contest.title}" already calculated by another instance`);
      } else if (err instanceof NotEnoughParticipantsError) {
        // Không đủ người → đánh dấu đã xử lý để không retry mãi
        log(`[RatingJob] ⚠️  Contest "${contest.title}": ${err.message} — marking as calculated`);
        await Contest.findByIdAndUpdate(contest._id, { $set: { ratingCalculated: true } });
      } else if (err instanceof ContestNotEndedError) {
        // Race condition hiếm gặp → bỏ qua
        log(`[RatingJob] ⏳ Contest "${contest.title}" not ended yet (race condition)`);
      } else {
        // Lỗi không mong đợi → log đầy đủ, service đã rollback lock
        logError(`[RatingJob] ❌ Failed to calculate rating for "${contest.title}":`, err);
      }
    }
  }
};

// ─────────────────────────────────────────────────────────────
// Khởi động cron job
// ─────────────────────────────────────────────────────────────
const startRatingJob = () => {
  // Chạy mỗi 5 phút: '*/5 * * * *'
  // Đổi thành '* * * * *' nếu muốn mỗi 1 phút
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runRatingJob();
    } catch (err) {
      // Catch top-level để cron không bị crash
      logError('[RatingJob] Unexpected error in cron handler:', err);
    }
  });

  log('[RatingJob] Elo rating job started (runs every 5 minutes)');
};

export default startRatingJob;
