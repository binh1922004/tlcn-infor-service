import Comment from "../models/comment.model.js";

const migrateComments = async () => {
  try {
    console.log("🛠 Bắt đầu tiến trình Migration cho Comments...");

    // Tìm tất cả các Comment vẫn còn xài trường cũ (post)
    const oldCommentsCount = await Comment.countDocuments({ post: { $exists: true } });
    console.log(`Tìm thấy ${oldCommentsCount} comment cần migrate.`);

    if (oldCommentsCount === 0) {
      console.log("✅ Không có comment cũ nào cần cập nhật. Migration hoàn tất!");
      return;
    }

    // UPDATE BẰNG LỆNH CỦA MONGO
    // rename trường 'post' thành 'item' VÀ set thêm trường 'itemModel' = 'Post'
    const result = await Comment.collection.updateMany(
      { post: { $exists: true } },
      { 
        $rename: { post: "item" },
        $set: { itemModel: "Post" }
      }
    );

    console.log(`✅ Đã cập nhật thành công: ${result.modifiedCount} documents.`);
    
    // (Bổ sung an toàn) Kiểm tra nếu có parentComment trong DB cũ, DB sẽ tự reference theo ID nên không cần thao tác thêm. Trường đó ta không đổi tên.
    
    console.log("🎉 Migration cho Comments đã hoàn thành!");

  } catch (error) {
    console.error("❌ Lỗi trong quá trình Migration Comments:", error);
  }
};

export default migrateComments;