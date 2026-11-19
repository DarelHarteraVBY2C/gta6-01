// Solmar Bay HUD: health and armour bars, cash, wanted stars, the mission
// objective, the speedometer, and the minimap in the corner. All drawn on the
// main canvas so screenshots show exactly what the player sees.
import { clamp, money, dist } from './utils.js';
import { CITY_WIDTH, CITY_HEIGHT, AVENUES, STREETS, districtAt } from './city.js';

const MINIMAP_W = 210;
const MINIMAP_H = 160;

/** Draw the full HUD over the game view. */
export function drawHUD(ctx, game, viewW, viewH) {
  const player = game.player;
  const wanted = game.wanted;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Top-left: health, armour, cash.
  drawBar(ctx, 18, 18, 190, 16, player.hp / player.maxHp, '#37d67a', '#12351f', 'HP');
  drawBar(ctx, 18, 40, 190, 12, player.armor / player.maxArmor, '#4da6ff', '#12283f', 'ARMOR');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillText(money(player.cash), 18, 82);
  ctx.fillStyle = '#ffe14d';
  ctx.font = '13px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillText(districtAt(player.x, player.y).toUpperCase(), 18, 100);

  // Top-right: wanted stars.
  ctx.font = '26px "Trebuchet MS", Verdana, sans-serif';
  ctx.textAlign = 'right';
  let stars = '';
  for (let i = 0; i < 5; i += 1) stars += i < wanted.level ? '★' : '☆';
  ctx.fillStyle = wanted.level > 0 ? '#ffcf3d' : 'rgba(255,255,255,0.45)';
  ctx.fillText(stars, viewW - 18, 44);
  ctx.textAlign = 'left';
  if (wanted.level > 0) {
    ctx.fillStyle = '#ff5d5d';
    ctx.font = 'bold 12px "Trebuchet MS", Verdana, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('WANTED', viewW - 18, 62);
    ctx.textAlign = 'left';
  }

  // Top-centre: mission objective banner.
  const objective = game.missions.objectiveText();
  ctx.font = 'bold 15px "Trebuchet MS", Verdana, sans-serif';
  const objW = ctx.measureText(objective).width;
  ctx.fillStyle = 'rgba(10, 14, 24, 0.72)';
  roundRect(ctx, (viewW - objW) / 2 - 14, 12, objW + 28, 30, 6);
  ctx.fill();
  ctx.fillStyle = '#ffe14d';
  ctx.textAlign = 'center';
  ctx.fillText(objective, viewW / 2, 32);
  ctx.textAlign = 'left';

  // Bottom-left: speed and vehicle, or weapon on foot.
  ctx.font = 'bold 22px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillStyle = '#ffffff';
  if (player.inCar) {
    const kmh = Math.round(Math.abs(player.car.speed) * 0.32);
    ctx.fillText(kmh + ' km/h', 18, viewH - 44);
    ctx.fillStyle = '#9fd8ff';
    ctx.font = '13px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText(player.car.def.name + '  •  E: exit car', 18, viewH - 22);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px "Trebuchet MS", Verdana, sans-serif';
    const weapon = player.weapon === 'pistol' ? 'Pistol ' + player.ammo + '/' + player.reserveAmmo : 'Fists';
    ctx.fillText(weapon + '  •  E: steal car   F: punch   Click: shoot', 18, viewH - 22);
  }

  // Centre message (mission complete, warnings, busted/wasted handled by screens).
  if (game.missions.messageTimer > 0 && game.missions.message) {
    ctx.font = 'bold 19px "Trebuchet MS", Verdana, sans-serif';
    const msg = game.missions.message;
    const w = ctx.measureText(msg).width;
    const alpha = clamp(game.missions.messageTimer, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(10, 14, 24, 0.78)';
    roundRect(ctx, (viewW - w) / 2 - 16, viewH - 150, w + 32, 34, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(msg, viewW / 2, viewH - 127);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // Off-screen objective arrow at the screen edge.
  drawObjectiveArrow(ctx, game, viewW, viewH);

  // Minimap, bottom-right.
  drawMinimap(ctx, game, viewW - MINIMAP_W - 14, viewH - MINIMAP_H - 14, MINIMAP_W, MINIMAP_H);

  // Hurt flash.
  if (player.hurtTimer > 0) {
    ctx.fillStyle = 'rgba(255, 30, 30,' + (player.hurtTimer * 0.55) + ')';
    ctx.fillRect(0, 0, viewW, viewH);
  }
  ctx.restore();
}

function drawBar(ctx, x, y, w, h, ratio, fill, bg, label) {
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  if (ratio > 0) {
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, Math.max(8, w * clamp(ratio, 0, 1)), h, 4);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 9px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillText(label, x + 5, y + h - 3);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** An arrow at the screen edge pointing at the current objective. */
function drawObjectiveArrow(ctx, game, viewW, viewH) {
  const marker = game.missions.marker();
  if (!marker) return;
  const cam = game.camera;
  const sx = (marker.x - cam.x) * cam.zoom + viewW / 2;
  const sy = (marker.y - cam.y) * cam.zoom + viewH / 2;
  const margin = 46;
  if (sx > margin && sx < viewW - margin && sy > margin && sy < viewH - margin) return;
  const cx = clamp(sx, margin, viewW - margin);
  const cy = clamp(sy, margin, viewH - margin);
  const angle = Math.atan2(sy - viewH / 2, sx - viewW / 2);
  const d = dist(game.player.x, game.player.y, marker.x, marker.y);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = marker.color;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-10, -11);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-10, 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = marker.color;
  ctx.font = 'bold 12px "Trebuchet MS", Verdana, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(Math.round(d) + 'm', cx, cy + 26);
  ctx.textAlign = 'left';
}

/** The minimap: roads, sea, the player, cars, police and the mission marker. */
export function drawMinimap(ctx, game, x, y, w, h) {
  const sx = w / CITY_WIDTH;
  const sy = h / CITY_HEIGHT;
  ctx.save();
  ctx.fillStyle = 'rgba(8, 12, 20, 0.82)';
  roundRect(ctx, x - 6, y - 6, w + 12, h + 12, 8);
  ctx.fill();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  // Sea and sand.
  ctx.fillStyle = '#1d4e6b';
  ctx.fillRect(x, y + 2380 * sy, w, h - 2380 * sy);
  ctx.fillStyle = '#c9a86a';
  ctx.fillRect(x, y + 2250 * sy, w, 130 * sy);
  // Blocks.
  ctx.fillStyle = '#2c3442';
  ctx.fillRect(x, y, w, h);
  // Roads.
  ctx.fillStyle = '#565e6e';
  for (const a of AVENUES) ctx.fillRect(x, y + (a - 55) * sy, w, 110 * sy);
  for (const s of STREETS) ctx.fillRect(x + (s - 55) * sx, y, 110 * sx, h);
  // Park.
  ctx.fillStyle = '#2f6b3a';
  ctx.fillRect(x + 1520 * sx, y + 1120 * sy, 260 * sx, 260 * sy);
  // Mission marker (pulsing).
  const marker = game.missions.marker();
  if (marker) {
    const pulse = 3 + Math.sin(game.time * 5) * 1.5;
    ctx.fillStyle = marker.color;
    ctx.beginPath();
    ctx.arc(x + marker.x * sx, y + marker.y * sy, pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cash bundles.
  ctx.fillStyle = '#37d67a';
  for (const b of game.missions.cashPickups) {
    if (!b.taken) ctx.fillRect(x + b.x * sx - 1, y + b.y * sy - 1, 2, 2);
  }
  // Traffic dots.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const car of game.cars) {
    if (car.dead || car.driver === 'police') continue;
    ctx.fillRect(x + car.x * sx - 1, y + car.y * sy - 1, 2, 2);
  }
  // Police (flashing red/blue).
  const flash = Math.floor(game.time * 6) % 2 === 0;
  ctx.fillStyle = flash ? '#ff3b30' : '#3b82ff';
  for (const car of game.police) {
    if (car.dead) continue;
    ctx.beginPath();
    ctx.arc(x + car.x * sx, y + car.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const px = x + game.player.x * sx;
  const py = y + game.player.y * sy;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(game.player.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Border + label.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 10px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillText('SOLMAR BAY', x + 4, y + 12);
  ctx.restore();
}
