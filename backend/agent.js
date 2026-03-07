require("dotenv").config()
const { GoogleGenAI } = require("@google/genai")

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY  // ✅ safe - reads from .env file
})

const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
]

async function askAI(message) {
  for (let modelName of MODEL_CHAIN) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: message
      })
      return response.text

    } catch (error) {
      console.error(`Model failed [${modelName}]:`, error.message)
    }
  }

  return "Sorry, I couldn't process that right now. Please try again later."
}

module.exports = askAI