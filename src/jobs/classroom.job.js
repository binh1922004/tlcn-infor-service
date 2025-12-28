import cron from 'node-cron';
import classroomModel from '../models/classroom.model.js';

/**
 * Job tự động đóng lớp học khi hết hạn
 * Chạy mỗi giờ để kiểm tra
 */
export const startClassroomAutoCloseJob = () => {
  // Chạn mỗi giờ vào phút 0
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('🔄 [CRON] Checking for expired classrooms...');
      
      const now = new Date();
      
      // Tìm các lớp học đã hết hạn nhưng vẫn active
      const expiredClassrooms = await classroomModel.find({
        status: 'active',
        'settings.endDate': { $lte: now, $ne: null }
      });

      if (expiredClassrooms.length === 0) {
        console.log(' [CRON] No expired classrooms found');
        return;
      }

      console.log(` [CRON] Found ${expiredClassrooms.length} expired classroom(s)`);

      // Cập nhật status thành 'closed'
      let closedCount = 0;
      for (const classroom of expiredClassrooms) {
        classroom.status = 'closed';
        await classroom.save();
        closedCount++;
        
        console.log(` [CRON] Closed: ${classroom.classCode} - ${classroom.className}`);
      }

      console.log(` [CRON] Auto-close completed. Closed ${closedCount} classroom(s)`);
      
    } catch (error) {
      console.error('❌ [CRON] Error in auto-close job:', error);
    }
  });

  console.log('✅ Classroom auto-close job started (runs every hour at minute 0)');
};

export default startClassroomAutoCloseJob;