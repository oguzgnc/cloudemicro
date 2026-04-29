import React, { useEffect, useRef, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import * as d3 from 'd3'
import './App.css'

export default function GraphView({ resolution, dynamicTrafficEnabled, onExport, metricsRef, legendRef }) {
  const fgRef = useRef()
  const [data, setData] = useState({ nodes: [], links: [] })
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState(null)
  const [clusterColorMap, setClusterColorMap] = useState({})
  const [highlightedNodes, setHighlightedNodes] = useState(new Set())

  // Load graph data
  useEffect(() => {
    async function load() {
      try {
        const depsResp = await fetch('/dependencies.json')
        const deps = await depsResp.json()
        const dynamicResp = await fetch('/dynamic_calls.json')
        const dynamicCalls = dynamicResp.ok ? await dynamicResp.json() : { calls: [] }

        const clusterFile = resolution ? `/clusters_res_${String(resolution)}.json` : '/clustered_results.json'
        const metricsFile = resolution ? `/metrics_res_${String(resolution)}.json` : '/metrics_res_default.json'

        let clusters = {}
        try {
          const cResp = await fetch(clusterFile)
          if (!cResp.ok) throw new Error('not found')
          clusters = await cResp.json()
        } catch (e) {
          const cResp = await fetch('/clustered_results.json')
          clusters = await cResp.json()
        }

        try {
          const mResp = await fetch(metricsFile)
          if (mResp.ok) setMetrics(await mResp.json())
          else setMetrics(null)
        } catch (e) {
          setMetrics(null)
        }

        const dynamicLinkMap = new Map()
        const dynamicCallList = Array.isArray(dynamicCalls.calls) ? dynamicCalls.calls : []
        let maxDynamicCount = 0
        for (const call of dynamicCallList) {
          const key = `${call.caller}|||${call.callee}`
          const count = Number(call.count) || 0
          dynamicLinkMap.set(key, count)
          if (count > maxDynamicCount) maxDynamicCount = count
        }

        const nodesMap = new Map()
        Object.keys(deps).forEach(src => {
          if (!nodesMap.has(src)) nodesMap.set(src, { id: src })
          for (const t of deps[src] || []) {
            if (!nodesMap.has(t)) nodesMap.set(t, { id: t })
          }
        })

        for (const [id, node] of nodesMap) {
          const cluster = clusters[id]
          node.cluster = typeof cluster !== 'undefined' ? cluster : null
        }

        const nodes = Array.from(nodesMap.values())
        const links = []
        for (const [src, targets] of Object.entries(deps)) {
          for (const t of targets) {
            const count = dynamicLinkMap.get(`${src}|||${t}`) || 0
            const intensity = maxDynamicCount > 0 ? count / maxDynamicCount : 0
            links.push({
              source: src,
              target: t,
              count,
              intensity,
              isHot: count > 0 && intensity >= 0.6
            })
          }
        }

        const clusterIds = Array.from(new Set(nodes.map(n => n.cluster).filter(c => c !== null)))
        const color = d3.scaleOrdinal(d3.schemeTableau10).domain(clusterIds)
        const cmap = {}
        nodes.forEach(n => {
          const col = n.cluster === null ? '#999' : color(n.cluster)
          n.color = col
          if (n.cluster !== null) cmap[n.cluster] = col
        })
        setClusterColorMap(cmap)
        setData({ nodes, links })
        setLoading(false)
      } catch (err) {
        console.error('Failed to load graph data', err)
        setLoading(false)
      }
    }

    setLoading(true)
    load()
  }, [resolution])

  // Center graph when data changes (FIX FOR CENTERING BUG)
  useEffect(() => {
    if (!fgRef.current || data.nodes.length === 0) return
    
    const timer = setTimeout(() => {
      try {
        if (typeof fgRef.current.zoomToFit === 'function') {
          fgRef.current.zoomToFit(400, 70)
        }
        if (typeof fgRef.current.centerAt === 'function') {
          fgRef.current.centerAt(0, 0, 400)
        }
      } catch (e) {
        console.warn('Could not center graph', e)
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [data, resolution])

  // Update metrics and legend cards
  useEffect(() => {
    if (metricsRef && metricsRef.current) {
      if (metrics) {
        metricsRef.current.style.display = 'block'
        const mqValue = (metrics.MQ * 100).toFixed(2)
        const mqClass = metrics.MQ >= 0.5 ? 'excellent' : 'good'
        metricsRef.current.innerHTML = `
          <div class="metrics-title">System Metrics</div>
          <div class="mq-box">
            <div class="mq-label">Modularization Quality</div>
            <div class="mq-value ${mqClass}">${mqValue}%</div>
            <div class="mq-subtitle">Resolution ${metrics.resolution}</div>
          </div>
          <div class="metrics-row">
            <span class="metrics-label">Total Clusters</span>
            <span class="metrics-value">${metrics.numClusters}</span>
          </div>
          <div class="metrics-row">
            <span class="metrics-label">Avg Cohesion</span>
            <span class="metrics-value">${(metrics.cohesion * 100).toFixed(1)}%</span>
          </div>
          <div class="metrics-row">
            <span class="metrics-label">Coupling Penalty</span>
            <span class="metrics-value">${(metrics.coupling * 100).toFixed(1)}%</span>
          </div>
        `
      } else {
        metricsRef.current.style.display = 'none'
      }
    }
  }, [metrics, metricsRef])

  // Update legend card
  useEffect(() => {
    if (legendRef && legendRef.current) {
      const cmapKeys = Object.keys(clusterColorMap).sort((a, b) => Number(a) - Number(b))
      if (cmapKeys.length > 0) {
        legendRef.current.style.display = 'block'
        const items = cmapKeys.map(cid => `
          <div class="legend-item">
            <div class="legend-color" style="background-color: ${clusterColorMap[cid]}"></div>
            <span class="legend-label">Cluster ${cid}</span>
          </div>
        `).join('')
        const legendContent = legendRef.current.querySelector('#legend-content')
        if (legendContent) legendContent.innerHTML = items
      } else {
        legendRef.current.style.display = 'none'
      }
    }
  }, [clusterColorMap, legendRef])

  // Export PNG
  const exportPNG = useCallback(() => {
    try {
      if (fgRef.current && typeof fgRef.current.toDataURL === 'function') {
        const uri = fgRef.current.toDataURL('image/png', 2)
        const a = document.createElement('a')
        a.href = uri
        a.download = `microservices-graph_${resolution || 'default'}.png`
        a.click()
        return
      }
    } catch (e) {
      // fallback
    }

    const canvas = document.querySelector('canvas')
    if (canvas) {
      const uri = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = uri
      a.download = `microservices-graph_${resolution || 'default'}.png`
      a.click()
    } else {
      alert('Unable to export: canvas not found')
    }
  }, [resolution])

  // Expose export to parent
  useEffect(() => {
    if (typeof onExport === 'function') onExport(exportPNG)
  }, [onExport, exportPNG])

  // Node click handler with highlighting
  const handleNodeClick = (node) => {
    if (!fgRef.current || !node.x || !node.y) return

    // Get neighbors
    const neighbors = new Set([node.id])
    data.links.forEach(link => {
      if (link.source.id === node.id) neighbors.add(link.target.id)
      if (link.target.id === node.id) neighbors.add(link.source.id)
    })

    setHighlightedNodes(neighbors)

    // Center and zoom
    try {
      fgRef.current.centerAt(node.x, node.y, 500)
      fgRef.current.zoom(1.5, 500)
    } catch (e) {
      // ignore
    }
  }

  const getLinkWidth = useCallback((link) => {
    if (!dynamicTrafficEnabled) return 1.5
    const count = Number(link.count) || 0
    if (count <= 0) return 1.2
    return 1.2 + Math.min(6, Math.sqrt(count) * 0.85)
  }, [dynamicTrafficEnabled])

  const getLinkColor = useCallback((link) => {
    if (!dynamicTrafficEnabled || !link.count) return 'rgba(100, 116, 139, 0.4)'
    if ((link.intensity || 0) >= 0.6) return 'rgba(14, 165, 233, 0.95)'
    if ((link.intensity || 0) >= 0.3) return 'rgba(59, 130, 246, 0.7)'
    return 'rgba(96, 165, 250, 0.45)'
  }, [dynamicTrafficEnabled])

  const drawTrafficGlow = useCallback((link, ctx, globalScale) => {
    if (!dynamicTrafficEnabled || !link.count || !link.isHot) return
    if (!link.source || !link.target || typeof link.source.x !== 'number' || typeof link.target.x !== 'number') return

    const sourceX = link.source.x
    const sourceY = link.source.y
    const targetX = link.target.x
    const targetY = link.target.y
    const intensity = link.intensity || 0
    const glowWidth = Math.max(2, getLinkWidth(link) + 2)

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(sourceX, sourceY)
    ctx.lineTo(targetX, targetY)
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.75)'
    ctx.lineWidth = glowWidth / Math.max(0.75, globalScale)
    ctx.globalAlpha = 0.35 + intensity * 0.45
    ctx.shadowBlur = 18 + intensity * 22
    ctx.shadowColor = 'rgba(34, 211, 238, 0.9)'
    ctx.filter = 'drop-shadow(0 0 8px rgba(34, 211, 238, 0.75))'
    ctx.stroke()
    ctx.restore()
  }, [dynamicTrafficEnabled, getLinkWidth])

  if (loading) {
    return <div className="loading-container">Loading microservice graph...</div>
  }

  return (
    <div className="graph-container">
      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        width={window.innerWidth}
        height={window.innerHeight - 70}
        backgroundColor="#0f172a"
        nodeLabel={n => `${n.id}${n.cluster !== null ? ` (cluster ${n.cluster})` : ''}`}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const isHighlighted = highlightedNodes.has(node.id)
          const label = node.id.split('.').slice(-1)[0]
          const fontSize = 12 / Math.max(1, globalScale)
          const radius = 6

          // Draw glow for highlighted nodes
          if (isHighlighted) {
            ctx.fillStyle = `rgba(${node.color === '#999' ? '153, 153, 153' : node.color.substr(1).match(/.{1,2}/g).map(x => parseInt(x, 16)).join(', ')}, 0.3)`
            ctx.beginPath()
            ctx.arc(node.x, node.y, radius + 8, 0, 2 * Math.PI, false)
            ctx.fill()
          }

          // Draw node circle
          ctx.fillStyle = node.color || '#666'
          ctx.beginPath()
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false)
          ctx.fill()

          // Draw node border
          ctx.strokeStyle = isHighlighted ? '#10b981' : 'rgba(255, 255, 255, 0.2)'
          ctx.lineWidth = isHighlighted ? 2 : 1
          ctx.beginPath()
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false)
          ctx.stroke()

          // Draw label with shadow
          ctx.font = `${fontSize}px 'Segoe UI', sans-serif`
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'

          // Shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
          ctx.fillText(label, node.x + 10, node.y + 1)

          // Text
          ctx.fillStyle = '#fff'
          ctx.fillText(label, node.x + 10, node.y)
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI, false)
          ctx.fill()
        }}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkWidth={getLinkWidth}
        linkColor={getLinkColor}
        linkCanvasObject={drawTrafficGlow}
        linkCanvasObjectMode="after"
        cooldownTicks={100}
        onNodeClick={handleNodeClick}
        onBackgroundClick={() => setHighlightedNodes(new Set())}
      />
    </div>
  )
}
