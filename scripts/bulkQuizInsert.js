// File: backend/scripts/bulkQuizInsert.js

import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Quiz from "../src/models/Quiz.js";
import Category from "../src/models/Category.js";

// =====================================================
//   📋 QUIZ METADATA
// =====================================================
const quizMeta = {
  title: "UPSC Speed & Accuracy Test - ₹20 (10 Qs)", 
  description: "Premium 10-question test. Can you score full marks under the time limit?",
  categoryName: "UPSC & State PSC",
  subCategory: "IAS Prelims",
  durationMinutes: 5,  // 10 questions in 5 mins (30 sec per question)
  maxAttempts: 1,      
  realPrice: 50,       
  discountedPrice: 20, // ✅ Price ₹20
  showAnswers: true,
  status: "published",
  negativeMarks: 0.33, 
  marksPerQuestion: 2, // 2 marks per question
  banner: {
    url: "https://res.cloudinary.com/di2iqibyt/image/upload/v1/uploadApp/quizzes/banners/upsc-mock-1.jpg",
    publicId: "uploadApp/quizzes/banners/upsc-mock-1",
  },
};

// =====================================================
//   📝 QUESTIONS DATA — 10 Hard UPSC Questions
// =====================================================
const rawQuestions = [
  { q: "भारतीय संविधान की प्रस्तावना में 'समाजवादी' शब्द किस संशोधन द्वारा जोड़ा गया था? By which amendment was the word 'Socialist' added to the Preamble?", e: "By which amendment was the word 'Socialist' added to the Preamble?", a: "42वां संशोधन | 42nd Amendment", b: "44वां संशोधन | 44th Amendment", c: "52वां संशोधन | 52nd Amendment", d: "73वां संशोधन | 73rd Amendment", correct: "A" },
  { q: "गांधीजी ने 'दांडी मार्च' किस वर्ष शुरू किया था? In which year did Gandhi start the 'Dandi March'?", e: "In which year did Gandhi start the 'Dandi March'?", a: "1920", b: "1928", c: "1930", d: "1942", correct: "C" },
  { q: "पृथ्वी के वायुमंडल की सबसे निचली परत कौन सी है, जहाँ मौसम की घटनाएँ होती हैं? Which is the lowest layer of the Earth's atmosphere where weather phenomena occur?", e: "Which is the lowest layer of the Earth's atmosphere where weather phenomena occur?", a: "समतापमंडल | Stratosphere", b: "क्षोभमंडल | Troposphere", c: "मध्यमंडल | Mesosphere", d: "बहिर्मंडल | Exosphere", correct: "B" },
  { q: "'नीली क्रांति' (Blue Revolution) का संबंध किस क्षेत्र से है? The 'Blue Revolution' is related to which sector?", e: "The 'Blue Revolution' is related to which sector?", a: "कृषि | Agriculture", b: "दूध उत्पादन | Milk Production", c: "मत्स्य पालन | Fish Farming", d: "तेल उत्पादन | Oil Production", correct: "C" },
  { q: "कंप्यूटर का मस्तिष्क (Brain) किसे कहा जाता है? What is considered the 'Brain' of a computer?", e: "What is considered the 'Brain' of a computer?", a: "RAM", b: "CPU", c: "Hard Disk", d: "Monitor", correct: "B" },
  { q: "भारतीय संविधान के किस अनुच्छेद में 'समानता का अधिकार' दिया गया है? Which Article of the Indian Constitution provides the 'Right to Equality'?", e: "Which Article of the Indian Constitution provides the 'Right to Equality'?", a: "अनुच्छेद 12 | Article 12", b: "अनुच्छेद 14 | Article 14", c: "अनुच्छेद 19 | Article 19", d: "अनुच्छेद 21 | Article 21", correct: "B" },
  { q: "सूर्य के सबसे निकट कौन सा ग्रह है? Which planet is closest to the Sun?", e: "Which planet is closest to the Sun?", a: "शुक्र | Venus", b: "पृथ्वी | Earth", c: "बुध | Mercury", d: "मंगल | Mars", correct: "C" },
  { q: "विश्व पर्यावरण दिवस कब मनाया जाता है? When is World Environment Day celebrated?", e: "When is World Environment Day celebrated?", a: "22 अप्रैल | 22 April", b: "5 जून | 5 June", c: "21 जून | 21 June", d: "16 सितंबर | 16 September", correct: "B" },
  { q: "भारत की मुद्रा (Currency) का नाम क्या है? What is the currency of India?", e: "What is the currency of India?", a: "रुपया | Rupee", b: "टका | Taka", c: "दिरहम | Dirham", d: "डॉलर | Dollar", correct: "A" },
  { q: "'जलियांवाला बाग हत्याकांड' किस वर्ष हुआ था? In which year did the 'Jallianwala Bagh massacre' take place?", e: "In which year did the 'Jallianwala Bagh massacre' take place?", a: "1905", b: "1919", c: "1922", d: "1930", correct: "B" }
];

// =====================================================
//   🔄 CONVERT RAW → MONGOOSE FORMAT
// =====================================================
const optionLabels = { A: 0, B: 1, C: 2, D: 3 };

const convertQuestion = (raw) => {
  const correctIndex = optionLabels[raw.correct?.toUpperCase()];

  if (correctIndex === undefined) {
    throw new Error(`Invalid correct option: ${raw.correct} for Q: ${raw.q}`);
  }

  const parseOption = (opt) => {
    if (!opt) return { hindi: "", english: "" };
    const parts = opt.split("|").map((s) => s.trim());
    return {
      hindi: parts[0] || "",
      english: parts[1] || parts[0] || "",
    };
  };

  return {
    questionHindi: raw.q || "",
    questionEnglish: raw.e || "",
    options: [
      parseOption(raw.a),
      parseOption(raw.b),
      parseOption(raw.c),
      parseOption(raw.d),
    ],
    correctOption: correctIndex,
    marks: 2, 
    negativeMarks: 0.33,
    image: { url: null, publicId: null },
  };
};

// =====================================================
//   🚀 MAIN INSERT
// =====================================================
const bulkInsert = async () => {
  const startTime = Date.now();

  try {
    console.log("\n🔵 ===== BULK QUIZ INSERT STARTED =====");
    console.log("⏱️  Time:", new Date().toISOString());

    console.log("\n🔌 Connecting to MongoDB Atlas...");
    await connectDB();
    console.log("✅ Connected");

    console.log("\n🔍 Finding category:", quizMeta.categoryName);
    const cat = await Category.findOne({ name: quizMeta.categoryName });

    if (!cat) {
      console.error("❌ Category not found:", quizMeta.categoryName);
      console.log("\n📋 Available categories:");
      const allCats = await Category.find().select("name slug").lean();
      allCats.forEach((c) => console.log(`   - ${c.name} (${c.slug})`));
      process.exit(1);
    }

    console.log("✅ Category found:", cat.name);
    
    console.log("\n🔄 Converting", rawQuestions.length, "questions...");
    const questions = rawQuestions.map((raw, i) => {
      try {
        return convertQuestion(raw);
      } catch (err) {
        console.error(`❌ Error in Q${i + 1}:`, err.message);
        throw err;
      }
    });
    console.log("✅ All questions converted");

    console.log("\n💾 Creating quiz in Atlas...");
    const quiz = await Quiz.create({
      title: quizMeta.title,
      description: quizMeta.description,
      banner: quizMeta.banner,
      category: cat._id,
      categoryName: cat.name,
      categorySlug: cat.slug || cat.name.toLowerCase(),
      subCategory: quizMeta.subCategory,
      durationMinutes: quizMeta.durationMinutes,
      maxAttempts: quizMeta.maxAttempts,
      totalQuestions: questions.length,
      questions: questions,
      uploadDate: new Date(),
      status: quizMeta.status,
      showAnswers: quizMeta.showAnswers,
      realPrice: quizMeta.realPrice,
      discountedPrice: quizMeta.discountedPrice,
      createdByName: "Bulk Script",
    });

    const totalTime = Date.now() - startTime;

    console.log("\n✅ ===== QUIZ CREATED SUCCESSFULLY =====");
    console.log("   🆔 ID:", quiz._id);
    console.log("   📝 Title:", quiz.title);
    console.log("   ❓ Questions:", quiz.questions.length);
    console.log("   ⏱️  Time Limit:", quiz.durationMinutes, "Minutes");
    console.log("   💰 Price: ₹", quiz.discountedPrice, "(MRP: ₹", quiz.realPrice, ")");
    console.log("   🔄 Max Attempts:", quiz.maxAttempts, "(Only 1)");
    console.log("   ⏱️  Execution time:", totalTime, "ms");
    console.log("=========================================\n");

    process.exit(0);
  } catch (err) {
    console.error("\n❌ ===== ERROR =====");
    console.error("Message:", err.message);
    process.exit(1);
  }
};

bulkInsert();