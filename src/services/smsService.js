// File: backend/src/services/smsService.js

import axios from "axios";

// ---------- Fast2SMS Provider ----------
const sendViaFast2SMS = async (phone, otp) => {
const apiKey = process.env.FAST2SMS_API_KEY || process.env.SMS_API_KEY;
  if (!apiKey) throw new Error("SMS_API_KEY missing");

  try {
    const { data } = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        route: "q",
        message: `Your OTP is ${otp}. Valid for 5 minutes. Do not share.`,
        language: "english",
        flash: 0,
        numbers: phone,
      },
      {
        headers: {
          authorization: apiKey,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    if (!data.return) {
      throw new Error(data.message || "SMS send failed");
    }

    return { success: true, provider: "fast2sms", response: data };
  } catch (err) {
    console.error("Fast2SMS error:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || err.message);
  }
};

// ---------- Twilio Provider (optional) ----------
const sendViaTwilio = async (phone, otp) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken) throw new Error("Twilio credentials missing");

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    To: `+91${phone}`,
    From: fromNumber,
    Body: `Your OTP is ${otp}. Valid for 5 minutes.`,
  });

  const { data } = await axios.post(url, body, {
    auth: { username: accountSid, password: authToken },
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 10000,
  });

  return { success: true, provider: "twilio", response: data };
};

// ---------- Console (Dev/Testing) ----------
const sendViaConsole = async (phone, otp) => {
  console.log(`\n🔐 ═══════════════════════════════════════`);
  console.log(`   📱 Phone: +91 ${phone}`);
  console.log(`   🔑 OTP:   ${otp}`);
  console.log(`   ⏱️  Valid: 5 minutes`);
  console.log(`🔐 ═══════════════════════════════════════\n`);
  return { success: true, provider: "console" };
};

// ---------- Main Dispatcher ----------
export const sendOtpSms = async (phone, otp) => {
  const provider = process.env.SMS_PROVIDER || "console";

  // Dev mode — OTP console me
  if (process.env.NODE_ENV === "development" && provider === "console") {
    return sendViaConsole(phone, otp);
  }

  switch (provider) {
    case "fast2sms":
      return sendViaFast2SMS(phone, otp);
    case "twilio":
      return sendViaTwilio(phone, otp);
    case "console":
    default:
      return sendViaConsole(phone, otp);
  }
};