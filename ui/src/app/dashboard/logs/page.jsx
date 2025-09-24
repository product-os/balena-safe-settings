"use client"
import TitleBar from '../../components/TitleBar'
import { useState } from 'react'

export default function LogsPage () {
  // Static mock data for demonstration
  const mockEntries = [
    { timestamp: '2025-09-11T10:00:00.000Z', level: 'INFO', message: 'Safe Settings service started.' },
    { timestamp: '2025-09-11T10:01:05.123Z', level: 'WARN', message: 'Config file missing, using defaults.' },
    { timestamp: '2025-09-11T10:02:10.456Z', level: 'ERROR', message: 'Failed to sync settings: network error.' },
    { timestamp: '2025-09-11T10:03:00.789Z', level: 'DEBUG', message: 'Polling GitHub API for updates.' },
    { timestamp: '2025-09-11T10:04:15.000Z', level: 'INFO', message: 'Sync completed successfully.' },
    { timestamp: '2025-09-11T10:05:00.000Z', level: 'INFO', message: 'SYNC: Organization settings updated.' },
    { timestamp: '2025-09-11T10:06:00.000Z', level: 'ERROR', message: 'SYNC: Failed to update organization settings.' }
  ]

  const logLevels = ['INFO', 'WARN', 'DEBUG', 'ERROR']
  const [selectedLevels, setSelectedLevels] = useState(new Set(logLevels))
  const [search, setSearch] = useState('')

  const toggleLevel = (lvl) => {
    const next = new Set(selectedLevels)
    if (next.has(lvl)) next.delete(lvl)
    else next.add(lvl)
    setSelectedLevels(next)
  }

  const filtered = mockEntries.filter(e =>
    selectedLevels.has(e.level.toUpperCase()) &&
    (search.trim() === '' || e.message.toLowerCase().includes(search.trim().toLowerCase()))
  )

  return (
    <>
      <TitleBar />
      <div className="container py-4">
        <div className="col-12 mb-4">
          <div className="card shadow-sm">
            <div className="card-body">
              <h4 className="card-title mb-2">Safe Settings Log</h4>
              <p className="card-text text-muted">View recent log entries for Safe Settings operations and syncs.</p>
            </div>
          </div>
        </div>
        <div className="col-12 mb-4">
          <div className="card shadow-sm">
            <div className="card-body">
              <h5 className="card-title mb-3">Filter Options</h5>
              <div className="mb-2">
                <strong>Log Levels:</strong>
                <div className="d-flex gap-3 mt-2">
                  {logLevels.map(lvl => (
                    <label key={lvl} className="form-check form-check-inline">
                      <input className="form-check-input" type="checkbox" checked={selectedLevels.has(lvl)} onChange={() => toggleLevel(lvl)} />
                      <span className="form-check-label">{lvl}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <strong>Search Message:</strong>
                <input
                  type="text"
                  className="form-control mt-1"
                  placeholder="Search for SYNC, error, etc."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ maxWidth: 300 }}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="col-12">
          <div className="card shadow-sm">
            <div className="card-body">
              <h5 className="card-title mb-3">Log Entries</h5>
              <div className="table-responsive" style={{ maxHeight: '60vh', overflow: 'auto' }}>
                <table className="table table-sm table-striped align-middle">
                  <thead>
                    <tr>
                      <th style={{width: '200px'}}>Timestamp</th>
                      <th style={{width: '90px'}}>Level</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, i) => {
                      let levelClass = ''
                      if (row.level === 'ERROR') levelClass = 'log-error'
                      else if (row.level === 'WARN') levelClass = 'log-warn'
                      return (
                        <tr key={`${row.timestamp || 'na'}-${i}`}>
                          <td style={{fontSize: '0.85rem', whiteSpace: 'nowrap'}}>{row.timestamp || '-'}</td>
                          <td className={levelClass} style={{fontWeight: 600}}>{row.level || 'UNKNOWN'}</td>
                          <td className={levelClass} style={{fontFamily: 'monospace', fontSize: '0.9rem', whiteSpace: 'pre-wrap'}}>{row.message}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {filtered.length === 0 && <div className="text-muted py-3">No log entries match your filters.</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
