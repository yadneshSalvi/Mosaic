import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const project = new URL('../', import.meta.url);
mkdirSync(new URL('assets/vendor/', project), { recursive: true });
copyFileSync(fileURLToPath(new URL('node_modules/gsap/dist/gsap.min.js', project)), fileURLToPath(new URL('assets/vendor/gsap.min.js', project)));
console.log('Staged pinned local GSAP runtime.');
