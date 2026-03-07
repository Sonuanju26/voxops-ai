require("dotenv").config()
const { sendConfirmations } = require("./notifier")

const fakeBooking = {
  ref:         "VX999999",
  patientName: "Rahul",
  problem:     "back pain",
  doctorName:  "Dr. Suresh Verma",
  specialty:   "Orthopedic Surgeon",
  date:        "28-07-2026",
  time:        "3:00 PM",
  fee:         1000
}

console.log("🧪 Testing Twilio WhatsApp...\n")
sendConfirmations(fakeBooking)
  .then(r => console.log("\nDone:", JSON.stringify(r, null, 2)))
  .catch(e => console.error("Error:", e.message))