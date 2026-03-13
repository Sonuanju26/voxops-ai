import { useState } from "react"
import Dashboard from "./Dashboard"
import VoiceAssistant from "./VoiceAssistant"

const navStyle = {
  position: "fixed", bottom: 24, left: "50%",
  transform: "translateX(-50%)",
  display: "flex", gap: 8, zIndex: 1000,
  background: "rgba(1,3,8,.9)",
  border: "1px solid rgba(0,200,255,.15)",
  borderRadius: 50, padding: "6px 8px",
  backdropFilter: "blur(20px)",
  boxShadow: "0 8px 32px rgba(0,0,0,.5)"
}

export default function App() {
  const [page, setPage] = useState("voice")

  return (
    <div style={{ background: "#010308", minHeight: "100vh" }}>
      {page === "voice"     && <VoiceAssistant />}
      {page === "dashboard" && <Dashboard />}

      {/* Bottom nav */}
      <nav style={navStyle}>
        {[
          { id: "voice",     icon: "🎤", label: "Voice AI"  },
          { id: "dashboard", icon: "📊", label: "Dashboard" },
        ].map(({ id, icon, label }) => (
          <button key={id} onClick={() => setPage(id)} style={{
            background: page === id ? "rgba(0,200,255,.15)" : "transparent",
            border: `1px solid ${page===id ? "rgba(0,200,255,.4)" : "transparent"}`,
            color: page === id ? "#00c8ff" : "rgba(255,255,255,.4)",
            padding: "8px 20px", borderRadius: 40, cursor: "pointer",
            fontFamily: "'Exo 2', 'Outfit', sans-serif",
            fontSize: 12, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 7,
            transition: "all .2s"
          }}>
            {icon} {label}
          </button>
        ))}
      </nav>
    </div>
  )
}