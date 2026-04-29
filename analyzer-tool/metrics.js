#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DEPS_FILE = path.join(__dirname, 'dependencies.json');
const CLUSTERS_FILE = path.join(__dirname, 'clustered_results.json');
const OUT_FILE = path.join(__dirname, 'evaluation_metrics.json');

function readJSON(file) {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function computeMetrics(deps, clusters) {
  // clusters: node -> clusterId
  const clusterNodes = new Map();
  for (const [node, cid] of Object.entries(clusters)) {
    if (!clusterNodes.has(cid)) clusterNodes.set(cid, new Set());
    clusterNodes.get(cid).add(node);
  }

  const clusterIds = Array.from(clusterNodes.keys()).sort((a,b) => a - b);

  // initialize stats
  const stats = {};
  for (const cid of clusterIds) {
    stats[cid] = { total_deps: 0, internal_deps: 0, external_deps: 0 };
  }

  // coupling matrix (directed): coupling[from][to] = count
  const coupling = {};
  function incCoupling(a,b) {
    if (!coupling[a]) coupling[a] = {};
    coupling[a][b] = (coupling[a][b] || 0) + 1;
  }

  let totalEdges = 0;
  let totalExternal = 0;

  for (const [src, targets] of Object.entries(deps)) {
    const srcCluster = clusters.hasOwnProperty(src) ? clusters[src] : null;
    for (const dst of targets || []) {
      const dstCluster = clusters.hasOwnProperty(dst) ? clusters[dst] : null;
      totalEdges++;

      if (srcCluster !== null && stats[srcCluster]) {
        stats[srcCluster].total_deps++;
        if (dstCluster === srcCluster) {
          stats[srcCluster].internal_deps++;
        } else {
          stats[srcCluster].external_deps++;
          totalExternal++;
        }
      } else {
        // src not in any cluster: ignore for per-cluster cohesion but count coupling
        if (dstCluster !== null) {
          // treat as coupling from 'unassigned' -> dstCluster
          incCoupling('unassigned', String(dstCluster));
          totalExternal++;
        }
      }

      if (srcCluster !== null && dstCluster !== null && srcCluster !== dstCluster) {
        incCoupling(String(srcCluster), String(dstCluster));
      } else if (srcCluster !== null && dstCluster === null) {
        incCoupling(String(srcCluster), 'unassigned');
      }
    }
  }

  // compute cohesion per cluster
  const cohesion = {};
  for (const cid of clusterIds) {
    const s = stats[cid];
    const total = s.total_deps;
    const internal = s.internal_deps;
    const score = total === 0 ? 1 : internal / total; // define cohesion=1 when no outgoing deps
    cohesion[cid] = { clusterId: cid, total_deps: total, internal_deps: internal, external_deps: s.external_deps, cohesion: Number(score.toFixed(4)) };
  }

  const avgCohesion = clusterIds.length === 0 ? 1 : (clusterIds.reduce((sum, c) => sum + cohesion[c].cohesion, 0) / clusterIds.length);
  const couplingPenalty = totalEdges === 0 ? 0 : totalExternal / totalEdges;

  const MQ = Number((avgCohesion - couplingPenalty).toFixed(4));

  // create undirected coupling summary between unordered pairs (string key like "a<->b")
  const undirected = {};
  for (const from of Object.keys(coupling)) {
    for (const to of Object.keys(coupling[from])) {
      const a = from;
      const b = to;
      const key = a <= b ? `${a}<->${b}` : `${b}<->${a}`;
      undirected[key] = (undirected[key] || 0) + coupling[from][to];
    }
  }

  return {
    clusters: cohesion,
    coupling_directed: coupling,
    coupling_undirected: undirected,
    totals: { total_edges: totalEdges, total_external_edges: totalExternal },
    average_cohesion: Number(avgCohesion.toFixed(4)),
    coupling_penalty: Number(couplingPenalty.toFixed(4)),
    MQ
  };
}

function main() {
  try {
    const deps = readJSON(DEPS_FILE);
    const clusters = readJSON(CLUSTERS_FILE);
    const metrics = computeMetrics(deps, clusters);
    fs.writeFileSync(OUT_FILE, JSON.stringify(metrics, null, 2), 'utf8');
    console.log(`Wrote ${OUT_FILE}`);
    console.log('--- Evaluation Summary ---');
    const clusterCount = Object.keys(metrics.clusters).length;
    console.log(`Clusters: ${clusterCount}`);
    console.log(`Total edges: ${metrics.totals.total_edges}`);
    console.log(`Total external (coupling) edges: ${metrics.totals.total_external_edges}`);
    console.log(`Average cohesion: ${(metrics.average_cohesion * 100).toFixed(2)}%`);
    console.log(`Coupling penalty: ${(metrics.coupling_penalty * 100).toFixed(2)}%`);
    console.log(`System MQ (avgCohesion - penalty): ${(metrics.MQ * 100).toFixed(2)}%`);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
