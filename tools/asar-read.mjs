import fs from 'node:fs';
const file = process.argv[2];
process.stdout.write(fs.readFileSync(file, 'utf8'));
