// slotManager.js

const fs   = require("fs")
const path = require("path")

// Always resolve from this module directory to avoid cwd-dependent bugs
const BASE_DIR      = __dirname
const DOCTORS_FILE  = path.join(BASE_DIR, "doctors.json")
const BOOKINGS_FILE = path.join(BASE_DIR, "bookings.json")

function normalizePhone(phone) {
  if (!phone) return ""
  const digits = String(phone).replace(/\D/g, "")
  // Keep last 10 digits for India numbers
  return digits.length >= 10 ? digits.slice(-10) : digits
}

function loadDoctors() {
  if (!fs.existsSync(DOCTORS_FILE)) {
    throw new Error(`doctors.json not found at: ${DOCTORS_FILE}`)
  }
  try {
    const data = JSON.parse(fs.readFileSync(DOCTORS_FILE, "utf8"))
    if (!data.doctors) throw new Error("doctors.json missing 'doctors' array")
    return data
  } catch(e) {
    throw new Error(`doctors.json is invalid: ${e.message}`)
  }
}

function loadBookings() {
  try {
    if (!fs.existsSync(BOOKINGS_FILE)) {
      const empty = { bookings: [] }
      fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(empty, null, 2))
      return empty
    }
    const raw = fs.readFileSync(BOOKINGS_FILE, "utf8").trim()
    if (!raw) {
      const empty = { bookings: [] }
      fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(empty, null, 2))
      return empty
    }
    const data = JSON.parse(raw)
    if (!data.bookings || !Array.isArray(data.bookings)) {
      data.bookings = []
    }
    return data
  } catch(e) {
    console.error("bookings.json corrupted, resetting:", e.message)
    const empty = { bookings: [] }
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(empty, null, 2))
    return empty
  }
}

function saveBookings(data) {
  if (!data.bookings) data.bookings = []
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(data, null, 2))
  console.log(`💾 Booking saved to: ${BOOKINGS_FILE}`)
  console.log(`💾 Total bookings: ${data.bookings.length}`)
}

function findDoctor(nameQuery) {
  const { doctors } = loadDoctors()
  const query = nameQuery.toLowerCase()
  return doctors.find(d =>
    d.name.toLowerCase().includes(query) ||
    d.specialty.toLowerCase().includes(query)
  ) || null
}

function getDoctorsList() {
  const { doctors } = loadDoctors()
  return doctors.map(d =>
    `  • ${d.name} — ${d.specialty} | ${d.experience} exp | Fee: ₹${d.fee} | 📞 ${d.contact}`
  ).join("\n")
}

function suggestDoctor(problem) {
  const { doctors } = loadDoctors()
  const text = problem.toLowerCase()
  return doctors.find(d => d.conditions.some(c => text.includes(c))) || null
}

function getDayName(dateStr) {
  if (!dateStr) return null
  if (dateStr === "today") {
    return new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase()
  }
  if (dateStr === "tomorrow") {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase()
  }
  if (dateStr.startsWith("this ")) {
    return dateStr.replace("this ", "").toLowerCase()
  }
  const parts = dateStr.split("-")
  if (parts.length === 3) {
    const day   = parseInt(parts[0])
    const month = parseInt(parts[1]) - 1
    const year  = parseInt(parts[2])
    const date  = new Date(year, month, day)
    if (isNaN(date.getTime())) return null
    return date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase()
  }
  return null
}

function getAvailableSlots(doctorId, date) {
  try {
    const { doctors }  = loadDoctors()
    const doctor       = doctors.find(d => d.id === doctorId)
    if (!doctor) return []

    const dayName = getDayName(date)
    if (!dayName) return []

    if (!doctor.available_days.includes(dayName)) return []

    const allSlots     = doctor.slots[dayName] || []
    const { bookings } = loadBookings()

    const bookedSlots = bookings
      .filter(b => b.doctorId === doctorId && b.date === date && b.status === "confirmed")
      .map(b => b.time)

    return allSlots.filter(s => !bookedSlots.includes(s))
  } catch(e) {
    console.error("getAvailableSlots error:", e.message)
    return []
  }
}

function isSlotAvailable(doctorId, date, time) {
  try {
    const { bookings } = loadBookings()
    return !bookings.some(b =>
      b.doctorId === doctorId &&
      b.date     === date &&
      b.time     === time &&
      b.status   === "confirmed"
    )
  } catch(e) {
    console.error("isSlotAvailable error:", e.message)
    return true
  }
}

function confirmBooking(bookingData) {
  try {
    console.log("\n📋 confirmBooking called for:", bookingData.patientName)
    console.log("📁 Saving to:", BOOKINGS_FILE)
    const data = loadBookings()

    if (!isSlotAvailable(bookingData.doctorId, bookingData.date, bookingData.time)) {
      return { success: false, message: "This slot was just taken. Please choose another time." }
    }

    // De-dupe: prevent accidental double-booking for same person/slot
    const phoneNorm = normalizePhone(bookingData.patientPhone)
    const duplicate = data.bookings.find(b =>
      b.status === "confirmed" &&
      normalizePhone(b.patientPhone) === phoneNorm &&
      b.doctorId === bookingData.doctorId &&
      b.date === bookingData.date &&
      b.time === bookingData.time
    )
    if (duplicate) {
      return { success: true, ref: duplicate.ref, deduped: true }
    }

    const ref = "APT" + Math.floor(1000 + Math.random() * 9000)

    data.bookings.push({
      id: ref,
      ref, // keep legacy key for existing UI/flows
      ...bookingData,
      language: bookingData.language || "en",
      paymentStatus: bookingData.paymentStatus || "Pending",
      status:   "confirmed",
      bookedAt: new Date().toISOString()
    })

    saveBookings(data)
    return { success: true, ref }
  } catch(e) {
    console.error("confirmBooking error:", e.message)
    return { success: false, message: "Booking failed due to server error." }
  }
}

// ── Cancel booking by ref number ──────────────────────────────────────────────
function cancelBooking(ref) {
  try {
    const data    = loadBookings()
    const index   = data.bookings.findIndex(
      b => b.ref.toUpperCase() === ref.toUpperCase() && b.status === "confirmed"
    )

    if (index === -1) {
      // Check if ref exists but already cancelled
      const alreadyCancelled = data.bookings.find(
        b => b.ref.toUpperCase() === ref.toUpperCase() && b.status === "cancelled"
      )
      if (alreadyCancelled) {
        return { success: false, message: `Booking ${ref} was already cancelled.` }
      }
      return { success: false, message: `No confirmed booking found with reference ${ref}.` }
    }

    // Mark as cancelled and record time
    data.bookings[index].status      = "cancelled"
    data.bookings[index].cancelledAt = new Date().toISOString()

    saveBookings(data)

    console.log(`\n🗑️  Booking ${ref} cancelled successfully`)

    // Return the full booking so notifier can send the right details
    return { success: true, booking: data.bookings[index] }
  } catch(e) {
    console.error("cancelBooking error:", e.message)
    return { success: false, message: "Cancellation failed due to server error." }
  }
}

function getHospitalInfo() {
  const { hospital } = loadDoctors()
  return hospital
}

module.exports = {
  findDoctor,
  getDoctorsList,
  suggestDoctor,
  getAvailableSlots,
  isSlotAvailable,
  confirmBooking,
  cancelBooking,
  getDayName,
  getHospitalInfo
}