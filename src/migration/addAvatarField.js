import mongoose from 'mongoose';
import User from '../models/User.js';
import { config } from '../config/env.js';

async function addAvatarFieldToExistingUsers() {
  try {
    await mongoose.connect(config.mongoUri);
    
    
    // Update tất cả users chưa có avatar field
    const result = await User.updateMany(
      { avatar: { $exists: false } }, // Chỉ users chưa có avatar field
      { 
        $set: { 
          avatar: null,
          updatedAt: new Date()
        }
      }
    );
    
    
    // Verify - list all users with avatar field
    const users = await User.find({}, 'userName avatar').limit(5);
    users.forEach(user => {
    });
    
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Chạy migration
addAvatarFieldToExistingUsers();