/**
 * One-off maintenance: inspect the usage_billing domain directory, report every
 * record's stamp, and (with --apply) delete only v1-era leftovers and the
 * invalid-record backups created before the tolerant schema fix. v2 ledger data
 * is never touched.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = 'C:/Users/Hp/.dsh/storages/usage_billing';
const apply = process.argv.includes('--apply');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(root);
const report = { v2: [], v1: [], backup: [], foreign: [] };
const doomed = [];
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (file.endsWith('.bak') || /\.bak\.\d+/.test(file)) {
    report.backup.push(rel);
    doomed.push(file);
    continue;
  }
  let document;
  try {
    document = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    report.foreign.push(rel);
    continue;
  }
  const stamp = document?.version;
  if (stamp === 2) report.v2.push(rel);
  else if (stamp === 1) { report.v1.push(rel); doomed.push(file); }
  else report.foreign.push(rel);
}

// v1-only tables are not declared by the v2 domain at all.
for (const legacy of ['ledger_shards', 'folds']) {
  const dir = path.join(root, legacy);
  if (fs.existsSync(dir)) {
    for (const file of walk(dir)) { report.v1.push(path.relative(root, file).replace(/\\/g, '/')); doomed.push(file); }
    if (apply) fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log('v2 records kept:', report.v2.length);
console.log('v1 records removed:', report.v1.length);
console.log('invalid-record backups removed:', report.backup.length);
if (report.foreign.length > 0) console.log('unrecognized (kept):', report.foreign);
if (apply) {
  for (const file of doomed) {
    if (!fs.existsSync(file)) continue;
    fs.rmSync(file, { force: true });
  }
  // Snapshot/v1 leftovers may leave empty legacy table dirs behind.
  for (const legacy of ['ledger_shards', 'folds']) {
    const dir = path.join(root, legacy);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log('applied: removed', doomed.length, 'legacy/backup files');
} else {
  console.log('dry run; pass --apply to delete');
}
