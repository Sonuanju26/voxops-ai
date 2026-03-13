import { useState, useEffect, useCallback } from "react"

// ── Google Fonts injected via style tag ───────────────────────────────────────
const FONT_LINK = document.createElement("link")
FONT_LINK.rel  = "stylesheet"
FONT_LINK.href = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap"
document.head.appendChild(FONT_LINK)

// ── Styles ────────────────────────────────────────────────────────────────────
const injectStyles = () => {
  const style = document.createElement("style")
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #03060a; font-family: 'Outfit', sans-serif; color: #e2eeff; }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: #030609; }
    ::-webkit-scrollbar-thumb { background: #1a3050; border-radius: 4px; }

    @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(0,229,122,.5)} 50%{box-shadow:0 0 0 8px rgba(0,229,122,0)} }
    @keyframes pulseRed { 0%,100%{box-shadow:0 0 0 0 rgba(255,59,92,.5)} 50%{box-shadow:0 0 0 8px rgba(255,59,92,0)} }
    @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
    @keyframes spin { to{transform:rotate(360deg)} }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.4} }
    @keyframes slideIn { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }

    .fade-up { animation: fadeUp .5s ease forwards; opacity: 0; }
    .fade-up-1 { animation-delay: .05s; }
    .fade-up-2 { animation-delay: .10s; }
    .fade-up-3 { animation-delay: .15s; }
    .fade-up-4 { animation-delay: .20s; }
    .fade-up-5 { animation-delay: .25s; }
    .fade-up-6 { animation-delay: .30s; }

    .spinner { display:inline-block; width:18px; height:18px; border:2px solid #1a3050; border-top-color:#00c8ff; border-radius:50%; animation:spin .7s linear infinite; }

    .row-hover { transition: background .15s; }
    .row-hover:hover { background: rgba(255,255,255,.025) !important; }

    .btn-filter { transition: all .2s; }
    .btn-filter:hover { transform: translateY(-1px); }
    .btn-filter.active { background: rgba(0,200,255,.15) !important; border-color: rgba(0,200,255,.4) !important; color: #00c8ff !important; }

    .stat-card-inner { transition: transform .2s, border-color .2s; }
    .stat-card-inner:hover { transform: translateY(-3px); }
  `
  document.head.appendChild(style)
}
injectStyles()

// ── Constants ─────────────────────────────────────────────────────────────────
const C = {
  bg:       "#03060a",
  surface:  "#060d15",
  surface2: "#0a1622",
  border:   "#0e1f30",
  border2:  "#182d42",
  accent:   "#00c8ff",
  accent2:  "#0066ff",
  green:    "#00e57a",
  red:      "#ff3b5c",
  amber:    "#ffb800",
  purple:   "#a855f7",
  muted:    "#3d6080",
  text:     "#e2eeff",
}

const EMERGENCY_KEYWORDS = [
  "chest pain","heart attack","stroke","can't breathe","cannot breathe",
  "severe bleeding","unconscious","fainted","seizure","not breathing",
  "difficulty breathing","shortness of breath","crushing pain","collapse","emergency",
  "severe chest","blood pressure very high","numbness in arm"
]

// ── Helpers ───────────────────────────────────────────────────────────────────
const initials = name => (name||"?").split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase()

const avatarGradient = name => {
  const gs = [
    ["#0066ff","#00c8ff"], ["#a855f7","#c084fc"],
    ["#00c8aa","#00e57a"], ["#ff6b35","#ffb800"],
    ["#ff3b5c","#ff6b35"], ["#0ea5e9","#38bdf8"],
  ]
  let h = 0
  for (const c of (name||"")) h = c.charCodeAt(0) + h*31
  const [a,b] = gs[Math.abs(h) % gs.length]
  return `linear-gradient(135deg, ${a}, ${b})`
}

const isEmergency = text => {
  if (!text) return false
  const l = text.toLowerCase()
  return EMERGENCY_KEYWORDS.some(k => l.includes(k))
}

const fmtTime = iso => {
  if (!iso) return "—"
  try { return new Date(iso).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}) }
  catch { return "—" }
}

const fmtDate = iso => {
  if (!iso) return "—"
  try { return new Date(iso).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) }
  catch { return "—" }
}

const relTime = iso => {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff/60000)
  if (m < 1)  return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m/60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h/24)}d ago`
}

// ── Demo data fallback ────────────────────────────────────────────────────────
const DEMO = [
  { ref:"VX484447", patientName:"Pavi",       patientPhone:"919036287921", problem:"stomach pain",           doctorId:"DOC007", doctorName:"Dr. Vikram Singh",  specialty:"Gastroenterologist",  date:"this monday",  time:"10:00 AM", fee:900,  status:"confirmed", bookedAt:"2026-03-07T15:53:44.683Z" },
  { ref:"VX160171", patientName:"Sonu",        patientPhone:"919036287921", problem:"fever and body ache",    doctorId:"DOC001", doctorName:"Dr. Arvind Sharma", specialty:"General Physician",   date:"this monday",  time:"10:00 AM", fee:500,  status:"confirmed", bookedAt:"2026-03-07T16:00:01.405Z" },
  { ref:"VX376034", patientName:"Poojitha",    patientPhone:"919036287921", problem:"kidney stones",          doctorId:"DOC003", doctorName:"Dr. Priya Kapoor",  specialty:"Dermatologist",       date:"this tuesday", time:"10:00 AM", fee:800,  status:"confirmed", bookedAt:"2026-03-07T16:38:09.715Z" },
  { ref:"VX270531", patientName:"Sonu Anju",   patientPhone:"919036287921", problem:"joint pain",             doctorId:"DOC004", doctorName:"Dr. Suresh Verma",  specialty:"Orthopedic Surgeon",  date:"this monday",  time:"2:00 PM",  fee:1000, status:"cancelled", bookedAt:"2026-03-08T12:37:57.965Z", cancelledAt:"2026-03-08T15:38:46.839Z" },
  { ref:"VX564396", patientName:"Pavitra",     patientPhone:"919036287921", problem:"heart problem",          doctorId:"DOC002", doctorName:"Dr. Rajesh Mehta",  specialty:"Cardiologist",        date:"09-03-2026",   time:"11:00 AM", fee:1200, status:"cancelled", bookedAt:"2026-03-08T15:01:51.333Z", cancelledAt:"2026-03-08T15:32:50.386Z" },
  { ref:"VX576598", patientName:"Suhas",       patientPhone:"919036287921", problem:"nose leakage",           doctorId:"DOC005", doctorName:"Dr. Kavitha Rao",   specialty:"ENT Specialist",      date:"03-09-2026",   time:"10:00 AM", fee:700,  status:"confirmed", bookedAt:"2026-03-08T15:16:22.021Z" },
  { ref:"VX168922", patientName:"Ningangouda", patientPhone:"919036287921", problem:"mental issue",           doctorId:"DOC001", doctorName:"Dr. Arvind Sharma", specialty:"General Physician",   date:"tomorrow",     time:"11:00 AM", fee:500,  status:"confirmed", bookedAt:"2026-03-08T15:42:18.781Z" },
  { ref:"VX951518", patientName:"Suhas",       patientPhone:"919036287921", problem:"general checkup",        doctorId:"DOC012", doctorName:"Dr. Pooja Menon",   specialty:"Psychiatrist",        date:"today",        time:"9:00 AM",  fee:1200, status:"confirmed", bookedAt:"2026-03-08T15:52:45.020Z" },
  { ref:"VX471181", patientName:"Sonu",        patientPhone:"919036287921", problem:"lower jaw pain",         doctorId:"DOC013", doctorName:"Dr. Harish Nambiar",specialty:"Dentist",             date:"07-09-2026",   time:"10:00 AM", fee:600,  status:"confirmed", bookedAt:"2026-03-08T16:38:21.696Z" },
  { ref:"VX641071", patientName:"Raksh",       patientPhone:"919036287921", problem:"fever",                  doctorId:"DOC001", doctorName:"Dr. Arvind Sharma", specialty:"General Physician",   date:"03-04-2026",   time:"11:00 AM", fee:500,  status:"cancelled", bookedAt:"2026-03-09T06:04:43.208Z", cancelledAt:"2026-03-09T06:08:26.483Z" },
  { ref:"VX927605", patientName:"Bala",        patientPhone:"916363767384", problem:"left-sided facial weakness and rash around ear — Ramsay Hunt Syndrome", doctorId:"DOC006", doctorName:"Dr. Anil Gupta", specialty:"Neurologist", date:"04-06-2026", time:"11:00 AM", fee:1500, status:"confirmed", bookedAt:"2026-03-09T09:19:57.985Z" },
  { ref:"VX246415", patientName:"Pradeep",     patientPhone:"916363767384", problem:"rash inside left ear with facial weakness — Ramsay Hunt Syndrome", doctorId:"DOC005", doctorName:"Dr. Kavitha Rao", specialty:"ENT Specialist", date:"this monday", time:"10:00 AM", fee:700, status:"confirmed", bookedAt:"2026-03-09T09:25:55.713Z" },
  { ref:"VX249796", patientName:"Anju",        patientPhone:"919036287921", problem:"severe peripheral vascular symptoms — Buerger's disease", doctorId:"DOC009", doctorName:"Dr. Meera Nair", specialty:"Cardiologist", date:"10-03-2026", time:"2:00 PM", fee:1100, status:"confirmed", bookedAt:"2026-03-09T10:01:03.670Z" },
]

// ── Sub-components ────────────────────────────────────────────────────────────
const Mono = ({ children, style={} }) => (
  <span style={{ fontFamily:"'Space Mono',monospace", ...style }}>{children}</span>
)

const StatusBadge = ({ status, isEmerg }) => {
  const cfg = isEmerg
    ? { label:"🚨 Emergency", bg:"rgba(255,59,92,.12)", color:C.red,   border:"rgba(255,59,92,.3)", anim:"blink 1s infinite" }
    : status === "confirmed"
    ? { label:"✓ Confirmed",  bg:"rgba(0,229,122,.08)", color:C.green, border:"rgba(0,229,122,.2)", anim:"none" }
    : status === "cancelled"
    ? { label:"✗ Cancelled",  bg:"rgba(255,59,92,.08)", color:C.red,   border:"rgba(255,59,92,.2)", anim:"none" }
    : { label:"⏳ Pending",   bg:"rgba(255,184,0,.08)", color:C.amber, border:"rgba(255,184,0,.2)", anim:"none" }
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:"4px 10px", borderRadius:20,
      background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}`,
      animation:cfg.anim, whiteSpace:"nowrap", fontFamily:"'Space Mono',monospace" }}>
      {cfg.label}
    </span>
  )
}

const Avatar = ({ name, size=36, radius=10 }) => (
  <div style={{ width:size, height:size, borderRadius:radius, flexShrink:0,
    background:avatarGradient(name), display:"flex", alignItems:"center",
    justifyContent:"center", fontSize:size*0.35, fontWeight:800, color:"#fff" }}>
    {initials(name)}
  </div>
)

const StatCard = ({ value, label, icon, accent, trend, trendUp, delay }) => (
  <div className={`stat-card-inner fade-up fade-up-${delay}`} style={{
    background:C.surface, border:`1px solid ${C.border}`, borderRadius:16,
    padding:22, position:"relative", overflow:"hidden",
    boxShadow:`0 0 40px rgba(0,0,0,.4)`
  }}>
    <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:accent, opacity:.7 }} />
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
      <div style={{ fontSize:22 }}>{icon}</div>
      {trend !== undefined && (
        <Mono style={{ fontSize:10, padding:"3px 8px", borderRadius:20, fontWeight:700,
          background: trendUp ? "rgba(0,229,122,.1)" : "rgba(255,59,92,.1)",
          color: trendUp ? C.green : C.red }}>
          {trend}
        </Mono>
      )}
    </div>
    <div style={{ fontSize:40, fontWeight:900, letterSpacing:-2, lineHeight:1, marginBottom:6 }}>{value}</div>
    <div style={{ fontSize:12, color:C.muted, fontWeight:500 }}>{label}</div>
  </div>
)

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [bookings, setBookings]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [filter, setFilter]           = useState("all")   // all | confirmed | cancelled | emergency
  const [doctorFilter, setDoctorFilter] = useState("all")
  const [clock, setClock]             = useState("")
  const [isDemo, setIsDemo]           = useState(false)

  // Clock
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-IN",{hour12:false}))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Fetch bookings
  const loadBookings = useCallback(async () => {
    try {
      const res  = await fetch("/api/bookings")
      const data = await res.json()
      const list = Array.isArray(data) ? data : (data.bookings || [])
      setBookings(list)
      setIsDemo(false)
    } catch {
      setBookings(DEMO)
      setIsDemo(true)
    } finally {
      setLoading(false)
      setLastRefresh(new Date())
    }
  }, [])

  useEffect(() => {
    loadBookings()
    const id = setInterval(loadBookings, 15000)
    return () => clearInterval(id)
  }, [loadBookings])

  // Derived stats
  const total      = bookings.length
  const confirmed  = bookings.filter(b => b.status === "confirmed").length
  const cancelled  = bookings.filter(b => b.status === "cancelled").length
  const emergencies = bookings.filter(b => isEmergency(b.problem || ""))
  const totalRevenue = bookings.filter(b => b.status === "confirmed").reduce((s,b) => s + (b.fee||0), 0)

  // Doctor list for filter
  const allDoctors = [...new Set(bookings.map(b => b.doctorName).filter(Boolean))]

  // Filtered bookings
  const filtered = bookings
    .filter(b => {
      if (filter === "confirmed")  return b.status === "confirmed" && !isEmergency(b.problem||"")
      if (filter === "cancelled")  return b.status === "cancelled"
      if (filter === "emergency")  return isEmergency(b.problem||"")
      return true
    })
    .filter(b => doctorFilter === "all" || b.doctorName === doctorFilter)
    .sort((a,b) => new Date(b.bookedAt||0) - new Date(a.bookedAt||0))

  // Doctor workload
  const doctorMap = {}
  bookings.filter(b => b.status !== "cancelled").forEach(b => {
    const n = b.doctorName || "Unknown"
    if (!doctorMap[n]) doctorMap[n] = { count:0, specialty:b.specialty||"", fees:0 }
    doctorMap[n].count++
    doctorMap[n].fees += (b.fee||0)
  })
  const doctorList = Object.entries(doctorMap).sort((a,b) => b[1].count - a[1].count)

  // Activity feed
  const feed = [...bookings]
    .sort((a,b) => new Date(b.bookedAt||0) - new Date(a.bookedAt||0))
    .slice(0, 10)
    .map(b => ({
      color:   isEmergency(b.problem||"") ? C.red : b.status==="cancelled" ? C.amber : C.green,
      icon:    isEmergency(b.problem||"") ? "🚨" : b.status==="cancelled" ? "✗" : "✓",
      msg:     isEmergency(b.problem||"")
               ? `EMERGENCY — ${b.patientName} needs urgent attention`
               : b.status === "cancelled"
               ? `${b.patientName} cancelled with ${b.doctorName}`
               : `${b.patientName} booked with ${b.doctorName} · ₹${b.fee||0}`,
      time:    relTime(b.bookedAt),
      ref:     b.ref,
    }))

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:C.bg, flexDirection:"column", gap:12 }}>
      <div className="spinner" style={{ width:32, height:32, borderWidth:3 }} />
      <Mono style={{ color:C.muted, fontSize:12 }}>Loading MediCare dashboard...</Mono>
    </div>
  )

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'Outfit',sans-serif" }}>

      {/* Grid bg */}
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0,
        backgroundImage:`linear-gradient(rgba(0,200,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.025) 1px,transparent 1px)`,
        backgroundSize:"44px 44px" }} />

      {/* Glow */}
      <div style={{ position:"fixed", top:-200, left:"50%", transform:"translateX(-50%)",
        width:900, height:500, borderRadius:"50%", pointerEvents:"none", zIndex:0,
        background:"radial-gradient(ellipse,rgba(0,100,255,.07) 0%,transparent 70%)" }} />

      {/* ── HEADER ── */}
      <header style={{ position:"sticky", top:0, zIndex:100,
        background:"rgba(3,6,10,.92)", backdropFilter:"blur(20px)",
        borderBottom:`1px solid ${C.border}`, padding:"0 32px" }}>
        <div style={{ maxWidth:1440, margin:"0 auto", height:60,
          display:"flex", alignItems:"center", justifyContent:"space-between" }}>

          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:40, height:40, borderRadius:12,
              background:`linear-gradient(135deg,${C.accent2},${C.accent})`,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:18, boxShadow:`0 0 24px rgba(0,200,255,.25)` }}>🏥</div>
            <div>
              <div style={{ fontSize:16, fontWeight:900, letterSpacing:-.5 }}>
                VoxOps <span style={{ color:C.accent }}>MediCare</span>
              </div>
              <Mono style={{ fontSize:9, color:C.muted }}>COMMAND CENTER</Mono>
            </div>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            {isDemo && (
              <div style={{ fontSize:10, padding:"4px 10px", borderRadius:20, fontWeight:700,
                background:"rgba(255,184,0,.1)", color:C.amber,
                border:"1px solid rgba(255,184,0,.3)" }}>
                ⚡ DEMO MODE
              </div>
            )}
            <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:11, fontWeight:600,
              color:C.green, background:"rgba(0,229,122,.07)",
              border:"1px solid rgba(0,229,122,.2)", padding:"5px 12px", borderRadius:20 }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:C.green, animation:"pulse 2s infinite" }} />
              LIVE
            </div>
            <Mono style={{ fontSize:13, color:C.muted }}>{clock}</Mono>
            <button onClick={loadBookings} style={{
              background:"rgba(0,200,255,.07)", border:`1px solid rgba(0,200,255,.2)`,
              color:C.accent, padding:"7px 16px", borderRadius:8,
              fontFamily:"'Outfit',sans-serif", fontSize:12, fontWeight:700,
              cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
              ⟳ Refresh
            </button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth:1440, margin:"0 auto", padding:"28px 32px", position:"relative", zIndex:1 }}>

        {/* Emergency alert */}
        {emergencies.length > 0 && (
          <div className="fade-up fade-up-1" style={{
            background:"rgba(255,59,92,.08)", border:`1px solid rgba(255,59,92,.3)`,
            borderRadius:12, padding:"12px 20px", marginBottom:24,
            display:"flex", alignItems:"center", gap:12, fontSize:13 }}>
            <span style={{ fontSize:18, animation:"pulseRed 1.5s infinite" }}>🚨</span>
            <div>
              <strong style={{ color:C.red }}>EMERGENCY ALERT</strong>
              <span style={{ color:C.muted }}> — {emergencies.length} patient(s) require immediate attention: </span>
              <strong>{emergencies.map(b=>b.patientName).join(", ")}</strong>
            </div>
          </div>
        )}

        {/* ── STATS ── */}
        <Mono style={{ fontSize:9, letterSpacing:3, color:C.muted, display:"block", marginBottom:14 }}>
          REAL-TIME METRICS · Updated {lastRefresh ? relTime(lastRefresh.toISOString()) : "—"}
        </Mono>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:14, marginBottom:28 }}>
          <StatCard value={total}     label="Total Bookings"  icon="📅" accent={C.accent}  trend={`+${total}`}   trendUp delay={1} />
          <StatCard value={confirmed} label="Confirmed"       icon="✅" accent={C.green}   trend={total>0?Math.round(confirmed/total*100)+"%":"0%"} trendUp delay={2} />
          <StatCard value={cancelled} label="Cancelled"       icon="❌" accent={C.red}     trend={cancelled}     trendUp={false} delay={3} />
          <StatCard value={emergencies.length} label="Emergencies" icon="🚨" accent={C.red} trend={emergencies.length} trendUp={false} delay={4} />
          <StatCard value={`₹${(totalRevenue/1000).toFixed(1)}k`} label="Revenue (Confirmed)" icon="💰" accent={C.amber} trend="+today" trendUp delay={5} />
        </div>

        {/* ── MAIN TWO COL ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:20, marginBottom:20 }}>

          {/* Appointments */}
          <div className="fade-up fade-up-3" style={{
            background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden" }}>

            {/* Panel header */}
            <div style={{ padding:"16px 22px", borderBottom:`1px solid ${C.border}`,
              display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
              <div style={{ fontWeight:800, fontSize:14 }}>📋 Appointments</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {/* Status filters */}
                {[["all","All",total],["confirmed","Confirmed",confirmed],["cancelled","Cancelled",cancelled],["emergency","Emergency",emergencies.length]].map(([val,lbl,cnt]) => (
                  <button key={val} className={`btn-filter${filter===val?" active":""}`}
                    onClick={() => setFilter(val)}
                    style={{ fontFamily:"'Outfit',sans-serif", fontSize:11, fontWeight:700,
                      padding:"5px 12px", borderRadius:20, cursor:"pointer",
                      background: filter===val ? "rgba(0,200,255,.15)" : "transparent",
                      border: `1px solid ${filter===val ? "rgba(0,200,255,.4)" : C.border2}`,
                      color: filter===val ? C.accent : C.muted }}>
                    {lbl} <Mono style={{ fontSize:9 }}>({cnt})</Mono>
                  </button>
                ))}
              </div>
            </div>

            {/* Doctor filter */}
            <div style={{ padding:"10px 22px", borderBottom:`1px solid ${C.border}`,
              display:"flex", gap:8, overflowX:"auto" }}>
              <button className={`btn-filter${doctorFilter==="all"?" active":""}`}
                onClick={() => setDoctorFilter("all")}
                style={{ fontFamily:"'Outfit',sans-serif", fontSize:10, fontWeight:600,
                  padding:"4px 10px", borderRadius:20, cursor:"pointer", whiteSpace:"nowrap",
                  background: doctorFilter==="all" ? "rgba(0,200,255,.15)" : "transparent",
                  border: `1px solid ${doctorFilter==="all" ? "rgba(0,200,255,.4)" : C.border}`,
                  color: doctorFilter==="all" ? C.accent : C.muted }}>
                All Doctors
              </button>
              {allDoctors.map(d => (
                <button key={d} className={`btn-filter${doctorFilter===d?" active":""}`}
                  onClick={() => setDoctorFilter(d)}
                  style={{ fontFamily:"'Outfit',sans-serif", fontSize:10, fontWeight:600,
                    padding:"4px 10px", borderRadius:20, cursor:"pointer", whiteSpace:"nowrap",
                    background: doctorFilter===d ? "rgba(0,200,255,.15)" : "transparent",
                    border: `1px solid ${doctorFilter===d ? "rgba(0,200,255,.4)" : C.border}`,
                    color: doctorFilter===d ? C.accent : C.muted }}>
                  {d.replace("Dr. ","")}
                </button>
              ))}
            </div>

            {/* Table header */}
            <div style={{ display:"grid", gridTemplateColumns:"42px 1fr 140px 120px 110px 90px",
              padding:"9px 22px", gap:12, alignItems:"center",
              background:"rgba(0,0,0,.2)" }}>
              {["","Patient","Doctor","Date","Time","Status"].map((h,i) => (
                <Mono key={i} style={{ fontSize:9, letterSpacing:2, color:C.muted, textTransform:"uppercase" }}>{h}</Mono>
              ))}
            </div>

            {/* Rows */}
            <div style={{ maxHeight:440, overflowY:"auto" }}>
              {filtered.length === 0 ? (
                <div style={{ padding:40, textAlign:"center", color:C.muted, fontSize:12 }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>📭</div>
                  No appointments match this filter
                </div>
              ) : filtered.map((b, i) => {
                const emerg = isEmergency(b.problem||"")
                return (
                  <div key={b.ref||i} className="row-hover" style={{
                    display:"grid", gridTemplateColumns:"42px 1fr 140px 120px 110px 90px",
                    padding:"13px 22px", gap:12, alignItems:"center",
                    borderBottom:`1px solid ${C.border}`,
                    background: emerg ? "rgba(255,59,92,.03)" : "transparent",
                    animation:`slideIn .3s ease ${i*.04}s both`
                  }}>
                    <Avatar name={b.patientName} size={34} radius={9} />
                    <div>
                      <div style={{ fontSize:13, fontWeight:700 }}>{b.patientName || "—"}</div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:2,
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:220 }}>
                        {b.problem || "—"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600 }}>{b.doctorName || "—"}</div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{b.specialty || ""}</div>
                    </div>
                    <Mono style={{ fontSize:11, color:C.accent }}>{b.date || "—"}</Mono>
                    <Mono style={{ fontSize:11, color:C.text }}>{b.time || "—"}</Mono>
                    <StatusBadge status={b.status} isEmerg={emerg} />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="fade-up fade-up-4" style={{
            background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden" }}>
            <div style={{ padding:"16px 22px", borderBottom:`1px solid ${C.border}`,
              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontWeight:800, fontSize:14 }}>⚡ Live Activity</div>
              <Mono style={{ fontSize:9, color:C.accent, background:"rgba(0,200,255,.07)",
                padding:"3px 8px", borderRadius:20, border:"1px solid rgba(0,200,255,.15)" }}>
                {feed.length} events
              </Mono>
            </div>
            <div style={{ overflowY:"auto", maxHeight:490 }}>
              {feed.length === 0 ? (
                <div style={{ padding:40, textAlign:"center", color:C.muted, fontSize:12 }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>⚡</div>No activity yet
                </div>
              ) : feed.map((e,i) => (
                <div key={i} className="row-hover" style={{
                  display:"flex", gap:12, padding:"13px 22px",
                  borderBottom:`1px solid ${C.border}`, alignItems:"flex-start" }}>
                  <div style={{ width:8, height:8, borderRadius:"50%",
                    background:e.color, marginTop:5, flexShrink:0,
                    boxShadow:`0 0 6px ${e.color}` }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, lineHeight:1.5 }}>{e.msg}</div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                      <Mono style={{ fontSize:9, color:C.muted }}>{e.time}</Mono>
                      <Mono style={{ fontSize:9, color:C.border2 }}>#{e.ref}</Mono>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── BOTTOM ROW ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:20 }}>

          {/* Doctor Workload */}
          <div className="fade-up fade-up-4" style={{
            background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden" }}>
            <div style={{ padding:"16px 22px", borderBottom:`1px solid ${C.border}`,
              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontWeight:800, fontSize:14 }}>👨‍⚕️ Doctor Workload</div>
              <Mono style={{ fontSize:9, color:C.muted }}>{doctorList.length} active</Mono>
            </div>
            {doctorList.length === 0 ? (
              <div style={{ padding:40, textAlign:"center", color:C.muted, fontSize:12 }}>No active doctors</div>
            ) : doctorList.map(([name, info], i) => (
              <div key={name} className="row-hover" style={{
                display:"flex", alignItems:"center", gap:14, padding:"13px 22px",
                borderBottom: i < doctorList.length-1 ? `1px solid ${C.border}` : "none" }}>
                <Avatar name={name} size={38} radius={11} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700 }}>{name}</div>
                  <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{info.specialty}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <Mono style={{ fontSize:16, fontWeight:700, color:C.accent }}>{info.count}</Mono>
                  <div style={{ fontSize:9, color:C.muted }}>patients</div>
                  <div style={{ fontSize:9, color:C.green, marginTop:1 }}>₹{info.fees.toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Emergency Panel */}
          <div className="fade-up fade-up-5" style={{
            background:C.surface, border:`1px solid ${emergencies.length > 0 ? "rgba(255,59,92,.3)" : C.border}`,
            borderRadius:16, overflow:"hidden" }}>
            <div style={{ padding:"16px 22px", borderBottom:`1px solid ${C.border}`,
              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontWeight:800, fontSize:14 }}>🚨 Emergency Alerts</div>
              <Mono style={{ fontSize:9, color: emergencies.length > 0 ? C.red : C.muted,
                background: emergencies.length > 0 ? "rgba(255,59,92,.1)" : "transparent",
                padding:"3px 8px", borderRadius:20,
                border: emergencies.length > 0 ? "1px solid rgba(255,59,92,.3)" : "none" }}>
                {emergencies.length} alerts
              </Mono>
            </div>
            {emergencies.length === 0 ? (
              <div style={{ padding:"40px 22px", textAlign:"center", color:C.muted }}>
                <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
                <div style={{ fontSize:12 }}>No emergencies detected</div>
                <div style={{ fontSize:10, marginTop:4, color:C.border2 }}>System monitoring active</div>
              </div>
            ) : emergencies.map((b, i) => (
              <div key={b.ref||i} style={{ padding:"14px 22px",
                borderBottom: i < emergencies.length-1 ? `1px solid ${C.border}` : "none",
                background:"rgba(255,59,92,.03)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <div style={{ fontWeight:800, color:C.red, fontSize:13 }}>🚨 {b.patientName}</div>
                  <Mono style={{ fontSize:9, color:C.muted }}>{relTime(b.bookedAt)}</Mono>
                </div>
                <div style={{ fontSize:11, color:C.muted, lineHeight:1.5,
                  background:"rgba(255,59,92,.05)", border:"1px solid rgba(255,59,92,.1)",
                  borderRadius:8, padding:"8px 10px" }}>
                  {(b.problem||"Emergency symptoms detected").slice(0,120)}
                </div>
                <div style={{ marginTop:6, display:"flex", gap:8 }}>
                  <Mono style={{ fontSize:9, color:C.muted }}>{b.doctorName}</Mono>
                  <Mono style={{ fontSize:9, color:C.border2 }}>·</Mono>
                  <Mono style={{ fontSize:9, color:C.muted }}>{b.date} {b.time}</Mono>
                </div>
              </div>
            ))}
          </div>

          {/* Revenue & Ref Panel */}
          <div className="fade-up fade-up-6" style={{
            background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden" }}>
            <div style={{ padding:"16px 22px", borderBottom:`1px solid ${C.border}`,
              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontWeight:800, fontSize:14 }}>💬 Recent Bookings</div>
              <Mono style={{ fontSize:9, color:C.muted }}>{bookings.length} total</Mono>
            </div>
            {[...bookings].sort((a,b) => new Date(b.bookedAt||0)-new Date(a.bookedAt||0)).slice(0,8).map((b,i,arr) => (
              <div key={b.ref||i} className="row-hover" style={{
                padding:"11px 22px", display:"flex", alignItems:"center", gap:12,
                borderBottom: i < arr.length-1 ? `1px solid ${C.border}` : "none" }}>
                <Avatar name={b.patientName} size={32} radius={8} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, display:"flex", justifyContent:"space-between" }}>
                    <span>{b.patientName}</span>
                    <Mono style={{ fontSize:11, color:C.green }}>₹{b.fee||0}</Mono>
                  </div>
                  <div style={{ fontSize:10, color:C.muted, marginTop:2,
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {b.doctorName} · {b.specialty}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop:24, textAlign:"center" }}>
          <Mono style={{ fontSize:9, color:C.border2 }}>
            VoxOps MediCare Command Center · Auto-refresh 15s ·{" "}
            {lastRefresh ? `Last updated ${fmtDate(lastRefresh.toISOString())} ${fmtTime(lastRefresh.toISOString())}` : "Loading..."}
          </Mono>
        </div>
      </div>
    </div>
  )
}