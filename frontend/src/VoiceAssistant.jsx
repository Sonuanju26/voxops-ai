import { useState, useEffect, useRef, useCallback } from "react"

const styleEl = document.createElement("style")
styleEl.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;500;600;700;800;900&family=Share+Tech+Mono&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  @keyframes orbPulse  { 0%,100%{transform:scale(1);box-shadow:0 0 60px 20px rgba(0,200,255,.25),0 0 120px 40px rgba(0,100,255,.15)} 50%{transform:scale(1.06);box-shadow:0 0 80px 30px rgba(0,200,255,.4),0 0 160px 60px rgba(0,100,255,.2)} }
  @keyframes orbListen { 0%,100%{transform:scale(1);box-shadow:0 0 60px 20px rgba(255,50,100,.4)} 50%{transform:scale(1.12);box-shadow:0 0 100px 40px rgba(255,50,100,.7)} }
  @keyframes orbSpeak  { 0%,100%{transform:scale(1);box-shadow:0 0 60px 20px rgba(0,255,150,.35)} 50%{transform:scale(1.07);box-shadow:0 0 90px 35px rgba(0,255,150,.55)} }
  @keyframes orbThink  { 0%,100%{transform:scale(1);box-shadow:0 0 60px 20px rgba(160,80,255,.35)} 50%{transform:scale(1.05);box-shadow:0 0 90px 35px rgba(160,80,255,.55)} }
  @keyframes ringR     { from{transform:translate(-50%,-50%) rotate(0deg)} to{transform:translate(-50%,-50%) rotate(360deg)} }
  @keyframes ringL     { from{transform:translate(-50%,-50%) rotate(0deg)} to{transform:translate(-50%,-50%) rotate(-360deg)} }
  @keyframes waveBar   { 0%,100%{height:4px} 50%{height:24px} }
  @keyframes scanLine  { 0%{top:0%} 100%{top:100%} }
  @keyframes float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
  @keyframes msgIn     { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin      { to{transform:rotate(360deg)} }
  @keyframes gridMove  { from{background-position:0 0} to{background-position:40px 40px} }
  @keyframes pulseRed  { 0%,100%{opacity:1} 50%{opacity:.6} }
  @keyframes bargeFlash{ 0%{background:rgba(255,184,0,.3)} 100%{background:transparent} }
  @keyframes slideIn   { from{opacity:0;transform:translateX(-20px)} to{opacity:1;transform:translateX(0)} }
  @keyframes langPop   { 0%{transform:scale(.8);opacity:0} 60%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }

  .va-app { min-height:100vh;background:#010308;font-family:'Exo 2',sans-serif;color:#e0f0ff;overflow:hidden;position:relative; }
  .va-grid { position:fixed;inset:0;pointer-events:none;z-index:0;background-image:linear-gradient(rgba(0,180,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,255,.04) 1px,transparent 1px);background-size:40px 40px;animation:gridMove 8s linear infinite; }
  .va-glow { position:fixed;top:-300px;left:50%;transform:translateX(-50%);width:1000px;height:600px;border-radius:50%;pointer-events:none;z-index:0;background:radial-gradient(ellipse,rgba(0,80,255,.1) 0%,transparent 70%); }
  .va-scan { position:fixed;left:0;right:0;height:2px;pointer-events:none;z-index:1;background:linear-gradient(90deg,transparent,rgba(0,200,255,.3),transparent);animation:scanLine 6s linear infinite; }
  .va-header { position:relative;z-index:10;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(0,200,255,.08);background:rgba(1,3,8,.85);backdrop-filter:blur(20px); }
  .orb-wrap { position:relative;width:220px;height:220px;cursor:pointer;flex-shrink:0; }
  .orb-ring { position:absolute;top:50%;left:50%;border-radius:50%;border:1px solid transparent;pointer-events:none; }
  .orb-ring-1 { width:280px;height:280px;border-color:rgba(0,200,255,.15);animation:ringR 8s linear infinite; }
  .orb-ring-2 { width:320px;height:320px;border-color:rgba(0,100,255,.1);border-style:dashed;animation:ringL 12s linear infinite; }
  .orb-ring-3 { width:360px;height:360px;border-color:rgba(0,200,255,.06);animation:ringR 20s linear infinite; }
  .orb { width:220px;height:220px;border-radius:50%;position:relative;z-index:2;transition:all .3s;display:flex;align-items:center;justify-content:center; }
  .orb.idle      { background:radial-gradient(circle at 35% 35%,rgba(0,180,255,.4),rgba(0,60,180,.6) 50%,rgba(0,10,60,.9));animation:orbPulse 3s ease-in-out infinite; }
  .orb.listening { background:radial-gradient(circle at 35% 35%,rgba(255,100,130,.5),rgba(200,0,80,.6) 50%,rgba(60,0,30,.9));animation:orbListen 1s ease-in-out infinite; }
  .orb.thinking  { background:radial-gradient(circle at 35% 35%,rgba(180,100,255,.5),rgba(100,0,200,.6) 50%,rgba(20,0,60,.9));animation:orbThink 2s ease-in-out infinite; }
  .orb.speaking  { background:radial-gradient(circle at 35% 35%,rgba(0,255,150,.4),rgba(0,160,80,.6) 50%,rgba(0,40,20,.9));animation:orbSpeak 1.2s ease-in-out infinite; }
  .orb-inner { width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px; }
  .wave-bars { display:flex;gap:3px;align-items:center;height:28px; }
  .wave-bar  { width:3px;border-radius:2px;background:currentColor;animation:waveBar .7s ease-in-out infinite; }
  .tx-bar { background:rgba(0,0,0,.4);border:1px solid rgba(0,200,255,.15);border-radius:12px;padding:10px 16px;font-family:'Share Tech Mono',monospace;font-size:12px;color:rgba(0,200,255,.8);min-height:40px;letter-spacing:.5px; }
  .msg { animation:msgIn .3s ease forwards;max-width:78%; }
  .bubble { padding:12px 16px;border-radius:16px;font-size:14px;line-height:1.65;white-space:pre-wrap; }
  .barge-flash { animation:bargeFlash .4s ease; }
  ::-webkit-scrollbar { width:3px; }
  ::-webkit-scrollbar-thumb { background:rgba(0,200,255,.2);border-radius:4px; }
`
document.head.appendChild(styleEl)

const EMERGENCY_TERMS = ["chest pain","heart attack","heart pain","pain in heart","heart hurts",
  "can't breathe","cannot breathe","difficulty breathing","severe bleeding","unconscious",
  "not breathing","stroke","collapsed","seizure","cardiac arrest","shortness of breath"]

const SESSION_ID = `voice_${Date.now()}`

const WaveBars = ({color, count=5}) => (
  <div className="wave-bars" style={{color}}>
    {Array.from({length:count}).map((_,i) => (
      <div key={i} className="wave-bar" style={{animationDelay:`${i*.1}s`}}/>
    ))}
  </div>
)

// Deepgram TTS voice model per language
// Only en and es have dedicated Deepgram Aura models — others use browser TTS fallback


// Web Speech API recognition codes per language
const LANGS = {
  auto: { code:"en-IN",  label:"AUTO", name:"Auto-detect",  flag:"🔍", hint:["Just speak in any language!","बोलिए — मैं भाषा पहचानूँगी","பேசுங்கள் — நான் கண்டுபிடிப்பேன்"] },
  en:   { code:"en-IN",  label:"EN",   name:"English",       flag:"🇬🇧", hint:["Book an appointment","I have a headache","Cancel my appointment","Connect me to doctor"] },
  hi:   { code:"hi-IN",  label:"हि",   name:"Hindi",         flag:"🇮🇳", hint:["अपॉइंटमेंट बुक करें","मुझे सिरदर्द है","अपॉइंटमेंट रद्द करें","डॉक्टर से बात करें"] },
  ta:   { code:"ta-IN",  label:"த",    name:"Tamil",         flag:"🌺", hint:["அப்பாயின்ட்மென்ட் பதிவு செய்க","எனக்கு தலைவலி உள்ளது","அப்பாயின்ட்மென்ட் ரத்து செய்க","மருத்துவரை இணைக்கவும்"] },
  te:   { code:"te-IN",  label:"తె",   name:"Telugu",        flag:"🌸", hint:["అపాయింట్మెంట్ బుక్ చేయండి","నాకు తలనొప్పి ఉంది","అపాయింట్మెంట్ రద్దు చేయండి","డాక్టర్‌తో మాట్లాడండి"] },
  kn:   { code:"kn-IN",  label:"ಕ",    name:"Kannada",       flag:"🏔️", hint:["ಅಪಾಯಿಂಟ್ಮೆಂಟ್ ಬುಕ್ ಮಾಡಿ","ನನಗೆ ತಲೆನೋವಿದೆ","ಅಪಾಯಿಂಟ್ಮೆಂಟ್ ರದ್ದು ಮಾಡಿ","ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ"] },
  ml:   { code:"ml-IN",  label:"മ",    name:"Malayalam",     flag:"🌴", hint:["അപ്പോയിൻ്റ്മെൻ്റ് ബുക്ക് ചെയ്യുക","എനിക്ക് തലവേദനയുണ്ട്","അപ്പോയിൻ്റ്മെൻ്റ് റദ്ദാക്കുക","ഡോക്ടറെ ബന്ധിപ്പിക്കുക"] },
}

// Language detection from Web Speech API result locale
// Chrome returns locale like "en-US", "hi-IN", "ta-IN" etc.
function detectLangFromLocale(locale) {
  if (!locale) return "en"
  const prefix = locale.slice(0,2).toLowerCase()
  const map = { en:"en", hi:"hi", ta:"ta", te:"te", kn:"kn", ml:"ml" }
  return map[prefix] || "en"
}

export default function VoiceAssistant() {
  const [mode, setMode]           = useState("idle")
  const [messages, setMessages]   = useState([])
  const [liveText, setLiveText]   = useState("")
  const [latency, setLatency]     = useState(null)
  const [bargeCount, setBargeCount] = useState(0)
  const [emergency, setEmergency] = useState(false)
  const [clock, setClock]         = useState("")
  const [typeVal, setTypeVal]     = useState("")
  const [lang, setLang]           = useState("auto")
  const [detectedLang, setDetectedLang] = useState(null)   // set after first speech
  const [bargeFlash, setBargeFlash] = useState(false)

  const recognitionRef  = useRef(null)
  const audioRef        = useRef(null)
  const sessionRef      = useRef(SESSION_ID)
  const modeRef         = useRef("idle")
  const startTimeRef    = useRef(null)
  const messagesEndRef  = useRef(null)
  const isSpeakingRef   = useRef(false)
  const shouldListenRef = useRef(false)
  const vadTimerRef     = useRef(null)

  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({behavior:"smooth"}) }, [messages])
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-IN",{hour12:false}))
    tick(); const id = setInterval(tick,1000); return () => clearInterval(id)
  }, [])

  // ── STOP AUDIO — barge-in core ───────────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      try { audioRef.current.src = "" } catch(e) {}
      audioRef.current = null
    }
    window.speechSynthesis?.cancel()
    isSpeakingRef.current = false
  }, [])

  // ── DEEPGRAM TTS ─────────────────────────────────────────────────────────
  const speak = useCallback(async (text) => {
    stopAudio()
    isSpeakingRef.current = true
    setMode("speaking")

    try {
      const res = await fetch("/deepgram-tts", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ text })
      })
      if (!res.ok) throw new Error(`TTS ${res.status}`)
      const blob  = await res.blob()
      const url   = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = () => {
        isSpeakingRef.current = false
        URL.revokeObjectURL(url)
        setMode("idle")
        setTimeout(() => { if (shouldListenRef.current) startListening() }, 350)
      }
      audio.onerror = () => {
        isSpeakingRef.current = false
        setMode("idle")
      }
      await audio.play()
    } catch(e) {
      console.error("TTS error:", e)
      // Browser TTS fallback
      const utt = new SpeechSynthesisUtterance(text)
      const effLang = lang === "auto" ? (detectedLang || "en") : lang
      utt.lang = LANGS[effLang]?.code || "en-IN"
      utt.rate  = 1.0
      utt.onend = () => {
        isSpeakingRef.current = false
        setMode("idle")
        setTimeout(() => { if (shouldListenRef.current) startListeningRef.current?.() }, 350)
      }
      window.speechSynthesis.speak(utt)
    }
  }, [stopAudio, lang])

  // ── SEND TO BACKEND ──────────────────────────────────────────────────────
  const handleInput = useCallback(async (text, effectiveLang) => {
    const activeLang = effectiveLang || (lang === "auto" ? (detectedLang || "en") : lang)
    if (!text.trim()) return
    // ── BARGE-IN: stop AI immediately ─────────────────────────────────────
    if (isSpeakingRef.current) {
      stopAudio()
      setBargeCount(p => p+1)
      setBargeFlash(true)
      setTimeout(() => setBargeFlash(false), 400)
      console.log("⚡ BARGE-IN!")
    }
    setLiveText("")
    const isEmerg = EMERGENCY_TERMS.some(w => text.toLowerCase().includes(w))
    const time    = new Date().toLocaleTimeString("en-IN",{hour12:false})
    setMessages(prev => [...prev, { role:"user", text, time, isEmergency: isEmerg }])
    setMode("thinking")
    startTimeRef.current = Date.now()

    if (isEmerg) {
      setEmergency(true)
      const msg = lang === "hi"
        ? "यह एक चिकित्सा आपात स्थिति है! तुरंत 108 पर कॉल करें!"
        : "This is a medical emergency! Please call 108 immediately!"
      setMessages(prev => [...prev, { role:"ai", text:"🚨 "+msg, time, isEmergency:true }])
      speak(msg)
      setTimeout(() => { window.location.href = "tel:108" }, 2500)
      return
    }

    try {
      // Start backend call
      const backendPromise = fetch("/voice", {
        method:  "POST",
        headers: {"Content-Type":"application/json"},
        body:    JSON.stringify({ message: text, sessionId: sessionRef.current, lang: activeLang })
      }).then(r => r.json())

      const data = await backendPromise
      if (data.sessionId) sessionRef.current = data.sessionId
      const ms = Date.now() - startTimeRef.current
      setLatency(ms)
      console.log(`⚡ Backend: ${ms}ms`)

      if (data.reply === "EMERGENCY_DETECTED") {
        setEmergency(true)
        const msg = "Medical emergency detected. Calling 108 now. Please stay calm."
        setMessages(prev => [...prev, { role:"ai", text:"🚨 "+msg, time, isEmergency:true }])
        speak(msg)
        setTimeout(() => { window.location.href = "tel:108" }, 2500)
        return
      }

      const reply = data.reply || "Sorry, I could not process that. Please try again."

      // ── PARALLEL: show text + fetch TTS at same time ──────────────────
      const ttsStart = Date.now()
      const ttsPromise = fetch("/deepgram-tts", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ text: reply })
      }).then(r => { 
        console.log(`⚡ TTS fetch: ${Date.now()-ttsStart}ms`)
        return r.ok ? r.blob() : null 
      }).catch(() => null)

      // Show text immediately — don't wait for audio
      setMessages(prev => [...prev, { role:"ai", text:reply, time }])
      setMode("speaking")
      isSpeakingRef.current = true

      // Play audio as soon as blob is ready
      const blob = await ttsPromise
      if (blob) {
        const url   = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => {
          isSpeakingRef.current = false
          URL.revokeObjectURL(url)
          setMode("idle")
          setTimeout(() => { if (shouldListenRef.current) startListeningRef.current?.() }, 300)
        }
        audio.onerror = () => { isSpeakingRef.current = false; setMode("idle") }
        audio.play().catch(() => { isSpeakingRef.current = false; speak(reply) })
      } else {
        speak(reply)
      }

    } catch(err) {
      console.error("Error:", err)
      const errMsg = "Connection error. Please try again."
      setMessages(prev => [...prev, { role:"ai", text:errMsg, time }])
      speak(errMsg)
    }
  }, [speak, stopAudio, lang])

  // ── VOICE ACTIVITY DETECTION — auto barge-in ────────────────────────────
  // Use a ref for startListening to avoid stale closure
  const startListeningRef = useRef(null)

  const startVAD = useCallback(() => {
    if (!navigator.mediaDevices?.getUserMedia) return
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const ctx      = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = ctx.createAnalyser()
      const source   = ctx.createMediaStreamSource(stream)
      source.connect(analyser)
      analyser.fftSize = 256  // smaller = faster processing
      const data = new Uint8Array(analyser.frequencyBinCount)

      let bargeDebounce = false
      let loudFrames = 0
      const THRESHOLD = 15  // very sensitive — user just needs to speak normally

      const checkVoice = () => {
        analyser.getByteFrequencyData(data)
        // Focus on speech frequencies (300Hz-3000Hz) not full spectrum
        const speechData = data.slice(3, 30)
        const avg = speechData.reduce((a,b) => a+b,0) / speechData.length

        if (avg > THRESHOLD) {
          loudFrames++
        } else {
          loudFrames = Math.max(0, loudFrames - 1)
        }

        // 2 consecutive loud frames while AI speaking = barge-in
        if (loudFrames >= 2 && isSpeakingRef.current &&
            modeRef.current === "speaking" && !bargeDebounce) {
          bargeDebounce = true
          loudFrames = 0
          console.log("⚡ BARGE-IN! speech avg:", avg.toFixed(1))
          stopAudio()
          window.speechSynthesis.cancel()
          setBargeCount(p => p+1)
          setBargeFlash(true)
          setTimeout(() => setBargeFlash(false), 500)
          // Use ref to get latest startListening function
          setTimeout(() => {
            if (startListeningRef.current) startListeningRef.current()
            setTimeout(() => { bargeDebounce = false }, 1000)
          }, 200)
        }
        vadTimerRef.current = requestAnimationFrame(checkVoice)
      }
      checkVoice()
    }).catch(e => console.log("VAD mic error:", e.message))
  }, [stopAudio])

  useEffect(() => {
    startVAD()
    return () => { if (vadTimerRef.current) cancelAnimationFrame(vadTimerRef.current) }
  }, [startVAD])

  // ── WEB SPEECH STT ───────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (modeRef.current === "listening" || modeRef.current === "thinking") return
    if (isSpeakingRef.current) {
      stopAudio()
      setBargeCount(p => p+1)
      setBargeFlash(true)
      setTimeout(() => setBargeFlash(false), 400)
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert("Please use Chrome browser for voice support."); return }

    const r = new SR()
    r.continuous     = false
    r.interimResults = true
    // Auto mode: try all Indian languages so Chrome can detect any of them
    if (lang === "auto") {
      r.lang = detectedLang ? LANGS[detectedLang]?.code || "en-IN" : "en-IN"
    } else {
      r.lang = LANGS[lang]?.code || "en-IN"
    }
    recognitionRef.current = r

    r.onstart  = () => { setMode("listening"); setLiveText("") }
    r.onresult = (e) => {
      let interim = "", final = "", resultLang = null
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        // Chrome exposes lang on the result object
        if (e.results[i][0]?.lang) resultLang = e.results[i][0].lang
        if (e.results[i].isFinal) final += t
        else interim += t
      }
      setLiveText(final || interim)
      if (final.trim()) {
        // Auto-detect: lock language from first confident result
        if (lang === "auto" && resultLang) {
          const detected = detectLangFromLocale(resultLang)
          console.log("🌐 Auto-detected language:", resultLang, "→", detected)
          setDetectedLang(detected)
        }
        r.stop()
        // Pass detected lang to backend for correct Groq response language
        const effectiveLang = lang === "auto" ? (detectedLang || "en") : lang
        handleInput(final.trim(), effectiveLang)
      }
    }
    r.onerror = (e) => { 
      console.log("Speech recognition error:", e.error)
      setMode("idle"); setLiveText("") 
    }
    r.onend   = () => { if (modeRef.current === "listening") { setMode("idle"); setLiveText("") } }
    r.start()
    shouldListenRef.current = true
  }, [handleInput, stopAudio, lang])

  // Keep ref updated with latest startListening
  useEffect(() => { startListeningRef.current = startListening }, [startListening])

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop() } catch(e) {}
    recognitionRef.current  = null
    shouldListenRef.current = false
    setMode("idle"); setLiveText("")
  }, [])

  const handleOrb = () => {
    if (mode === "speaking") {
      stopAudio()
      setBargeCount(p => p+1)
      setBargeFlash(true)
      setTimeout(() => setBargeFlash(false), 400)
      setTimeout(startListening, 250)
      return
    }
    if (mode === "listening") { stopListening(); return }
    if (mode === "idle")      { startListening(); return }
  }

  const clearChat = () => {
    stopListening(); stopAudio()
    setMessages([]); setMode("idle"); setLatency(null)
    setBargeCount(0); setLiveText(""); setEmergency(false)
    sessionRef.current = `voice_${Date.now()}`
    shouldListenRef.current = false
  }

  const sendType = () => {
    if (!typeVal.trim() || mode === "thinking") return
    const tl = lang === "auto" ? (detectedLang || "en") : lang
    handleInput(typeVal.trim(), tl); setTypeVal("")
  }

  const COLORS = { idle:"#00c8ff", listening:"#ff3b5c", thinking:"#a855f7", speaking:"#00e57a" }
  const LABELS = {
    idle:      lang === "hi" ? "बोलने के लिए टैप करें" : "TAP ORB TO SPEAK",
    listening: lang === "hi" ? "सुन रहा हूँ..." : "LISTENING...",
    thinking:  lang === "hi" ? "सोच रहा हूँ..." : "PROCESSING...",
    speaking:  lang === "hi" ? "ARIA बोल रही है" : "ARIA IS SPEAKING — TAP TO INTERRUPT"
  }

  return (
    <div className={`va-app ${bargeFlash ? "barge-flash":""}`}>
      <div className="va-grid"/>
      <div className="va-glow"/>
      <div className="va-scan"/>

      {/* HEADER */}
      <header className="va-header">
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:38,height:38,borderRadius:10,
            background:"linear-gradient(135deg,#0066ff,#00c8ff)",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:18,boxShadow:"0 0 16px rgba(0,180,255,.4)"}}>🏥</div>
          <div>
            <div style={{fontSize:16,fontWeight:800,letterSpacing:-.3}}>
              VoxOps <span style={{color:"#00c8ff"}}>MediCare</span>
            </div>
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:"rgba(0,200,255,.5)"}}>
              AI RECEPTIONIST · ARIA
            </span>
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {/* Language Toggle */}
          <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
            {/* Language pills — scrollable row */}
            <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end",maxWidth:320}}>
              {Object.entries(LANGS).map(([k,v]) => {
                const isActive = lang === k
                const isDetected = lang === "auto" && detectedLang === k
                return (
                  <button key={k} onClick={() => { setLang(k); setDetectedLang(null) }} style={{
                    padding:"4px 10px",borderRadius:12,cursor:"pointer",
                    fontSize:10,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",
                    transition:"all .2s",
                    background: isActive ? "rgba(0,200,255,.25)" : isDetected ? "rgba(0,255,150,.15)" : "rgba(255,255,255,.04)",
                    color: isActive ? "#00c8ff" : isDetected ? "#00ff96" : "rgba(255,255,255,.3)",
                    border: isActive ? "1px solid rgba(0,200,255,.4)" : isDetected ? "1px solid rgba(0,255,150,.3)" : "1px solid rgba(255,255,255,.08)",
                    animation: isActive ? "langPop .3s ease" : "none"
                  }}>
                    {v.flag} {v.label}
                  </button>
                )
              })}
            </div>
            {/* Show detected language label */}
            {lang === "auto" && detectedLang && LANGS[detectedLang] && (
              <span style={{fontSize:9,color:"#00ff96",fontFamily:"'Share Tech Mono',monospace",letterSpacing:1}}>
                🌐 DETECTED: {LANGS[detectedLang].name.toUpperCase()}
              </span>
            )}
            {lang === "auto" && !detectedLang && (
              <span style={{fontSize:9,color:"rgba(255,255,255,.3)",fontFamily:"'Share Tech Mono',monospace",letterSpacing:1}}>
                🌐 AUTO-DETECT ON
              </span>
            )}
          </div>

          {/* Barge-in counter */}
          {bargeCount > 0 && (
            <span style={{background:"rgba(255,184,0,.12)",border:"1px solid rgba(255,184,0,.35)",
              color:"#ffb800",padding:"3px 10px",borderRadius:20,
              fontFamily:"'Share Tech Mono',monospace",fontSize:9,letterSpacing:1}}>
              ⚡ {bargeCount}x BARGE-IN
            </span>
          )}

          {/* Latency */}
          {latency && (
            <span style={{background:"rgba(0,229,122,.08)",border:"1px solid rgba(0,229,122,.2)",
              color:"#00e57a",padding:"3px 10px",borderRadius:20,
              fontFamily:"'Share Tech Mono',monospace",fontSize:9}}>
              ⚡ {latency}ms
            </span>
          )}

          {/* Mode pill */}
          <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(0,0,0,.3)",
            border:"1px solid rgba(0,200,255,.1)",borderRadius:20,padding:"6px 14px"}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:COLORS[mode],
              boxShadow:`0 0 8px ${COLORS[mode]}`}}/>
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,
              color:COLORS[mode],letterSpacing:2}}>{mode.toUpperCase()}</span>
          </div>

          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:"rgba(0,200,255,.4)"}}>{clock}</span>

          <button onClick={clearChat} style={{background:"rgba(255,255,255,.04)",
            border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.4)",
            padding:"6px 14px",borderRadius:8,cursor:"pointer",
            fontFamily:"'Exo 2',sans-serif",fontSize:12}}>✕</button>
        </div>
      </header>

      <div style={{display:"flex",height:"calc(100vh - 62px)",position:"relative",zIndex:1}}>

        {/* LEFT — ORB */}
        <div style={{width:420,flexShrink:0,display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",gap:22,
          borderRight:"1px solid rgba(0,200,255,.06)",
          background:"rgba(0,0,0,.2)",padding:28}}>

          {/* Barge-in tip when speaking */}
          {mode === "speaking" && (
            <div style={{animation:"slideIn .3s ease",background:"rgba(255,184,0,.08)",
              border:"1px solid rgba(255,184,0,.25)",borderRadius:10,
              padding:"8px 16px",textAlign:"center",maxWidth:300}}>
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,
                color:"#ffb800",letterSpacing:1}}>
                ⚡ TAP ORB OR SPEAK TO INTERRUPT
              </span>
            </div>
          )}

          {/* Orb */}
          <div style={{animation:"float 4s ease-in-out infinite"}}>
            <div className="orb-wrap" onClick={handleOrb}>
              <div className="orb-ring orb-ring-1"/>
              <div className="orb-ring orb-ring-2"/>
              <div className="orb-ring orb-ring-3"/>
              <div className={`orb ${mode}`}>
                <div className="orb-inner">
                  {mode === "idle" && (
                    <svg viewBox="0 0 64 64" width="72" height="72" fill="none">
                      <rect x="22" y="8" width="20" height="28" rx="10" fill="rgba(255,255,255,.9)"/>
                      <path d="M14 32 Q14 50 32 50 Q50 50 50 32" stroke="rgba(255,255,255,.9)" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                      <line x1="32" y1="50" x2="32" y2="58" stroke="rgba(255,255,255,.9)" strokeWidth="3.5" strokeLinecap="round"/>
                      <line x1="22" y1="58" x2="42" y2="58" stroke="rgba(255,255,255,.9)" strokeWidth="3.5" strokeLinecap="round"/>
                    </svg>
                  )}
                  {mode === "listening" && (
                    <>
                      <svg viewBox="0 0 64 64" width="50" height="50" fill="none">
                        <rect x="22" y="8" width="20" height="28" rx="10" fill="#ff6b8a"/>
                        <path d="M14 32 Q14 50 32 50 Q50 50 50 32" stroke="#ff6b8a" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                        <line x1="32" y1="50" x2="32" y2="58" stroke="#ff6b8a" strokeWidth="3.5" strokeLinecap="round"/>
                        <line x1="22" y1="58" x2="42" y2="58" stroke="#ff6b8a" strokeWidth="3.5" strokeLinecap="round"/>
                      </svg>
                      <WaveBars color="#ff6b8a"/>
                    </>
                  )}
                  {mode === "thinking" && (
                    <>
                      <div style={{width:32,height:32,border:"3px solid rgba(180,100,255,.3)",
                        borderTopColor:"#a855f7",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
                      <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:"#c084fc",marginTop:4}}>
                        {lang==="hi"?"सोच रहा...":"THINKING"}
                      </span>
                    </>
                  )}
                  {mode === "speaking" && (
                    <>
                      <svg viewBox="0 0 64 64" width="50" height="50" fill="none">
                        <rect x="22" y="8" width="20" height="28" rx="10" fill="#00e57a"/>
                        <path d="M14 32 Q14 50 32 50 Q50 50 50 32" stroke="#00e57a" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                        <line x1="32" y1="50" x2="32" y2="58" stroke="#00e57a" strokeWidth="3.5" strokeLinecap="round"/>
                        <line x1="22" y1="58" x2="42" y2="58" stroke="#00e57a" strokeWidth="3.5" strokeLinecap="round"/>
                      </svg>
                      <WaveBars color="#00e57a"/>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Status label */}
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,letterSpacing:3,
            textTransform:"uppercase",color:COLORS[mode],opacity:.9,textAlign:"center"}}>
            {LABELS[mode]}
          </div>

          {/* Live transcript */}
          {(liveText || mode === "listening") && (
            <div className="tx-bar" style={{width:"100%",maxWidth:320}}>
              {liveText
                ? <span>{liveText}</span>
                : <span style={{opacity:.4}}>{lang==="hi"?"बोलने की प्रतीक्षा...":"Waiting for speech..."}</span>
              }
            </div>
          )}

          {/* Stack badges */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center"}}>
              <span style={{fontSize:9,padding:"3px 10px",borderRadius:20,
                fontFamily:"'Share Tech Mono',monospace",
                background:"rgba(0,200,255,.07)",border:"1px solid rgba(0,200,255,.2)",color:"#00c8ff"}}>
                STT: WEB SPEECH API
              </span>
              <span style={{fontSize:9,padding:"3px 10px",borderRadius:20,
                fontFamily:"'Share Tech Mono',monospace",
                background:"rgba(0,229,122,.07)",border:"1px solid rgba(0,229,122,.2)",color:"#00e57a"}}>
                TTS: DEEPGRAM AURA ✨
              </span>
            </div>
            <div style={{display:"flex",gap:6}}>
              <span style={{fontSize:9,padding:"3px 10px",borderRadius:20,
                fontFamily:"'Share Tech Mono',monospace",
                background:"rgba(255,184,0,.07)",border:"1px solid rgba(255,184,0,.2)",color:"#ffb800"}}>
                LLM: GROQ LLAMA 4
              </span>
              <span style={{fontSize:9,padding:"3px 10px",borderRadius:20,
                fontFamily:"'Share Tech Mono',monospace",
                background:"rgba(255,100,200,.07)",border:"1px solid rgba(255,100,200,.2)",color:"#ff64c8"}}>
                ⚡ BARGE-IN ACTIVE
              </span>
            </div>
          </div>

          {/* Hints */}
          {messages.length === 0 && (
            <div style={{maxWidth:300,textAlign:"center"}}>
              <div style={{fontSize:11,color:"rgba(0,200,255,.35)",lineHeight:2,
                fontFamily:"'Share Tech Mono',monospace"}}>
                {LANGS[lang].hint.map((h,i) => (
                  <div key={i} style={{color:"rgba(0,200,255,.6)",cursor:"pointer",
                    padding:"1px 0",transition:"color .2s"}}
                    onClick={() => handleInput(h)}>
                    "{h}"
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Type input */}
          <div style={{width:"100%",maxWidth:320,display:"flex",gap:8}}>
            <input value={typeVal} onChange={e=>setTypeVal(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&sendType()}
              placeholder={lang==="hi"?"यहाँ टाइप करें...":"Or type here..."}
              disabled={mode==="thinking"}
              style={{flex:1,background:"rgba(0,0,0,.4)",border:"1px solid rgba(0,200,255,.15)",
                borderRadius:10,padding:"9px 14px",color:"#e0f0ff",fontSize:12,outline:"none",
                fontFamily:"'Exo 2',sans-serif",opacity:mode==="thinking"?.5:1}}/>
            <button onClick={sendType}
              disabled={mode==="thinking"||!typeVal.trim()}
              style={{width:40,height:40,borderRadius:10,border:"none",cursor:"pointer",
                background:"linear-gradient(135deg,#0066ff,#00c8ff)",fontSize:16,
                opacity:mode==="thinking"||!typeVal.trim()?.4:1}}>↑</button>
          </div>
        </div>

        {/* RIGHT — CHAT */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"12px 24px",borderBottom:"1px solid rgba(0,200,255,.06)",
            display:"flex",alignItems:"center",justifyContent:"space-between",
            background:"rgba(0,0,0,.15)"}}>
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,
              color:"rgba(0,200,255,.4)",letterSpacing:2}}>CONVERSATION LOG</span>
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:"rgba(0,200,255,.3)"}}>
              {messages.length} msgs · {sessionRef.current.slice(-6)} · {LANGS[lang].name}
            </span>
          </div>

          <div style={{flex:1,overflowY:"auto",padding:24,display:"flex",flexDirection:"column",gap:14}}>
            {messages.length === 0 && (
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
                justifyContent:"center",gap:16,opacity:.3}}>
                <div style={{fontSize:52}}>🎙️</div>
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,
                  letterSpacing:2,color:"rgba(0,200,255,.6)"}}>AWAITING VOICE INPUT</span>
                <div style={{fontSize:11,color:"rgba(0,200,255,.4)",textAlign:"center",lineHeight:1.8}}>
                  Tap the orb or click a hint to start<br/>
                  Speak anytime to interrupt Aria
                </div>
              </div>
            )}

            {messages.map((msg,i) => (
              <div key={i} className="msg"
                style={{alignSelf:msg.role==="user"?"flex-end":"flex-start"}}>
                <div style={{fontSize:9,fontFamily:"'Share Tech Mono',monospace",opacity:.4,
                  marginBottom:4,letterSpacing:1,textAlign:msg.role==="user"?"right":"left"}}>
                  {msg.role==="user"?"YOU":"ARIA · DEEPGRAM AURA"} · {msg.time}
                </div>
                <div className="bubble" style={{
                  background: msg.isEmergency?"rgba(255,50,80,.1)":msg.role==="user"?"rgba(0,120,255,.12)":"rgba(0,200,120,.07)",
                  border:`1px solid ${msg.isEmergency?"rgba(255,50,80,.3)":msg.role==="user"?"rgba(0,150,255,.2)":"rgba(0,200,120,.15)"}`,
                  color: msg.isEmergency?"#ffb0b8":msg.role==="user"?"#9dd0ff":"#8fffc8",
                  borderBottomRightRadius:msg.role==="user"?3:14,
                  borderBottomLeftRadius:msg.role==="ai"?3:14,
                }}>
                  {msg.text}
                </div>
              </div>
            ))}

            {mode === "thinking" && (
              <div className="msg" style={{alignSelf:"flex-start"}}>
                <div style={{padding:"12px 18px",borderRadius:14,borderBottomLeftRadius:3,
                  background:"rgba(160,80,255,.07)",border:"1px solid rgba(160,80,255,.15)",
                  display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:14,height:14,border:"2px solid rgba(160,80,255,.3)",
                    borderTopColor:"#a855f7",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
                  <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,
                    color:"rgba(160,80,255,.7)",letterSpacing:1}}>
                    {lang==="hi"?"ARIA सोच रही है...":"ARIA IS THINKING..."}
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef}/>
          </div>

          {/* Footer */}
          <div style={{padding:"10px 24px",borderTop:"1px solid rgba(0,200,255,.06)",
            background:"rgba(0,0,0,.2)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"#00e57a",boxShadow:"0 0 6px #00e57a"}}/>
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,
                color:"rgba(0,200,255,.4)",letterSpacing:1}}>
                DEEPGRAM AURA · GROQ LLAMA 4 · BARGE-IN · WHATSAPP · {LANGS[lang].name.toUpperCase()}
              </span>
            </div>
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:"rgba(0,200,255,.3)"}}>
              VoxOps MediCare AI
            </span>
          </div>
        </div>
      </div>

      {/* EMERGENCY OVERLAY */}
      {emergency && (
        <div style={{position:"fixed",inset:0,zIndex:100,background:"rgba(0,0,0,.92)",
          backdropFilter:"blur(12px)",display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",gap:20,padding:32}}>
          <div style={{fontSize:64,animation:"pulseRed 1s infinite"}}>🚨</div>
          <div style={{fontSize:22,fontWeight:900,color:"#ff3b5c",textAlign:"center",
            letterSpacing:2,fontFamily:"'Exo 2',sans-serif"}}>
            {lang==="hi"?"चिकित्सा आपात स्थिति":"MEDICAL EMERGENCY DETECTED"}
          </div>
          <div style={{fontSize:13,color:"rgba(255,180,180,.7)",textAlign:"center",lineHeight:1.8}}>
            {lang==="hi"
              ? "कृपया शांत रहें। 108 पर कॉल करें।"
              : "Please stay calm. Calling 108 automatically in 3 seconds."}
          </div>
          <a href="tel:108" style={{display:"flex",alignItems:"center",gap:12,
            background:"linear-gradient(135deg,#ff1a40,#ff6b8a)",color:"#fff",
            padding:"18px 48px",borderRadius:16,textDecoration:"none",fontWeight:900,
            fontSize:22,fontFamily:"'Exo 2',sans-serif",
            boxShadow:"0 0 40px rgba(255,30,60,.6)",animation:"pulseRed 1.2s infinite"}}>
            📞 CALL 108 NOW
          </a>
          <div style={{fontSize:11,color:"rgba(255,255,255,.3)"}}>
            Police: 100 · Fire: 101 · Ambulance: 108
          </div>
          <button onClick={() => setEmergency(false)} style={{background:"transparent",
            border:"1px solid rgba(255,255,255,.15)",color:"rgba(255,255,255,.3)",
            padding:"8px 24px",borderRadius:8,cursor:"pointer",fontSize:12,
            fontFamily:"'Exo 2',sans-serif",marginTop:8}}>
            {lang==="hi"?"मैं सुरक्षित हूँ":"I am safe — dismiss"}
          </button>
        </div>
      )}
    </div>
  )
}