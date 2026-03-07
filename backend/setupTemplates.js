// setupTemplates.js — Run ONCE: node setupTemplates.js
require("dotenv").config()
const https = require("https")

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN
const WABA_ID      = process.env.META_WABA_ID

async function createTemplate(template) {
  return new Promise((resolve) => {
    const body = JSON.stringify(template)
    const options = {
      hostname: "graph.facebook.com",
      path:     `/v22.0/${WABA_ID}/message_templates`,
      method:   "POST",
      headers: {
        "Authorization":  `Bearer ${ACCESS_TOKEN}`,
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }
    const req = https.request(options, (res) => {
      let data = ""
      res.on("data", c => data += c)
      res.on("end", () => {
        const parsed = JSON.parse(data)
        console.log(`\n[${template.name}]`)
        console.log("Status:", res.statusCode)
        console.log("Response:", JSON.stringify(parsed, null, 2))
        resolve(parsed)
      })
    })
    req.on("error", e => { console.error(e); resolve(null) })
    req.write(body)
    req.end()
  })
}

async function run() {
  console.log("Creating templates...\n")

  // Template 1: Patient booking confirmed
  await createTemplate({
    name: "patient_booking_confirmed",
    language: "en_US",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Hello {{1}}, your appointment is confirmed!\n\nDoctor: {{2}}\nDate: {{3}}\nTime: {{4}}\nFee: Rs.{{5}}\nRef: {{6}}\n\nPlease arrive 10 minutes early.\nVoxOps MediCare Hospital",
        example: {
          body_text: [
            ["Rahul", "Dr. Sharma", "28-07-2026", "3:00 PM", "500", "VX123456"]
          ]
        }
      }
    ]
  })

  // Template 2: Patient booking cancelled
  await createTemplate({
    name: "patient_booking_cancelled",
    language: "en_US",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Hello {{1}}, your appointment has been cancelled.\n\nDoctor: {{2}}\nDate: {{3}}\nTime: {{4}}\nRef: {{5}}\n\nTo rebook please call +91-80-1234-5678.\nVoxOps MediCare Hospital",
        example: {
          body_text: [
            ["Rahul", "Dr. Sharma", "28-07-2026", "3:00 PM", "VX123456"]
          ]
        }
      }
    ]
  })

  // Template 3: Doctor new appointment
  await createTemplate({
    name: "doctor_new_appointment",
    language: "en_US",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "New appointment booked at VoxOps MediCare.\n\nPatient: {{1}}\nProblem: {{2}}\nDate: {{3}}\nTime: {{4}}\nRef: {{5}}\n\nPlease be available on time.",
        example: {
          body_text: [
            ["Rahul", "Back pain", "28-07-2026", "3:00 PM", "VX123456"]
          ]
        }
      }
    ]
  })

  // Template 4: Doctor appointment cancelled
  await createTemplate({
    name: "doctor_appt_cancelled",
    language: "en_US",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "An appointment has been cancelled at VoxOps MediCare.\n\nPatient: {{1}}\nDate: {{2}}\nTime: {{3}}\nRef: {{4}}",
        example: {
          body_text: [
            ["Rahul", "28-07-2026", "3:00 PM", "VX123456"]
          ]
        }
      }
    ]
  })
}

run()