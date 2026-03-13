import { useEffect, useMemo, useState } from "react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"

const HOURS = Array.from({ length: 17 }, (_, i) => 6 + i) // 6 → 22

const hourLabel = (h) => {
  const mer = h >= 12 ? "PM" : "AM"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:00 ${mer}`
}

const useCountUp = (target, duration = 600) => {
  const [value, setValue] = useState(0)

  useEffect(() => {
    let frame
    const start = performance.now()
    const from = value
    const to = Number.isFinite(target) ? target : 0

    const loop = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = from + (to - from) * eased
      setValue(t === 1 ? to : next)
      if (t < 1) frame = requestAnimationFrame(loop)
    }

    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return value
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10)
}

function normalizeDate(str) {
  if (!str) return null
  const s = String(str).trim()
  const lower = s.toLowerCase()
  if (lower === "today") return getTodayKey()

  let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m) {
    const [ , dd, mm, yyyy ] = m
    const d = new Date(parseInt(yyyy,10), parseInt(mm,10)-1, parseInt(dd,10))
    if (!isNaN(d.getTime())) return d.toISOString().slice(0,10)
  }

  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0,10)
  return null
}

function isTodayBooking(b) {
  const key = normalizeDate(b.date)
  return key === getTodayKey()
}

function parseHour(b) {
  if (b.time) {
    const t = String(b.time).trim()
    const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
    if (m) {
      let h = parseInt(m[1],10)
      const mer = m[3] ? m[3].toLowerCase() : null
      if (mer === "pm" && h < 12) h += 12
      if (mer === "am" && h === 12) h = 0
      return h
    }
  }
  if (b.bookedAt) {
    const d = new Date(b.bookedAt)
    if (!isNaN(d.getTime())) return d.getHours()
  }
  return null
}

function getBarColor(count, max) {
  if (!max || max <= 0) return "rgba(15,118,110,0.9)"
  const t = Math.min(1, count / max)
  const r = Math.round(20 + (244 - 20) * t)
  const g = Math.round(180 + (63 - 180) * t)
  const b = Math.round(163 + (94 - 163) * t)
  return `rgb(${r},${g},${b})`
}

export default function AnalyticsPanel() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch("/api/bookings")
        const data = await res.json()
        if (!cancelled) {
          const list = Array.isArray(data) ? data : (data.bookings || [])
          setBookings(list)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setBookings([])
          setLoading(false)
        }
      }
    }

    load()
    const id = setInterval(load, 15000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const today = useMemo(() => {
    const todays = bookings.filter(isTodayBooking).filter(b => b.status !== "cancelled")

    const totalBookings = todays.length
    const totalRevenue = todays.reduce((s, b) => s + (Number(b.fee) || 0), 0)

    const doctorCounts = {}
    todays.forEach(b => {
      const name = b.doctorName || "Unknown"
      if (!doctorCounts[name]) doctorCounts[name] = 0
      doctorCounts[name]++
    })
    let mostBookedDoctor = null
    Object.entries(doctorCounts).forEach(([name, count]) => {
      if (!mostBookedDoctor || count > mostBookedDoctor.count) {
        mostBookedDoctor = { name, count }
      }
    })

    const STOP = new Set(["the","a","an","is","i","have","been","my","and","for"])
    const wordCounts = {}
    todays.forEach(b => {
      const text = (b.symptoms || b.problem || "").toString().toLowerCase()
      text.split(/[^a-zA-Z]+/).forEach(w => {
        if (!w || w.length <= 2) return
        if (STOP.has(w)) return
        wordCounts[w] = (wordCounts[w] || 0) + 1
      })
    })
    let mostSymptom = null
    Object.entries(wordCounts).forEach(([word, count]) => {
      if (!mostSymptom || count > mostSymptom.count) {
        mostSymptom = { word, count }
      }
    })

    const byHourMap = {}
    todays.forEach(b => {
      const h = parseHour(b)
      if (h == null || h < 6 || h > 22) return
      const key = String(h)
      byHourMap[key] = (byHourMap[key] || 0) + 1
    })
    const peakData = HOURS.map(h => ({
      hour: h,
      label: hourLabel(h),
      count: byHourMap[String(h)] || 0
    }))
    const maxCount = peakData.reduce((m, d) => Math.max(m, d.count), 0)

    const doctorMap = {}
    todays.forEach(b => {
      const name = b.doctorName || "Unknown"
      if (!doctorMap[name]) {
        doctorMap[name] = {
          name,
          specialty: b.specialty || "",
          bookingsToday: 0,
          revenueToday: 0
        }
      }
      doctorMap[name].bookingsToday += 1
      doctorMap[name].revenueToday += Number(b.fee) || 0
    })
    const doctorRows = Object.values(doctorMap).sort((a, b) => b.bookingsToday - a.bookingsToday)

    return {
      todays,
      totalBookings,
      totalRevenue,
      mostBookedDoctor,
      mostSymptom,
      peakData,
      maxCount,
      doctorRows
    }
  }, [bookings])

  const totalBookingsDisplay = useCountUp(today.totalBookings || 0)
  const totalRevenueDisplay = useCountUp(today.totalRevenue || 0)
  const doctorCountDisplay = useCountUp(today.mostBookedDoctor?.count || 0)
  const symptomCountDisplay = useCountUp(today.mostSymptom?.count || 0)

  if (loading) {
    return (
      <div className="analytics-root">
        <div className="analytics-grid">
          <div className="analytics-header">
            <div>
              <div className="analytics-title">REAL-TIME CLINIC ANALYTICS</div>
              <div className="analytics-subtitle">Loading live metrics…</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const hasData = today.todays && today.todays.length > 0

  return (
    <div className="analytics-root">
      <div className="analytics-grid">
        <div className="analytics-header">
          <div>
            <div className="analytics-title">LIVE OPERATIONS OVERVIEW</div>
            <div className="analytics-subtitle">
              Today&apos;s booking performance • Updated every 15s
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="live-pill">
              <span className="live-dot-green" />
              LIVE
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#9ca3af",
                fontFamily: "'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
              }}
            >
              {new Date().toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
              })}{" "}
              IST
            </div>
          </div>
        </div>

        <div className="analytics-stat-row">
          <div className="analytics-stat-card">
            <div className="analytics-stat-label">Total bookings today</div>
            <div className="analytics-stat-value">
              {Math.round(totalBookingsDisplay)}
            </div>
            <div className="analytics-stat-caption">
              All confirmed visits scheduled for today
            </div>
          </div>

          <div className="analytics-stat-card">
            <div className="analytics-stat-label">Revenue today</div>
            <div className="analytics-stat-value">
              ₹{Math.round(totalRevenueDisplay).toLocaleString()}
            </div>
            <div className="analytics-stat-caption">
              Sum of consultation fees for today&apos;s bookings
            </div>
          </div>

          <div className="analytics-stat-card">
            <div className="analytics-stat-label">Most booked doctor</div>
            <div className="analytics-stat-value">
              {today.mostBookedDoctor?.name || "—"}
            </div>
            <div className="analytics-stat-caption">
              <span className="analytics-mono">
                {Math.round(doctorCountDisplay)}
              </span>{" "}
              bookings today
            </div>
          </div>

          <div className="analytics-stat-card">
            <div className="analytics-stat-label">Most common symptom</div>
            <div className="analytics-stat-value">
              {today.mostSymptom?.word || "—"}
            </div>
            <div className="analytics-stat-caption">
              <span className="analytics-mono">
                {Math.round(symptomCountDisplay)}
              </span>{" "}
              mentions across today&apos;s bookings
            </div>
          </div>
        </div>

        <div className="analytics-layout">
          <div className="analytics-card">
            <div className="analytics-card-header">
              <div className="analytics-card-title">Peak hours — today</div>
              <div
                style={{
                  fontSize: 11,
                  color: "#9ca3af"
                }}
              >
                6 AM – 10 PM • by confirmed bookings
              </div>
            </div>
            {!hasData ? (
              <div className="analytics-empty">No bookings yet for today.</div>
            ) : (
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={today.peakData}
                    layout="vertical"
                    margin={{ top: 4, right: 10, left: 0, bottom: 0 }}
                  >
                    <XAxis
                      type="number"
                      hide
                      domain={[0, Math.max(1, today.maxCount)]}
                    />
                    <YAxis
                      dataKey="label"
                      type="category"
                      width={80}
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(15,23,42,0.6)" }}
                      contentStyle={{
                        background: "#020617",
                        borderRadius: 8,
                        border: "1px solid #1f2937",
                        fontSize: 11,
                        color: "#e5f7ff"
                      }}
                    />
                    <Bar
                      dataKey="count"
                      isAnimationActive
                      animationDuration={600}
                      radius={[0, 8, 8, 0]}
                    >
                      {today.peakData.map((d, i) => (
                        <Cell
                          key={d.hour}
                          fill={getBarColor(d.count, today.maxCount)}
                          style={{ transition: "all 0.3s ease" }}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="analytics-card">
            <div className="analytics-card-header">
              <div className="analytics-card-title">Doctor workload — today</div>
            </div>
            {!hasData || today.doctorRows.length === 0 ? (
              <div className="analytics-empty">No doctor activity yet today.</div>
            ) : (
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                <table className="analytics-doctor-table">
                  <thead>
                    <tr>
                      <th>Doctor</th>
                      <th>Specialty</th>
                      <th>Bookings</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {today.doctorRows.map((d) => (
                      <tr key={d.name}>
                        <td>{d.name}</td>
                        <td style={{ color: "#9ca3af" }}>{d.specialty}</td>
                        <td className="analytics-mono">{d.bookingsToday}</td>
                        <td className="analytics-mono">
                          ₹{d.revenueToday.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

