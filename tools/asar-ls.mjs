import fs from 'node:fs';
const dir = process.argv[2];
const items = fs.readdirSync(dir, { withFileTypes: true });
for (const it of items) {
  let size = '';
  try { size = it.isFile() ? fs.statSync(dir + '/' + it.name).size : '<dir>'; } catch { }
  console.log((it.isDirectory() ? 'D ' : 'F ') + it.name + '  ' + size);
}
