import mongoose from "mongoose";

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g., "1 Month Prime"
    durationDays: { type: Number, required: true }, // 30, 90, 365
    realPrice: { type: Number, required: true },
    discountedPrice: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    features: [{ type: String }], // e.g., ["Unlimited Quizzes", "Priority Support"]
  },
  { timestamps: true }
);

export default mongoose.model("SubscriptionPlan", subscriptionPlanSchema);