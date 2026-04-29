#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const Graph = require('graphology');
const louvain = require('graphology-communities-louvain');

const DEPS_FILE = path.join(__dirname, 'dependencies.json');
const RESOLUTIONS = [0.5, 0.8, 1.0, 1.2, 1.5, 2.0];

function readJSON(file) {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function buildUndirectedGraph(deps) {
  const graph = new Graph({type: 'undirected'});
  for (const src of Object.keys(deps)) {
    if (!graph.hasNode(src)) graph.addNode(src);
    for (const dst of deps[src] || []) {
      if (!graph.hasNode(dst)) graph.addNode(dst);
      if (!graph.hasEdge(src, dst) && !graph.hasEdge(dst, src)) {
        try { graph.addEdge(src, dst); } catch (e) { /* ignore */ }
      }
    }
  }
  return graph;
}

function computeMetricsFromMapping(deps, clusters) {
  // Copy of metrics.computeMetrics logic (lightweight reuse)
  const clusterNodes = new Map();
  for (const [node, cid] of Object.entries(clusters)) {
    if (!clusterNodes.has(cid)) clusterNodes.set(cid, new Set());
    clusterNodes.get(cid).add(node);
  }
  const clusterIds = Array.from(clusterNodes.keys()).sort((a,b)=>a-b);
  const stats = {};
  for (const cid of clusterIds) stats[cid] = { total_deps:0, internal_deps:0, external_deps:0 };
  const coupling = {};
  function incCoupling(a,b){ if(!coupling[a]) coupling[a] = {}; coupling[a][b] = (coupling[a][b]||0)+1; }
  let totalEdges = 0; let totalExternal = 0;
  for (const [src, targets] of Object.entries(deps)){
    const srcCluster = Object.prototype.hasOwnProperty.call(clusters, src) ? clusters[src] : null;
    for (const dst of targets || []){
      const dstCluster = Object.prototype.hasOwnProperty.call(clusters, dst) ? clusters[dst] : null;
      totalEdges++;
      if (srcCluster !== null && stats[srcCluster]){
        stats[srcCluster].total_deps++;
        if (dstCluster === srcCluster) stats[srcCluster].internal_deps++; else { stats[srcCluster].external_deps++; totalExternal++; }
      } else {
        if (dstCluster !== null){ incCoupling('unassigned', String(dstCluster)); totalExternal++; }
      }
      if (srcCluster !== null && dstCluster !== null && srcCluster !== dstCluster) incCoupling(String(srcCluster), String(dstCluster));
      else if (srcCluster !== null && dstCluster === null) incCoupling(String(srcCluster), 'unassigned');
    }
  }
  const cohesion = {};
  for (const cid of clusterIds){ const s = stats[cid]; const total = s.total_deps; const internal = s.internal_deps; const score = total===0?1:internal/total; cohesion[cid] = { clusterId: cid, total_deps: total, internal_deps: internal, external_deps: s.external_deps, cohesion: Number(score.toFixed(4)) }; }
  const avgCohesion = clusterIds.length===0?1:(clusterIds.reduce((sum,c)=>sum+cohesion[c].cohesion,0)/clusterIds.length);
  const couplingPenalty = totalEdges===0?0: totalExternal/totalEdges;
  const MQ = Number((avgCohesion - couplingPenalty).toFixed(4));
  // undirected coupling summary
  const undirected = {};
  for (const from of Object.keys(coupling)) for (const to of Object.keys(coupling[from])){ const a=from,b=to; const key = a<=b?`${a}<->${b}`:`${b}<->${a}`; undirected[key] = (undirected[key]||0)+coupling[from][to]; }
  return { clusters: cohesion, average_cohesion: Number(avgCohesion.toFixed(4)), coupling_penalty: Number(couplingPenalty.toFixed(4)), MQ, totals: { total_edges: totalEdges, total_external_edges: totalExternal }, coupling_directed: coupling, coupling_undirected: undirected };
}

function runLouvainWithResolution(graph, resolution){
  let assignments = null;
  try {
    if (typeof louvain === 'function') {
      assignments = louvain(graph, {resolution});
    }
  } catch (e) {
    // ignore
  }
  if (!assignments && louvain && typeof louvain.assign === 'function'){
    const maybe = louvain.assign(graph, {resolution});
    if (maybe) assignments = maybe;
  }
  // if assignments is mapping, return it
  if (assignments && typeof assignments === 'object' && !Array.isArray(assignments)) return assignments;

  // otherwise read node attributes
  const mapping = {};
  graph.forEachNode((node) => {
    let val = null;
    try {
      val = graph.getNodeAttribute(node, 'community');
    } catch (e) { val = undefined; }
    if (val === undefined) val = graph.getNodeAttribute(node, 'label') || graph.getNodeAttribute(node, 'cluster') || graph.getNodeAttribute(node, 'modularity_class');
    if (val === undefined) val = null;
    mapping[node] = val;
  });
  return mapping;
}

function printTable(rows){
  // compute column widths
  const headers = ['Resolution','#Clusters','Cohesion','Coupling','MQ'];
  const lines = [];
  lines.push(headers.join(' | '));
  lines.push(headers.map(h=>'-'.repeat(h.length)).join('-|-'));
  for (const r of rows){
    lines.push([String(r.resolution), String(r.numClusters), `${(r.cohesion*100).toFixed(2)}%`, `${(r.coupling*100).toFixed(2)}%`, `${(r.MQ*100).toFixed(2)}%`].join(' | '));
  }
  console.log(lines.join('\n'));
}

async function main(){
  try {
    const deps = readJSON(DEPS_FILE);
    const graph = buildUndirectedGraph(deps);
    const results = [];
    for (const res of RESOLUTIONS){
      // clone graph for safe operations since some implementations mutate attributes
      const g = buildUndirectedGraph(deps);
      const mapping = runLouvainWithResolution(g, res);
      const metrics = computeMetricsFromMapping(deps, mapping);
      const numClusters = Object.keys(metrics.clusters).length;
      results.push({ resolution: res, numClusters, cohesion: metrics.average_cohesion, coupling: metrics.coupling_penalty, MQ: metrics.MQ });

      // write per-resolution outputs into frontend-demo/public if available
      try {
        const outDir = path.join(__dirname, '..', 'frontend-demo', 'public');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const mappingFile = path.join(outDir, `clusters_res_${String(res)}.json`);
        const metricsFile = path.join(outDir, `metrics_res_${String(res)}.json`);
        fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2), 'utf8');
        // write a compact metrics summary
        const metricsSummary = {
          resolution: res,
          numClusters,
          cohesion: metrics.average_cohesion,
          coupling: metrics.coupling_penalty,
          MQ: metrics.MQ,
          totals: metrics.totals
        };
        fs.writeFileSync(metricsFile, JSON.stringify(metricsSummary, null, 2), 'utf8');
      } catch (e) {
        // non-fatal: continue
        console.error('Warning: failed to write per-resolution files:', e.message);
      }
    }

    printTable(results);
    // find best
    let best = results[0];
    for (const r of results) if (r.MQ > best.MQ) best = r;
    console.log('\nBest resolution:', best.resolution, `→ MQ ${(best.MQ*100).toFixed(2)}% with ${best.numClusters} clusters`);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
