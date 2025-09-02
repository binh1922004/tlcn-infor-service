import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    userName: {type: String, required: true, unique: true},
    email: {type: String, required: true, unique: true},
    password: {type: String},
    fullName: {type: String, required: true},
    avatar: { type: String, default: null },
    avatarPublicId: { type: String, default: null },
    dob: {type: String},
    active: {type:Boolean, default: false}
}, {
    timestamps: true //auto generate createAt and updateAt
})

userSchema.statics.findByUsername = function(username){
    return this.findOne({userName: username})
}

export default mongoose.model('User', userSchema);