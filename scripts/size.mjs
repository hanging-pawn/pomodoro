/* global console, process */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const LIMIT = 200 * 1024;
let total = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else total += gzipSync(readFileSync(p)).length;
  }
};
walk('dist');
console.log(
  `Bundle size (gzip): ${(total / 1024).toFixed(2)} kB (limit 200 kB)`,
);
if (total >= LIMIT) process.exit(1);
