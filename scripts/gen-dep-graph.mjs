// scripts/gen-dep-graph.mjs
import madge from 'madge';
import path from 'node:path';

// ====== INPUT ======
const SRC_DIR = 'src';
const FILE_EXT = ['js'];
// ====================

// Palette neon (bordi dei cluster)
const NEON = [
  '#22D3EE', // cyan
  '#F472B6', // pink
  '#A78BFA', // violet
  '#34D399', // green
  '#F59E0B', // amber
  '#60A5FA', // blue
  '#E879F9', // fuchsia
];

function pickColorFor(name) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return NEON[h % NEON.length];
}
const q = s => `"${String(s).replace(/"/g, '\\"')}"`;
const groupOf = rel => {
  const p = rel.split(/[\\/]/); const i = p[0] === 'src' ? 1 : 0;
  return p[i] ?? 'root';
};
const fileName = rel => path.basename(rel);

(async () => {
  const res = await madge(SRC_DIR, {
    fileExtensions: FILE_EXT,
    baseDir: '.',
    excludeRegExp: [/node_modules/, /(dist|build)/, /\.test\./, /\.spec\./],
  });

  const graph = res.obj();
  const nodes = new Set(Object.keys(graph));
  Object.values(graph).forEach(ds => ds.forEach(d => nodes.add(d)));

  // cluster -> nodes
  const clusters = new Map();
  for (const n of nodes) {
    const g = groupOf(n);
    if (!clusters.has(g)) clusters.set(g, new Set());
    clusters.get(g).add(n);
  }

  // ====== STYLE (futuristic + minimal) ======
  const BG         = '#0B0F19';   // quasi-nero blu
  const NODE_FILL  = '#0F172A';   // card scura
  const NODE_STROKE= '#1F2937';   // bordo sottile
  const NODE_FONT  = '#E5E7EB';   // testo chiaro
  const EDGE_COLOR = '#94A3B8';   // grigio-azzurro
  const ARROW      = 'vee';
  const FONT       = 'Inter,SF Pro Text,Segoe UI,Arial';
  // ==========================================

  let dot = '';
  dot += 'digraph G {\n';
  dot += `  graph [bgcolor="${BG}", rankdir=LR, splines=true, pad="0.6", nodesep="0.45", ranksep="0.7"];\n`;
  dot += `  node  [shape=box, style="rounded,filled", fillcolor="${NODE_FILL}", color="${NODE_STROKE}", penwidth=1.2, fontcolor="${NODE_FONT}", fontname=${q(FONT)}, fontsize=15, margin="0.14,0.06"];\n`;
  dot += `  edge  [color="${EDGE_COLOR}", arrowsize=0.7, arrowhead=${ARROW}, penwidth=1.2, fontname=${q(FONT)}];\n\n`;

  // clusters con bordo neon e senza riempimento
  for (const [group, set] of clusters.entries()) {
    const cname = `cluster_${group.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const neon  = pickColorFor(group);
    dot += `  subgraph ${cname} {\n`;
    dot += `    label=${q(group)}; labelloc="t"; labeljust="l"; fontsize=18; fontcolor="${NODE_FONT}";\n`;
    dot += `    style="rounded"; color="${neon}"; penwidth=2.2; margin=22;\n`;
    for (const n of set) {
      dot += `    ${q(n)} [label=${q(fileName(n))}, tooltip=${q(n)}];\n`;
    }
    dot += '  }\n\n';
  }

  // archi
  for (const [from, deps] of Object.entries(graph)) {
    for (const to of deps) dot += `  ${q(from)} -> ${q(to)};\n`;
  }

  dot += '}\n';
  process.stdout.write(dot);
})();
