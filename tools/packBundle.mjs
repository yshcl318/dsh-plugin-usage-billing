#!/usr/bin/env node
/**
 * Copy the bundle into `dist/` and produce a zip next to it.
 * Kept dependency-free: the archive step shells out to Windows PowerShell's
 * Compress-Archive, which every supported Desktop host has.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'bundle', 'dsh-plugin-usage-billing');
const dist = path.join(root, 'dist');
const staged = path.join(dist, 'dsh-plugin-usage-billing');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
const zip = path.join(dist, `dsh-plugin-usage-billing-${manifest.version}.zip`);

fs.rmSync(staged, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.cpSync(source, staged, { recursive: true });
if (fs.existsSync(zip)) fs.rmSync(zip, { force: true });
execFileSync('powershell.exe', [
  '-NoProfile', '-NonInteractive', '-Command',
  `Compress-Archive -Path '${staged.replace(/'/g, "''")}\\*' -DestinationPath '${zip.replace(/'/g, "''")}' -CompressionLevel Optimal`,
], { stdio: 'inherit' });
console.log('packed:', zip);
