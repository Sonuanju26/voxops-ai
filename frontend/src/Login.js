// ADMIN CREDENTIALS:
// Email:    admin@voxops.in
// Password: Voxops@2025

import { useState } from "react"

const ADMIN_EMAIL    = "admin@voxops.in"
const ADMIN_PASSWORD = "Voxops@2025"

export default function Login({ onLogin, onCancel }) {
  const [email, setEmail]               = useState("")
  const [password, setPassword]         = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]               = useState("")

  const handleSubmit = (e) => {
    e.preventDefault()
    if (email.trim() === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      sessionStorage.setItem("voxops_admin", "true")
      setError("")
      if (typeof onLogin === "function") onLogin()
      return
    }
    setError("Invalid credentials. Access denied.")
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#050a14",
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(15,23,42,0.7) 0, rgba(15,23,42,0.7) 1px, transparent 1px, transparent 18px)",
        fontFamily: "'Syne', system-ui, sans-serif",
        color: "#e5f7ff",
        padding: 16
      }}
    >
      <div
        style={{
          width: 320,
          background: "#0d1524",
          borderRadius: 24,
          border: "1px solid #1a2d4a",
          boxShadow: "0 24px 70px rgba(0,0,0,0.9)",
          padding: "24px 22px 18px",
          position: "relative",
          overflow: "hidden",
          animation: "loginCardIn 0.4s ease-out both"
        }}
      >
        {/* Animated teal sweep line at top */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, overflow: "hidden" }}>
          <div
            style={{
              height: "100%", width: "100%",
              transformOrigin: "left",
              background: "linear-gradient(90deg,#00d4aa,#22c1c3,#00d4aa)",
              animation: "loginSweep 0.7s ease-out forwards"
            }}
          />
        </div>

        {/* Back to Voice AI link */}
        {typeof onCancel === "function" && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              border: "none", background: "transparent",
              color: "#9ca3af", fontSize: 11, cursor: "pointer",
              marginBottom: 14, padding: 0,
              fontFamily: "'DM Mono', monospace",
              display: "flex", alignItems: "center", gap: 5
            }}
          >
            ← Back to Voice AI
          </button>
        )}

        {/* Logo */}
        <div style={{ marginBottom: 22, marginTop: 2 }}>
          <div
            style={{
              fontFamily: "'Syne', system-ui, sans-serif",
              fontSize: 18, letterSpacing: 6, fontWeight: 800,
              textTransform: "uppercase", color: "#00d4aa"
            }}
          >
            VOXOPS
          </div>
          <div
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11, color: "#7a9cc0", marginTop: 4
            }}
          >
            MediCare Admin · Dashboard Access
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>Email</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@voxops.in"
              autoComplete="username"
              required
              style={inputStyle}
              onFocus={(e) => { e.target.style.boxShadow = "0 0 0 2px #00d4aa33"; e.target.style.borderColor = "#00d4aa" }}
              onBlur={(e)  => { e.target.style.boxShadow = "none"; e.target.style.borderColor = "#1e3a5f" }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Password</div>
            <div
              style={{
                display: "flex", alignItems: "center",
                borderRadius: 12, border: "1px solid #1e3a5f",
                background: "#0a1628", overflow: "hidden"
              }}
            >
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                autoComplete="current-password"
                required
                style={{
                  ...inputStyle,
                  border: "none", borderRadius: 0,
                  flex: 1, outline: "none"
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{
                  border: "none", borderLeft: "1px solid #1e3a5f",
                  background: "transparent", color: "#9ca3af",
                  fontSize: 11, padding: "0 10px", cursor: "pointer",
                  fontFamily: "'DM Mono', monospace"
                }}
              >
                {showPassword ? "HIDE" : "SHOW"}
              </button>
            </div>
          </div>

          {/* Sign In button */}
          <button
            type="submit"
            style={{
              width: "100%", marginTop: 4, padding: "10px 0",
              borderRadius: 8, border: "none", cursor: "pointer",
              background: "#00d4aa", color: "#050a14",
              fontFamily: "'Syne', system-ui, sans-serif",
              fontWeight: 700, fontSize: 13, letterSpacing: 1.6,
              textTransform: "uppercase",
              boxShadow: "0 12px 30px rgba(0,212,170,0.45)",
              transition: "transform 0.15s ease, filter 0.15s ease"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.1)"; e.currentTarget.style.transform = "translateY(-1px)" }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)";   e.currentTarget.style.transform = "translateY(0)" }}
          >
            Sign In to Dashboard
          </button>
        </form>

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: 10, fontSize: 11, color: "#ff6b6b",
              fontFamily: "'DM Mono', monospace"
            }}
          >
            ⚠ {error}
          </div>
        )}

        <div
          style={{
            marginTop: 18, fontSize: 10, color: "#6b7280",
            textAlign: "center", fontFamily: "'DM Mono', monospace"
          }}
        >
          VoxOps MediCare · Restricted Access
        </div>
      </div>

      <style>{`
        @keyframes loginCardIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes loginSweep {
          from { transform: scaleX(0); opacity: 0; }
          to   { transform: scaleX(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

const labelStyle = {
  fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
  color: "#7a9cc0", marginBottom: 4,
  fontFamily: "'DM Mono', monospace"
}

const inputStyle = {
  width: "100%", padding: "9px 11px", borderRadius: 12,
  border: "1px solid #1e3a5f", background: "#0a1628",
  color: "#e5f7ff", fontSize: 13, outline: "none",
  fontFamily: "'DM Mono', monospace",
  transition: "box-shadow 0.18s ease, border-color 0.18s ease",
  boxSizing: "border-box"
}