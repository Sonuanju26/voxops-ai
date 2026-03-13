import { useEffect, useMemo, useState } from "react"

const TIME_SLOTS = [
  { label: "9 AM", hour: 9 },
  { label: "10 AM", hour: 10 },
  { label: "11 AM", hour: 11 },
  { label: "12 PM", hour: 12 },
  { label: "1 PM", hour: 13 },
  { label: "2 PM", hour: 14 },
  { label: "3 PM", hour: 15 },
  { label: "4 PM", hour: 16 },
  { label: "5 PM", hour: 17 },
  { label: "6 PM", hour: 18 }
]

function getRollingDays() {
  const days = []
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    days.push(d)
  }
  return days
}

function formatDayLabel(d) {
  return d.toLocaleDateString("en-IN", { weekday: "short" })
}

function formatDateNumber(d) {
  return d.getDate()
}

function dateKey(d) {
  return d.toISOString().slice(0, 10)
}

function normalizeDateToKey(value) {
  if (!value) return null
  const s = String(value).trim()

  // dd-mm-yyyy or dd/mm/yyyy
  let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m) {
    const [ , dd, mm, yyyy ] = m
    const d = new Date(parseInt(yyyy,10), parseInt(mm,10)-1, parseInt(dd,10))
    if (!isNaN(d.getTime())) return dateKey(d)
  }

  // Fallback to Date parser for natural language like "March 15"
  const d = new Date(s)
  if (!isNaN(d.getTime())) return dateKey(d)

  return null
}

function parseHour(timeStr) {
  if (!timeStr) return null
  const s = String(timeStr).trim()
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const mer = m[3] ? m[3].toLowerCase() : null
  if (mer === "pm" && h < 12) h += 12
  if (mer === "am" && h === 12) h = 0
  return h
}

function colorForCount(count) {
  if (!count) return "#1a2035"
  if (count === 1) return "#0d4f3c"
  if (count === 2) return "#00a884"
  return "#ff6b6b"
}

export default function HeatmapCalendar() {
  const [bookings, setBookings] = useState([])
  const [previousCounts, setPreviousCounts] = useState({})

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch("/api/bookings")
        const data = await res.json()
        if (!cancelled) {
          const list = Array.isArray(data) ? data : (data.bookings || [])
          setBookings(list)
        }
      } catch {
        if (!cancelled) setBookings([])
      }
    }

    load()
    const id = setInterval(load, 15000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const days = useMemo(() => getRollingDays(), [])

  const grid = useMemo(() => {
    const cellCounts = {}
    const cellBookings = {}

    bookings.forEach(b => {
      const key = normalizeDateToKey(b.date)
      if (!key) return
      const h = parseHour(b.time)
      if (h == null) return

      const slot = TIME_SLOTS.find(s => s.hour === h)
      if (!slot) return

      const cellKey = `${key}-${h}`
      cellCounts[cellKey] = (cellCounts[cellKey] || 0) + 1
      if (!cellBookings[cellKey]) cellBookings[cellKey] = []
      cellBookings[cellKey].push(b)
    })

    const rows = TIME_SLOTS.map(slot => {
      const rowCells = days.map(d => {
        const dKey = dateKey(d)
        const cellKey = `${dKey}-${slot.hour}`
        const count = cellCounts[cellKey] || 0
        const prev = previousCounts[cellKey] || 0
        const isNew = count > prev

        return {
          dateKey: dKey,
          hour: slot.hour,
          count,
          bookings: cellBookings[cellKey] || [],
          isNew
        }
      })
      return { slot, cells: rowCells }
    })

    setPreviousCounts(cellCounts)
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, days])

  const hasAny = bookings && bookings.length > 0

  return (
    <div className="heatmap-root">
      <div className="heatmap-grid-shell">
        <div className="heatmap-header">
          <div>
            <div className="heatmap-title">APPOINTMENT LOAD — LIVE</div>
            <div className="heatmap-sub">Next 7 days • by hour slot</div>
          </div>
          <div className="live-pill">
            <span className="live-dot-red" />
            LIVE
          </div>
        </div>

        {!hasAny ? (
          <div style={{ padding: "26px 0", fontSize: 13, color: "#9ca3af" }}>
            No bookings yet. New appointments will start painting the grid as they are created.
          </div>
        ) : (
          <div className="heatmap-scroll">
            <table className="heatmap-table">
              <thead>
                <tr>
                  <th className="heatmap-th" />
                  {days.map(d => (
                    <th key={dateKey(d)} className="heatmap-th">
                      <div className="heatmap-date-label">
                        <span>{formatDayLabel(d)}</span>
                        <span>{formatDateNumber(d)}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map(row => (
                  <tr key={row.slot.hour}>
                    <td className="heatmap-td">
                      <div className="heatmap-hour-label">{row.slot.label}</div>
                    </td>
                    {row.cells.map(cell => {
                      const color = colorForCount(cell.count)
                      const title =
                        cell.bookings.length === 0
                          ? "No bookings"
                          : cell.bookings
                              .map(
                                b =>
                                  `Dr. ${b.doctorName || "Unknown"} — ${b.patientName || "Unknown"} — ${b.time || ""}`
                              )
                              .join("\n")

                      const classes = [
                        "heat-cell",
                        cell.count >= 3 ? "heat-cell-full" : "",
                        cell.isNew ? "heat-cell-new" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")

                      return (
                        <td key={cell.dateKey + cell.hour} className="heatmap-td">
                          <div
                            className={classes}
                            style={{ background: color }}
                            title={title}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="heatmap-legend">
          <span className="heatmap-legend-swatch" style={{ background: "#1a2035" }} />
          Empty
          <span className="heatmap-legend-swatch" style={{ background: "#0d4f3c" }} />
          1 booking
          <span className="heatmap-legend-swatch" style={{ background: "#00a884" }} />
          2 bookings
          <span className="heatmap-legend-swatch" style={{ background: "#ff6b6b" }} />
          3+ bookings (FULL)
        </div>
      </div>
    </div>
  )
}

