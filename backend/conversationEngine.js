// conversationEngine.js — Multi-turn conversation using real doctors dataset

const {
  suggestDoctor,
  getDoctorsList,
  getAvailableSlots,
  isSlotAvailable,
  confirmBooking,
  findDoctor,
  getHospitalInfo
} = require("./slotManager")

const { sendConfirmations } = require("./notifier")

const sessions = {}

// ── Date/Time extractors ──────────────────────────────────────────────────────

function extractDate(text) {
  const numericDate = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (numericDate) {
    const day   = numericDate[1].padStart(2, "0")
    const month = numericDate[2].padStart(2, "0")
    let year    = numericDate[3]
    if (year.length === 2) year = "20" + year
    return `${day}-${month}-${year}`
  }
  const months = ["january","february","march","april","may","june",
                  "july","august","september","october","november","december"]
  const monthIndex = months.findIndex(m => text.toLowerCase().includes(m))
  if (monthIndex !== -1) {
    const dayMatch  = text.match(/\b(\d{1,2})(st|nd|rd|th)?\b/)
    const yearMatch = text.match(/\b(20\d{2})\b/)
    const day   = dayMatch  ? dayMatch[1].padStart(2,"0") : "01"
    const month = String(monthIndex + 1).padStart(2,"0")
    const year  = yearMatch ? yearMatch[1] : new Date().getFullYear()
    return `${day}-${month}-${year}`
  }
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"]
  const dayIndex = days.findIndex(d => text.toLowerCase().includes(d))
  if (dayIndex !== -1) return `this ${days[dayIndex]}`
  if (text.includes("today"))    return "today"
  if (text.includes("tomorrow")) return "tomorrow"
  return null
}

function extractTime(text) {
  const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (timeMatch) {
    const hour   = timeMatch[1]
    const min    = timeMatch[2] || "00"
    const period = timeMatch[3].toUpperCase()
    return `${hour}:${min} ${period}`
  }
  if (text.includes("morning"))   return "9:00 AM"
  if (text.includes("afternoon")) return "2:00 PM"
  if (text.includes("evening"))   return "5:00 PM"
  return null
}

function freshSession() {
  return {
    step: "idle",
    data: {
      patientName: null,
      problem:     null,
      doctor:      null,   // full doctor object from dataset
      date:        null,
      time:        null
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

function handleConversation(sessionId, userMessage) {
  if (!sessions[sessionId]) sessions[sessionId] = freshSession()

  const session = sessions[sessionId]
  const text    = userMessage.toLowerCase().trim()
  const data    = session.data

  // ── IDLE: detect intent ──────────────────────────────────────────────────
  if (session.step === "idle") {
    const bookKeywords = ["book","appointment","schedule","reserve","visit","consult","meet","consultation","slot"]
    const isBooking    = bookKeywords.some(k => text.includes(k))

    if (isBooking) {
      // Extract anything already given upfront
      data.date = extractDate(text) || null
      data.time = extractTime(text) || null
      const namedDoc = findDoctor(text)
      if (namedDoc) data.doctor = namedDoc

      session.step = "ask_name"
      return {
        reply:  "Sure! I'd be happy to help you book an appointment. 😊\n\nMay I know your name please?",
        intent: "book",
        step:   session.step
      }
    }

    if (text.includes("cancel")) {
      session.step = "cancel_confirm"
      return {
        reply:  "I can help you cancel your appointment. Please share your booking reference number (e.g. VX123456).",
        intent: "cancel",
        step:   session.step
      }
    }

    if (text.includes("doctor") || text.includes("specialist") || text.includes("available")) {
      return {
        reply:  `Here are our available doctors at ${getHospitalInfo().name}:\n\n${getDoctorsList()}\n\nWould you like to book an appointment?`,
        intent: "info",
        step:   "idle"
      }
    }

    return null // pass to Gemini
  }

  // ── ASK NAME ─────────────────────────────────────────────────────────────
  if (session.step === "ask_name") {
    data.patientName = userMessage.trim()
    session.step = "ask_phone"
    return {
      reply:  `Nice to meet you, ${data.patientName}! 🙏\n\nCould you please share your WhatsApp number so we can send you a confirmation? (e.g. 9876543210)`,
      intent: "book",
      step:   session.step
    }
  }

  // ── ASK PHONE ────────────────────────────────────────────────────────────
  if (session.step === "ask_phone") {
    const phoneMatch = userMessage.trim().match(/\d{10,12}/)
    if (!phoneMatch) {
      return {
        reply:  "Please enter a valid 10-digit mobile number (e.g. 9876543210).",
        intent: "book",
        step:   session.step
      }
    }
    let phone = phoneMatch[0]
    // Add country code if not present
    if (phone.length === 10) phone = "91" + phone
    data.phone   = phone
    session.step = "ask_problem"
    return {
      reply:  `Got it! ✅\n\nWhat seems to be the problem? Please describe your symptoms so I can suggest the right doctor.`,
      intent: "book",
      step:   session.step
    }
  }

  // ── ASK PROBLEM ──────────────────────────────────────────────────────────
  if (session.step === "ask_problem") {
    data.problem = userMessage.trim()

    // If doctor already chosen upfront, skip suggestion
    if (data.doctor) {
      session.step = data.date ? "ask_time" : "ask_date"
      const nextReply = data.date
        ? `Got it! Now let me check available time slots for ${data.doctor.name} on ${data.date}...\n\n` + getSlotsReply(data.doctor.id, data.date)
        : `Got it! What date would you like to see ${data.doctor.name}?\n\n📅 Available days: ${data.doctor.available_days.join(", ")}`
      return { reply: nextReply, intent: "book", step: session.step }
    }

    const suggested = suggestDoctor(data.problem)
    if (suggested) {
      data.doctor  = suggested
      session.step = "confirm_doctor"
      return {
        reply:  `Based on your concern, I'd recommend:\n\n` +
                `👨‍⚕️ ${suggested.name} — ${suggested.specialty}\n` +
                `🎓 ${suggested.qualification} | ${suggested.experience} experience\n` +
                `💰 Consultation Fee: ₹${suggested.fee}\n` +
                `📞 Contact: ${suggested.contact}\n` +
                `📅 Available: ${suggested.available_days.join(", ")}\n\n` +
                `Would you like to book with ${suggested.name}? (yes / no)\n\nOr type "list" to see all doctors.`,
        intent: "book",
        step:   session.step
      }
    }

    session.step = "ask_doctor"
    return {
      reply:  `Here are our available doctors:\n\n${getDoctorsList()}\n\nWhich doctor would you like to consult?`,
      intent: "book",
      step:   session.step
    }
  }

  // ── CONFIRM DOCTOR ────────────────────────────────────────────────────────
  if (session.step === "confirm_doctor") {
    const isYes = ["yes","yeah","sure","ok","okay","confirm","good","great","perfect","sounds good"].some(w => text.includes(w))
    const isNo  = ["no","nope","different","another","other","change","list"].some(w => text.includes(w))
    const namedDoc = findDoctor(text)

    if (namedDoc) {
      data.doctor  = namedDoc
      session.step = data.date ? "ask_time" : "ask_date"
      const reply  = data.date
        ? getSlotsReply(data.doctor.id, data.date)
        : `${data.doctor.name} confirmed! 👍\n\n📅 Available days: ${data.doctor.available_days.join(", ")}\n\nWhat date would you like the appointment?`
      return { reply, intent: "book", step: session.step }
    }

    if (isYes) {
      session.step = data.date ? "ask_time" : "ask_date"
      const reply  = data.date
        ? getSlotsReply(data.doctor.id, data.date)
        : `Great choice! 👍\n\n📅 ${data.doctor.name} is available on: ${data.doctor.available_days.join(", ")}\n\nWhat date would you like?`
      return { reply, intent: "book", step: session.step }
    }

    if (isNo) {
      session.step = "ask_doctor"
      return {
        reply:  `No problem! Here are all our doctors:\n\n${getDoctorsList()}\n\nWhich doctor would you prefer?`,
        intent: "book",
        step:   session.step
      }
    }

    return {
      reply:  `Just say "yes" to confirm ${data.doctor.name}, "no" to see other doctors, or type a doctor's name.`,
      intent: "book",
      step:   session.step
    }
  }

  // ── ASK DOCTOR (manual pick) ──────────────────────────────────────────────
  if (session.step === "ask_doctor") {
    const namedDoc = findDoctor(text)
    if (namedDoc) {
      data.doctor  = namedDoc
      session.step = data.date ? "ask_time" : "ask_date"
      const reply  = data.date
        ? getSlotsReply(data.doctor.id, data.date)
        : `${data.doctor.name} selected! 👍\n\n📅 Available days: ${data.doctor.available_days.join(", ")}\n\nWhat date would you like?`
      return { reply, intent: "book", step: session.step }
    }
    return {
      reply:  `I couldn't find that doctor. Please type a name from the list (e.g., "Dr. Sharma" or "Cardiologist").`,
      intent: "book",
      step:   session.step
    }
  }

  // ── ASK DATE ─────────────────────────────────────────────────────────────
  if (session.step === "ask_date") {
    const date = extractDate(text)
    if (date) {
      data.date    = date
      session.step = "ask_time"
      return {
        reply:  getSlotsReply(data.doctor.id, date),
        intent: "book",
        step:   session.step
      }
    }
    return {
      reply:  `I couldn't understand that date. Try formats like:\n  • 29-07-2026\n  • July 29 2026\n  • this Monday\n  • tomorrow`,
      intent: "book",
      step:   session.step
    }
  }

  // ── ASK TIME ─────────────────────────────────────────────────────────────
  if (session.step === "ask_time") {
    const time = extractTime(text)
    if (time) {
      // ✅ CHECK SLOT AVAILABILITY
      const available = isSlotAvailable(data.doctor.id, data.date, time)
      if (!available) {
        const freeSlots = getAvailableSlots(data.doctor.id, data.date)
        if (freeSlots.length === 0) {
          return {
            reply:  `❌ Sorry, ${data.doctor.name} is fully booked on ${data.date}. Would you like to pick a different date?`,
            intent: "book",
            step:   "ask_date"
          }
        }
        session.step = "ask_time"
        return {
          reply:  `❌ Sorry, ${time} is already booked.\n\n✅ Available slots on ${data.date}:\n${freeSlots.join("  |  ")}\n\nPlease choose another time.`,
          intent: "book",
          step:   session.step
        }
      }

      data.time    = time
      session.step = "confirm_booking"
      const hospital = getHospitalInfo()
      return {
        reply:  `Almost done! Please confirm your appointment details:\n\n` +
                `🏥 Hospital  : ${hospital.name}, ${hospital.city}\n` +
                `👤 Patient   : ${data.patientName}\n` +
                `🩺 Problem   : ${data.problem}\n` +
                `👨‍⚕️ Doctor    : ${data.doctor.name} (${data.doctor.specialty})\n` +
                `💰 Fee       : ₹${data.doctor.fee}\n` +
                `📅 Date      : ${data.date}\n` +
                `⏰ Time      : ${data.time}\n\n` +
                `Type "confirm" to book or "no" to cancel.`,
        intent: "book",
        step:   session.step
      }
    }
    return {
      reply:  `Please specify a valid time (e.g., 10am, 2:30 PM, morning, afternoon).`,
      intent: "book",
      step:   session.step
    }
  }

  // ── CONFIRM BOOKING ───────────────────────────────────────────────────────
  if (session.step === "confirm_booking") {
    const isYes = ["yes","yeah","sure","ok","okay","confirm","book it","go ahead","do it"].some(w => text.includes(w))
    const isNo  = ["no","nope","cancel","stop"].some(w => text.includes(w))

    if (isYes) {
      const result = confirmBooking({
        patientName: data.patientName,
        patientPhone: data.phone,
        problem:     data.problem,
        doctorId:    data.doctor.id,
        doctorName:  data.doctor.name,
        specialty:   data.doctor.specialty,
        date:        data.date,
        time:        data.time,
        fee:         data.doctor.fee
      })

      sessions[sessionId] = freshSession()

      if (!result.success) {
        return {
          reply:  `⚠️ ${result.message}\n\nLet's pick another time. What works for you?`,
          intent: "book",
          step:   "ask_time"
        }
      }

      const hospital = getHospitalInfo()

      // ✅ Send WhatsApp to patient + doctor (non-blocking)
      sendConfirmations({
        ref:          result.ref,
        patientName:  data.patientName,
        patientPhone: data.phone,
        problem:      data.problem,
        doctorName:   data.doctor.name,
        specialty:    data.doctor.specialty,
        date:         data.date,
        time:         data.time,
        fee:          data.doctor.fee
      }).then(results => {
        console.log("📱 Patient WhatsApp:", results.patient.success ? "✅ Sent" : "❌ Failed - " + results.patient.error)
        console.log("📱 Doctor WhatsApp:", results.doctor.success  ? "✅ Sent" : "❌ Failed - " + results.doctor.error)
      }).catch(err => console.error("Notification error:", err.message))

      return {
        reply:  `✅ Appointment Confirmed!\n\n` +
                `📋 Booking Ref : ${result.ref}\n` +
                `👤 Patient     : ${data.patientName}\n` +
                `👨‍⚕️ Doctor      : ${data.doctor.name} (${data.doctor.specialty})\n` +
                `📅 Date        : ${data.date}\n` +
                `⏰ Time        : ${data.time}\n` +
                `💰 Fee         : ₹${data.doctor.fee}\n` +
                `🏥 Location    : ${hospital.address}\n` +
                `📞 Hospital    : ${hospital.contact}\n\n` +
                `📱 Confirmation WhatsApp sent to patient & doctor!\n` +
                `Please arrive 10 minutes early. Is there anything else I can help you with? 😊`,
        intent: "confirmed",
        step:   "idle",
        booking: { ref: result.ref, ...data }
      }
    }

    if (isNo) {
      sessions[sessionId] = freshSession()
      return {
        reply:  `Booking cancelled. Feel free to start over anytime! 😊`,
        intent: "cancelled",
        step:   "idle"
      }
    }

    return { reply: `Type "confirm" to book or "no" to cancel.`, intent: "book", step: session.step }
  }

  // ── CANCEL FLOW ───────────────────────────────────────────────────────────
  if (session.step === "cancel_confirm") {
    const refMatch = text.match(/vx\d{6}/i)
    if (refMatch) {
      const { bookings } = require("./slotManager").getHospitalInfo
      sessions[sessionId] = freshSession()
      return {
        reply:  `✅ Appointment ${refMatch[0].toUpperCase()} has been cancelled successfully. Is there anything else I can help you with?`,
        intent: "cancelled",
        step:   "idle"
      }
    }
    return {
      reply:  `Please provide your booking reference number (format: VX followed by 6 digits, e.g. VX847291).`,
      intent: "cancel",
      step:   session.step
    }
  }

  return null
}

// ── Helper: build slots reply message ────────────────────────────────────────
function getSlotsReply(doctorId, date) {
  const freeSlots = getAvailableSlots(doctorId, date)
  if (freeSlots.length === 0) {
    return `❌ No slots available on ${date}. Please choose a different date.`
  }
  return `✅ Available slots on ${date}:\n\n${freeSlots.join("  |  ")}\n\nWhat time would you prefer?`
}

function getSession(sessionId)  { return sessions[sessionId] || null }
function clearSession(sessionId) { delete sessions[sessionId] }

module.exports = { handleConversation, getSession, clearSession }