import redisClient from "../utils/redisClient.js";
import sendMail from "../utils/sendMail.js";
import crypto from "crypto";
import User from "../models/user.models.js";

export const resendOtpRegister = async (req, res) => {
  try {
    const { email, userName } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });
    if (!userName) return res.status(400).json({ message: "Username is required" });

    // Kiểm tra user tồn tại với cả email và username
    const user = await User.findOne({ email, userName });
    if (!user) {
      return res.status(404).json({ 
        message: "Email hoặc username không đúng. Vui lòng kiểm tra lại thông tin." 
      });
    }

    // Kiểm tra user đã active chưa
    if (user.active) {
      return res.status(400).json({ 
        message: "Tài khoản đã được kích hoạt rồi" 
      });
    }

    // Tạo OTP 6 chữ số mới
    const otp = crypto.randomInt(100000, 999999).toString();

    // Xóa OTP cũ nếu có và lưu OTP mới vào Redis với TTL 120s
    await redisClient.del(`otp:register:${email}`);
    await redisClient.setEx(`otp:register:${email}`, 120, otp);

    // Gửi OTP qua email
    await sendMail(email, "Mã OTP tái kích hoạt", `Mã OTP tái kích hoạt của bạn: ${otp}`);

    res.status(200).json({ message: "OTP đã gửi lại về email" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gửi OTP thất bại" });
  }
};

// Xác thực OTP cho Register
export const verifyOtpRegister = async(req, res) =>{
  try {
    const { email, otp } = req.body;
    const savedOtp = await redisClient.get(`otp:register:${email}`);
    if (!savedOtp) return res.status(400).json({ message: "OTP hết hạn hoặc không tồn tại" });
    console.log(otp, savedOtp);
    if (savedOtp !== otp) return res.status(400).json({ message: "OTP không đúng" });
    
    // Cập nhật user thành active
    await User.findOneAndUpdate({ email }, { active: true });
    
    // Xóa OTP
    await redisClient.del(`otp:register:${email}`);
    
    res.status(200).json({ message: "Xác thực OTP thành công, tài khoản đã kích hoạt" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Xác thực OTP thất bại" });
  }
}

// Gửi OTP cho Forgot Password
export const forgotPasswordSendOtp = async (req, res) => {
  try {
    const { userName } = req.body;

    if (!userName) {
      return res.status(400).json({ message: "Username là bắt buộc" });
    }

    // Tìm user theo userName
    const user = await User.findOne({ userName });
    if (!user) {
      return res.status(404).json({ 
        message: "Không tìm thấy tài khoản với username này" 
      });
    }

    // Kiểm tra nếu là tài khoản Google
    if (user.isGoogle) {
      return res.status(400).json({ 
        message: "Tài khoản Google không hỗ trợ đổi mật khẩu" 
      });
    }

    // Tạo OTP 6 chữ số
    const otp = crypto.randomInt(100000, 999999).toString();

    // Lưu OTP vào Redis với TTL 300s (5 phút)
    await redisClient.setEx(`otp:forgot:${userName}`, 300, otp);

    // Gửi OTP qua email
    await sendMail(
      user.email,
      "Mã OTP đặt lại mật khẩu",
      `Mã OTP để đặt lại mật khẩu của bạn là: ${otp}. Mã này có hiệu lực trong 5 phút.`
    );

    res.status(200).json({ 
      message: "Mã OTP đã được gửi đến email của bạn",
      email: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') // Ẩn bớt email
    });

  } catch (err) {
    console.error("Send OTP error:", err);
    res.status(500).json({ message: "Gửi OTP thất bại" });
  }
};

// Xác thực OTP cho Forgot Password
export const forgotPasswordVerifyOtp = async (req, res) => {
  try {
    const { userName, otp } = req.body;

    if (!userName || !otp) {
      return res.status(400).json({ 
        message: "Username và OTP là bắt buộc" 
      });
    }

    // Kiểm tra OTP từ Redis
    const savedOtp = await redisClient.get(`otp:forgot:${userName}`);
    if (!savedOtp) {
      return res.status(400).json({ 
        message: "Mã OTP đã hết hạn hoặc không tồn tại" 
      });
    }

    if (savedOtp !== otp) {
      return res.status(400).json({ 
        message: "Mã OTP không chính xác" 
      });
    }

    // Xóa OTP cũ và lưu trạng thái đã verify (10 phút)
    await redisClient.del(`otp:forgot:${userName}`);
    await redisClient.setEx(`verified:forgot:${userName}`, 600, "true");

    res.status(200).json({ 
      message: "Xác thực OTP thành công. Bạn có thể đặt lại mật khẩu mới." 
    });

  } catch (err) {
    console.error("Verify OTP error:", err);
    res.status(500).json({ message: "Xác thực OTP thất bại" });
  }
};

// Resend OTP 
export const resendForgotPasswordOtp = async (req, res) => {
  try {
    const { userName } = req.body;

    if (!userName) {
      return res.status(400).json({ message: "Username là bắt buộc" });
    }

    const user = await User.findOne({ userName });
    if (!user) {
      return res.status(404).json({ 
        message: "Không tìm thấy tài khoản" 
      });
    }

    if (user.isGoogle) {
      return res.status(400).json({ 
        message: "Tài khoản Google không hỗ trợ đổi mật khẩu" 
      });
    }

    // Tạo OTP mới
    const otp = crypto.randomInt(100000, 999999).toString();
    await redisClient.setEx(`otp:forgot:${userName}`, 300, otp);

    await sendMail(
      user.email,
      "Mã OTP đặt lại mật khẩu",
      `Mã OTP để đặt lại mật khẩu của bạn là: ${otp}. Mã này có hiệu lực trong 5 phút.`
    );

    res.status(200).json({ 
      message: "Mã OTP mới đã được gửi đến email của bạn" 
    });

  } catch (err) {
    console.error("Resend OTP error:", err);
    res.status(500).json({ message: "Gửi lại OTP thất bại" });
  }
};