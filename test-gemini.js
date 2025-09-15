import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = "AIzaSyC-87IVTMjEIxMfNpNiyvb-j7-8IGYUv6E";

async function testGeminiAPI() {
  try {
    console.log("Testing Gemini API with key:", GEMINI_API_KEY ? '*** (key exists)' : 'No key found!');
    
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    console.log("Sending test prompt to Gemini...");
    const result = await model.generateContent("Say 'Hello, World!' in a creative way.");
    const response = await result.response;
    const text = response.text();
    
    console.log("API Response:", text);
    console.log("✅ Success! The API key is valid.");
  } catch (error) {
    console.error("❌ Error testing Gemini API:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
  }
}

testGeminiAPI();
