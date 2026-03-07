require("dotenv").config()
const express = require("express")
const cors    = require("cors")
const { v4: uuidv4 } = require("uuid")

const askAI = require("./agent")
const { handleConversation } = require("./conversationEngine")

const app = express()
app.use(cors())
app.use(express.json())

app.post("/agent", async (req, res) => {
  try {
    const { message, sessionId } = req.body

    if (!message || message.trim() === "") {
      return res.status(400).json({ error: "Message cannot be empty." })
    }

    // Use provided sessionId or generate one
    const sid = sessionId || uuidv4()

    // Try conversation engine first (handles booking flow)
    const conversationReply = handleConversation(sid, message)

    if (conversationReply) {
      return res.json({ ...conversationReply, sessionId: sid })
    }

    // Fallback to Gemini for general questions
    const aiReply = await askAI(message)
    return res.json({
      reply:   aiReply,
      intent:  "chat",
      step:    "idle",
      sessionId: sid
    })

  } catch (error) {
    console.error("Server error:", error.message)
    res.status(500).json({
      reply: "Something went wrong. Please try again.",
      intent: "error"
    })
  }
})

// Health check
app.get("/", (req, res) => res.json({ status: "VoxOps AI running " }))

app.listen(5000, () => console.log("Server running on port 5000"))