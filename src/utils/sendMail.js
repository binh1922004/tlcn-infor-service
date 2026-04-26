import nodemailer from "nodemailer";
import { config } from "../../config/env.js";
import { log, logError } from "./logger.js";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, 
  auth: {
    user: config.email,
    pass: config.passEmail,
  },
  tls: {
    rejectUnauthorized: false 
  }
});

// Thêm verify connection để debug
if (!process.env.CI){
  transporter.verify(function(error, success) {
    if (error) {
      logError("SMTP Connection Error:", error);
    } else {
      log("SMTP Server is ready to send emails");
    }
  });
}

const sendMail = async (to, subject, text, html) => {
  try {
    const mailOptions = {
      from: config.email,
      to,
      subject,
    };

    // Nếu có html thì dùng html, không thì dùng text
    if (html) {
      mailOptions.html = html;
    } else {
      mailOptions.text = text;
    }

    const result = await transporter.sendMail(mailOptions);
    log("Email sent successfully:", result.messageId);
    return result;
  } catch (error) {
    logError("Send mail error:", error);
    throw error;
  }
};

export default sendMail;