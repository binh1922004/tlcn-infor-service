import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    userName: {type: String, required: true, unique: true},
    email: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    fullName: {type: String, required: true},
    dob: {type: String}
}, {
    timestamps: true //auto generate createAt and updateAt
})

userSchema.statics.findByUsername = function(username){
    return this.findOne({userName: username})
}

export default mongoose.model('User', userSchema);