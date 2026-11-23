// Solmar Bay collectibles: ten hidden packages stashed around the city and
// four shotgun shell crates at the fight spots. Packages pay $150 each and
// show a counter on the HUD; the first shell crate hands Danny the shotgun,
// so the new weapon is discoverable in free roam too, not just in the heist.
import { dist } from './utils.js';

// Ten stashes, one per corner of the city: every spot sits on a road line
// or on the open beach, never inside a building, so all ten are reachable.
export const HIDDEN_PACKAGES = [
  { x: 250, y: 250 }, // Old Town, north-west corner
  { x: 1050, y: 250 }, // Downtown, north edge
  { x: 2250, y: 250 }, // Downtown, north-east corner
  { x: 3050, y: 650 }, // Harbor Port, north gate
  { x: 650, y: 1050 }, // Palm Heights, west edge
  { x: 1850, y: 1450 }, // Casino Row, south edge
  { x: 2650, y: 1850 }, // Harbor Port, mid docks
  { x: 1050, y: 2250 }, // Boardwalk, west end
  { x: 2250, y: 2250 }, // Boardwalk, east end
  { x: 450, y: 2450 }, // the beach, buried in the sand
];

// Shell crates at the four big fight spots: the docks, the bank, the
// Harbor vault and Casino Row.
export const AMMO_CRATES = [
  { x: 3050, y: 1450 }, // the docks (Payback)
  { x: 1850, y: 1050 }, // Solmar Bank (The Big Score)
  { x: 3200, y: 1850 }, // the Harbor vault (The Harbor Heist)
  { x: 2250, y: 650 }, // Casino Row (Hot Wheels)
];

export class Collectibles {
  constructor() {
    this.packages = HIDDEN_PACKAGES.map((p) => ({ x: p.x, y: p.y, taken: false }));
    this.crates = AMMO_CRATES.map((c) => ({ x: c.x, y: c.y, taken: false }));
    this.packagesFound = 0;
  }

  /** Walk-over pickup checks, called once per simulation step. */
  update(game) {
    const player = game.player;
    for (const pack of this.packages) {
      if (pack.taken) continue;
      if (dist(player.x, player.y, pack.x, pack.y) < 34) {
        pack.taken = true;
        this.packagesFound += 1;
        player.cash += 150;
        game.audio.pickup();
        game.missions.showMessage(
          'Hidden package ' + this.packagesFound + '/10  +$150' +
          (this.packagesFound === 10 ? ' — all ten found. Vera is impressed.' : ''),
          3,
        );
      }
    }
    for (const crate of this.crates) {
      if (crate.taken) continue;
      if (dist(player.x, player.y, crate.x, crate.y) < 40) {
        crate.taken = true;
        const firstGun = player.weapon !== 'shotgun';
        player.giveShotgun(12);
        game.audio.pickup();
        game.missions.showMessage(
          firstGun ? 'Found a shotgun! 12 shells — click to fire.' : 'Shotgun shells  +12',
          3,
        );
      }
    }
  }
}

/** Draw packages (a faint glint from afar, the full parcel up close) and
 * the shell crates (always visible: they are supply crates, not hidden). */
export function drawCollectibles(ctx, game) {
  const player = game.player;
  const near = 260;
  for (const pack of game.collectibles.packages) {
    if (pack.taken) continue;
    const d = dist(player.x, player.y, pack.x, pack.y);
    const pulse = 0.6 + Math.sin(game.time * 3 + pack.x) * 0.4;
    if (d < near) {
      // The parcel: gold box, dark ribbon, bow.
      ctx.fillStyle = '#e8b73a';
      ctx.fillRect(pack.x - 9, pack.y - 6, 18, 12);
      ctx.fillStyle = '#7a1f1f';
      ctx.fillRect(pack.x - 2, pack.y - 6, 4, 12);
      ctx.fillStyle = '#7a1f1f';
      ctx.beginPath();
      ctx.arc(pack.x, pack.y - 6, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // A faint gold glint, so a sharp eye can spot the stash from afar.
      ctx.save();
      ctx.globalAlpha = 0.35 * pulse + 0.25;
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      ctx.moveTo(pack.x, pack.y - 6);
      ctx.lineTo(pack.x + 5, pack.y);
      ctx.lineTo(pack.x, pack.y + 6);
      ctx.lineTo(pack.x - 5, pack.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  for (const crate of game.collectibles.crates) {
    if (crate.taken) continue;
    ctx.fillStyle = '#3d5a3a';
    ctx.fillRect(crate.x - 12, crate.y - 9, 24, 18);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(crate.x - 12, crate.y - 9, 24, 18);
    ctx.fillStyle = '#c9d67a';
    ctx.fillRect(crate.x - 12, crate.y - 2, 24, 3);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px "Trebuchet MS", Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('12', crate.x, crate.y + 7);
    ctx.textAlign = 'left';
  }
}
