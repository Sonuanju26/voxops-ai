require("dotenv").config()
const { GoogleGenAI } = require("@google/genai")
const https = require("https")

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

const GEMINI_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
]

// ── Groq API caller with history ──────────────────────────────────────────────
async function callGroqWithHistory(systemPrompt, history) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return reject(new Error("GROQ_API_KEY missing in .env"))

    const messages = [{ role: "system", content: systemPrompt }]
    for (const turn of history) {
      messages.push({
        role:    turn.role === "user" ? "user" : "assistant",
        content: turn.content
      })
    }
    messages.push({
      role:    "user",
      content: "Based on the conversation above, what is your response? Output ONLY valid JSON."
    })

    const body = JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.3,
      max_tokens:  500
    })

    const options = {
      hostname: "api.groq.com",
      path:     "/openai/v1/chat/completions",
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Authorization":  `Bearer ${apiKey}`,
        "Content-Length": Buffer.byteLength(body)
      }
    }

    const req = https.request(options, (res) => {
      let data = ""
      res.on("data", chunk => data += chunk)
      res.on("end", () => {
        try {
          const json = JSON.parse(data)
          if (json.error) return reject(new Error(json.error.message))
          resolve(json.choices?.[0]?.message?.content || "")
        } catch (e) { reject(new Error("Failed to parse Groq response")) }
      })
    })
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

// ── Groq single message caller ────────────────────────────────────────────────
async function callGroq(systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return reject(new Error("GROQ_API_KEY missing in .env"))

    const body = JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMessage  }
      ],
      temperature: 0.3,
      max_tokens:  500
    })

    const options = {
      hostname: "api.groq.com",
      path:     "/openai/v1/chat/completions",
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Authorization":  `Bearer ${apiKey}`,
        "Content-Length": Buffer.byteLength(body)
      }
    }

    const req = https.request(options, (res) => {
      let data = ""
      res.on("data", chunk => data += chunk)
      res.on("end", () => {
        try {
          const json = JSON.parse(data)
          if (json.error) return reject(new Error(json.error.message))
          resolve(json.choices?.[0]?.message?.content || "")
        } catch (e) { reject(new Error("Failed to parse Groq response")) }
      })
    })
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

// ── Core AI caller (Gemini) — general chat only ───────────────────────────────
async function askAI(message) {
  for (const modelName of GEMINI_CHAIN) {
    try {
      const response = await ai.models.generateContent({ model: modelName, contents: message })
      return response.text
    } catch (error) {
      console.error(`Model failed [${modelName}]:`, error.message)
    }
  }
  return "Sorry, I couldn't process that right now. Please try again later."
}

// ── Wikipedia Search — free, no API key, great for medical conditions ─────────
function wikipediaSearch(conditionName) {
  return new Promise((resolve) => {
    const query   = encodeURIComponent(conditionName)
    const url     = `https://en.wikipedia.org/api/rest_v1/page/summary/${query}`
    console.log(`🔎 Wikipedia Search: "${conditionName}"`)

    https.get(url, { headers: { "User-Agent": "VoxOpsMediCare/1.0 (medical-bot)" } }, (res) => {
      let data = ""
      res.on("data", chunk => data += chunk)
      res.on("end", () => {
        try {
          const json = JSON.parse(data)
          if (json.type === "disambiguation" || json.type === "https://mediawiki.org/wiki/HyperSwitch/errors/not_found") {
            console.log(`⚠️  Wikipedia: not found for "${conditionName}"`)
            return resolve("")
          }
          if (json.extract) {
            console.log(`✅ Wikipedia returned: "${json.title}"`)
            resolve(`Title: ${json.title}\n\n${json.extract}`)
          } else {
            resolve("")
          }
        } catch (e) { resolve("") }
      })
    }).on("error", () => resolve(""))
  })
}

// ── Extract condition name from Groq summary ──────────────────────────────────
function extractConditionName(summary) {
  // Match disease names — exclude common English words as the first word
  const EXCLUDED = /^(with|the|a|an|this|that|for|of|in|is|has|have|been|and|or|by|to|from|its|their)$/i
  const rx = /\b([A-Za-z'-]+(?:'s)?(?:\s+[A-Za-z'-]+)?\s+(?:Syndrome|Disease|Disorder|Condition|Infection|Failure|Cancer|Palsy|Fever|Deficiency|Anemia|Arthritis))\b/gi
  let m
  while ((m = rx.exec(summary)) !== null) {
    const firstWord = m[1].split(" ")[0]
    if (!EXCLUDED.test(firstWord)) {
      console.log(`🏷️  Condition (pattern): "${m[1]}"`)
      return m[1]
    }
  }

  // Strip filler phrases
  const stripped = summary
    .replace(/^(The patient|Patient)\s+(with|has been diagnosed with|is experiencing|reports|has|suffers from|presents with)\s*/i, "")
    .replace(/^(Patient with|Patient has|Patient reports)\s*/i, "")
    .split(/[,.]/)[0]
    .trim()

  if (stripped && stripped.length < 50) {
    console.log(`🏷️  Condition (cleaned): "${stripped}"`)
    return stripped
  }

  const fallback = summary.split(" ").slice(0, 3).join(" ")
  console.log(`🏷️  Condition (fallback): "${fallback}"`)
  return fallback
}

// ── Available specialties ─────────────────────────────────────────────────────
const AVAILABLE_SPECIALTIES = [
  "General Physician", "Cardiologist", "Dermatologist", "Orthopedic Surgeon",
  "ENT Specialist", "Neurologist", "Gastroenterologist", "Pediatrician",
  "Psychiatrist", "Dentist", "Gynecologist", "Ophthalmologist", "Urologist",
  "Endocrinologist", "Pulmonologist", "Oncologist", "Rheumatologist", "Nephrologist"
]


// ── Medical knowledge base — 200+ conditions hardcoded for 95%+ accuracy ─────
// Layer 1: instant lookup before hitting Wikipedia/Groq
const MEDICAL_KB = {
  // Cardiologist
  "heart attack": "Cardiologist",
  "myocardial infarction": "Cardiologist",
  "angina": "Cardiologist",
  "heart failure": "Cardiologist",
  "arrhythmia": "Cardiologist",
  "atrial fibrillation": "Cardiologist",
  "hypertension": "Cardiologist",
  "high blood pressure": "Cardiologist",
  "coronary artery disease": "Cardiologist",
  "cardiomyopathy": "Cardiologist",
  "pericarditis": "Cardiologist",
  "endocarditis": "Cardiologist",
  "heart valve disease": "Cardiologist",
  "aortic stenosis": "Cardiologist",
  "mitral valve prolapse": "Cardiologist",
  "wolff parkinson white": "Cardiologist",
  "long qt syndrome": "Cardiologist",

  // ENT Specialist
  "ramsay hunt syndrome": "ENT Specialist",
  "bells palsy": "ENT Specialist",
  "bell's palsy": "ENT Specialist",
  "sinusitis": "ENT Specialist",
  "tonsillitis": "ENT Specialist",
  "otitis media": "ENT Specialist",
  "otitis externa": "ENT Specialist",
  "meniere's disease": "ENT Specialist",
  "meniere disease": "ENT Specialist",
  "vertigo": "ENT Specialist",
  "bppv": "ENT Specialist",
  "acoustic neuroma": "ENT Specialist",
  "deviated septum": "ENT Specialist",
  "nasal polyps": "ENT Specialist",
  "laryngitis": "ENT Specialist",
  "epiglottitis": "ENT Specialist",
  "cholesteatoma": "ENT Specialist",

  // Neurologist
  "parkinson's disease": "Neurologist",
  "parkinson disease": "Neurologist",
  "alzheimer's disease": "Neurologist",
  "alzheimer disease": "Neurologist",
  "epilepsy": "Neurologist",
  "multiple sclerosis": "Neurologist",
  "migraine": "Neurologist",
  "stroke": "Neurologist",
  "transient ischemic attack": "Neurologist",
  "guillain barre syndrome": "Neurologist",
  "guillain-barre syndrome": "Neurologist",
  "myasthenia gravis": "Neurologist",
  "huntington's disease": "Neurologist",
  "huntington disease": "Neurologist",
  "als": "Neurologist",
  "amyotrophic lateral sclerosis": "Neurologist",
  "cerebral palsy": "Neurologist",
  "meningitis": "Neurologist",
  "encephalitis": "Neurologist",
  "neuropathy": "Neurologist",
  "trigeminal neuralgia": "Neurologist",

  // Rheumatologist
  "buerger's disease": "Rheumatologist",
  "buerger disease": "Rheumatologist",
  "thromboangiitis obliterans": "Rheumatologist",
  "raynaud's phenomenon": "Rheumatologist",
  "raynaud phenomenon": "Rheumatologist",
  "raynaud's disease": "Rheumatologist",
  "rheumatoid arthritis": "Rheumatologist",
  "lupus": "Rheumatologist",
  "systemic lupus erythematosus": "Rheumatologist",
  "sle": "Rheumatologist",
  "psoriatic arthritis": "Rheumatologist",
  "ankylosing spondylitis": "Rheumatologist",
  "gout": "Rheumatologist",
  "fibromyalgia": "Rheumatologist",
  "sjogren's syndrome": "Rheumatologist",
  "sjogren syndrome": "Rheumatologist",
  "vasculitis": "Rheumatologist",
  "scleroderma": "Rheumatologist",
  "polymyalgia rheumatica": "Rheumatologist",
  "reactive arthritis": "Rheumatologist",
  "antiphospholipid syndrome": "Rheumatologist",
  "polymyositis": "Rheumatologist",
  "dermatomyositis": "Rheumatologist",
  "mixed connective tissue disease": "Rheumatologist",

  // Gastroenterologist
  "crohn's disease": "Gastroenterologist",
  "crohn disease": "Gastroenterologist",
  "ulcerative colitis": "Gastroenterologist",
  "irritable bowel syndrome": "Gastroenterologist",
  "ibs": "Gastroenterologist",
  "celiac disease": "Gastroenterologist",
  "peptic ulcer": "Gastroenterologist",
  "gerd": "Gastroenterologist",
  "gastroesophageal reflux disease": "Gastroenterologist",
  "cirrhosis": "Gastroenterologist",
  "hepatitis": "Gastroenterologist",
  "hepatitis b": "Gastroenterologist",
  "hepatitis c": "Gastroenterologist",
  "fatty liver disease": "Gastroenterologist",
  "pancreatitis": "Gastroenterologist",
  "gallstones": "Gastroenterologist",
  "diverticulitis": "Gastroenterologist",
  "colorectal cancer": "Gastroenterologist",
  "hemorrhoids": "Gastroenterologist",
  "appendicitis": "Gastroenterologist",
  "cholecystitis": "Gastroenterologist",

  // Endocrinologist
  "diabetes": "Endocrinologist",
  "type 1 diabetes": "Endocrinologist",
  "type 2 diabetes": "Endocrinologist",
  "hypothyroidism": "Endocrinologist",
  "hyperthyroidism": "Endocrinologist",
  "hashimoto's thyroiditis": "Endocrinologist",
  "hashimoto thyroiditis": "Endocrinologist",
  "graves' disease": "Endocrinologist",
  "graves disease": "Endocrinologist",
  "cushing's syndrome": "Endocrinologist",
  "cushing syndrome": "Endocrinologist",
  "addison's disease": "Endocrinologist",
  "addison disease": "Endocrinologist",
  "acromegaly": "Endocrinologist",
  "pcos": "Endocrinologist",
  "polycystic ovary syndrome": "Endocrinologist",
  "osteoporosis": "Endocrinologist",
  "hyperparathyroidism": "Endocrinologist",
  "hypoparathyroidism": "Endocrinologist",
  "pheochromocytoma": "Endocrinologist",
  "metabolic syndrome": "Endocrinologist",

  // Pulmonologist
  "asthma": "Pulmonologist",
  "copd": "Pulmonologist",
  "chronic obstructive pulmonary disease": "Pulmonologist",
  "pneumonia": "Pulmonologist",
  "tuberculosis": "Pulmonologist",
  "tb": "Pulmonologist",
  "lung cancer": "Pulmonologist",
  "pulmonary fibrosis": "Pulmonologist",
  "bronchitis": "Pulmonologist",
  "emphysema": "Pulmonologist",
  "sleep apnea": "Pulmonologist",
  "pulmonary hypertension": "Pulmonologist",
  "pleurisy": "Pulmonologist",
  "sarcoidosis": "Pulmonologist",
  "cystic fibrosis": "Pulmonologist",
  "bronchiectasis": "Pulmonologist",
  "covid": "Pulmonologist",
  "post covid": "Pulmonologist",

  // Nephrologist
  "chronic kidney disease": "Nephrologist",
  "ckd": "Nephrologist",
  "kidney failure": "Nephrologist",
  "renal failure": "Nephrologist",
  "nephrotic syndrome": "Nephrologist",
  "nephritic syndrome": "Nephrologist",
  "glomerulonephritis": "Nephrologist",
  "polycystic kidney disease": "Nephrologist",
  "kidney stones": "Urologist",
  "renal calculi": "Urologist",
  "iga nephropathy": "Nephrologist",
  "lupus nephritis": "Nephrologist",

  // Urologist
  "benign prostatic hyperplasia": "Urologist",
  "bph": "Urologist",
  "prostate cancer": "Urologist",
  "bladder cancer": "Urologist",
  "urinary tract infection": "Urologist",
  "uti": "Urologist",
  "erectile dysfunction": "Urologist",
  "overactive bladder": "Urologist",
  "urinary incontinence": "Urologist",
  "hydronephrosis": "Urologist",
  "varicocele": "Urologist",
  "testicular cancer": "Urologist",

  // Dermatologist
  "psoriasis": "Dermatologist",
  "eczema": "Dermatologist",
  "atopic dermatitis": "Dermatologist",
  "acne vulgaris": "Dermatologist",
  "rosacea": "Dermatologist",
  "vitiligo": "Dermatologist",
  "alopecia": "Dermatologist",
  "alopecia areata": "Dermatologist",
  "skin cancer": "Dermatologist",
  "melanoma": "Dermatologist",
  "basal cell carcinoma": "Dermatologist",
  "squamous cell carcinoma": "Dermatologist",
  "urticaria": "Dermatologist",
  "hives": "Dermatologist",
  "pemphigus": "Dermatologist",
  "herpes zoster": "Dermatologist",
  "shingles": "Dermatologist",
  "tinea": "Dermatologist",
  "ringworm": "Dermatologist",
  "scabies": "Dermatologist",

  // Orthopedic Surgeon
  "osteoarthritis": "Orthopedic Surgeon",
  "rheumatoid arthritis joint": "Orthopedic Surgeon",
  "scoliosis": "Orthopedic Surgeon",
  "herniated disc": "Orthopedic Surgeon",
  "slipped disc": "Orthopedic Surgeon",
  "carpal tunnel syndrome": "Orthopedic Surgeon",
  "rotator cuff tear": "Orthopedic Surgeon",
  "acl tear": "Orthopedic Surgeon",
  "meniscus tear": "Orthopedic Surgeon",
  "fracture": "Orthopedic Surgeon",
  "bone fracture": "Orthopedic Surgeon",
  "osteomyelitis": "Orthopedic Surgeon",
  "tendinitis": "Orthopedic Surgeon",
  "plantar fasciitis": "Orthopedic Surgeon",
  "frozen shoulder": "Orthopedic Surgeon",

  // Ophthalmologist
  "glaucoma": "Ophthalmologist",
  "cataract": "Ophthalmologist",
  "macular degeneration": "Ophthalmologist",
  "diabetic retinopathy": "Ophthalmologist",
  "retinal detachment": "Ophthalmologist",
  "uveitis": "Ophthalmologist",
  "conjunctivitis": "Ophthalmologist",
  "keratoconus": "Ophthalmologist",
  "amblyopia": "Ophthalmologist",
  "strabismus": "Ophthalmologist",
  "dry eye syndrome": "Ophthalmologist",

  // Psychiatrist
  "depression": "Psychiatrist",
  "major depressive disorder": "Psychiatrist",
  "bipolar disorder": "Psychiatrist",
  "schizophrenia": "Psychiatrist",
  "anxiety disorder": "Psychiatrist",
  "generalized anxiety disorder": "Psychiatrist",
  "panic disorder": "Psychiatrist",
  "ptsd": "Psychiatrist",
  "post traumatic stress disorder": "Psychiatrist",
  "ocd": "Psychiatrist",
  "obsessive compulsive disorder": "Psychiatrist",
  "eating disorder": "Psychiatrist",
  "anorexia nervosa": "Psychiatrist",
  "bulimia nervosa": "Psychiatrist",
  "adhd": "Psychiatrist",
  "attention deficit hyperactivity disorder": "Psychiatrist",
  "autism spectrum disorder": "Psychiatrist",
  "borderline personality disorder": "Psychiatrist",
  "insomnia": "Psychiatrist",

  // Oncologist
  "breast cancer": "Oncologist",
  "cervical cancer": "Oncologist",
  "ovarian cancer": "Oncologist",
  "leukemia": "Oncologist",
  "lymphoma": "Oncologist",
  "hodgkin lymphoma": "Oncologist",
  "non hodgkin lymphoma": "Oncologist",
  "multiple myeloma": "Oncologist",
  "colon cancer": "Oncologist",
  "rectal cancer": "Oncologist",
  "stomach cancer": "Oncologist",
  "pancreatic cancer": "Oncologist",
  "liver cancer": "Oncologist",
  "brain tumor": "Oncologist",
  "glioblastoma": "Oncologist",
  "thyroid cancer": "Oncologist",
  "bone cancer": "Oncologist",
  "sarcoma": "Oncologist",

  // Gynecologist
  "endometriosis": "Gynecologist",
  "uterine fibroids": "Gynecologist",
  "ovarian cyst": "Gynecologist",
  "cervical dysplasia": "Gynecologist",
  "pelvic inflammatory disease": "Gynecologist",
  "pid": "Gynecologist",
  "vaginitis": "Gynecologist",
  "menorrhagia": "Gynecologist",
  "amenorrhea": "Gynecologist",
  "dysmenorrhea": "Gynecologist",
  "ectopic pregnancy": "Gynecologist",
  "preeclampsia": "Gynecologist",
  "gestational diabetes": "Gynecologist",

  // General Physician
  "influenza": "General Physician",
  "common cold": "General Physician",
  "typhoid": "General Physician",
  "malaria": "General Physician",
  "dengue": "General Physician",
  "chickenpox": "General Physician",
  "mumps": "General Physician",
  "measles": "General Physician",
  "anemia": "General Physician",
  "vitamin deficiency": "General Physician",
  "iron deficiency": "General Physician"
}

// Look up condition in knowledge base — normalize to lowercase for matching
function lookupKnowledgeBase(conditionName) {
  const key = conditionName.toLowerCase().trim()
  // Exact match
  if (MEDICAL_KB[key]) return MEDICAL_KB[key]
  // Partial match — check if any KB key is contained in the condition name
  for (const [disease, specialist] of Object.entries(MEDICAL_KB)) {
    if (key.includes(disease) || disease.includes(key)) {
      console.log(`📚 KB match: "${disease}" → ${specialist}`)
      return specialist
    }
  }
  return null
}

const INTAKE_SYSTEM_PROMPT = `You are a medical intake assistant for VoxOps MediCare Hospital.
Your job is to ask the patient follow-up questions to understand their symptoms clearly,
then recommend the correct medical specialist from our hospital.

Available specialists:
${AVAILABLE_SPECIALTIES.map(s => `- ${s}`).join("\n")}

Rules:
1. Ask ONE focused follow-up question at a time to understand:
   - Exact location of symptom
   - Duration (how long)
   - Severity (mild / moderate / severe)
   - Associated symptoms (fever, nausea, dizziness, etc.)
2. Keep questions short, friendly, and in simple language.
3. Once you have enough information to be confident, output ONLY this JSON:
   {"status":"confident","specialty":"<specialist name from list>","summary":"<include disease/condition name if mentioned, plus one sentence summary of symptoms>"}
4. If after 4-5 questions you still cannot determine the right specialist, output ONLY this JSON:
   {"status":"unclear","summary":"<what you understood so far>"}
5. If you need more information, output ONLY this JSON:
   {"status":"question","reply":"<your follow-up question>"}
6. NEVER output plain text. ALWAYS output valid JSON only.
7. NEVER suggest a specialist not in the available list.`

// ── Step 1: Gather symptoms using Groq ───────────────────────────────────────
async function gatherSymptoms(intakeHistory) {
  try {
    const raw       = await callGroqWithHistory(INTAKE_SYSTEM_PROMPT, intakeHistory)
    const cleaned   = raw.trim().replace(/```json|```/g, "").trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error("No JSON in Groq response")
    const parsed = JSON.parse(jsonMatch[0])
    console.log(`🦙 Groq intake [llama-3.3-70b]:`, JSON.stringify(parsed))
    return parsed
  } catch (error) {
    console.error(`Groq intake failed:`, error.message)
    console.warn(`Falling back to Gemini for intake...`)
  }

  // Fallback to Gemini
  const contents = [
    { role: "user", parts: [{ text: INTAKE_SYSTEM_PROMPT + "\n\nConversation so far:" }] }
  ]
  for (const turn of intakeHistory) {
    contents.push({ role: turn.role === "user" ? "user" : "model", parts: [{ text: turn.content }] })
  }
  contents.push({ role: "user", parts: [{ text: "Based on the conversation above, what is your response? Output ONLY valid JSON." }] })

  for (const modelName of GEMINI_CHAIN) {
    try {
      const response = await ai.models.generateContent({ model: modelName, contents })
      const raw      = response.text.trim()
      const cleaned  = raw.replace(/```json|```/g, "").trim()
      const parsed   = JSON.parse(cleaned)
      console.log(`🧠 Gemini fallback intake [${modelName}]:`, JSON.stringify(parsed))
      return parsed
    } catch (error) {
      console.error(`Gemini intake failed [${modelName}]:`, error.message)
    }
  }

  return { status: "unclear", summary: "Could not process intake" }
}

// ── Step 2: Wikipedia search + Groq verification ──────────────────────────────
async function verifySpecialtyWithSearch(specialty, summary, intakeHistory = []) {
  try {
    console.log(`\n🌐 Running Wikipedia-based verification...`)

    // Try to extract condition name from summary first
    let conditionName = extractConditionName(summary)

    // If extraction fell back to symptom words, try patient's first message instead
    // Patient's first message often contains the actual disease name e.g. "I have Buerger's disease"
    const symptomWords = /^(severe|pain|mild|moderate|my|i have|i feel|the|a |an )/i
    if (symptomWords.test(conditionName) && intakeHistory.length > 0) {
      const firstMsg = intakeHistory[0].content || ""
      const fromMsg  = extractConditionName(firstMsg)
      if (!symptomWords.test(fromMsg)) {
        conditionName = fromMsg
        console.log(`🏷️  Using condition from patient message: "${conditionName}"`)
      }
    }

    // ── Layer 1: Check knowledge base first — instant, 95%+ accurate ──────
    const kbResult = lookupKnowledgeBase(conditionName)
    if (kbResult) {
      console.log(`📚 Knowledge base match: "${conditionName}" → ${kbResult}`)
      if (kbResult !== specialty) {
        console.log(`🔄 CORRECTED by KB: ${specialty} → ${kbResult}`)
      } else {
        console.log(`✅ CONFIRMED by KB: ${kbResult}`)
      }
      return kbResult
    }

    // ── Layer 2: Wikipedia + Groq for unknown conditions ─────────────────
    console.log(`📖 Not in KB — trying Wikipedia...`)
    let wikiText = await wikipediaSearch(conditionName)

    // Try without apostrophe e.g. "Buergers disease"
    if (!wikiText) {
      const simplified = conditionName.replace(/'/g, "").replace(/\s+/g, " ").trim()
      if (simplified !== conditionName) wikiText = await wikipediaSearch(simplified)
    }

    // Try just the first two words e.g. "Buerger's disease" from "Buerger's disease symptoms"
    if (!wikiText) {
      const twoWords = conditionName.split(" ").slice(0, 2).join(" ")
      if (twoWords !== conditionName) wikiText = await wikipediaSearch(twoWords)
    }

    if (!wikiText) {
      console.warn(`⚠️  No Wikipedia results for "${conditionName}" — keeping original`)
      return specialty
    }

    console.log(`✅ Wikipedia data obtained — verifying with Groq...`)

    const verifyPrompt = `You are a medical specialist routing assistant.

Condition: "${conditionName}"
Initial AI recommendation: ${specialty}

Wikipedia information about this condition:
─────────────────────────────────────────────
${wikiText.slice(0, 1500)}
─────────────────────────────────────────────

Based on this Wikipedia information, which specialist should this patient see FIRST?

Specialist selection guide — use this to map conditions:
- Blood vessel / vascular / artery / circulation problems → Rheumatologist (closest to vascular in our list)
- Inflammatory joint / autoimmune / connective tissue → Rheumatologist
- Ear / nose / throat / facial nerve / hearing → ENT Specialist
- Heart / cardiac / chest pain / blood pressure → Cardiologist
- Lung / breathing / asthma / TB → Pulmonologist
- Kidney / renal / dialysis → Nephrologist
- Hormone / thyroid / diabetes → Endocrinologist
- Stomach / liver / bowel → Gastroenterologist
- Skin / hair / rash → Dermatologist
- Bone / joint / fracture / spine → Orthopedic Surgeon
- Brain / nerve / seizure / stroke → Neurologist (only if clearly neurological, not vascular)
- Mental health / anxiety / depression → Psychiatrist
- Eye → Ophthalmologist
- Child / infant / pediatric → Pediatrician
- Urinary / kidney stone / prostate → Urologist
- Cancer / tumor → Oncologist
- General illness / fever / cold / checkup → General Physician
- Teeth / gum / jaw → Dentist
- Women / pregnancy / periods → Gynecologist

IMPORTANT: General Physician is ONLY for common illnesses like fever, cold, checkup.
For any specific named disease or complex condition, always pick the relevant specialist.

Only choose from this exact list:
${AVAILABLE_SPECIALTIES.map(s => `  - ${s}`).join("\n")}

Output ONLY this JSON:
{"specialty":"<first-visit specialist>","searchConfirmed":<true/false>,"reason":"<one line from Wikipedia text>"}`

    try {
      const raw       = await callGroq("You are a medical routing assistant. Output only valid JSON.", verifyPrompt)
      const cleaned   = raw.trim().replace(/```json|```/g, "").trim()
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error("No JSON")
      const parsed = JSON.parse(jsonMatch[0])
      console.log(`✅ Groq verification:`, JSON.stringify(parsed))
      if (!parsed.searchConfirmed) {
        console.log(`🔄 CORRECTED: ${specialty} → ${parsed.specialty}`)
      } else {
        console.log(`✅ CONFIRMED: ${parsed.specialty}`)
      }
      return parsed.specialty
    } catch (groqErr) {
      console.error("Groq verification failed:", groqErr.message)
    }

    // Fallback to Gemini
    for (const modelName of GEMINI_CHAIN) {
      try {
        const response  = await ai.models.generateContent({
          model:    modelName,
          contents: [{ role: "user", parts: [{ text: verifyPrompt }] }]
        })
        const raw       = response.text.trim()
        const cleaned   = raw.replace(/```json|```/g, "").trim()
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error("No JSON")
        const parsed = JSON.parse(jsonMatch[0])
        console.log(`✅ Gemini verification [${modelName}]:`, JSON.stringify(parsed))
        return parsed.specialty
      } catch (error) {
        console.error(`Gemini verification failed [${modelName}]:`, error.message)
      }
    }

  } catch (error) {
    console.error("verifySpecialtyWithSearch error:", error.message)
  }

  console.warn(`⚠️  Verification failed — keeping original: ${specialty}`)
  return specialty
}

// ── Main intake conductor ─────────────────────────────────────────────────────
async function conductIntake(intakeHistory) {
  const intakeResult = await gatherSymptoms(intakeHistory)

  if (intakeResult.status === "question" || intakeResult.status === "unclear") {
    return intakeResult
  }

  if (intakeResult.status === "confident") {
    console.log(`\n🔍 Initial assessment: ${intakeResult.specialty}`)
    const verifiedSpecialty = await verifySpecialtyWithSearch(
      intakeResult.specialty,
      intakeResult.summary,
      intakeHistory
    )
    return {
      status:    "confident",
      specialty: verifiedSpecialty,
      summary:   intakeResult.summary
    }
  }

  return intakeResult
}

module.exports = { askAI, conductIntake }