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
      temperature: 0.7,
      max_tokens: 160
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

function suggestNextSlot(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return timeStr || ""
  const raw = timeStr.trim().toUpperCase()
  if (raw === "4:00 PM" || raw === "04:00 PM") return "4:30 PM"
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/)
  if (!m) return timeStr
  let hour = parseInt(m[1], 10)
  const minute = parseInt(m[2] || "00", 10)
  const meridiem = m[3]
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
    list[idx].date          = newDate
    list[idx].time          = newTime
    list[idx].rescheduledAt = new Date().toISOString()
    list[idx].previousDate  = oldDate
    list[idx].previousTime  = oldTime
    writeBookings(list)
    console.log(`🔄 Booking rescheduled: ${ref} → ${newDate} ${newTime}`)
    return list[idx]
  } catch(e) { console.error("Reschedule error:", e.message); return null }
}

function getActiveBookingByPhone(phone) {
  const list   = loadBookings()
  const digits = phone.replace(/\D/g, "")
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

function checkEmergency(msg) {
  const lower = msg.toLowerCase().trim()
  if (EMERGENCY_TERMS.some(t => lower.includes(t))) return true
  const words = lower.split(/\s+/)
  const dangerWords = ["stroke","seizure","unconscious","fainted","collapsed"]
  if (words.some(w => dangerWords.includes(w))) return true
  if ((lower.includes("heart") || lower.includes("chest")) &&
      (lower.includes("pain") || lower.includes("hurt") || lower.includes("ache") ||
       lower.includes("tight") || lower.includes("attack"))) return true
  return false
}

// ── Insurance data ────────────────────────────────────────────────────────────
const INSURANCE_FILE = path.join(__dirname, "insurance.json")

function loadInsurance() {
  try { return JSON.parse(fs.readFileSync(INSURANCE_FILE, "utf8")) }
  catch(e) { return { criticalConditions:{}, conditionKeywords:{}, insurers:{}, doctors:{} } }
}

// Detect if patient message mentions a critical/severe condition
function detectCriticalCondition(msg) {
  const data = loadInsurance()
  const keywords = data.conditionKeywords || {}
  const msgLow = msg.toLowerCase()
  for (const [condition, kwList] of Object.entries(keywords)) {
    if (kwList.some(kw => msgLow.includes(kw))) {
      const condData = data.criticalConditions[condition]
      if (condData) return { condition, ...condData }
    }
  }
  return null
}

// Extract insurance provider name from patient message
function extractInsuranceProvider(msg) {
  const data = loadInsurance()
  const msgLow = msg.toLowerCase().trim()
  // Check for "no insurance" first
  const noInsurance = ["no insurance","don't have","dont have","no cover","uninsured","no policy","self pay","cash","no scheme"]
  if (noInsurance.some(k => msgLow.includes(k))) return { provider: "none", insurer: null }
  // Match against known insurer keys and shortcodes
  for (const [key, ins] of Object.entries(data.insurers || {})) {
    if (msgLow.includes(key) || msgLow.includes((ins.shortCode||"").toLowerCase())) {
      return { provider: key, insurer: ins }
    }
  }
  return null
}

// Extract coverage amount from patient message (e.g. "5 lakh", "500000", "3 lakhs")
function extractCoverageAmount(msg) {
  const msgLow = msg.toLowerCase().replace(/,/g,"")
  // "X lakh/lakhs" pattern
  const lakhMatch = msgLow.match(/(\d+(?:\.\d+)?)\s*lakh/)
  if (lakhMatch) return Math.round(parseFloat(lakhMatch[1]) * 100000)
  // Plain number >= 10000
  const numMatch = msgLow.match(/\b(\d{5,8})\b/)
  if (numMatch) return parseInt(numMatch[1])
  return null
}

// Calculate how much insurance pays vs patient pays for a critical condition
function calculateInsuranceSplit(insurer, condition, coverageAmount) {
  const data = loadInsurance()
  const condData = data.criticalConditions?.[condition]
  if (!condData) return null

  const estimatedCost = condData.estimatedCost
  const isCovered = insurer.criticalConditionsCovered?.includes(condition)
  const coveragePct = isCovered ? (insurer.criticalCoveragePercent || insurer.coveragePercent) : 0
  const copayPct = insurer.copay || 0

  // Effective coverage = min(coverage amount, estimated cost * coveragePct%)
  const maxInsurancePays = coverageAmount
    ? Math.min(coverageAmount, Math.round(estimatedCost * coveragePct / 100))
    : Math.round(estimatedCost * coveragePct / 100)

  const insurerPays = isCovered ? maxInsurancePays : 0
  const patientPays = estimatedCost - insurerPays
  const effectivePct = Math.round((insurerPays / estimatedCost) * 100)
  const copayAmount = isCovered ? Math.round(insurerPays * copayPct / 100) : 0
  const finalPatientPays = patientPays + copayAmount

  return {
    estimatedCost,
    isCovered,
    cashless: insurer.cashless,
    insurerPays,
    patientPays: finalPatientPays,
    effectivePct,
    copayPct,
    copayAmount,
    coveragePct,
    waitingPeriod: insurer.waitingPeriod,
    notes: insurer.notes,
    displayName: insurer.displayName
  }
}

// Documents required based on condition severity and insurer type
function getClaimDocuments(condition, insurer, isCashless) {
  const condData = loadInsurance().criticalConditions?.[condition]
  const severity = condData?.severity || "SERIOUS"

  const baseDocsCashless = [
    "Insurance card / policy document (original or photo)",
    "Valid government photo ID (Aadhaar / PAN / Passport)",
    "Duly filled cashless pre-authorization form (hospital will provide)",
    "Doctor's referral letter stating diagnosis and treatment plan",
    "Previous medical records related to this condition (if any)"
  ]
  const baseDocsReimbursement = [
    "Insurance card / policy document (original)",
    "Valid government photo ID (Aadhaar / PAN / Passport)",
    "Original discharge summary from hospital",
    "All original bills and receipts (hospital, pharmacy, diagnostics)",
    "Doctor's certificate stating diagnosis and treatment given",
    "All original investigation reports (blood tests, scans, X-rays)",
    "Duly filled claim reimbursement form (from insurer's website)",
    "Cancelled cheque or bank passbook copy for NEFT settlement"
  ]

  const conditionSpecificDocs = {
    "heart attack":     ["ECG reports (all strips)", "Cardiac enzyme reports (Troponin, CPK-MB)", "Angiography/Angioplasty report if done"],
    "bypass surgery":   ["Surgeon's operation notes", "Anesthesia report", "ICU daily charts", "Pre-op cardiac evaluation report"],
    "angioplasty":      ["Coronary angiography report", "Stent invoice with model number and price", "Cardiologist's procedure note"],
    "heart failure":    ["Echocardiogram report", "BNP / NT-proBNP blood test report", "Cardiologist's case summary"],
    "liver cirrhosis":  ["Liver function test reports (LFT)", "Ultrasound / fibroscan report", "Hepatologist's treatment summary"],
    "liver transplant": ["Transplant surgery notes", "Donor compatibility report", "NOTTO registration proof", "Immunosuppression prescription"],
    "liver failure":    ["Liver function tests", "Coagulation profile (PT/INR)", "ICU treatment chart"],
    "fracture":         ["X-ray reports (before and after)", "Orthopedic surgeon's notes", "Implant invoice with make/model if surgery done"],
    "hip replacement":  ["Pre-op X-rays", "Implant invoice with model number", "Physiotherapy discharge notes"],
    "knee replacement": ["Pre-op X-rays / MRI", "Implant invoice with model number", "Physiotherapy records"],
    "spinal surgery":   ["MRI spine report", "Neurosurgeon / orthopedic surgeon's operative notes", "Implant invoice if used"],
    "cancer":           ["Biopsy / histopathology report", "Oncologist's treatment plan", "Chemotherapy / radiation prescriptions", "FNAC report if applicable"],
    "stroke":           ["CT or MRI brain report", "Neurologist's case summary", "Physiotherapy / speech therapy records if applicable"],
    "kidney failure":   ["Creatinine and GFR blood reports", "Nephrologist's case summary", "Dialysis records if applicable"],
    "appendix":         ["Ultrasound / CT abdomen report", "Surgeon's operative notes", "Laparoscopy report"],
    "gallstone":        ["Ultrasound abdomen report", "Surgeon's operative notes", "Specimen report if sent to pathology"],
    "pneumonia":        ["Chest X-ray reports", "Sputum culture report if done", "Pulmonologist's case summary"],
    "diabetes complications": ["HbA1c report", "Endocrinologist's treatment summary", "Related specialist reports (retina, kidney, foot)"]
  }

  const baseDocs = isCashless ? baseDocsCashless : baseDocsReimbursement
  const extraDocs = conditionSpecificDocs[condition] || []

  const preAuthNote = isCashless
    ? "⚡ CASHLESS: Submit pre-authorization BEFORE starting treatment. Our hospital's TPA desk will handle this — ask at the front desk immediately on admission."
    : "💳 REIMBURSEMENT: Collect and keep EVERY original bill and report. Submit claim within 30 days of discharge."

  return { baseDocs, extraDocs, preAuthNote, isCashless }
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
  if (data.newDate) known.push(`preferred date: ${data.newDate}`)
  if (data.newTime) known.push(`preferred time: ${data.newTime}`)

  let bookingContext = ""
  if (activeBooking) {
    bookingContext = `\nACTIVE BOOKING ON FILE:
Ref: ${activeBooking.ref}
Doctor: ${activeBooking.doctorName}
Date: ${activeBooking.date}
Time: ${activeBooking.time}
Status: ${activeBooking.status}
→ Acknowledge this booking naturally and ask what the patient wants to do with it.`
  }

  let returningNote = ""
  if (data.isReturning && data.lastVisit && !activeBooking) {
    returningNote = `\n→ RETURNING PATIENT. Last saw ${data.lastVisit.doctorName} on ${data.lastVisit.date}. Greet them warmly by name and ask if they'd like the same doctor.`
  }

  const isNonEnglish = data.lang && data.lang !== "en"
  const L = data.langName || "English"

  // Symptom-specific intelligent follow-up questions (for Step 3)
  const smartFollowUps = {
    en: {
      head:    "Is it more of a throbbing pain or constant pressure? And is light or noise making it worse?",
      stomach: "Is the pain sharp or more of a cramp? And have you noticed any changes with eating?",
      skin:    "Is it more of a rash, or something changing in texture or color?",
      back:    "Is it a dull ache or sharp pain? Does it shoot down your leg at all?",
      eye:     "Is your vision affected, or is it more of a discomfort and redness?",
      child:   "How high has the temperature been, and is the little one eating and drinking okay?",
      default: "Can you tell me a bit more — where exactly is the discomfort, and did it come on suddenly?"
    }
  }

  // Greeting variations (picked by LLM based on context)
  const greetingVariants = `
GREETING VARIATIONS — pick one naturally based on tone and time of day, never repeat the same one:
- "Hello! Welcome to VoxOps MediCare. I'm Aria — how can I help you today?"
- "Hi there! You've reached VoxOps MediCare. What can I do for you?"
- "Good ${getNowIST().getHours() < 12 ? "morning" : getNowIST().getHours() < 17 ? "afternoon" : "evening"}! This is Aria at VoxOps MediCare. How may I assist you?"
- "Hello, welcome! I'm Aria, your medical receptionist here. What brings you in today?"
- "Hi! Great to hear from you. How can I make your day a little easier?"`

  // Phone ask variations
  const phoneVariants = `
PHONE NUMBER ASK VARIATIONS — pick one naturally, always mention saying digits slowly:
- "What's your 10-digit mobile number? Go ahead and say each digit slowly."
- "I'll send you a confirmation — what number should I use? Say the digits one by one."
- "Could I get your mobile number? Say each digit clearly and I'll catch it."
- "What's the best number to reach you on? Take your time with the digits."`

  return `${isNonEnglish ? `CRITICAL: You are in ${L} MODE. Reply in ${L} ONLY. Zero English words. Every word must be ${L}.\n\n` : ""}You are Aria — a warm, experienced AI medical receptionist at VoxOps MediCare Hospital. You have been doing this for years. You sound like a real person, not a chatbot.
Current date and time: ${getTodayStr()}, ${getCurrentTimeStr()} IST.${returningNote}${bookingContext}

${isNonEnglish ? `LANGUAGE: ${L.toUpperCase()} ONLY.` : "LANGUAGE: English"}

━━━ KNOWN DATA — NEVER ASK FOR THESE AGAIN ━━━
${known.length ? known.join("\n") : "none yet"}
Treat these as facts you already know. Never re-ask anything listed above.

━━━ HOW YOU SPEAK ━━━
- You are warm, calm, and professional — like a senior receptionist who genuinely cares
- You NEVER sound like a form. You have a real conversation.
- You respond to what the patient actually said, not just what data you need next
- If a patient sounds worried or in pain, acknowledge it FIRST before asking anything
- If a patient volunteers information (name, symptoms, date), pick it up — don't ask again
- You NEVER say "I understand", "I see", "Of course", "Certainly", "Sure" — just respond naturally
- You NEVER repeat back what the patient just said word for word
- No markdown, no bullet points, no lists — this is voice, speak naturally
- Keep responses to 2 sentences max. Warm but efficient.
- VARY your phrasing every message — never use the same sentence twice in a conversation
${greetingVariants}
${phoneVariants}

━━━ GREETING RULE ━━━
If the patient just says "Hi", "Hello", or any plain greeting with NO other information:
→ Use one of the greeting variations above. NEVER jump straight into booking questions.
→ If they sound hesitant, be extra warm. If they sound rushed, be quick.

━━━ COLLECTING INFORMATION (in this order, ONE question at a time) ━━━
1. NAME — if unknown, ask naturally: "Before I pull up the schedule, who am I speaking with?" or "I'd love to help — what's your name?"
2. SYMPTOMS — ask openly: "What's been troubling you?" or "Tell me what's going on — I want to find you the right doctor." NEVER say "What are your symptoms?"
3. SMART FOLLOW-UP — ask ONE medically intelligent follow-up based on what they said:
   • Headache/migraine → "${smartFollowUps.en.head}"
   • Stomach/nausea/vomiting → "${smartFollowUps.en.stomach}"
   • Skin issue → "${smartFollowUps.en.skin}"
   • Back/joint pain → "${smartFollowUps.en.back}"
   • Eye problem → "${smartFollowUps.en.eye}"
   • Child patient → "${smartFollowUps.en.child}"
   • Anything else → "${smartFollowUps.en.default}"
4. HOW LONG — ask naturally: "How long have you been dealing with this?" or "When did this start?"
5. DOCTOR SUGGESTION — after steps 2-4, suggest the right specialist naturally: "Based on what you're describing, I'd recommend Dr. [Name], our [specialty]. They're really good with this."
6. DATE — if patient said "earliest tomorrow" or similar, offer a specific slot. Otherwise ask: "What date works for you?" Never ask if they already mentioned one.
7. TIME — ask: "And what time works best?" or "Morning or afternoon?" — skip if already given.
8. PHONE — use a phone variation from above. Always mention saying digits slowly.
9. CONFIRM — wrap it warmly: "Perfect, [name]! So that's Dr. [X] on [date] at [time], fee is Rs [Y]. Shall I lock that in for you?"
10. ON YES → output the booking JSON tag, then add a warm close.

━━━ DOCTOR ROUTING ━━━
headache/migraine → Neurologist (Dr. Anil Gupta, Rs 1500)
stomach/digestion/nausea → Gastroenterologist (Dr. Vikram Singh, Rs 900)
heart/chest pressure → Cardiologist (Dr. Rajesh Mehta, Rs 1200)
skin/rash → Dermatologist (Dr. Priya Kapoor, Rs 800)
ear/nose/throat → ENT (Dr. Kavitha Rao, Rs 700)
bones/joints/back → Orthopedic (Dr. Suresh Verma, Rs 1000)
eyes → Ophthalmologist (Dr. Sanjay Reddy, Rs 900)
children → Pediatrician (Dr. Sunita Patel, Rs 600)
teeth → Dentist (Dr. Harish Nambiar, Rs 600)
mental health/anxiety → Psychiatrist (Dr. Pooja Menon, Rs 1200)
gynecology → Gynecologist (Dr. Ananya Krishnan, Rs 1000)
only simple fever/cold/flu → General Physician (Dr. Arvind Sharma, Rs 500)

━━━ CRITICAL OUTPUT RULES ━━━
- ONE question per message — never combine two questions, always wait for answer
- NEVER output JSON before patient says yes/confirm
- Reject past dates. Today only after ${getCurrentTimeStr()}
- On patient YES to confirmation → output FIRST:
<<<BOOKING_JSON>>>{"name":"","phone":"","doctor":"","specialty":"","date":"","time":"","fee":0}<<<END_BOOKING>>>
Then add your warm confirmation message.

CANCEL: <<<CANCEL_JSON>>>{"ref":"${activeBooking?.ref || ""}","name":"","phone":"","doctor":"","date":"","time":""}<<<END_CANCEL>>>
RESCHEDULE: <<<RESCHEDULE_JSON>>>{"ref":"${activeBooking?.ref || ""}","name":"","phone":"","doctor":"","date":"","time":"","newDate":"","newTime":""}<<<END_RESCHEDULE>>>
CONNECT TO DOCTOR: <<<CONNECT_DOCTOR>>>{"patientName":"","patientPhone":"","doctorName":"","reason":""}<<<END_CONNECT>>>`
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
  if (session.emergency || checkEmergency(userMessage)) {
    session.emergency = true
    console.log(`🚨 EMERGENCY: "${userMessage}"`)
    return "EMERGENCY_DETECTED"
  }

  // ── Auto-detect language from message script ─────────────────────────────
  const langNames = { hi:"Hindi", ta:"Tamil", te:"Telugu", kn:"Kannada", ml:"Malayalam", en:"English" }

  function detectScriptLang(text) {
    if (/[ಀ-೿]/.test(text)) return "kn"
    if (/[ऀ-ॿ]/.test(text)) return "hi"
    if (/[஀-௿]/.test(text)) return "ta"
    if (/[ఀ-౿]/.test(text)) return "te"
    if (/[ഀ-ൿ]/.test(text)) return "ml"
    return null
  }

  const detectedFromScript = detectScriptLang(userMessage)
  if (detectedFromScript) {
    if (session.data.lang !== detectedFromScript) {
      session.data.lang     = detectedFromScript
      session.data.langName = langNames[detectedFromScript]
      console.log(`🌐 Auto-detected from script: ${session.data.langName}`)
    }
  } else if (req_lang && req_lang !== "en" && req_lang !== session.data.lang) {
    session.data.lang     = req_lang
    session.data.langName = langNames[req_lang] || "English"
    console.log(`🌐 Language set from UI: ${session.data.langName}`)
  } else if (!session.data.lang) {
    session.data.lang     = "en"
    session.data.langName = "English"
  }

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
      session.data.newDate = null
      session.data.newTime = null
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
  const INDIAN_SCRIPT = new RegExp(
    '[\u0900-\u097F' +
    '\u0C80-\u0CFF' +
    '\u0C00-\u0C7F' +
    '\u0D00-\u0D7F' +
    '\u0B80-\u0BFF]'
  )
  const hasText = /[a-zA-Z]/.test(userMessage) || INDIAN_SCRIPT.test(userMessage)
  console.log("Input validation — hasText:", hasText, "| msg:", userMessage.slice(0, 30))
  if (!hasText) {
    return "I didn't catch that clearly. Could you please repeat?"
  }

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

  // ── Direct intent detection ──────────────────────────────────────────────
  const msgLow = userMessage.toLowerCase()
  const isConnectIntent = msgLow.includes("connect") || msgLow.includes("talk to doctor") ||
    msgLow.includes("speak to doctor") || msgLow.includes("call doctor") ||
    msgLow.includes("connect to doctor") || msgLow.includes("speak with doctor") ||
    (msgLow.includes("doctor") && (msgLow.includes("talk") || msgLow.includes("speak") || msgLow.includes("call") || msgLow.includes("connect")))

  if (isConnectIntent && session.data.phone) {
    const doctorPhone = (process.env.DOCTOR_PHONE || process.env.DOCTOR_WHATSAPP_NUMBER || "").replace(/\D/g, "")
    const patientName  = session.data.name || "Patient"
    const patientPhone = session.data.phone
    const doctorName   = session.data.activeBooking?.doctorName || activeBooking?.doctorName || "your doctor"

    storeDoctorConnectRequest(patientPhone, {
      patientName, patientPhone, doctorName,
      reason: "Patient requested to speak with doctor after booking"
    })

    console.log(`📞 Direct connect intent detected — sending WhatsApp to doctor: ${doctorPhone}`)
    if (doctorPhone) {
      const sent = await sendWhatsApp(doctorPhone,
        `*Patient Connect Request*\n\nPatient *${patientName}* (${patientPhone}) wants to speak with ${doctorName}.\n\nReply *YES* if you are available and we will share your number with the patient.`)
      console.log(`📞 Doctor connect WhatsApp sent: ${sent}`)
    } else {
      console.error("❌ DOCTOR_PHONE not set in .env")
    }
    return `I've sent a message to ${doctorName} right now. As soon as the doctor confirms, you'll get their number on WhatsApp at ${patientPhone}.`
  }

  // ════════════════════════════════════════════════════════════════════════
  // INSURANCE FLOW — runs in parallel with booking, intercepts when needed
  // Stages: detected → ask_provider → ask_coverage → show_split → show_docs
  // ════════════════════════════════════════════════════════════════════════

  const ins = session.data.insuranceFlow || {}

  // STAGE 0 — detect critical condition (fires once, on ANY message)
  if (!ins.conditionDetected) {
    // Check current message AND all prior user messages
    const allUserMsgs = session.history.filter(m => m.role === "user").map(m => m.content).join(" ") + " " + userMessage
    const critical = detectCriticalCondition(allUserMsgs)
    if (critical) {
      ins.conditionDetected = true
      ins.condition = critical.condition
      ins.conditionData = critical
      ins.stage = "ask_provider"
      session.data.insuranceFlow = ins
      console.log(`🏥 Critical condition detected: ${critical.condition} (${critical.severity})`)

      const costStr = critical.estimatedCost >= 100000
        ? `Rs ${(critical.estimatedCost / 100000).toFixed(1)} lakh`
        : `Rs ${critical.estimatedCost.toLocaleString()}`
      const severityLine = critical.severity === "CRITICAL"
        ? `This is a serious condition that typically requires hospitalization.`
        : `This condition will likely need hospital treatment.`

      const alertMsg = `${severityLine} ${critical.label} treatment costs around ${costStr}. ${critical.insuranceAdvice} Do you have health insurance? If yes, which provider — for example Star Health, HDFC Ergo, Ayushman Bharat, or any other?`
      session.history.push({ role: "user", content: userMessage })
      session.history.push({ role: "assistant", content: alertMsg })
      return alertMsg
    }
  }

  // STAGE 1 — we asked for provider, now read their answer
  if (ins.stage === "ask_provider" && !ins.providerAnswered) {
    ins.providerAnswered = true
    const providerResult = extractInsuranceProvider(userMessage)

    if (providerResult && providerResult.provider === "none") {
      // No insurance — tell them total cost and proceed to booking
      ins.stage = "done"
      ins.hasInsurance = false
      session.data.insuranceFlow = ins
      const costStr = ins.conditionData?.estimatedCost >= 100000
        ? `Rs ${(ins.conditionData.estimatedCost / 100000).toFixed(1)} lakh`
        : `Rs ${ins.conditionData?.estimatedCost?.toLocaleString() || "the full amount"}`
      const noInsMsg = `No problem — you'll be paying the full estimated cost of ${costStr} directly. Our billing team can help you with a payment plan if needed. Now let's get your appointment sorted. What date works for you?`
      session.history.push({ role: "user", content: userMessage })
      session.history.push({ role: "assistant", content: noInsMsg })
      return noInsMsg
    }

    if (providerResult && providerResult.insurer) {
      ins.provider = providerResult.provider
      ins.insurer = providerResult.insurer
      ins.stage = "ask_coverage"
      session.data.insuranceFlow = ins
      const askCovMsg = `Great — ${providerResult.insurer.displayName} is accepted at our hospital. What is your total insurance coverage amount? For example, 3 lakh, 5 lakh, or whatever your policy sum insured is.`
      session.history.push({ role: "user", content: userMessage })
      session.history.push({ role: "assistant", content: askCovMsg })
      return askCovMsg
    }

    // Provider mentioned but not recognized — ask them to clarify
    ins.providerAnswered = false // let them retry
    session.data.insuranceFlow = ins
    const clarifyMsg = `I didn't catch the insurance provider name clearly. Could you say it again? For example — Star Health, HDFC Ergo, ICICI Lombard, Bajaj Allianz, Ayushman Bharat, or say "no insurance" if you're self-paying.`
    session.history.push({ role: "user", content: userMessage })
    session.history.push({ role: "assistant", content: clarifyMsg })
    return clarifyMsg
  }

  // STAGE 2 — we asked for coverage amount, now read their answer
  if (ins.stage === "ask_coverage" && !ins.coverageAnswered) {
    const amount = extractCoverageAmount(userMessage)
    if (!amount) {
      // Couldn't parse — ask again simply
      const retryMsg = `I didn't catch the amount. Please say your total coverage — for example, "5 lakh" or "3 lakh".`
      session.history.push({ role: "user", content: userMessage })
      session.history.push({ role: "assistant", content: retryMsg })
      return retryMsg
    }

    ins.coverageAmount = amount
    ins.coverageAnswered = true
    ins.stage = "show_split"
    session.data.insuranceFlow = ins

    const split = calculateInsuranceSplit(ins.insurer, ins.condition, amount)
    ins.split = split
    session.data.insuranceFlow = ins

    if (!split) {
      const fallbackMsg = `Got it — coverage of Rs ${(amount/100000).toFixed(1)} lakh noted. Let's proceed with your booking. What date works for you?`
      session.history.push({ role: "user", content: userMessage })
      session.history.push({ role: "assistant", content: fallbackMsg })
      return fallbackMsg
    }

    const costStr   = `Rs ${(split.estimatedCost / 100000).toFixed(1)} lakh`
    const insPayStr = split.insurerPays >= 100000
      ? `Rs ${(split.insurerPays / 100000).toFixed(1)} lakh`
      : `Rs ${split.insurerPays.toLocaleString()}`
    const ptPayStr  = split.patientPays >= 100000
      ? `Rs ${(split.patientPays / 100000).toFixed(1)} lakh`
      : `Rs ${split.patientPays.toLocaleString()}`

    let splitMsg = ""
    if (split.isCovered) {
      const cashlessNote = split.cashless ? "This is a cashless policy — no upfront payment needed at admission." : "You'll pay upfront and claim reimbursement after discharge."
      splitMsg = `Here's your coverage breakdown. Estimated treatment cost: ${costStr}. Your ${split.displayName} covers ${split.effectivePct}% — that's ${insPayStr} paid by the insurer. You pay only ${ptPayStr}${split.copayPct > 0 ? ` (includes ${split.copayPct}% copay)` : ""}. ${cashlessNote} Shall I also tell you what documents you'll need to submit for the claim?`
    } else {
      splitMsg = `Your ${split.displayName} policy unfortunately does not cover ${ins.conditionData?.label} at our hospital. You'll need to pay the full estimated cost of ${costStr} directly. Would you still like to proceed with the appointment?`
    }

    session.history.push({ role: "user", content: userMessage })
    session.history.push({ role: "assistant", content: splitMsg })
    return splitMsg
  }

  // STAGE 3 — patient said yes to seeing documents
  if (ins.stage === "show_split" && ins.split?.isCovered) {
    const msgLow = userMessage.toLowerCase()
    const wantsDocs = ["yes","yeah","sure","ok","okay","tell me","show me","what documents","documents","please","haan","ha "].some(k => msgLow.includes(k))
    if (wantsDocs) {
      ins.stage = "show_docs"
      session.data.insuranceFlow = ins

      const docs = getClaimDocuments(ins.condition, ins.insurer, ins.split.cashless)
      const baseList  = docs.baseDocs.map((d, i) => `${i+1}. ${d}`).join(". ")
      const extraList = docs.extraDocs.length
        ? " Additionally for " + ins.conditionData?.label + ": " + docs.extraDocs.join(", ") + "."
        : ""
      const docsMsg = `${docs.preAuthNote} Here are the documents you'll need: ${baseList}.${extraList} Our hospital's insurance helpdesk at the front desk can guide you through the paperwork. Shall we now finalize your appointment?`

      session.history.push({ role: "user", content: userMessage })
      session.history.push({ role: "assistant", content: docsMsg })
      return docsMsg
    } else {
      // Patient said no to docs — move on to booking
      ins.stage = "done"
      session.data.insuranceFlow = ins
      const skipMsg = `No problem. Our insurance helpdesk at the front desk will assist you on arrival. Now let's book your appointment — what date works for you?`
      session.history.push({ role: "user", content: userMessage })
      session.history.push({ role: "assistant", content: skipMsg })
      return skipMsg
    }
  }

  // STAGE 4 — after docs shown, move on
  if (ins.stage === "show_docs") {
    ins.stage = "done"
    session.data.insuranceFlow = ins
    // Fall through to normal booking flow below
  }

  // ════════════════════════════════════════════════════════════════════════
  // END INSURANCE FLOW
  // ════════════════════════════════════════════════════════════════════════

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

    const doctorPhone = (process.env.DOCTOR_PHONE || process.env.DOCTOR_WHATSAPP_NUMBER || "").replace(/\D/g, "")
    if (!doctorPhone) console.warn("⚠️  DOCTOR_PHONE not set in .env")

    // ── BOOKING ────────────────────────────────────────────────────────────
    if (!session.booked) {
      let booking = extractBlock(raw, "<<<BOOKING_JSON>>>", "<<<END_BOOKING>>>")

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

        const slotCount = getSlotBookingCount(fullBooking.doctorId, fullBooking.date, fullBooking.time)
        if (slotCount >= 3) {
          const suggestedTime = suggestNextSlot(fullBooking.time)
          if (suggestedTime && suggestedTime !== fullBooking.time) {
            session.data.newTime = suggestedTime
          }
          return `That slot is fully booked. The next available with ${fullBooking.doctorName} is ${suggestedTime || fullBooking.time} — shall I book that instead?`
        }
        if (slotCount === 2) {
          return `That slot is almost full, just one spot left. Want me to go ahead and confirm it?`
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
        return `You're all set, ${fullBooking.patientName}! Appointment confirmed with ${fullBooking.doctorName} on ${fullBooking.date} at ${fullBooking.time}. Fee is Rs ${fullBooking.fee}, reference number ${ref}. Check your WhatsApp for the confirmation.`
      }
    }

    // ── CANCELLATION ───────────────────────────────────────────────────────
    if (!session.cancelled) {
      const cancel = extractBlock(raw, "<<<CANCEL_JSON>>>", "<<<END_CANCEL>>>")
      if (cancel && (cancel.ref || activeBooking)) {
        session.cancelled = true
        const ref       = cancel.ref || activeBooking?.ref
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
          return `Done — your appointment with ${cancelled.doctorName} on ${cancelled.date} has been cancelled. You'll get a WhatsApp confirmation shortly. Is there anything else I can help with?`
        }
      }
    }

    // ── RESCHEDULE ─────────────────────────────────────────────────────────
    if (!session.rescheduled) {
      const reschedule = extractBlock(raw, "<<<RESCHEDULE_JSON>>>", "<<<END_RESCHEDULE>>>")
      if (reschedule && (reschedule.ref || activeBooking)) {
        session.rescheduled = true
        const ref     = reschedule.ref || activeBooking?.ref
        const newDate = reschedule.newDate || session.data.newDate || reschedule.date
        const newTime = reschedule.newTime || session.data.newTime || reschedule.time
        const updated = rescheduleBooking(ref, newDate, newTime)
        if (updated) {
          session.data.activeBooking = updated
          const patientPhone = updated.patientPhone || session.data.phone || ""
          console.log(`📱 Sending reschedule WhatsApp to patient: "${patientPhone}", doctor: "${doctorPhone}"`)

          const patientMsg = `*VoxOps MediCare - Appointment Rescheduled*\n\nHi ${updated.patientName},\n\nYour appointment has been successfully rescheduled.\n\n*Doctor:* ${updated.doctorName}\n*New Date:* ${newDate}\n*New Time:* ${newTime}\n*Ref:* ${ref}\n\nSee you then! Please arrive 10 mins early.`
          const doctorMsg  = `*Appointment Rescheduled*\n\nPatient: ${updated.patientName}\nPhone: ${patientPhone}\nNew Date: ${newDate} at ${newTime}\nRef: ${ref}`

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
          return `Done! Rescheduled to ${newDate} at ${newTime}. WhatsApp confirmation is on its way. Your reference stays the same — ${ref}.`
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
          `*Patient Connect Request*\n\nPatient *${connect.patientName}* (${patientPhone}) wants to speak with ${doctorName}.\n\nReason: ${connect.reason || "Not specified"}\n\nReply *YES* to this message if you are available and we will connect them to you.`)
        console.log(`📞 Doctor connect WhatsApp sent: ${sent}`)
      } else {
        console.error("❌ DOCTOR_PHONE not configured in .env — cannot send connect request")
      }
      console.log(`📞 Doctor connect request processed for ${connect.patientName}`)
      return `I've messaged ${doctorName} right now. Once the doctor is available, you'll get their number on WhatsApp at ${patientPhone}.`
    }

    return cleanSpeech(raw)

  } catch(err) {
    console.error("voiceAgent error:", err.message)
    return "Sorry about that — could you say that again?"
  }
}

// ── Handle doctor reply "YES" from WhatsApp ───────────────────────────────────
async function handleDoctorConnectReply(doctorPhoneRaw, message) {
  const msgLower = message.toLowerCase().trim()
  if (!msgLower.startsWith("yes")) return false

  const pending = Object.values(doctorConnectRequests)
    .filter(r => r.status === "pending")
    .sort((a, b) => b.createdAt - a.createdAt)[0]

  if (!pending) {
    console.log("⚠️  No pending doctor connect request found")
    return false
  }

  pending.status = "accepted"
  console.log(`✅ Doctor available for ${pending.patientName}`)

  const doctorDisplayNum = doctorPhoneRaw
    .replace("whatsapp:", "")
    .replace("+91", "")
    .replace("+", "")
    .replace(/\D/g, "")
    .slice(-10)

  const sent = await sendWhatsApp(pending.patientPhone,
    `*VoxOps MediCare - Doctor Available Now*\n\nGood news, ${pending.patientName}!\n\n*${pending.doctorName}* is available to speak with you right now.\n\n📞 Call the doctor at: *+91 ${doctorDisplayNum}*\n\nOr wait — the doctor will call you on your number shortly.\n\n_VoxOps MediCare_`)

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