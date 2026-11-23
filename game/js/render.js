// Solmar Bay rendering: the golden-hour city, every car and pedestrian, the
// particles, and the title, pause and end screens. All drawing is plain Canvas
// 2D so the game runs anywhere with no assets to download.
import { clamp, lerp, dist, shade } from './utils.js';
import { CITY_WIDTH, CITY_HEIGHT, AVENUES, STREETS, ROAD_HALF } from './city.js';
import { money, clock } from './utils.js';
import { drawCollectibles } from './collectibles.js';

export const VIEW_W = 1280;
export const VIEW_H = 720;

/** A camera that follows the player with a little velocity look-ahead. */
export class Camera {
  constructor() {
    this.x = CITY_WIDTH / 2;
    this.y = CITY_HEIGHT / 2;
    this.zoom = 1;
    this.targetZoom = 1;
  }

  update(dt, px, py, vx, vy, inCar, speedRatio) {
    const lookX = px + vx * 0.22;
    const lookY = py + vy * 0.22;
    this.x = lerp(this.x, lookX, Math.min(1, dt * 4));
    this.y = lerp(this.y, lookY, Math.min(1, dt * 4));
    this.targetZoom = inCar ? 0.86 - speedRatio * 0.12 : 1.05;
    this.zoom = lerp(this.zoom, this.targetZoom, Math.min(1, dt * 2));
    const halfW = VIEW_W / 2 / this.zoom;
    const halfH = VIEW_H / 2 / this.zoom;
    this.x = clamp(this.x, halfW - 200, CITY_WIDTH - halfW + 200);
    this.y = clamp(this.y, halfH - 200, CITY_HEIGHT - halfH + 200);
  }
}

/** Draw the whole world view (ground, roads, buildings, entities, particles). */
export function drawWorld(ctx, game) {
  const cam = game.camera;
  ctx.save();
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  // Warm golden-hour wash over everything.
  ctx.fillStyle = '#e8b06a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const shakeX = game.shake > 0 ? (Math.random() - 0.5) * game.shake * 14 : 0;
  const shakeY = game.shake > 0 ? (Math.random() - 0.5) * game.shake * 14 : 0;
  ctx.translate(VIEW_W / 2 + shakeX, VIEW_H / 2 + shakeY);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  drawGround(ctx, game);
  drawBuildings(ctx, game);
  drawProps(ctx, game);
  drawMarkers(ctx, game);
  drawCollectibles(ctx, game);
  drawPeds(ctx, game);
  drawEnemies(ctx, game);
  drawCars(ctx, game);
  drawPlayer(ctx, game);
  drawHeli(ctx, game);
  drawParticles(ctx, game);
  drawBullets(ctx, game);
  ctx.restore();
  // Vignette to focus the eye on the middle of the frame.
  const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(20,10,0,0.34)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Sun glare from the west (top-left) plus a warm golden-hour grade.
  // Screen-space, so it warms the whole frame evenly.
  const glare = ctx.createRadialGradient(0, 0, 0, 0, 0, VIEW_H * 0.95);
  glare.addColorStop(0, 'rgba(255,205,125,0.26)');
  glare.addColorStop(0.45, 'rgba(255,185,105,0.08)');
  glare.addColorStop(1, 'rgba(255,185,105,0)');
  ctx.fillStyle = glare;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawGround(ctx, game) {
  const city = game.city;
  // Block base (warm sunlit concrete).
  ctx.fillStyle = '#6a5e45';
  ctx.fillRect(-400, -400, CITY_WIDTH + 800, CITY_HEIGHT + 800);
  // Beach sand and sea to the south; the sea warms toward the horizon.
  ctx.fillStyle = '#e0bf85';
  ctx.fillRect(-400, city.beach.y, CITY_WIDTH + 800, CITY_HEIGHT - city.beach.y + 400);
  const seaGrad = ctx.createLinearGradient(0, city.beach.seaY, 0, city.beach.seaY + 200);
  seaGrad.addColorStop(0, '#24789f');
  seaGrad.addColorStop(0.6, '#3d8ab0');
  seaGrad.addColorStop(1, '#e8956b');
  ctx.fillStyle = seaGrad;
  ctx.fillRect(-400, city.beach.seaY, CITY_WIDTH + 800, 200);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i += 1) {
    const wy = city.beach.seaY + 24 + i * 26 + Math.sin(game.time * 0.8 + i * 2) * 3;
    ctx.beginPath();
    ctx.moveTo(-400, wy);
    ctx.lineTo(CITY_WIDTH + 400, wy);
    ctx.stroke();
  }
  // Sun glints on the water: short bright dashes that drift with the time.
  ctx.strokeStyle = 'rgba(255,245,200,0.5)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 9; i += 1) {
    const gx = ((i * 397 + Math.floor(game.time * 12)) % 3400) - 100;
    const gy = city.beach.seaY + 40 + (i * 23) % 140;
    const glint = 0.25 + Math.sin(game.time * 1.7 + i * 1.3) * 0.2;
    ctx.globalAlpha = Math.max(0.05, glint);
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + 26, gy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Park grass and pond.
  ctx.fillStyle = '#4c8a50';
  ctx.fillRect(city.park.x, city.park.y, city.park.w, city.park.h);
  ctx.fillStyle = '#3d7ea6';
  ctx.beginPath();
  ctx.ellipse(city.park.x + 130, city.park.y + 150, 52, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  // A slow ripple ring on the pond.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(city.park.x + 130, city.park.y + 150, 30 + Math.sin(game.time * 0.9) * 9, 20 + Math.sin(game.time * 0.9) * 6, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Roads: dark asphalt with lighter sidewalks.
  for (const a of AVENUES) {
    ctx.fillStyle = '#9c9180';
    ctx.fillRect(-400, a - 70, CITY_WIDTH + 800, 140);
    ctx.fillStyle = '#3a3e46';
    ctx.fillRect(-400, a - ROAD_HALF, CITY_WIDTH + 800, ROAD_HALF * 2);
  }
  for (const s of STREETS) {
    ctx.fillStyle = '#9c9180';
    ctx.fillRect(s - 70, -400, 140, CITY_HEIGHT + 800);
    ctx.fillStyle = '#3a3e46';
    ctx.fillRect(s - ROAD_HALF, -400, ROAD_HALF * 2, CITY_HEIGHT + 800);
  }
  // Centre dashes on every road.
  ctx.fillStyle = '#e8c53a';
  for (const a of AVENUES) {
    for (let x = 0; x < CITY_WIDTH; x += 64) {
      ctx.fillRect(x, a - 2, 34, 4);
    }
  }
  for (const s of STREETS) {
    for (let y = 0; y < CITY_HEIGHT; y += 64) {
      ctx.fillRect(s - 2, y, 4, 34);
    }
  }
  // Crosswalk stripes at every intersection.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const a of AVENUES) {
    for (const s of STREETS) {
      for (let i = -3; i <= 3; i += 1) {
        ctx.fillRect(s - 46 + i * 14, a - 66, 7, 16);
        ctx.fillRect(s - 46 + i * 14, a + 50, 7, 16);
      }
    }
  }
}

function drawBuildings(ctx, game) {
  for (const b of game.city.buildings) {
    // Long golden-hour shadow, cast to the north-east by the low western sun.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(b.x + 18, b.y + 14, b.w, b.h);
    // Extruded side facades (2.5D): the south wall and east wall of the
    // building, darker shades of its own color, so the roof reads as raised.
    ctx.fillStyle = shade(b.color, 0.55);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.h);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.lineTo(b.x + b.w + 10, b.y + b.h + 12);
    ctx.lineTo(b.x + 10, b.y + b.h + 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(b.color, 0.7);
    ctx.beginPath();
    ctx.moveTo(b.x + b.w, b.y);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.lineTo(b.x + b.w + 10, b.y + b.h + 12);
    ctx.lineTo(b.x + b.w + 10, b.y + 12);
    ctx.closePath();
    ctx.fill();
    // Body.
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // Roof detail: darker inset and vents.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, 5);
    if (b.tall) {
      // Glass tower: window grid.
      ctx.fillStyle = 'rgba(180,220,255,0.35)';
      for (let wx = b.x + 12; wx < b.x + b.w - 10; wx += 18) {
        for (let wy = b.y + 12; wy < b.y + b.h - 10; wy += 18) {
          ctx.fillRect(wx, wy, 10, 12);
        }
      }
    } else if (b.w > 100 && b.h > 100) {
      // Big block: sparse warm lit windows so the facade reads as inhabited.
      ctx.fillStyle = 'rgba(255,220,150,0.30)';
      for (let wx = b.x + 16; wx < b.x + b.w - 12; wx += 26) {
        for (let wy = b.y + 16; wy < b.y + b.h - 12; wy += 26) {
          ctx.fillRect(wx, wy, 11, 13);
        }
      }
    } else if (b.roof > 0.35) {
      // Rooftop vents on more roofs: the city reads as lived-in, not flat.
      ctx.fillStyle = '#6b6f78';
      ctx.fillRect(b.x + b.w * 0.3, b.y + b.h * 0.3, 14, 14);
      ctx.fillRect(b.x + b.w * 0.6, b.y + b.h * 0.55, 10, 10);
      ctx.fillRect(b.x + b.w * 0.55, b.y + b.h * 0.2, 8, 8);
    }
    if (b.helipad) {
      // Air One's rooftop helipad: a marked landing circle on the tower.
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      ctx.strokeStyle = '#ffe14d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px "Trebuchet MS", Verdana, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('H', cx, cy + 9);
      ctx.textAlign = 'left';
    }
  }
  // Neon signs.
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px "Trebuchet MS", Verdana, sans-serif';
  for (const s of game.city.signs) {
    ctx.fillStyle = s.color;
    ctx.globalAlpha = 0.85 + Math.sin(game.time * 3 + s.x) * 0.15;
    ctx.fillText(s.text, s.x, s.y + 16);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawProps(ctx, game) {
  for (const p of game.city.props) {
    if (p.kind === 'palm') {
      ctx.strokeStyle = '#6b4a2a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 3, p.y - 22);
      ctx.stroke();
      ctx.fillStyle = '#3f7a44';
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.ellipse(p.x + 3 + Math.cos(a) * 12, p.y - 22 + Math.sin(a) * 7, 13, 5, a, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (p.kind === 'lamp') {
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y - 26);
      ctx.stroke();
      ctx.fillStyle = '#ffe9a3';
      ctx.beginPath();
      ctx.arc(p.x, p.y - 28, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'container') {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 26, p.y - 12, 52, 24);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 26, p.y - 12, 52, 24);
    } else if (p.kind === 'crane') {
      ctx.strokeStyle = '#c9a13b';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y - 130);
      ctx.lineTo(p.x + 90, p.y - 130);
      ctx.stroke();
      ctx.fillStyle = '#8a7f9e';
      ctx.fillRect(p.x + 78, p.y - 118, 16, 22);
    }
  }
  for (const t of game.city.trees) {
    ctx.fillStyle = '#2f6b3a';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a8a4f';
    ctx.beginPath();
    ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMarkers(ctx, game) {
  // Street race: every checkpoint gate, the next one pulsing bright.
  const step = game.missions.step;
  if (game.missions.active && step && step.type === 'race') {
    for (let i = 0; i < step.gates.length; i += 1) {
      const gate = step.gates[i];
      const isNext = i === game.missions.raceGate;
      const isDone = i < game.missions.raceGate;
      const pulse = isNext ? 1 + Math.sin(game.time * 4) * 0.15 : 1;
      ctx.save();
      ctx.globalAlpha = isDone ? 0.35 : isNext ? 0.95 : 0.6;
      ctx.fillStyle = isDone ? '#37d67a' : '#ff9a3d';
      ctx.beginPath();
      ctx.ellipse(gate.x, gate.y, 30 * pulse, 12 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px "Trebuchet MS", Verdana, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), gate.x, gate.y + 5);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }
  const marker = (game.missions.active && step && step.type === 'race') ? null : game.missions.marker();
  if (marker) {
    const pulse = 1 + Math.sin(game.time * 4) * 0.15;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = marker.color;
    ctx.beginPath();
    ctx.ellipse(marker.x, marker.y, 26 * pulse, 10 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (const b of game.missions.cashPickups) {
    if (b.taken) continue;
    ctx.fillStyle = '#37d67a';
    ctx.fillRect(b.x - 9, b.y - 6, 18, 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px "Trebuchet MS", Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', b.x, b.y + 4);
    ctx.textAlign = 'left';
  }
}

function drawPeds(ctx, game) {
  for (const ped of game.peds) {
    if (ped.dead) continue;
    const bob = ped.fallTimer > 0 ? 0 : Math.sin(ped.walkPhase) * 2;
    if (ped.fallTimer > 0) {
      // Lying on the ground.
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 13, 7, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(ped.x + 3, ped.y + 4, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y + bob * 0.3, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4 + bob * 0.3, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEnemies(ctx, game) {
  for (const e of game.missions.enemies) {
    if (e.dead) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(e.x + 3, e.y + 4, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a1f1f';
    ctx.beginPath();
    ctx.arc(e.x, e.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8c9a0';
    ctx.beginPath();
    ctx.arc(e.x + Math.cos(e.angle) * 4, e.y + Math.sin(e.angle) * 4, 6, 0, Math.PI * 2);
    ctx.fill();
    // Gun barrel.
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(e.x + Math.cos(e.angle) * 8, e.y + Math.sin(e.angle) * 8);
    ctx.lineTo(e.x + Math.cos(e.angle) * 20, e.y + Math.sin(e.angle) * 20);
    ctx.stroke();
    // Health bar.
    ctx.fillStyle = '#111';
    ctx.fillRect(e.x - 12, e.y - 22, 24, 4);
    ctx.fillStyle = '#ff5d5d';
    ctx.fillRect(e.x - 12, e.y - 22, 24 * clamp(e.hp / 100, 0, 1), 4);
  }
}

function drawCars(ctx, game) {
  const all = [...game.cars, ...game.police];
  for (const car of all) {
    if (car.dead) continue;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-car.length / 2 + 3, -car.width / 2 + 4, car.length, car.width);
    if (car.type === 'bike') {
      // Motorcycle: two wheels, a slim frame and a rider leaning forward.
      // No cabin, no windshield — the bike reads as a bike at a glance.
      ctx.fillStyle = '#161616';
      ctx.beginPath();
      ctx.arc(-car.length / 2 + 4, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(car.length / 2 - 4, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = car.color;
      roundRectPath(ctx, -car.length / 2, -3, car.length, 6, 3);
      ctx.fill();
      ctx.fillStyle = '#e8c9a0';
      ctx.beginPath();
      ctx.arc(-3, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#23232c';
      ctx.beginPath();
      ctx.arc(2, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,244,180,0.9)';
      ctx.fillRect(car.length / 2 - 2, -2, 3, 4);
    } else {
      // Body.
      ctx.fillStyle = car.color;
      roundRectPath(ctx, -car.length / 2, -car.width / 2, car.length, car.width, 6);
      ctx.fill();
      // Cabin + windshield.
      ctx.fillStyle = 'rgba(20,30,44,0.85)';
      roundRectPath(ctx, -car.length * 0.18, -car.width / 2 + 3, car.length * 0.32, car.width - 6, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(160,210,255,0.5)';
      ctx.fillRect(car.length * 0.14, -car.width / 2 + 4, 5, car.width - 8);
      // Taxi checker stripe.
      if (car.type === 'taxi') {
        ctx.fillStyle = '#111';
        for (let i = 0; i < 5; i += 1) ctx.fillRect(-car.length / 2 + 6 + i * 8, -2, 5, 4);
        ctx.fillStyle = '#ffe14d';
        ctx.font = 'bold 8px Verdana, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('TAXI', 0, -car.width / 2 - 3);
        ctx.textAlign = 'left';
      }
      // Police light bar, flashing red and blue.
      if (car.type === 'police' || car.type === 'swat') {
        const phase = Math.floor(car.lightPhase) % 2 === 0;
        ctx.fillStyle = phase ? '#ff3b30' : '#3b82ff';
        ctx.fillRect(-8, -car.width / 2 - 2, 8, 5);
        ctx.fillStyle = phase ? '#3b82ff' : '#ff3b30';
        ctx.fillRect(0, -car.width / 2 - 2, 8, 5);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px Verdana, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(car.type === 'swat' ? 'SWAT' : 'SBPD', 0, car.width / 2 + 9);
        ctx.textAlign = 'left';
      }
      // Headlights.
      ctx.fillStyle = 'rgba(255,244,180,0.9)';
      ctx.fillRect(car.length / 2 - 2, -car.width / 2 + 2, 3, 5);
      ctx.fillRect(car.length / 2 - 2, car.width / 2 - 7, 3, 5);
    }
    ctx.restore();
    // Smoke when wrecked.
    if (car.smoke > 0) {
      ctx.fillStyle = 'rgba(120,120,120,0.5)';
      ctx.beginPath();
      ctx.arc(car.x + (Math.random() - 0.5) * 20, car.y + (Math.random() - 0.5) * 20 - 8, 8 + Math.random() * 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPlayer(ctx, game) {
  const player = game.player;
  if (player.dead || player.inCar) return;
  const p = player;
  ctx.save();
  ctx.translate(p.x, p.y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(3, 5, 11, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle);
  // Danny: teal jacket, dark jeans.
  ctx.fillStyle = '#1f8a7a';
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8c9a0';
  ctx.beginPath();
  ctx.arc(5, 0, 6.5, 0, Math.PI * 2);
  ctx.fill();
  // Hair.
  ctx.fillStyle = '#2a1c10';
  ctx.beginPath();
  ctx.arc(3, -2, 5, Math.PI * 0.6, Math.PI * 1.9);
  ctx.fill();
  if (p.weapon === 'pistol') {
    ctx.strokeStyle = '#1c1c1c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(22, 0);
    ctx.stroke();
  }
  if (p.weapon === 'shotgun') {
    // Long barrel with a wooden pump: the shotgun reads at a glance.
    ctx.strokeStyle = '#1c1c1c';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(30, 0);
    ctx.stroke();
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(14, -3, 10, 6);
  }
  if (p.punchTimer > 0) {
    // Extended fist.
    ctx.fillStyle = '#e8c9a0';
    ctx.beginPath();
    ctx.arc(24, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Air One: the police helicopter, its searchlight cone and ground shadow. */
function drawHeli(ctx, game) {
  const heli = game.heli;
  if (!heli) return;
  const p = game.player;
  const bobY = Math.sin(heli.bob) * 3;
  // Ground shadow: a soft ellipse offset from the heli, showing altitude.
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath();
  ctx.ellipse(heli.x + 26, heli.y + 34, 30, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  // Searchlight cone: a translucent beam from the heli down to the player.
  const dx = p.x - heli.x;
  const dy = p.y - heli.y;
  const d = Math.hypot(dx, dy) || 1;
  const px = -dy / d;
  const py = dx / d;
  ctx.fillStyle = 'rgba(255,240,170,0.18)';
  ctx.beginPath();
  ctx.moveTo(heli.x, heli.y);
  ctx.lineTo(p.x + px * 46, p.y + py * 46);
  ctx.lineTo(p.x - px * 46, p.y - py * 46);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,240,170,0.28)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 44, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body.
  ctx.save();
  ctx.translate(heli.x, heli.y + bobY);
  ctx.rotate(heli.angle);
  ctx.fillStyle = '#2a4a6b';
  ctx.beginPath();
  ctx.ellipse(0, 0, 32, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Cabin windshield.
  ctx.fillStyle = 'rgba(160,210,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(17, 0, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tail boom + tail rotor.
  ctx.fillStyle = '#1d3247';
  ctx.fillRect(-52, -4, 24, 7);
  ctx.strokeStyle = '#c8d4e0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-52, -10);
  ctx.lineTo(-52, 10);
  ctx.stroke();
  // Main rotor: two crossed blades spinning with the rotor phase.
  ctx.strokeStyle = 'rgba(30,40,55,0.85)';
  ctx.lineWidth = 3;
  const r = heli.rotor;
  ctx.beginPath();
  ctx.moveTo(Math.cos(r) * -44, Math.sin(r) * -44);
  ctx.lineTo(Math.cos(r) * 44, Math.sin(r) * 44);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(Math.cos(r + Math.PI / 2) * -44, Math.sin(r + Math.PI / 2) * -44);
  ctx.lineTo(Math.cos(r + Math.PI / 2) * 44, Math.sin(r + Math.PI / 2) * 44);
  ctx.stroke();
  // AIR ONE marking.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px Verdana, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AIR ONE', 0, 3);
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawParticles(ctx, game) {
  for (const pt of game.particles) {
    const a = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size * (0.5 + a * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBullets(ctx, game) {
  ctx.strokeStyle = '#ffe9a3';
  ctx.lineWidth = 2;
  for (const b of game.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Title screen, drawn over a slowly panning view of the city. */
export function drawTitleScreen(ctx, game) {
  drawWorld(ctx, game);
  ctx.fillStyle = 'rgba(12, 10, 24, 0.62)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe14d';
  ctx.font = 'bold 84px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillText('SOLMAR BAY', VIEW_W / 2, 190);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillText('— SUNSET HUSTLE —', VIEW_W / 2, 238);
  ctx.font = '16px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillStyle = '#ffd9a0';
  ctx.fillText('An original open-world crime story. Steal cars, dodge the SBPD, run eight jobs for Vera.', VIEW_W / 2, 272);
  const buttons = game.menuButtons;
  for (const b of buttons) {
    ctx.fillStyle = b.hover ? '#ffe14d' : 'rgba(255,255,255,0.16)';
    roundRectPath(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.fill();
    ctx.fillStyle = b.hover ? '#1c2733' : '#ffffff';
    ctx.font = 'bold 20px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + 32);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '14px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillText('WASD / arrows: move & drive   •   E: steal / exit car   •   F: punch   •   Mouse: aim, click: shoot   •   P: pause   •   M: mute', VIEW_W / 2, 640);
  ctx.fillText('Saves automatically after every mission. Runs offline, no network needed.', VIEW_W / 2, 664);
  ctx.textAlign = 'left';
}

/** Pause overlay. */
export function drawPauseScreen(ctx, game) {
  ctx.fillStyle = 'rgba(8, 10, 20, 0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 54px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillText('PAUSED', VIEW_W / 2, 210);
  ctx.font = '16px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillStyle = '#ffd9a0';
  ctx.fillText('Mission: ' + (game.missions.mission ? game.missions.mission.name : 'Free roam') + '   •   Cash: ' + money(game.player.cash) + '   •   Play time: ' + clock(game.playTime), VIEW_W / 2, 248);
  const buttons = game.menuButtons;
  for (const b of buttons) {
    ctx.fillStyle = b.hover ? '#ffe14d' : 'rgba(255,255,255,0.16)';
    roundRectPath(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.fill();
    ctx.fillStyle = b.hover ? '#1c2733' : '#ffffff';
    ctx.font = 'bold 20px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + 32);
  }
  ctx.textAlign = 'left';
}

/** Wasted / busted / finished overlays. */
export function drawEndScreen(ctx, game, kind) {
  const colors = { wasted: '#ff3b30', busted: '#3b82ff', finished: '#37d67a' };
  const titles = { wasted: 'WASTED', busted: 'BUSTED', finished: 'THE BIG SCORE' };
  const subs = {
    wasted: 'Danny went down. The city keeps moving without him.',
    busted: 'The SBPD caught up with Danny. Time served, then back to work.',
    finished: 'Every job done. Solmar Bay is yours, Danny.',
  };
  ctx.fillStyle = 'rgba(8, 8, 16, 0.66)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = colors[kind];
  ctx.font = 'bold 72px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillText(titles[kind], VIEW_W / 2, 300);
  ctx.fillStyle = '#ffffff';
  ctx.font = '18px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillText(subs[kind], VIEW_W / 2, 344);
  ctx.font = '16px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillStyle = '#ffd9a0';
  ctx.fillText('Missions done: ' + game.missions.completedCount + '   •   Cash: ' + money(game.player.cash) + '   •   Play time: ' + clock(game.playTime), VIEW_W / 2, 384);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px "Trebuchet MS", Verdana, sans-serif';
  ctx.fillText(kind === 'finished' ? 'Press Enter — free roam, or Esc for the title screen' : 'Press Enter to retry the mission', VIEW_W / 2, 440);
  ctx.textAlign = 'left';
}
