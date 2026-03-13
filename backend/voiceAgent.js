require("dotenv").config()
const https = require("https")
const fs    = require("fs")
const path  = require("path")

const BOOKINGS_FILE = path.join(__dirname, "bookings.json")
const PATIENTS_FILE = path.join(__dirname, "patients.json")

// ── Groq caller with retry ────────────────────────────────────────────────────
async function callGroq(messages, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try { return await callGroqOnce(messages) }
    catch(e) {
      console.error(`Groq attempt ${attempt} failed:`, e.message)
      if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * attempt))
      else {
        // Fallback to Gemini if Groq is rate limited
        console.log("⚠️  Groq failed — trying Gemini fallback...")
        return await callGeminiFallback(messages)
      }
    }
  }
}

async function callGeminiFallback(messages) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("No Gemini API key configured")
  const systemMsg = messages.find(m => m.role === "system")
  const chatMsgs  = messages.filter(m => m.role !== "system")
  const contents  = chatMsgs.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }))
  const body = JSON.stringify({
    system_instruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
    contents,
    generationConfig: { maxOutputTokens: 500, temperature: 0.5 }
  })
  return new Promise((resolve, reject) => {
    const https = require("https")
    const opts = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }
    const req = https.request(opts, (res) => {
      let d = ""
      res.on("data", c => d += c)
      res.on("end", () => {
        try {
          const json = JSON.parse(d)
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) { console.log("✅ Gemini fallback success"); resolve(text.trim()) }
          else reject(new Error("Gemini returned no text"))
        } catch(e) { reject(e) }
      })
    })
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

function callGroqOnce(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages,
      temperature: 0.4,
      max_tokens: 120  // short responses = faster latency
    })
    const opts = {
      hostname: "api.groq.com",
      path:     "/openai/v1/chat/completions",
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Authorization":  `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Length": Buffer.byteLength(body)
      }
    }
    const req = https.request(opts, (res) => {
      let d = ""
      res.on("data", c => d += c)
      res.on("end", () => {
        try {
          const json = JSON.parse(d)
          if (json.error) return reject(new Error(json.error.message))
          resolve(json.choices?.[0]?.message?.content?.trim() || "")
        } catch(e) { reject(e) }
      })
    })
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

// ── Twilio WhatsApp ───────────────────────────────────────────────────────────
function sendWhatsApp(to, message) {
  return new Promise((resolve) => {
    const sid   = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    const from  = process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_WHATSAPP_NUMBER
    if (!sid || !token || !from) {
      console.warn("⚠️  Twilio not configured")
      return resolve(false)
    }
    const digits = to.replace(/\D/g, "")
    const toNum  = `whatsapp:+${digits.startsWith("91") ? digits : "91" + digits}`
    const body   = new URLSearchParams({ From: from, To: toNum, Body: message }).toString()
    const auth   = Buffer.from(`${sid}:${token}`).toString("base64")
    const opts   = {
      hostname: "api.twilio.com",
      path:     `/2010-04-01/Accounts/${sid}/Messages.json`,
      method:   "POST",
      headers: {
        "Content-Type":   "application/x-www-form-urlencoded",
        "Authorization":  `Basic ${auth}`,
        "Content-Length": Buffer.byteLength(body)
      }
    }
    const req = https.request(opts, (res) => {
      let d = ""
      res.on("data", c => d += c)
      res.on("end", () => {
        try {
          const json = JSON.parse(d)
          if (json.sid) { 
            console.log(`✅ WhatsApp sent to ${toNum} | SID: ${json.sid}`)
            resolve(true) 
          } else { 
            console.error(`❌ WhatsApp FAILED to ${toNum}`)
            console.error(`   Error ${json.code}: ${json.message}`)
            if (json.code === 63016 || json.message?.includes("sandbox")) {
              console.error(`   ⚠️  SANDBOX: Patient must send "join <word>" to ${from} first`)
            }
            if (json.code === 21608) {
              console.error(`   ⚠️  Phone number not opted into Twilio sandbox`)
            }
            resolve(false) 
          }
        } catch(e) { console.error("WhatsApp parse error:", e.message); resolve(false) }
      })
    })
    req.on("error", (e) => { console.error("WhatsApp request error:", e.message); resolve(false) })
    req.write(body)
    req.end()
  })
}

// ── File helpers ──────────────────────────────────────────────────────────────
function loadBookings() {
  try {
    if (!fs.existsSync(BOOKINGS_FILE)) return []
    const raw = JSON.parse(fs.readFileSync(BOOKINGS_FILE, "utf8"))
    return Array.isArray(raw) ? raw : (raw.bookings || [])
  } catch(e) { return [] }
}

// Count active bookings for a specific doctor/date/time slot
function getSlotBookingCount(doctorId, date, time) {
  try {
    const list = loadBookings()
    const d = (date || "").toString().trim().toLowerCase()
    const t = (time || "").toString().trim().toLowerCase()
    if (!doctorId || !d || !t) return 0
    return list.filter(b =>
      b &&
      b.status !== "cancelled" &&
      (b.doctorId || "").toString().trim() === doctorId &&
      (b.date || "").toString().trim().toLowerCase() === d &&
      (b.time || "").toString().trim().toLowerCase() === t
    ).length
  } catch {
    return 0
  }
}

// Very simple next-slot suggestion helper
function suggestNextSlot(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return timeStr || ""
  const raw = timeStr.trim().toUpperCase()
  if (raw === "4:00 PM" || raw === "04:00 PM") return "4:30 PM"

  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/)
  if (!m) return timeStr
  let hour = parseInt(m[1], 10)
  const minute = parseInt(m[2] || "00", 10)
  const meridiem = m[3]

  // For this hackathon, just move one hour ahead within same AM/PM window
  hour = hour + 1
  if (hour === 12 && meridiem === "AM") hour = 12
  if (hour > 12) hour = 12

  const hh = hour.toString()
  const mm = minute.toString().padStart(2, "0")
  return `${hh}:${mm} ${meridiem}`
}

function writeBookings(list) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify({ bookings: list }, null, 2))
}

function saveBooking(booking) {
  try {
    const list = loadBookings()
    list.push(booking)
    writeBookings(list)
    console.log(`📋 Booking saved: ${booking.ref} — ${booking.patientName}`)
    return true
  } catch(e) { console.error("Save booking error:", e.message); return false }
}

function cancelBookingByRef(ref) {
  try {
    const list = loadBookings()
    const idx  = list.findIndex(b => b.ref === ref)
    if (idx === -1) return null
    list[idx].status      = "cancelled"
    list[idx].cancelledAt = new Date().toISOString()
    writeBookings(list)
    console.log(`❌ Booking cancelled: ${ref}`)
    return list[idx]
  } catch(e) { console.error("Cancel error:", e.message); return null }
}

function rescheduleBooking(ref, newDate, newTime) {
  try {
    const list = loadBookings()
    const idx  = list.findIndex(b => b.ref === ref)
    if (idx === -1) return null
    const oldDate = list[idx].date
    const oldTime = list[idx].time
    list[idx].date         = newDate
    list[idx].time         = newTime
    list[idx].rescheduledAt = new Date().toISOString()
    list[idx].previousDate  = oldDate
    list[idx].previousTime  = oldTime
    writeBookings(list)
    console.log(`🔄 Booking rescheduled: ${ref} → ${newDate} ${newTime}`)
    return list[idx]
  } catch(e) { console.error("Reschedule error:", e.message); return null }
}

function getActiveBookingByPhone(phone) {
  const list    = loadBookings()
  const digits  = phone.replace(/\D/g, "")
  return list.find(b =>
    b.status === "confirmed" &&
    b.patientPhone?.replace(/\D/g, "")?.endsWith(digits.slice(-9))
  ) || null
}

// ── Patient memory ────────────────────────────────────────────────────────────
function loadPatients() {
  try {
    if (fs.existsSync(PATIENTS_FILE)) return JSON.parse(fs.readFileSync(PATIENTS_FILE, "utf8"))
  } catch(e) {}
  return {}
}

function savePatient(phone, name, bookingSummary) {
  try {
    const p = loadPatients()
    if (!p[phone]) p[phone] = { visits: [] }
    p[phone].name     = name
    p[phone].phone    = phone
    p[phone].lastSeen = new Date().toISOString()
    if (bookingSummary) {
      p[phone].visits.unshift(bookingSummary)
      if (p[phone].visits.length > 5) p[phone].visits = p[phone].visits.slice(0, 5)
    }
    fs.writeFileSync(PATIENTS_FILE, JSON.stringify(p, null, 2))
  } catch(e) { console.error("Save patient error:", e.message) }
}

function getPatient(phone) {
  return loadPatients()[phone] || null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const genRef = () => "VX" + Math.floor(100000 + Math.random() * 900000)

const DOCTORS = {
  "Dr. Arvind Sharma":   { id:"DOC001", specialty:"General Physician",  fee:500  },
  "Dr. Rajesh Mehta":    { id:"DOC002", specialty:"Cardiologist",        fee:1200 },
  "Dr. Priya Kapoor":    { id:"DOC003", specialty:"Dermatologist",       fee:800  },
  "Dr. Suresh Verma":    { id:"DOC004", specialty:"Orthopedic Surgeon",  fee:1000 },
  "Dr. Kavitha Rao":     { id:"DOC005", specialty:"ENT Specialist",      fee:700  },
  "Dr. Anil Gupta":      { id:"DOC006", specialty:"Neurologist",         fee:1500 },
  "Dr. Vikram Singh":    { id:"DOC007", specialty:"Gastroenterologist",  fee:900  },
  "Dr. Sunita Patel":    { id:"DOC008", specialty:"Pediatrician",        fee:600  },
  "Dr. Pooja Menon":     { id:"DOC012", specialty:"Psychiatrist",        fee:1200 },
  "Dr. Harish Nambiar":  { id:"DOC013", specialty:"Dentist",             fee:600  },
  "Dr. Ananya Krishnan": { id:"DOC014", specialty:"Gynecologist",        fee:1000 },
  "Dr. Sanjay Reddy":    { id:"DOC015", specialty:"Ophthalmologist",     fee:900  },
}

function getNowIST() {
  return new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000)
}
function getTodayStr() {
  return getNowIST().toLocaleDateString("en-IN", { weekday:"long", year:"numeric", month:"long", day:"numeric" })
}
function getCurrentTimeStr() {
  return getNowIST().toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", hour12:true })
}

// ── In-memory sessions ────────────────────────────────────────────────────────
const voiceSessions = {}

// ── Emergency keywords ────────────────────────────────────────────────────────
const EMERGENCY_TERMS = [
  "heart pain","chest pain","chest tightness","heart attack",
  "pain in heart","pain in my heart","heart is paining","heart hurts",
  "in heart","my heart","heart ache","hurts in heart","n heart",
  "can't breathe","cannot breathe","difficulty breathing","shortness of breath",
  "not breathing","stroke","unconscious","not responding","severe bleeding",
  "collapsed","pain in left arm","jaw pain","sudden numbness","cant breathe",
  "cardiac arrest","fainted","seizure","can not breathe"
]

// More aggressive emergency check — word-level scan
function checkEmergency(msg) {
  const lower = msg.toLowerCase().trim()
  if (EMERGENCY_TERMS.some(t => lower.includes(t))) return true
  // Single word triggers
  const words = lower.split(/\s+/)
  const dangerWords = ["stroke","seizure","unconscious","fainted","collapsed"]
  if (words.some(w => dangerWords.includes(w))) return true
  // Heart + pain combination
  if ((lower.includes("heart") || lower.includes("chest")) && 
      (lower.includes("pain") || lower.includes("hurt") || lower.includes("ache") || 
       lower.includes("tight") || lower.includes("attack"))) return true
  return false
}

// ── Extract info from message ─────────────────────────────────────────────────
function extractInfo(msg, data) {
  const phoneClean = msg.replace(/\s+/g, "")
  const phoneMatch = phoneClean.match(/\d{9,11}/)
  if (phoneMatch && !data.phone) {
    data.phone = phoneMatch[0].slice(-10)
    console.log(`📱 Phone: ${data.phone}`)
    const existing = getPatient(data.phone)
    if (existing) {
      data.name        = data.name || existing.name
      data.isReturning = true
      data.lastVisit   = existing.visits?.[0] || null
    }
  }
  // Strict name extraction — only from clear "I am X" or "my name is X" patterns
  // Must be a proper noun (capitalized), min 3 chars, not a common word
  const COMMON_WORDS = ["the","this","that","with","from","have","been","they","them",
    "their","what","when","where","which","will","would","could","should","experiencing",
    "suffering","having","feeling","getting","going","coming","looking","trying","saying",
    "morning","afternoon","evening","today","tomorrow","monday","tuesday","wednesday",
    "thursday","friday","saturday","sunday","january","february","march","april","india",
    "pain","headache","fever","stomach","doctor","hospital","appointment","please","thank"]
  const nameMatch = msg.match(/(?:i(?:'m| am)|my name is|this is|name(?:\s+is)?\s*(?:as\s+)?)\s+([A-Za-z]{3,20})(?:\s|$|,)/i)
  if (nameMatch && !data.name) {
    const candidate = nameMatch[1]
    const isCommon  = COMMON_WORDS.includes(candidate.toLowerCase())
    const isNumber  = /\d/.test(candidate)
    if (!isCommon && !isNumber) {
      data.name = candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase()
      console.log(`👤 Name: ${data.name}`)
    }
  }
  const dateWords = ["today","tomorrow","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]
  for (const w of dateWords) {
    if (msg.toLowerCase().includes(w) && !data.newDate) {
      data.newDate = w.charAt(0).toUpperCase() + w.slice(1)
      break
    }
  }
  const dateMatch = msg.match(/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?/i)
  if (dateMatch && !data.newDate) data.newDate = dateMatch[0].trim()

  const timeMatch = msg.match(/\d{1,2}(?::\d{2})?\s*(?:am|pm)|morning|afternoon|evening/i)
  if (timeMatch && !data.newTime) data.newTime = timeMatch[0].trim()

  return data
}

// ── Build system prompt ───────────────────────────────────────────────────────
function buildPrompt(data, activeBooking) {
  const known = []
  if (data.name)    known.push(`name: ${data.name}`)
  if (data.phone)   known.push(`phone: ${data.phone}`)
  if (data.newDate) known.push(`new preferred date: ${data.newDate}`)
  if (data.newTime) known.push(`new preferred time: ${data.newTime}`)

  let bookingContext = ""
  if (activeBooking) {
    bookingContext = `\nACTIVE BOOKING FOUND:
Ref: ${activeBooking.ref}
Doctor: ${activeBooking.doctorName}
Date: ${activeBooking.date}
Time: ${activeBooking.time}
Status: ${activeBooking.status}

Since this patient has an upcoming appointment, FIRST ask: "I can see you have an appointment with ${activeBooking.doctorName} on ${activeBooking.date} at ${activeBooking.time}. Would you like to cancel it, reschedule it, or book a new appointment?"`
  }

  let returningNote = ""
  if (data.isReturning && data.lastVisit && !activeBooking) {
    returningNote = `\nReturning patient. Last visit: ${data.lastVisit.doctorName} on ${data.lastVisit.date}. Ask if they want the same doctor.`
  }

  // Build language-specific step phrases
  const isNonEnglish = data.lang && data.lang !== "en"
  const L = data.langName || "English"

  // All booking flow questions translated per language
  const STEPS = {
    en: {
      name:     "May I have your name please?",
      phone:    "Can I have your phone number?",
      where:    "Where exactly is the pain or issue located?",
      howlong:  "How long have you been experiencing this?",
      other:    "Any other symptoms like fever, nausea, or sensitivity to light?",
      date:     "What date would you like the appointment?",
      time:     "What time works best for you?",
    },
    hi: {
      name:     "क्या आप अपना नाम बता सकते हैं?",
      phone:    "क्या आप अपना फोन नंबर दे सकते हैं?",
      where:    "दर्द या समस्या बिल्कुल कहाँ है?",
      howlong:  "आप यह कब से महसूस कर रहे हैं?",
      other:    "क्या बुखार, मतली या रोशनी से तकलीफ जैसे कोई और लक्षण हैं?",
      date:     "आप किस तारीख को अपॉइंटमेंट चाहते हैं?",
      time:     "आपके लिए कौन सा समय सही रहेगा?",
    },
    kn: {
      name:     "ನಿಮ್ಮ ಹೆಸರು ಏನು?",
      phone:    "ನಿಮ್ಮ ಫೋನ್ ಸಂಖ್ಯೆ ಹೇಳಿ.",
      where:    "ನೋವು ಅಥವಾ ಸಮಸ್ಯೆ ನಿಖರವಾಗಿ ಎಲ್ಲಿದೆ?",
      howlong:  "ಇದು ಎಷ್ಟು ದಿನಗಳಿಂದ ಇದೆ?",
      other:    "ಜ್ವರ, ವಾಂತಿ ಅಥವಾ ಬೆಳಕಿಗೆ ಸಂವೇದನೆ ಇದೆಯೇ?",
      date:     "ಯಾವ ದಿನಾಂಕದಂದು ಅಪಾಯಿಂಟ್ಮೆಂಟ್ ಬೇಕು?",
      time:     "ಯಾವ ಸಮಯ ನಿಮಗೆ ಅನುಕೂಲ?",
    },
    ta: {
      name:     "உங்கள் பெயர் என்ன?",
      phone:    "உங்கள் தொலைபேசி எண் சொல்லுங்கள்.",
      where:    "வலி அல்லது பிரச்சனை சரியாக எங்கே உள்ளது?",
      howlong:  "இது எத்தனை நாட்களாக இருக்கிறது?",
      other:    "காய்ச்சல், குமட்டல் அல்லது வெளிச்சத்தில் உணர்வு இருக்கிறதா?",
      date:     "எந்த தேதியில் சந்திப்பு வேண்டும்?",
      time:     "எந்த நேரம் உங்களுக்கு வசதியாக இருக்கும்?",
    },
    te: {
      name:     "మీ పేరు ఏమిటి?",
      phone:    "మీ ఫోన్ నంబర్ చెప్పండి.",
      where:    "నొప్పి లేదా సమస్య సరిగ్గా ఎక్కడ ఉంది?",
      howlong:  "ఇది ఎన్ని రోజులుగా ఉంది?",
      other:    "జ్వరం, వికారం లేదా వెలుతురుకు సున్నితత్వం ఉందా?",
      date:     "ఏ తేదీన అపాయింట్మెంట్ కావాలి?",
      time:     "మీకు ఏ సమయం అనుకూలంగా ఉంటుంది?",
    },
    ml: {
      name:     "നിങ്ങളുടെ പേര് എന്താണ്?",
      phone:    "നിങ്ങളുടെ ഫോൺ നമ്പർ പറയൂ.",
      where:    "വേദന അല്ലെങ്കിൽ പ്രശ്നം കൃത്യമായി എവിടെയാണ്?",
      howlong:  "ഇത് എത്ര ദിവസമായി ഉണ്ട്?",
      other:    "പനി, ഓക്കാനം അല്ലെങ്കിൽ വെളിച്ചത്തോട് സംവേദനക്ഷമത ഉണ്ടോ?",
      date:     "ഏത് തീയതിയിൽ അപ്പോയിൻ്റ്മെൻ്റ് വേണം?",
      time:     "ഏത് സമയം നിങ്ങൾക്ക് സൗകര്യപ്രദമാണ്?",
    },
  }
  const S = STEPS[data.lang] || STEPS.en

  return `${isNonEnglish ? `CRITICAL SYSTEM INSTRUCTION — READ FIRST:
You are operating in ${L} MODE. You MUST reply in ${L} ONLY.
NEVER use English. NEVER mix languages. Every single word must be ${L}.
If you reply in English, the system will FAIL. Reply in ${L} only.
==========================================================================

` : ""}You are Aria, a warm AI medical receptionist at VoxOps MediCare Hospital.
Current date and time: ${getTodayStr()}, ${getCurrentTimeStr()} IST.${returningNote}${bookingContext}

${isNonEnglish ? `LANGUAGE: ${L.toUpperCase()} ONLY. Zero English words allowed.` : "LANGUAGE: English"}

KNOWN DATA — never ask for these again:
${known.length ? known.join("\n") : "none yet"}

CRITICAL RULE — ONE QUESTION PER MESSAGE, NO EXCEPTIONS:
Never ask two things in one message. Always wait for answer before next question.

BOOKING FLOW — strictly one step at a time, NEVER skip steps:
STEP 1: If name unknown → ask ONLY "${S.name}"
STEP 2: If phone unknown → ask ONLY "${S.phone}"
STEP 3: Ask ONLY "${S.where}" — WAIT FOR ANSWER
STEP 4: Ask ONLY "${S.howlong}" — WAIT FOR ANSWER
STEP 5: Ask ONLY "${S.other}" — WAIT FOR ANSWER
STEP 6: ONLY after receiving answers to ALL THREE of steps 3,4,5 → suggest doctor
CRITICAL: You MUST complete steps 3, 4 AND 5 before step 6. Skipping any symptom question is FORBIDDEN.
STEP 7: Ask ONLY "${S.date}"
STEP 8: Ask ONLY "${S.time}"
STEP 9: ${isNonEnglish ? `Say the booking summary in ${L} — doctor name, date, time, fee. Ask confirmation in ${L}.` : `Say "I have you booked with [doctor] on [date] at [time], fee Rs [X]. Shall I confirm?"`}
STEP 10: On patient YES → output FIRST:
<<<BOOKING_JSON>>>{"name":"","phone":"","doctor":"","specialty":"","date":"","time":"","fee":0}<<<END_BOOKING>>>
Then add your friendly confirmation message${isNonEnglish ? ` in ${L}` : ""}.

CANCEL:
- Confirm intent then output: <<<CANCEL_JSON>>>{"ref":"${activeBooking?.ref || ""}","name":"","phone":"","doctor":"","date":"","time":""}<<<END_CANCEL>>>

RESCHEDULE:
- Get new date then time then output: <<<RESCHEDULE_JSON>>>{"ref":"${activeBooking?.ref || ""}","name":"","phone":"","doctor":"","date":"","time":"","newDate":"","newTime":""}<<<END_RESCHEDULE>>>

CONNECT TO DOCTOR:
- When patient says talk/speak/connect to doctor output: <<<CONNECT_DOCTOR>>>{"patientName":"","patientPhone":"","doctorName":"","reason":""}<<<END_CONNECT>>>

RULES:
- ONE question per message — NEVER combine two questions
- NEVER output JSON before patient confirms
- headache/migraine→Neurologist, stomach/nausea→Gastroenterologist, heart/chest→Cardiologist, skin→Dermatologist, ear/nose/throat→ENT, bones/joints→Orthopedic, eyes→Ophthalmologist, only fever/cold→General Physician
- Reject past dates/times. Today only after ${getCurrentTimeStr()}
- Keep replies 1-2 sentences max, warm and natural, no emojis
- Be DIRECT and CLEAR — say exactly what you need, nothing extra
- Never repeat what the patient just said back to them
- Never say "I understand" or "I see" or "Of course" — just ask the next question directly
- Voice output only — no markdown, no bullet points, no lists

Available doctors:
Dr. Arvind Sharma — General Physician — Rs 500
Dr. Rajesh Mehta — Cardiologist — Rs 1200
Dr. Priya Kapoor — Dermatologist — Rs 800
Dr. Suresh Verma — Orthopedic Surgeon — Rs 1000
Dr. Kavitha Rao — ENT Specialist — Rs 700
Dr. Anil Gupta — Neurologist — Rs 1500
Dr. Vikram Singh — Gastroenterologist — Rs 900
Dr. Sunita Patel — Pediatrician — Rs 600
Dr. Pooja Menon — Psychiatrist — Rs 1200
Dr. Harish Nambiar — Dentist — Rs 600
Dr. Ananya Krishnan — Gynecologist — Rs 1000
Dr. Sanjay Reddy — Ophthalmologist — Rs 900`
}

// ── Parse JSON blocks ─────────────────────────────────────────────────────────
function extractBlock(reply, openTag, closeTag) {
  try {
    const m = reply.match(new RegExp(openTag + "\\s*([\\s\\S]*?)\\s*" + closeTag))
    if (!m) return null
    return JSON.parse(m[1])
  } catch(e) { return null }
}

// ── Clean for speech ──────────────────────────────────────────────────────────
function cleanSpeech(text) {
  return text
    .replace(/<<<[A-Z_]+>>>[\s\S]*?<<<END_[A-Z_]+>>>/g, "")
    .replace(/<<<[^>]*>>>/g, "")
    .replace(/\{[\s\S]*?"(?:doctor|name|ref)"[\s\S]*?\}/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/[_~`#]/g, "")
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/\n+/g, ". ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim()
}

// ── Doctor connect — pending requests stored in memory ────────────────────────
const doctorConnectRequests = {}

function storeDoctorConnectRequest(patientPhone, data) {
  doctorConnectRequests[patientPhone] = { ...data, createdAt: Date.now(), status: "pending" }
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function handleVoiceConversation(sessionId, userMessage, req_lang = "en") {
  if (!voiceSessions[sessionId]) {
    voiceSessions[sessionId] = { history: [], data: {}, booked: false, cancelled: false, rescheduled: false, emergency: false, createdAt: Date.now() }
  }
  const session = voiceSessions[sessionId]

  // ── Emergency check — highest priority ───────────────────────────────────
  const msgLower = userMessage.toLowerCase()
  if (session.emergency || checkEmergency(userMessage)) {
    session.emergency = true
    console.log(`🚨 EMERGENCY: "${userMessage}"`)
    return "EMERGENCY_DETECTED"
  }

  // ── Auto-detect language from message script ─────────────────────────────
  // This runs EVERY message — if Indian script detected, lock language immediately
  const langNames = { hi:"Hindi", ta:"Tamil", te:"Telugu", kn:"Kannada", ml:"Malayalam", en:"English" }

  function detectScriptLang(text) {
    if (/[ಀ-೿]/.test(text)) return "kn"  // Kannada
    if (/[ऀ-ॿ]/.test(text)) return "hi"  // Hindi/Devanagari
    if (/[஀-௿]/.test(text)) return "ta"  // Tamil
    if (/[ఀ-౿]/.test(text)) return "te"  // Telugu
    if (/[ഀ-ൿ]/.test(text)) return "ml"  // Malayalam
    return null
  }

  const detectedFromScript = detectScriptLang(userMessage)

  if (detectedFromScript) {
    // Patient is writing in Indian script — lock language to that script
    if (session.data.lang !== detectedFromScript) {
      session.data.lang     = detectedFromScript
      session.data.langName = langNames[detectedFromScript]
      console.log(`🌐 Auto-detected from script: ${session.data.langName}`)
    }
  } else if (req_lang && req_lang !== "en" && req_lang !== session.data.lang) {
    // Use frontend-provided lang if no script detected
    session.data.lang     = req_lang
    session.data.langName = langNames[req_lang] || "English"
    console.log(`🌐 Language set from UI: ${session.data.langName}`)
  } else if (!session.data.lang) {
    session.data.lang     = "en"
    session.data.langName = "English"
  }
  // NOTE: Once a non-English language is set, it STAYS for the whole session
  // It only changes if patient sends a different Indian script

  // Extract info
  session.data = extractInfo(userMessage, session.data)

  // Check for active booking once we have phone
  let activeBooking = null
  if (session.data.phone && !session.data.activeBookingChecked) {
    activeBooking = getActiveBookingByPhone(session.data.phone)
    session.data.activeBooking        = activeBooking
    session.data.activeBookingChecked = true
    if (activeBooking) {
      console.log(`📅 Active booking found: ${activeBooking.ref}`)
      // Clear any stale date/time from previous capture — patient hasn't given new ones yet
      session.data.newDate = null
      session.data.newTime = null
      // Build booking prompt in patient's language
      const lang4booking = session.data.lang || "en"
      const bookingPrompts = {
        en: `I can see you have an appointment with ${activeBooking.doctorName} on ${activeBooking.date} at ${activeBooking.time}. Would you like to cancel it, reschedule it, or book a new appointment?`,
        hi: `मैं देख सकती हूँ कि ${activeBooking.date} को ${activeBooking.time} बजे ${activeBooking.doctorName} के साथ आपका अपॉइंटमेंट है। क्या आप इसे रद्द करना, बदलना या नया अपॉइंटमेंट बुक करना चाहते हैं?`,
        kn: `${activeBooking.date} ರಂದು ${activeBooking.time} ಗೆ ${activeBooking.doctorName} ಅವರೊಂದಿಗೆ ನಿಮಗೆ ಅಪಾಯಿಂಟ್ಮೆಂಟ್ ಇದೆ. ನೀವು ಅದನ್ನು ರದ್ದುಗೊಳಿಸಲು, ಮರುಹೊಂದಿಸಲು ಅಥವಾ ಹೊಸ ಅಪಾಯಿಂಟ್ಮೆಂಟ್ ಬುಕ್ ಮಾಡಲು ಬಯಸುತ್ತೀರಾ?`,
        ta: `${activeBooking.date} அன்று ${activeBooking.time} மணிக்கு ${activeBooking.doctorName} உடன் உங்களுக்கு சந்திப்பு உள்ளது. ரத்து செய்ய, மாற்ற அல்லது புதிய சந்திப்பு பதிவு செய்ய விரும்புகிறீர்களா?`,
        te: `${activeBooking.date} న ${activeBooking.time} కి ${activeBooking.doctorName} తో మీకు అపాయింట్మెంట్ ఉంది. రద్దు చేయాలా, మార్చాలా లేదా కొత్తది బుక్ చేయాలా?`,
        ml: `${activeBooking.date} ന് ${activeBooking.time} ന് ${activeBooking.doctorName} നോടൊപ്പം നിങ്ങൾക്ക് അപ്പോയിൻ്റ്മെൻ്റ് ഉണ്ട്. റദ്ദാക്കണോ, മാറ്റണോ അല്ലെങ്കിൽ പുതിയത് ബുക്ക് ചെയ്യണോ?`,
      }
      const prompt = bookingPrompts[lang4booking] || bookingPrompts.en
      session.history.push({ role: "user", content: userMessage })
      session.history.push({ role: "assistant", content: prompt })
      return prompt
    }
  } else {
    activeBooking = session.data.activeBooking
  }

  // ── Input validation ─────────────────────────────────────────────────────
  // Accept: English letters OR any Indian script character
  // Reject: pure symbols, numbers only, empty
  const INDIAN_SCRIPT = new RegExp(
    '[\u0900-\u097F' +  // Devanagari (Hindi)
    '\u0C80-\u0CFF' +   // Kannada
    '\u0C00-\u0C7F' +   // Telugu  
    '\u0D00-\u0D7F' +   // Malayalam
    '\u0B80-\u0BFF]'    // Tamil
  )
  const hasText = /[a-zA-Z]/.test(userMessage) || INDIAN_SCRIPT.test(userMessage)
  console.log("Input validation — hasText:", hasText, "| msg:", userMessage.slice(0,30))
  if (!hasText) {
    return "I didn't catch that clearly. Could you please repeat?"
  }

  // Gibberish filter ONLY for English-only short messages at booking choice point
  const lastAI = session.history.filter(m => m.role === "assistant").slice(-1)[0]?.content?.toLowerCase() || ""
  const isWaitingForBookingChoice = lastAI.includes("cancel it, reschedule it, or book")
  const msgLow2 = userMessage.toLowerCase().trim()
  const isIndianScript = INDIAN_SCRIPT.test(userMessage)

  if (isWaitingForBookingChoice && !isIndianScript) {
    const validWords = ["cancel","reschedule","new","book","yes","no","ok","nahi","haan"]
    const hasValid = validWords.some(w => msgLow2.includes(w))
    const wordCount = msgLow2.split(/\s+/).length
    if (!hasValid && wordCount <= 3) {
      return "Please say: cancel to cancel, reschedule to change the date, or book new for a new appointment."
    }
  }

  // ── Direct intent detection — handle BEFORE Groq to avoid confusion ────
  const msgLow = userMessage.toLowerCase()
  const isConnectIntent = msgLow.includes("connect") || msgLow.includes("talk to doctor") ||
    msgLow.includes("speak to doctor") || msgLow.includes("call doctor") ||
    msgLow.includes("connect to doctor") || msgLow.includes("speak with doctor") ||
    (msgLow.includes("doctor") && (msgLow.includes("talk") || msgLow.includes("speak") || msgLow.includes("call") || msgLow.includes("connect")))

  if (isConnectIntent && session.data.phone) {
    const doctorPhone = (process.env.DOCTOR_PHONE || process.env.DOCTOR_WHATSAPP_NUMBER || "").replace(/\D/g,"")
    const patientName = session.data.name || "Patient"
    const patientPhone = session.data.phone
    const doctorName = session.data.activeBooking?.doctorName || activeBooking?.doctorName || "your doctor"

    storeDoctorConnectRequest(patientPhone, {
      patientName, patientPhone, doctorName,
      reason: "Patient requested to speak with doctor after booking"
    })

    console.log(`📞 Direct connect intent detected — sending WhatsApp to doctor: ${doctorPhone}`)
    if (doctorPhone) {
      const sent = await sendWhatsApp(doctorPhone,
        `*Patient Connect Request*

Patient *${patientName}* (${patientPhone}) wants to speak with ${doctorName}.

Reply *YES* if you are available and we will share your number with the patient.`)
      console.log(`📞 Doctor connect WhatsApp sent: ${sent}`)
    } else {
      console.error("❌ DOCTOR_PHONE not set in .env")
    }
    return `I have sent a message to ${doctorName} on WhatsApp. Once the doctor confirms availability, you will receive their contact details on your WhatsApp number ${patientPhone}.`
  }

  session.history.push({ role: "user", content: userMessage })

  const messages = [
    { role: "system", content: buildPrompt(session.data, activeBooking) },
    ...session.history.slice(-18)
  ]

  try {
    const raw = await callGroq(messages)
    console.log("\n── RAW REPLY ──\n" + raw.slice(0, 300) + "\n──────────────\n")
    session.history.push({ role: "assistant", content: raw })

    // ── Capture doctor/specialty/fee from AI reply into session ───────────
    const DOCTORS_MAP = {
      "Dr. Arvind Sharma":   { specialty:"General Physician",  fee:500  },
      "Dr. Rajesh Mehta":    { specialty:"Cardiologist",        fee:1200 },
      "Dr. Priya Kapoor":    { specialty:"Dermatologist",       fee:800  },
      "Dr. Suresh Verma":    { specialty:"Orthopedic Surgeon",  fee:1000 },
      "Dr. Kavitha Rao":     { specialty:"ENT Specialist",      fee:700  },
      "Dr. Anil Gupta":      { specialty:"Neurologist",         fee:1500 },
      "Dr. Vikram Singh":    { specialty:"Gastroenterologist",  fee:900  },
      "Dr. Sunita Patel":    { specialty:"Pediatrician",        fee:600  },
      "Dr. Pooja Menon":     { specialty:"Psychiatrist",        fee:1200 },
      "Dr. Harish Nambiar":  { specialty:"Dentist",             fee:600  },
      "Dr. Ananya Krishnan": { specialty:"Gynecologist",        fee:1000 },
      "Dr. Sanjay Reddy":    { specialty:"Ophthalmologist",     fee:900  },
    }
    const docMatch = raw.match(/Dr\.\s+[A-Z][a-z]+\s+[A-Z][a-z]+/)
    if (docMatch && !session.data.doctor) {
      session.data.doctor = docMatch[0]
      const info = DOCTORS_MAP[docMatch[0]]
      if (info) {
        session.data.specialty = info.specialty
        session.data.fee       = info.fee
        console.log(`🏥 Doctor: ${docMatch[0]} (${info.specialty}, Rs ${info.fee})`)
      }
    }

    // ── Doctor phone available to all blocks ─────────────────────────────
    const doctorPhone = (process.env.DOCTOR_PHONE || process.env.DOCTOR_WHATSAPP_NUMBER || "").replace(/\D/g,"")
    if (!doctorPhone) console.warn("⚠️  DOCTOR_PHONE not set in .env")

    // ── BOOKING ────────────────────────────────────────────────────────────
    if (!session.booked) {
      let booking = extractBlock(raw, "<<<BOOKING_JSON>>>", "<<<END_BOOKING>>>")

      // Fallback: if no JSON tag but AI confirmed AND we have all required data
      if (!booking) {
        const replyLower = raw.toLowerCase()
        const isConfirmed = replyLower.includes("confirmed") || 
                            replyLower.includes("appointment is booked") ||
                            replyLower.includes("all set") ||
                            replyLower.includes("see you then") ||
                            replyLower.includes("look forward to seeing you")
        const hasAllData = session.data.name && session.data.phone && 
                           session.data.doctor && (session.data.newDate || session.data.date)
        if (isConfirmed && hasAllData) {
          console.log("⚠️  No JSON tag but booking confirmed — using session data as fallback")
          booking = {
            name:      session.data.name,
            phone:     session.data.phone,
            doctor:    session.data.doctor,
            specialty: session.data.specialty || "",
            date:      session.data.newDate || session.data.date || "",
            time:      session.data.newTime || session.data.time || "10:00 AM",
            fee:       session.data.fee || 0
          }
        }
      }

      if (booking && booking.name && booking.doctor) {
        const doc = DOCTORS[booking.doctor] || {}
        const ref = genRef()
        const fullBooking = {
          ref,
          patientName:  booking.name,
          patientPhone: booking.phone || session.data.phone || "",
          problem:      session.history.filter(m => m.role === "user").slice(0, 5).map(m => m.content).join(". "),
          doctorId:     doc.id || "DOC001",
          doctorName:   booking.doctor,
          specialty:    booking.specialty || doc.specialty || "",
          date:         booking.date || session.data.newDate || "",
          time:         booking.time || session.data.newTime || "",
          fee:          booking.fee  || doc.fee || 500,
          status:       "confirmed",
          bookedAt:     new Date().toISOString(),
          source:       "voice"
        }

        // ── Slot conflict awareness ────────────────────────────────────────
        const slotCount = getSlotBookingCount(fullBooking.doctorId, fullBooking.date, fullBooking.time)

        if (slotCount >= 3) {
          const suggestedTime = suggestNextSlot(fullBooking.time)
          if (suggestedTime && suggestedTime !== fullBooking.time) {
            session.data.newTime = suggestedTime
          }
          return `That slot is fully booked. The next available slot for ${fullBooking.doctorName} is ${suggestedTime || fullBooking.time}. Shall I book that instead?`
        }

        if (slotCount === 2) {
          return "That slot is almost full — only 1 spot left. Shall I confirm it?"
        }

        session.booked = true
        saveBooking(fullBooking)
        savePatient(fullBooking.patientPhone, fullBooking.patientName, {
          ref: fullBooking.ref, doctorName: fullBooking.doctorName,
          specialty: fullBooking.specialty, date: fullBooking.date,
          time: fullBooking.time, problem: fullBooking.problem?.slice(0, 100)
        })
        session.data.activeBooking = fullBooking

        if (fullBooking.patientPhone) {
          await sendWhatsApp(fullBooking.patientPhone,
            `*VoxOps MediCare - Appointment Confirmed*\n\nHi ${fullBooking.patientName}!\n\n*Doctor:* ${fullBooking.doctorName}\n*Specialty:* ${fullBooking.specialty}\n*Date:* ${fullBooking.date}\n*Time:* ${fullBooking.time}\n*Fee:* Rs ${fullBooking.fee}\n*Ref:* ${ref}\n\nPlease arrive 10 mins early!`)
        }
        if (doctorPhone) {
          await sendWhatsApp(doctorPhone,
            `*New Appointment (Voice)*\n\nPatient: ${fullBooking.patientName}\nPhone: ${fullBooking.patientPhone}\nDate: ${fullBooking.date} at ${fullBooking.time}\nRef: ${ref}`)
        }
        console.log(`✅ Booking complete: ${ref}`)
        return `Your appointment with ${fullBooking.doctorName} on ${fullBooking.date} at ${fullBooking.time} is confirmed. Reference number is ${ref}. A WhatsApp confirmation has been sent to your number. Please check your WhatsApp.`
      }
    }

    // ── CANCELLATION ───────────────────────────────────────────────────────
    if (!session.cancelled) {
      const cancel = extractBlock(raw, "<<<CANCEL_JSON>>>", "<<<END_CANCEL>>>")
      if (cancel && (cancel.ref || activeBooking)) {
        session.cancelled = true
        const ref     = cancel.ref || activeBooking?.ref
        const cancelled = cancelBookingByRef(ref)
        if (cancelled) {
          session.data.activeBooking = null
          const patientPhone = cancelled.patientPhone || session.data.phone
          if (patientPhone) {
            await sendWhatsApp(patientPhone,
              `*VoxOps MediCare - Appointment Cancelled*\n\nHi ${cancelled.patientName},\n\nYour appointment has been cancelled.\n\n*Doctor:* ${cancelled.doctorName}\n*Was scheduled for:* ${cancelled.date} at ${cancelled.time}\n*Ref:* ${ref}\n\nTo rebook, visit our website or call us.`)
          }
          if (doctorPhone) {
            await sendWhatsApp(doctorPhone,
              `*Appointment Cancelled*\n\nPatient: ${cancelled.patientName}\nWas: ${cancelled.date} at ${cancelled.time}\nRef: ${ref}\n\nSlot is now free.`)
          }
          console.log(`✅ Cancellation complete: ${ref}`)
          return `Your appointment with ${cancelled.doctorName} on ${cancelled.date} has been successfully cancelled. A confirmation has been sent to your WhatsApp and the doctor has been notified.`
        }
      }
    }

    // ── RESCHEDULE ─────────────────────────────────────────────────────────
    if (!session.rescheduled) {
      const reschedule = extractBlock(raw, "<<<RESCHEDULE_JSON>>>", "<<<END_RESCHEDULE>>>")
      if (reschedule && (reschedule.ref || activeBooking)) {
        session.rescheduled = true
        const ref       = reschedule.ref || activeBooking?.ref
        const newDate   = reschedule.newDate || session.data.newDate || reschedule.date
        const newTime   = reschedule.newTime || session.data.newTime || reschedule.time
        const updated   = rescheduleBooking(ref, newDate, newTime)
        if (updated) {
          session.data.activeBooking = updated
          const patientPhone = updated.patientPhone || session.data.phone || ""
          console.log(`📱 Sending reschedule WhatsApp to patient: "${patientPhone}", doctor: "${doctorPhone}"`)
          
          const patientMsg = `*VoxOps MediCare - Appointment Rescheduled*

Hi ${updated.patientName},

Your appointment has been successfully rescheduled.

*Doctor:* ${updated.doctorName}
*New Date:* ${newDate}
*New Time:* ${newTime}
*Ref:* ${ref}

See you then! Please arrive 10 mins early.`
          
          const doctorMsg = `*Appointment Rescheduled*

Patient: ${updated.patientName}
Phone: ${patientPhone}
New Date: ${newDate} at ${newTime}
Ref: ${ref}`

          if (patientPhone) {
            const pSent = await sendWhatsApp(patientPhone, patientMsg)
            console.log(`📱 Patient WhatsApp result: ${pSent}`)
          } else {
            console.error("❌ No patient phone for reschedule notification")
          }
          if (doctorPhone) {
            const dSent = await sendWhatsApp(doctorPhone, doctorMsg)
            console.log(`👨‍⚕️ Doctor WhatsApp result: ${dSent}`)
          } else {
            console.error("❌ DOCTOR_PHONE not set — cannot notify doctor of reschedule")
          }
          console.log(`✅ Reschedule complete: ${ref}`)
          return `Your appointment has been rescheduled to ${newDate} at ${newTime}. A WhatsApp confirmation has been sent to your number. Your reference number is ${ref}.`
        }
      }
    }

    // ── CONNECT TO DOCTOR ──────────────────────────────────────────────────
    const connect = extractBlock(raw, "<<<CONNECT_DOCTOR>>>", "<<<END_CONNECT>>>")
    if (connect && connect.patientName) {
      const patientPhone = connect.patientPhone || session.data.phone
      const doctorName   = connect.doctorName   || activeBooking?.doctorName || "your doctor"

      storeDoctorConnectRequest(patientPhone, {
        patientName:  connect.patientName,
        patientPhone: patientPhone,
        doctorName:   doctorName,
        reason:       connect.reason || "Patient requested to speak with doctor"
      })

      console.log(`📞 Sending connect request to doctor phone: "${doctorPhone}"`)
      if (doctorPhone) {
        const sent = await sendWhatsApp(doctorPhone,
          `*Patient Connect Request*

Patient *${connect.patientName}* (${patientPhone}) wants to speak with ${doctorName}.

Reason: ${connect.reason || "Not specified"}

Reply *YES* to this message if you are available and we will connect them to you.`)
        console.log(`📞 Doctor connect WhatsApp sent: ${sent}`)
      } else {
        console.error("❌ DOCTOR_PHONE not configured in .env — cannot send connect request")
      }
      console.log(`📞 Doctor connect request processed for ${connect.patientName}`)
      return `I have sent a message to ${doctorName} requesting a connection. The doctor will respond on WhatsApp shortly. If available, you will receive their contact details on your WhatsApp number.`
    }

    // NOTE: Do NOT capture date/time from AI replies — only from user messages (extractInfo)
    // Capturing from AI replies causes hallucination bugs where AI-invented dates get saved

    return cleanSpeech(raw)

  } catch(err) {
    console.error("voiceAgent error:", err.message)
    return "I am sorry, I missed that. Could you please say it again?"
  }
}

// ── Handle doctor reply "YES" from WhatsApp ───────────────────────────────────
// Call this from server.js when doctor sends YES to the connect request
async function handleDoctorConnectReply(doctorPhoneRaw, message) {
  const msgLower = message.toLowerCase().trim()
  if (!msgLower.startsWith("yes")) return false

  // Find the most recent pending request
  const pending = Object.values(doctorConnectRequests)
    .filter(r => r.status === "pending")
    .sort((a, b) => b.createdAt - a.createdAt)[0]

  if (!pending) {
    console.log("⚠️  No pending doctor connect request found")
    return false
  }

  pending.status = "accepted"
  console.log(`✅ Doctor available for ${pending.patientName}`)

  // Extract clean doctor phone number for display
  const doctorDisplayNum = doctorPhoneRaw
    .replace("whatsapp:","")
    .replace("+91","")
    .replace("+","")
    .replace(/\D/g,"")
    .slice(-10)

  // Notify patient with doctor's number
  const sent = await sendWhatsApp(pending.patientPhone,
    `*VoxOps MediCare - Doctor Available Now*

` +
    `Good news, ${pending.patientName}!

` +
    `*${pending.doctorName}* is available to speak with you right now.

` +
    `📞 Call the doctor at: *+91 ${doctorDisplayNum}*

` +
    `Or wait — the doctor will call you on your number shortly.

` +
    `_VoxOps MediCare_`)

  console.log(`📱 Patient notified: ${sent}, doctor number shared: ${doctorDisplayNum}`)
  return true
}

// ── Clean old sessions ────────────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now()
  for (const id in voiceSessions) {
    if (now - voiceSessions[id].createdAt > 3600000) delete voiceSessions[id]
  }
}, 3600000)

module.exports = { handleVoiceConversation, handleDoctorConnectReply }