#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const Graph = require('graphology');
const louvain = require('graphology-communities-louvain');

const IN_FILE = path.join(__dirname, 'dependencies.json');
const OUT_FILE = path.join(__dirname, 'clustered_results.json');

function loadDependencies(file) {
  if (!fs.existsSync(file)) throw new Error(`Input file not found: ${file}`);
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw);
}

function buildGraph(deps) {
  const graph = new Graph({type: 'directed'});
  for (const src of Object.keys(deps)) {
    if (!graph.hasNode(src)) graph.addNode(src);
    const targets = deps[src] || [];
    for (const t of targets) {
      if (!graph.hasNode(t)) graph.addNode(t);
      if (!graph.hasEdge(src, t)) graph.addEdge(src, t);
    }
  }
  return graph;
}

function runLouvain(graph) {
  // Try a few API variants to be compatible with different package versions
  let assignments = null;
  try {
    if (typeof louvain === 'function') {
      assignments = louvain(graph);
    }
  } catch (e) {
    // fallthrough
  }

  if (!assignments && louvain && typeof louvain.assign === 'function') {
    // assign may return mapping or set node attributes
    const maybe = louvain.assign(graph);
    if (maybe) assignments = maybe;
  }

  if (!assignments) {
    // Fallback: read `community` attribute from nodes if set
    assignments = {};
    graph.forEachNode((node) => {
      const c = graph.getNodeAttribute(node, 'community');
      if (c !== undefined) assignments[node] = c;
    });
  }

  // If still empty but assign returned undefined, attempt to read attributes again
  if (Object.keys(assignments).length === 0) {
    graph.forEachNode((node) => {
      const c = graph.getNodeAttribute(node, 'community');
      if (c !== undefined) assignments[node] = c;
    });
  }

  return assignments;
}

function summarizeAndWrite(assignments, outFile) {
  const clusterIds = new Set(Object.values(assignments));
  fs.writeFileSync(outFile, JSON.stringify(assignments, null, 2), 'utf8');
  console.log(`Wrote ${outFile} (${Object.keys(assignments).length} classes, ${clusterIds.size} clusters)`);
}

function main() {
  try {
    const deps = loadDependencies(IN_FILE);
    const graph = buildGraph(deps);
    const assignments = runLouvain(graph);
    if (!assignments || Object.keys(assignments).length === 0) {
      console.error('Louvain produced no assignments. Ensure the library is installed and compatible.');
      process.exit(2);
    }
    summarizeAndWrite(assignments, OUT_FILE);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
