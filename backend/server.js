require("dotenv").config()
const express = require("express")
const cors    = require("cors")
const fs      = require("fs")
const path    = require("path")
const { v4: uuidv4 } = require("uuid")

const { askAI, conductIntake }                              = require("./agent")
const { handleVoiceConversation, handleDoctorConnectReply } = require("./voiceAgent")
const { handleConversation, handleSymptomResolved, getSession } = require("./conversationEngine")
const { getDoctorsList }                                    = require("./slotManager")

const app = express()
app.use(cors())
app.use(express.json())

// ── API: Bookings for dashboard ──────────────────────────────────────────────
app.get("/api/bookings", (req, res) => {
  try {
    const filePath = path.join(__dirname, "bookings.json")
    if (!fs.existsSync(filePath)) return res.json([])
    const raw  = fs.readFileSync(filePath, "utf8")
    const data = JSON.parse(raw)
    const list = Array.isArray(data) ? data : (data.bookings || [])
    res.json(list)
  } catch (err) {
    console.error("Error reading bookings.json:", err.message)
    res.json([])
  }
})

// ── API: Aggregated analytics for dashboard ─────────────────────────────────────
app.get("/api/analytics", (req, res) => {
  try {
    const filePath = path.join(__dirname, "bookings.json")
    if (!fs.existsSync(filePath)) {
      return res.json({
        today: {
          totalBookings: 0,
          totalRevenue: 0,
          topDoctor: null,
          topSymptom: null,
          byHour: {}
        },
        doctors: []
      })
    }

    const raw  = fs.readFileSync(filePath, "utf8")
    const data = JSON.parse(raw)
    const list = (Array.isArray(data) ? data : (data.bookings || [])).filter(b => b && b.status !== "cancelled")

    const now = new Date()
    const todayKey = now.toISOString().slice(0, 10) // YYYY-MM-DD

    const normalizeDate = (str) => {
      if (!str) return null
      const s = String(str).trim()
      const lower = s.toLowerCase()
      if (lower === "today") return todayKey

      // dd-mm-yyyy or dd/mm/yyyy
      let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
      if (m) {
        const [ , dd, mm, yyyy ] = m
        const d = new Date(parseInt(yyyy,10), parseInt(mm,10)-1, parseInt(dd,10))
        if (!isNaN(d.getTime())) return d.toISOString().slice(0,10)
      }

      // Natural language dates understood by Date()
      const d = new Date(s)
      if (!isNaN(d.getTime())) return d.toISOString().slice(0,10)
      return null
    }

    const isToday = (b) => {
      const key = normalizeDate(b.date)
      return key === todayKey
    }

    const todayBookings = list.filter(isToday)

    const totalBookings = todayBookings.length
    const totalRevenue  = todayBookings.reduce((sum, b) => sum + (Number(b.fee) || 0), 0)

    // Top doctor
    const doctorCounts = {}
    todayBookings.forEach(b => {
      const name = b.doctorName || "Unknown"
      if (!doctorCounts[name]) doctorCounts[name] = 0
      doctorCounts[name]++
    })
    let topDoctor = null
    Object.entries(doctorCounts).forEach(([name, count]) => {
      if (!topDoctor || count > topDoctor.count) {
        topDoctor = { name, count }
      }
    })

    // Top symptom word
    const STOP = new Set(["the","a","an","is","i","have","been","my","and","for"])
    const wordCounts = {}
    todayBookings.forEach(b => {
      const text = (b.symptoms || b.problem || "").toString().toLowerCase()
      text.split(/[^a-zA-Z]+/).forEach(w => {
        if (!w || w.length <= 2) return
        if (STOP.has(w)) return
        wordCounts[w] = (wordCounts[w] || 0) + 1
      })
    })
    let topSymptom = null
    Object.entries(wordCounts).forEach(([word, count]) => {
      if (!topSymptom || count > topSymptom.count) {
        topSymptom = { word, count }
      }
    })

    // By hour (6–22)
    const parseHour = (b) => {
      if (b.time) {
        const t = String(b.time).trim()
        const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
        if (m) {
          let h = parseInt(m[1],10)
          const mer = m[3] ? m[3].toLowerCase() : null
          if (mer === "pm" && h < 12) h += 12
          if (mer === "am" && h === 12) h = 0
          return h
        }
      }
      if (b.bookedAt) {
        const d = new Date(b.bookedAt)
        if (!isNaN(d.getTime())) return d.getHours()
      }
      return null
    }

    const byHour = {}
    todayBookings.forEach(b => {
      const h = parseHour(b)
      if (h == null || h < 6 || h > 22) return
      const key = String(h)
      byHour[key] = (byHour[key] || 0) + 1
    })

    // Doctor workload list
    const doctorStats = {}
    todayBookings.forEach(b => {
      const name = b.doctorName || "Unknown"
      if (!doctorStats[name]) {
        doctorStats[name] = {
          name,
          specialty: b.specialty || "",
          bookingsToday: 0,
          revenueToday: 0
        }
      }
      doctorStats[name].bookingsToday += 1
      doctorStats[name].revenueToday  += Number(b.fee) || 0
    })

    const doctors = Object.values(doctorStats).sort((a, b) => b.bookingsToday - a.bookingsToday)

    res.json({
      today: {
        totalBookings,
        totalRevenue,
        topDoctor: topDoctor || null,
        topSymptom: topSymptom ? topSymptom.word : null,
        byHour
      },
      doctors
    })
  } catch (err) {
    console.error("Error computing analytics:", err.message)
    res.status(500).json({ error: "Failed to compute analytics" })
  }
})

// ── Serve React dashboard (after npm run build) ──────────────────────────────
const frontendBuild = path.join(__dirname, "../frontend/build")
if (fs.existsSync(frontendBuild)) {
  app.use("/dashboard", express.static(frontendBuild))
  app.get("/dashboard/*splat", (req, res) => {
    res.sendFile(path.join(frontendBuild, "index.html"))
  })
  console.log("🖥️  Dashboard served at http://localhost:5000/dashboard")
}

// ── Deepgram Aura TTS endpoint ────────────────────────────────────────────────
app.post("/deepgram-tts", async (req, res) => {
  try {
    const { text } = req.body
    if (!text) return res.status(400).json({ error: "No text" })

    const apiKey = process.env.DEEPGRAM_API_KEY
    if (!apiKey) {
      console.warn("DEEPGRAM_API_KEY not set")
      return res.status(503).json({ error: "Deepgram not configured" })
    }

    const clean = text.replace(/[*_~`#]/g,"").replace(/<<<[^>]*>>>/g,"").trim()
    console.log(`Deepgram TTS: "${clean.slice(0,60)}..."`)

    const https  = require("https")
    const body   = JSON.stringify({ text: clean })
    const opts   = {
      hostname: "api.deepgram.com",
      path:     "/v1/speak?model=aura-asteria-en&encoding=mp3",
      method:   "POST",
      headers: {
        "Authorization":  `Token ${apiKey}`,
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }
    const dgReq = https.request(opts, (dgRes) => {
      if (dgRes.statusCode !== 200) {
        console.error(`Deepgram error: ${dgRes.statusCode}`)
        return res.status(500).json({ error: "TTS failed" })
      }
      // Stream audio directly — no buffering, starts playing immediately
      res.setHeader("Content-Type", "audio/mpeg")
      res.setHeader("Transfer-Encoding", "chunked")
      res.setHeader("Cache-Control", "no-cache")
      res.setHeader("X-Accel-Buffering", "no")
      dgRes.pipe(res)
      dgRes.on("error", (e) => {
        console.error("Deepgram stream error:", e.message)
      })
    })
    dgReq.setTimeout(8000, () => {
      dgReq.destroy()
      if (!res.headersSent) res.status(504).json({ error: "TTS timeout" })
    })
    dgReq.on("error", (e) => {
      console.error("Deepgram error:", e.message)
      if (!res.headersSent) res.status(500).json({ error: "TTS error" })
    })
    dgReq.write(body)
    dgReq.end()
  } catch(err) {
    console.error("TTS error:", err.message)
    res.status(500).json({ error: "Internal error" })
  }
})

// ── Voice endpoint — natural Groq conversation for voice assistant ───────────
app.post("/voice", async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid request." })
    }
    const { message, sessionId, lang } = req.body
    if (!message || message.trim() === "") {
      return res.status(400).json({ error: "Message cannot be empty." })
    }
    const sid   = sessionId || require("uuid").v4()
    const reply = await handleVoiceConversation(sid, message, lang || "en")
    console.log(`🎤 Voice [${sid.slice(-6)}]: "${message.slice(0,40)}" → "${reply.slice(0,60)}"`)
    return res.json({ reply, sessionId: sid })
  } catch (err) {
    console.error("Voice endpoint error:", err.message)
    res.status(500).json({ reply: "Sorry, something went wrong. Please try again." })
  }
})

// ── Unified Twilio WhatsApp webhook ──────────────────────────────────────────
// Handles both: patient WhatsApp bot + doctor YES reply for connect requests
app.post("/twilio", async (req, res) => {
  try {
    const msg  = (req.body.Body || "").trim()
    const from = (req.body.From || "").replace("whatsapp:","").replace("+","")
    const doctorPhone = (process.env.DOCTOR_PHONE || process.env.DOCTOR_WHATSAPP_NUMBER || "").replace(/\D/g,"")

    console.log(`📱 Twilio message from ${from}: "${msg}"`)

    // ── Check if this is doctor replying YES to a connect request ────────
    const isDoctor = doctorPhone && from.endsWith(doctorPhone.slice(-9))
    if (isDoctor) {
      console.log(`👨‍⚕️ Doctor message detected: "${msg}"`)
      const handled = await handleDoctorConnectReply("whatsapp:+" + from, msg)
      if (handled) {
        res.set("Content-Type","text/xml")
        return res.send(`<Response><Message>Got it! Patient has been notified that you are available.</Message></Response>`)
      }
    }

    // ── Otherwise route to normal WhatsApp bot ───────────────────────────
    // Get or create session for this phone number
    const { handleConversation, handleSymptomResolved, getSession } = require("./conversationEngine")
    const { v4: uuidv4 } = require("uuid")

    const sessionId = from
    const conversationReply = handleConversation(sessionId, msg)
    if (conversationReply) {
      const twiml = `<Response><Message>${conversationReply.reply || ""}</Message></Response>`
      res.set("Content-Type","text/xml")
      return res.send(twiml)
    }

    res.set("Content-Type","text/xml")
    res.send(`<Response></Response>`)

  } catch(err) {
    console.error("Twilio webhook error:", err.message)
    res.set("Content-Type","text/xml")
    res.send(`<Response></Response>`)
  }
})

// ── Main agent endpoint ──────────────────────────────────────────────────────
app.post("/agent", async (req, res) => {
  try {
    // Guard against missing or non-JSON body
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid request. JSON body required." })
    }

    const { message, sessionId } = req.body

    if (!message || message.trim() === "") {
      return res.status(400).json({ error: "Message cannot be empty." })
    }

    const sid = sessionId || uuidv4()

    // ── Step 1: Run conversation engine ─────────────────────────────────────
    const conversationReply = handleConversation(sid, message)

    if (conversationReply) {
      return res.json({ ...conversationReply, sessionId: sid })
    }

    // ── Step 2: conversationEngine returned null ─────────────────────────────
    // Check if we are in symptom intake mode
    const session = getSession(sid)

    if (session && (session.step === "symptom_intake" || session.step === "ask_problem")) {
      const intakeHistory = session.data.intakeHistory || []

      console.log(`\n🏥 Running Gemini medical intake | turn ${intakeHistory.length}`)

      // Run Groq/Gemini intake with full history
      const intakeResult = await conductIntake(intakeHistory)

      if (intakeResult.status === "question") {
        // Needs more info — store its question in history and ask user
        session.data.intakeHistory.push({
          role:    "assistant",
          content: intakeResult.reply
        })

        return res.json({
          reply:     intakeResult.reply,
          intent:    "book",
          step:      "symptom_intake",
          sessionId: sid
        })
      }

      if (intakeResult.status === "confident") {
        // Confident — map specialty to doctor(s)
        console.log(`✅ Gemini confident: ${intakeResult.specialty}`)

        const doctorReply = handleSymptomResolved(sid, intakeResult.specialty, intakeResult.summary)

        if (doctorReply) {
          return res.json({ ...doctorReply, sessionId: sid })
        }

        // Specialty matched but no doctor in dataset — tell user honestly
        return res.json({
          reply:     `Based on your symptoms (*${intakeResult.summary}*), you need a *${intakeResult.specialty}*.\n\n` +
                     `Unfortunately we don't have a ${intakeResult.specialty} available right now.\n\n` +
                     `Here are our available doctors:\n\n${getDoctorsList()}\n\n` +
                     `Which doctor would you like to consult?`,
          intent:    "book",
          step:      "ask_doctor",
          sessionId: sid
        })
      }

      if (intakeResult.status === "unclear") {
        // Couldn't determine — be honest, ask user to pick specialist
        console.log(`⚠️ Gemini unclear after intake`)

        const specialtyList = [
          "1. General Physician",   "2. Cardiologist",
          "3. Dermatologist",       "4. Orthopedic Surgeon",
          "5. ENT Specialist",      "6. Neurologist",
          "7. Gastroenterologist",  "8. Pediatrician",
          "9. Psychiatrist",        "10. Dentist",
          "11. Gynecologist",       "12. Ophthalmologist",
          "13. Urologist",          "14. Endocrinologist",
          "15. Pulmonologist",      "16. Oncologist",
          "17. Rheumatologist",     "18. Nephrologist"
        ].join("\n")

        return res.json({
          reply:     `I want to make sure you see the right doctor, so let me be honest — based on what you've described (*${intakeResult.summary}*), I'm not fully certain which specialist would be best for you.\n\n` +
                     `Could you tell me which type of specialist you'd like to see?\n\n${specialtyList}\n\n` +
                     `Reply with a number or specialist name.`,
          intent:    "book",
          step:      "ask_doctor",
          sessionId: sid
        })
      }
    }

    // ── Step 3: Normal AI chatbot for non-booking messages ───────────────────
    const aiReply = await askAI(message)
    return res.json({
      reply:     aiReply,
      intent:    "chat",
      step:      "idle",
      sessionId: sid
    })

  } catch (error) {
    console.error("Server error:", error.message)
    res.status(500).json({
      reply:  "Something went wrong. Please try again.",
      intent: "error"
    })
  }
})

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "VoxOps AI running ✅" }))

app.listen(5000, () => {
  console.log("🚀 Server running on port 5000")
  console.log("📊 Bookings API: http://localhost:5000/api/bookings")

  // ── Twilio config check on startup ──────────────────────────────────────
  const sid   = process.env.TWILIO_ACCOUNT_SID   || ""
  const token = process.env.TWILIO_AUTH_TOKEN     || ""
  const from  = process.env.TWILIO_WHATSAPP_FROM  || process.env.TWILIO_WHATSAPP_NUMBER || ""
  const dPhone = process.env.DOCTOR_PHONE         || ""

  console.log("\n📋 TWILIO CONFIG CHECK:")
  console.log(`   SID:          ${sid   ? sid.slice(0,10)+"..." : "❌ NOT SET"}`)
  console.log(`   AUTH TOKEN:   ${token ? token.slice(0,6)+"..." : "❌ NOT SET"}`)
  console.log(`   FROM NUMBER:  ${from  ? from : "❌ NOT SET — set TWILIO_WHATSAPP_FROM in .env"}`)
  console.log(`   DOCTOR PHONE: ${dPhone? dPhone : "❌ NOT SET — set DOCTOR_PHONE in .env"}`)

  if (!from) {
    console.error("\n⚠️  WARNING: TWILIO_WHATSAPP_FROM is not set!")
    console.error("   Add this to your .env: TWILIO_WHATSAPP_FROM=whatsapp:+14155238886")
    console.error("   Get your sandbox number from: Twilio Console → Messaging → Try it out → WhatsApp")
  }
  if (sid && !sid.startsWith("AC")) {
    console.error("\n⚠️  WARNING: TWILIO_ACCOUNT_SID looks wrong — should start with 'AC'")
  }
  const fromDigits = from.replace(/\D/g,"")
  if (from && fromDigits.length < 10) {
    console.error("\n⚠️  WARNING: TWILIO_WHATSAPP_FROM looks wrong:", from)
    console.error("   Format should be: whatsapp:+14155238886")
  }
  console.log("")
})