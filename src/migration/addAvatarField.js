import mongoose from 'mongoose';
import User from '../models/User.js';
import { config } from '../config/env.js';

async function addAvatarFieldToExistingUsers() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(config.mongoUri);
    
    console.log('🔄 Adding avatar field to existing users...');
    
    // ✅ Update tất cả users chưa có avatar field
    const result = await User.updateMany(
      { avatar: { $exists: false } }, // Chỉ users chưa có avatar field
      { 
        $set: { 
          avatar: null,
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`✅ Updated ${result.modifiedCount} users with avatar field`);
    
    // ✅ Verify - list all users with avatar field
    const users = await User.find({}, 'userName avatar').limit(5);
    console.log('📋 Sample users after update:');
    users.forEach(user => {
      console.log(`- ${user.userName}: avatar = ${user.avatar || 'null'}`);
    });
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Chạy migration
addAvatarFieldToExistingUsers();