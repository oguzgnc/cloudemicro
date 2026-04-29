import React, { useState, useRef } from 'react'
import GraphView from './GraphView'
import './App.css'

const RESOLUTIONS = [0.5, 0.8, 1.0, 1.2, 1.5, 2.0]

export default function App() {
  const [resolution, setResolution] = useState(0.5)
  const exportRef = useRef(null)
  const metricsRef = useRef(null)
  const legendRef = useRef(null)

  const handleExport = () => {
    if (exportRef.current) exportRef.current()
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <h1 className="app-title">Microservice Analyzer</h1>
        <div className="controls">
          <label className="control-label">
            Resolution:
            <select value={resolution} onChange={e => setResolution(parseFloat(e.target.value))} className="control-select">
              {RESOLUTIONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <button className="btn-export" onClick={handleExport}>Download PNG</button>
        </div>
      </header>
      <main className="app-main">
        <GraphView 
          resolution={resolution} 
          onExport={fn => { exportRef.current = fn }}
          metricsRef={metricsRef}
          legendRef={legendRef}
        />
        {/* Metrics Card - Top Left */}
        <div className="metrics-card" ref={metricsRef} style={{ display: 'none' }}>
          <div className="metrics-title">System Metrics</div>
          <div id="metrics-content" />
        </div>
        {/* Legend Card - Bottom Right */}
        <div className="legend-card" ref={legendRef} style={{ display: 'none' }}>
          <div className="legend-title">Proposed Microservices</div>
          <div className="legend-items" id="legend-content" />
        </div>
      </main>
    </div>
  )
}
