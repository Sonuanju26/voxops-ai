// notifier.js — Twilio WhatsApp sandbox

require("dotenv").config()
const twilio = require("twilio")

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

const FROM = process.env.TWILIO_WHATSAPP_FROM  // whatsapp:+14155238886

// ── Core sender ───────────────────────────────────────────────────────────────
async function sendWhatsApp(to, message) {
  try {
    const result = await client.messages.create({
      from: FROM,
      to:   to,
      body: message
    })
    console.log(`✅ Sent to ${to} | SID: ${result.sid}`)
    return { success: true, sid: result.sid }
  } catch (error) {
    console.error(`❌ Failed to ${to}:`, error.message)
    return { success: false, error: error.message }
  }
}

// ── Messages ──────────────────────────────────────────────────────────────────
function patientBookedMsg(booking) {
  return [
    `🏥 VoxOps MediCare Hospital`,
    ``,
    `✅ Appointment Confirmed!`,
    ``,
    `👤 Patient  : ${booking.patientName}`,
    `👨‍⚕️ Doctor   : ${booking.doctorName}`,
    `🏙️ City     : Bangalore`,
    `⏰ Time     : ${booking.time}`,
    `📅 Date     : ${booking.date}`,
    `💰 Fee      : Rs.${booking.fee}`,
    `📋 Ref      : ${booking.ref}`,
    ``,
    `📍 123, MG Road, Bangalore - 560001`,
    `📞 +91-80-1234-5678`,
    ``,
    `⚠️ Please arrive 10 mins early.`
  ].join("\n")
}

function patientCancelledMsg(booking) {
  return [
    `🏥 VoxOps MediCare Hospital`,
    ``,
    `❌ Appointment Cancelled`,
    ``,
    `📋 Ref     : ${booking.ref}`,
    `👤 Patient : ${booking.patientName}`,
    `👨‍⚕️ Doctor  : ${booking.doctorName}`,
    `📅 Date    : ${booking.date}`,
    `⏰ Time    : ${booking.time}`,
    ``,
    `To rebook call: +91-80-1234-5678`
  ].join("\n")
}

function doctorBookedMsg(booking) {
  return [
    `🏥 VoxOps MediCare`,
    ``,
    `🔔 New Appointment Alert`,
    ``,
    `👤 Patient  : ${booking.patientName}`,
    `🩺 Problem  : ${booking.problem}`,
    `⏰ Time     : ${booking.time}`,
    `📅 Date     : ${booking.date}`,
    `📋 Ref      : ${booking.ref}`,
    ``,
    `Please be available on time.`
  ].join("\n")
}

function doctorCancelledMsg(booking) {
  return [
    `🏥 VoxOps MediCare`,
    ``,
    `❌ Appointment Cancelled`,
    ``,
    `📋 Ref     : ${booking.ref}`,
    `👤 Patient : ${booking.patientName}`,
    `📅 Date    : ${booking.date}`,
    `⏰ Time    : ${booking.time}`,
    ``,
    `Please update your schedule.`
  ].join("\n")
}

// ── Public functions ──────────────────────────────────────────────────────────
async function sendConfirmations(booking) {
  console.log("\n📲 Sending WhatsApp confirmations...")

  // ✅ Use patient's own number if provided, else fallback to .env
  const patientPhone = booking.patientPhone
    ? `whatsapp:+${booking.patientPhone}`
    : process.env.PATIENT_PHONE

  console.log(`   Patient phone: ${patientPhone}`)
  console.log(`   Doctor phone : ${process.env.DOCTOR_PHONE}`)

  const [p, d] = await Promise.all([
    sendWhatsApp(patientPhone,              patientBookedMsg(booking)),
    sendWhatsApp(process.env.DOCTOR_PHONE,  doctorBookedMsg(booking))
  ])
  console.log("Patient:", p.success ? "✅" : "❌ " + p.error)
  console.log("Doctor :", d.success ? "✅" : "❌ " + d.error)
  return { patient: p, doctor: d }
}

async function sendCancellations(booking) {
  console.log("\n📲 Sending cancellation notifications...")
  const [p, d] = await Promise.all([
    sendWhatsApp(process.env.PATIENT_PHONE, patientCancelledMsg(booking)),
    sendWhatsApp(process.env.DOCTOR_PHONE,  doctorCancelledMsg(booking))
  ])
  console.log("Patient:", p.success ? "✅" : "❌ " + p.error)
  console.log("Doctor :", d.success ? "✅" : "❌ " + d.error)
  return { patient: p, doctor: d }
}

module.exports = { sendConfirmations, sendCancellations }