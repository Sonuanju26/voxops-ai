import { useEffect, useMemo, useState } from "react"

function normalizePhone(value) {
  if (!value) return ""
  return String(value).replace(/\D/g, "")
}

function deriveStatus(booking) {
  if (!booking) return "confirmed"
  if (booking.status === "cancelled") return "cancelled"
  if (booking.rescheduledAt || booking.previousDate || booking.previousTime) return "rescheduled"
  return "confirmed"
}

function formatBookedAt(iso) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })
}

function StatusPill({ status }) {
  let bg = "rgba(16,185,129,0.16)"
  let border = "rgba(16,185,129,0.7)"
  let color = "#6ee7b7"
  let label = "🟢 Confirmed"

  if (status === "cancelled") {
    bg = "rgba(248,113,113,0.12)"
    border = "rgba(248,113,113,0.9)"
    color = "#fecaca"
    label = "🔴 Cancelled"
  } else if (status === "rescheduled") {
    bg = "rgba(245,158,11,0.16)"
    border = "rgba(245,158,11,0.8)"
    color = "#fed7aa"
    label = "🔵 Rescheduled"
  }

  return (
    <span
      style={{
        fontSize: 11,
        padding: "3px 10px",
        borderRadius: 999,
        border: `1px solid ${border}`,
        background: bg,
        color,
        fontFamily:
          "'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
      }}
    >
      {label}
    </span>
  )
}

export default function PatientDetail({ patient, onBack }) {
  const phone =
    typeof patient === "string"
      ? patient
      : patient && typeof patient === "object"
      ? patient.phone
      : ""
  const fallbackName =
    typeof patient === "object" && patient && patient.name ? patient.name : null

  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/bookings")
        const data = await res.json()
        if (cancelled) return
        const list = Array.isArray(data) ? data : data.bookings || []
        setBookings(list)
      } catch {
        if (!cancelled) setBookings([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const normalizedPhone = normalizePhone(phone)

  const matches = useMemo(() => {
    if (!normalizedPhone) return []
    return bookings
      .filter((b) => normalizePhone(b.patientPhone).endsWith(normalizedPhone))
      .sort(
        (a, b) =>
          new Date(b.bookedAt || 0).getTime() - new Date(a.bookedAt || 0).getTime()
      )
  }, [bookings, normalizedPhone])

  const headerName =
    matches[0]?.patientName || fallbackName || "Unknown patient"
  const latestBooking = matches[0] || null
  const latestStatus = deriveStatus(latestBooking)

  const totalVisits = matches.length

  const hasInsurance = (b) => {
    if (!b) return false
    const ins = b.insurance
    if (!ins) return false
    if (typeof ins === "string" && ins.toLowerCase() === "none") return false
    return true
  }

  const getInsurerName = (b) => {
    const ins = b.insurance
    if (!ins) return null
    if (typeof ins === "string") return ins
    if (typeof ins === "object" && ins.provider) return ins.provider
    return "Insurance"
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0f1e",
        color: "#e5f7ff",
        padding: "28px 28px 40px",
        fontFamily:
          "'Syne', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            border: "none",
            background: "transparent",
            color: "#9ca3af",
            fontSize: 13,
            marginBottom: 12,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily:
              "'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
          }}
        >
          <span>←</span>
          <span>Back to Patients</span>
        </button>

        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: 0.04,
              marginBottom: 4
            }}
          >
            {headerName}
          </div>
          <div
            style={{
              fontFamily:
                "'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
              fontSize: 13,
              color: "#9ca3af",
              display: "flex",
              alignItems: "center",
              gap: 12
            }}
          >
            <span>{normalizedPhone || "Phone not available"}</span>
            {totalVisits > 0 && (
              <>
                <span style={{ opacity: 0.4 }}>•</span>
                <span>{totalVisits} visit{totalVisits > 1 ? "s" : ""}</span>
              </>
            )}
            {latestBooking && (
              <>
                <span style={{ opacity: 0.4 }}>•</span>
                <StatusPill status={latestStatus} />
              </>
            )}
          </div>
        </div>

        <div
          style={{
            position: "relative",
            margin: "18px 0 26px",
            borderBottom: "1px solid #1a2d4a",
            textAlign: "center"
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              background: "#0a0f1e",
              padding: "0 10px",
              fontSize: 12,
              color: "#00d4aa",
              fontFamily:
                "'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
            }}
          >
            ◆
          </div>
        </div>

        {loading ? (
          <div
            style={{
              padding: "40px 0",
              textAlign: "center",
              color: "#9ca3af",
              fontSize: 13
            }}
          >
            Loading patient history…
          </div>
        ) : matches.length === 0 ? (
          <div
            style={{
              padding: "48px 0",
              textAlign: "center",
              color: "#9ca3af"
            }}
          >
            <div
              style={{
                width: 70,
                height: 42,
                margin: "0 auto 14px",
                borderRadius: 999,
                border: "1px dashed #1f2937",
                position: "relative",
                background:
                  "radial-gradient(circle at 30% 0%, rgba(0,212,170,0.25), transparent 55%)"
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  border: "1px solid #1f2937",
                  position: "absolute",
                  left: "50%",
                  top: -13,
                  transform: "translateX(-50%)",
                  background: "#020617"
                }}
              />
            </div>
            <div
              style={{
                fontSize: 14,
                marginBottom: 4
              }}
            >
              No bookings found for this patient
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#6b7280"
              }}
            >
              When this patient books an appointment, their history will appear
              here.
            </div>
          </div>
        ) : (
          <div>
            {matches.map((b, idx) => {
              const status = deriveStatus(b)
              const borderColor =
                status === "cancelled"
                  ? "#ff6b6b"
                  : status === "rescheduled"
                  ? "#f59e0b"
                  : "#00d4aa"
              const insured = hasInsurance(b)
              const patientPays =
                typeof b.patientPays === "number" ? b.patientPays : b.fee || 0
              const insurerPays =
                typeof b.fee === "number"
                  ? Math.max(0, (b.fee || 0) - (patientPays || 0))
                  : null

              return (
                <div
                  key={b.ref || idx}
                  style={{
                    background: "#111827",
                    borderRadius: 16,
                    border: "1px solid #1e3a5f",
                    padding: 24,
                    marginBottom: 16,
                    borderLeft: `4px solid ${borderColor}`,
                    animation: "patientCardIn 0.32s ease-out both",
                    animationDelay: `${idx * 0.08}s`
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 10,
                      gap: 12
                    }}
                  >
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 8
                      }}
                    >
                      <span>⚕</span>
                      <span>{b.doctorName || "Unknown doctor"}</span>
                      {b.specialty && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "#9ca3af"
                          }}
                        >
                          · {b.specialty}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        fontFamily:
                          "'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                        fontSize: 11,
                        color: "#9ca3af"
                      }}
                    >
                      <div style={{ marginBottom: 4 }}>
                        Ref: {b.ref || "—"}
                      </div>
                      <StatusPill status={status} />
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: "#e5f7ff",
                      marginBottom: 8
                    }}
                  >
                    {b.date || "Unknown date"} · {b.time || "Unknown time"}
                  </div>

                  <div
                    style={{
                      background: "#0a1628",
                      borderLeft: "3px solid #00d4aa",
                      borderRadius: "0 8px 8px 0",
                      padding: 12,
                      margin: "10px 0 12px",
                      fontStyle: "italic",
                      fontSize: 12,
                      color: "#cbd5f5",
                      fontFamily:
                        "'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
                    }}
                  >
                    {b.problem || "No symptom description captured."}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-end",
                      gap: 16,
                      flexWrap: "wrap"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6
                      }}
                    >
                      {insured ? (
                        <>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#9ca3af"
                            }}
                          >
                            Insurance
                          </div>
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 11,
                              fontFamily:
                                "'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
                            }}
                          >
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: 999,
                                background: "#00d4aa",
                                color: "#020617"
                              }}
                            >
                              Insurer pays: Rs{" "}
                              {insurerPays != null
                                ? insurerPays.toLocaleString()
                                : "—"}
                            </span>
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: 999,
                                border: "1px solid rgba(148,163,184,0.5)",
                                color: "#e5f7ff"
                              }}
                            >
                              You pay: Rs{" "}
                              {patientPays != null
                                ? patientPays.toLocaleString()
                                : "—"}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#a5b4fc",
                              marginTop: 2
                            }}
                          >
                            {getInsurerName(b)}
                          </div>
                        </>
                      ) : (
                        <>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#9ca3af"
                            }}
                          >
                            Total fee
                          </div>
                          <div
                            style={{
                              display: "inline-flex",
                              padding: "3px 10px",
                              borderRadius: 999,
                              border: "1px solid rgba(45,212,191,0.5)",
                              background: "rgba(15,23,42,0.9)",
                              fontSize: 12,
                              fontFamily:
                                "'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                              color: "#a7f3d0"
                            }}
                          >
                            Rs {(b.fee || 0).toLocaleString()}
                          </div>
                        </>
                      )}
                    </div>

                    <div
                      style={{
                        textAlign: "right",
                        fontSize: 11,
                        color: "#9ca3af",
                        fontFamily:
                          "'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
                      }}
                    >
                      <div>Booked at: {formatBookedAt(b.bookedAt)}</div>
                      <div style={{ marginTop: 4 }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 999,
                            border: "1px solid rgba(96,165,250,0.7)",
                            color: "#bfdbfe",
                            fontSize: 10
                          }}
                        >
                          VOICE
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>
        {`
          @keyframes patientCardIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>
    </div>
  )
}

