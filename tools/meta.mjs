import fs from 'node:fs';
const meta = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const v = meta.versions[process.argv[3] || '1.3.1'];
console.log(JSON.stringify({ name: v.name, version: v.version, dist: v.dist, dependencies: v.dependencies, peerDependencies: v.peerDependencies, dsh: v.dsh, exports: v.exports, files: v.files }, null, 2));
