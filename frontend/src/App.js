import { useState } from "react"
import Dashboard from "./Dashboard"
import VoiceAssistant from "./VoiceAssistant"
import AnalyticsPanel from "./AnalyticsPanel"
import HeatmapCalendar from "./HeatmapCalendar"
import Login from "./Login"
import PatientDetail from "./PatientDetail"

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
  const [dashTab, setDashTab] = useState("bookings")
  const [isLoggedIn, setIsLoggedIn] = useState(
    typeof window !== "undefined" &&
      window.sessionStorage.getItem("voxops_admin") === "true"
  )
  const [showLogin, setShowLogin] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState(null)

  // Handle nav clicks — only dashboard requires login
  const handleNavClick = (id) => {
    if (id === "dashboard" && !isLoggedIn) {
      setShowLogin(true)   // intercept → show login
      return
    }
    setShowLogin(false)
    setPage(id)
  }

  const handleLoginSuccess = () => {
    setIsLoggedIn(true)
    setShowLogin(false)
    setPage("dashboard")  // go straight to dashboard after login
  }

  const handleLogout = () => {
    window.sessionStorage.removeItem("voxops_admin")
    setIsLoggedIn(false)
    setSelectedPatient(null)
    setPage("voice")       // send back to voice page after logout
  }

  // ── Show login page only when dashboard was clicked and not logged in ──
  if (showLogin && !isLoggedIn) {
    return (
      <Login
        onLogin={handleLoginSuccess}
        onCancel={() => {           // allow going back to voice without logging in
          setShowLogin(false)
          setPage("voice")
        }}
      />
    )
  }

  // ── Patient detail view (inside dashboard, requires login) ────────────
  if (selectedPatient && isLoggedIn) {
    return (
      <PatientDetail
        patient={selectedPatient}
        onBack={() => setSelectedPatient(null)}
      />
    )
  }

  return (
    <div style={{ background: "#010308", minHeight: "100vh" }}>

      {/* ── Voice page — no login needed ── */}
      {page === "voice" && <VoiceAssistant />}

      {/* ── Dashboard — only renders if logged in ── */}
      {page === "dashboard" && isLoggedIn && (
        <div className="dashboard-shell">
          <div className="dashboard-tabs-bar">
            <button
              type="button"
              className={`dashboard-tab-btn${dashTab === "bookings" ? " active" : ""}`}
              onClick={() => setDashTab("bookings")}
            >
              <span aria-hidden="true">📋</span>
              BOOKINGS
            </button>
            <button
              type="button"
              className={`dashboard-tab-btn${dashTab === "analytics" ? " active" : ""}`}
              onClick={() => setDashTab("analytics")}
            >
              <span aria-hidden="true">📊</span>
              ANALYTICS
            </button>
            <button
              type="button"
              className={`dashboard-tab-btn${dashTab === "heatmap" ? " active" : ""}`}
              onClick={() => setDashTab("heatmap")}
            >
              <span aria-hidden="true">🗓️</span>
              HEATMAP
            </button>
          </div>
          <div className="dashboard-tab-panel">
            {dashTab === "bookings" && (
              <Dashboard
                onSelectPatient={(p) => setSelectedPatient(p)}
                onLogout={handleLogout}
              />
            )}
            {dashTab === "analytics" && <AnalyticsPanel />}
            {dashTab === "heatmap" && <HeatmapCalendar />}
          </div>
        </div>
      )}

      {/* ── Bottom nav — always visible ── */}
      <nav style={navStyle}>
        {[
          { id: "voice",     icon: "🎤", label: "Voice AI"  },
          { id: "dashboard", icon: "📊", label: "Dashboard" },
        ].map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => handleNavClick(id)}
            style={{
              background: page === id ? "rgba(0,200,255,.15)" : "transparent",
              border: `1px solid ${page === id ? "rgba(0,200,255,.4)" : "transparent"}`,
              color: page === id ? "#00c8ff" : "rgba(255,255,255,.4)",
              padding: "8px 20px", borderRadius: 40, cursor: "pointer",
              fontFamily: "'Exo 2', 'Outfit', sans-serif",
              fontSize: 12, fontWeight: 700,
              display: "flex", alignItems: "center", gap: 7,
              transition: "all .2s"
            }}
          >
            {icon} {label}
          </button>
        ))}
      </nav>
    </div>
  )
}