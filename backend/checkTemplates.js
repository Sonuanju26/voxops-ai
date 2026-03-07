// checkTemplates.js — Check template approval status
// Run: node checkTemplates.js

require("dotenv").config()
const https = require("https")

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN
const WABA_ID      = process.env.META_WABA_ID

const options = {
  hostname: "graph.facebook.com",
  path:     `/v22.0/${WABA_ID}/message_templates?fields=name,status,category&limit=20`,
  method:   "GET",
  headers:  { "Authorization": `Bearer ${ACCESS_TOKEN}` }
}

const req = https.request(options, (res) => {
  let data = ""
  res.on("data", c => data += c)
  res.on("end", () => {
    const parsed = JSON.parse(data)
    if (!parsed.data) {
      console.log("❌ Error:", parsed.error?.message)
      return
    }
    console.log("\n📋 Your WhatsApp Templates:\n")
    parsed.data.forEach(t => {
      const icon = t.status === "APPROVED" ? "✅" : t.status === "PENDING" ? "⏳" : "❌"
      console.log(`${icon} ${t.name.padEnd(35)} → ${t.status}`)
    })

    const pending  = parsed.data.filter(t => t.status === "PENDING").length
    const approved = parsed.data.filter(t => t.status === "APPROVED").length
    const rejected = parsed.data.filter(t => t.status === "REJECTED").length

    console.log(`\n✅ Approved: ${approved} | ⏳ Pending: ${pending} | ❌ Rejected: ${rejected}`)

    if (pending > 0)  console.log("\n⏳ Still waiting for approval. Run again in 2 minutes.")
    if (rejected > 0) console.log("\n❌ Some templates were rejected. Share the names and I'll fix them.")
    if (pending === 0 && approved > 0) console.log("\n🎉 All approved! Run: node testBookingNotify.js")
  })
})
req.on("error", e => console.error(e))
req.end()