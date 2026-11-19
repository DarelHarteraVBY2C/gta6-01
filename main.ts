// Solmar Bay: Sunset Hustle — the gta6-01 entry program (Node 22, stdlib only).
//
// The game is plain static files under game/ (index.html plus ES modules, no
// library, no network request), and the screenshots are real renders of it.
// This program hands the entry in: it copies game/ and screenshots/ from
// beside this file into the output directory and writes dossier.json with the
// vendored make.fun library, so the judge can read the game from the dossier.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Copy a directory tree when it exists; fail loudly when a required one is missing. */
function copyTree(name, required) {
  const src = join(here, name);
  if (!existsSync(src)) {
    if (required) throw new Error('missing required directory: ' + src);
    return;
  }
  cpSync(src, join(out, name), { recursive: true });
}

/** Refuse an entry the gate would refuse, before writing the dossier. */
function checkCaps() {
  const shots = join(here, 'screenshots');
  const names = existsSync(shots) ? readdirSync(shots).filter((n) => !n.startsWith('.')) : [];
  if (names.length < 3 || names.length > 4) {
    throw new Error('screenshots/ must hold 3 or 4 images, found ' + names.length);
  }
  for (const name of names) {
    const bytes = statSync(join(shots, name)).size;
    if (bytes > 256 * 1024) throw new Error('screenshot over 256 KiB: ' + name);
  }
}

checkCaps();
mkdirSync(out, { recursive: true });
copyTree('game', true);
copyTree('screenshots', true);

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// dossier's bytes; the rest refuse an entry the scorer would refuse (more than
// 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files in all; a path under game/ over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
