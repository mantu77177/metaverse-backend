import mongoose from "mongoose";

const userSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true, index: true },
    status: { type: String, enum: ["active", "expired"], default: "active" },
    amountPaid: { type: Number, required: true },
    promoCodeUsed: { type: String, default: null },
    paymentId: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("UserSubscription", userSubscriptionSchema);