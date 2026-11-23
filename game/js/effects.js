// Solmar Bay juice: the feel layer. One object owns the screen shake, the
// muzzle flashes, the skidmarks a drifting car leaves on the asphalt, and
// the per-kind particle behaviour (sparks streak, smoke rises and grows,
// fire flickers, flashes die in a blink). The game loop feeds it events
// (a shot, a crash, a hard turn); the renderer asks it for the current
// camera offset and draws its marks under the cars.
//
// Shake is proportional on purpose: a pistol tap barely moves the frame,
// a shotgun blast jolts it, an explosion throws it. Everything decays
// fast, so the frame settles before the next beat.
import { clamp } from './utils.js';

const MAX_SKIDS = 320;

/** A skidmark: two dark tyre streaks that fade off the road over seconds. */
function makeSkid(x, y, angle) {
  return { x, y, angle, life: 5, maxLife: 5 };
}

export class Juice {
  constructor() {
    this.shakePower = 0; // 0..1, the camera jolt still ringing
    this.skids = []; // fading tyre marks, oldest first
    this.flashes = []; // muzzle flashes: {x, y, angle, life, big}
  }

  clear() {
    this.shakePower = 0;
    this.skids.length = 0;
    this.flashes.length = 0;
  }

  /** Add a jolt, capped at full power. Shotgun ~0.3, explosion 1.0. */
  kick(amount) {
    this.shakePower = Math.min(1, this.shakePower + amount);
  }

  /** Decay the shake and the flashes; returns the shake for the camera. */
  update(dt) {
    if (this.shakePower > 0) this.shakePower = Math.max(0, this.shakePower - dt * 2.4);
    for (let i = this.flashes.length - 1; i >= 0; i -= 1) {
      this.flashes[i].life -= dt;
      if (this.flashes[i].life <= 0) this.flashes.splice(i, 1);
    }
    for (let i = this.skids.length - 1; i >= 0; i -= 1) {
      this.skids[i].life -= dt;
      if (this.skids[i].life <= 0) this.skids.splice(i, 1);
    }
    return this.shakePower;
  }

  /** Random camera offset, scaled by the current shake. */
  offset() {
    const p = this.shakePower;
    if (p <= 0) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * p * 16, y: (Math.random() - 0.5) * p * 16 };
  }

  /** A bright star at the barrel tip when a gun fires. */
  muzzle(x, y, angle, big) {
    this.flashes.push({ x, y, angle, life: big ? 0.09 : 0.06, big: !!big });
    if (this.flashes.length > 8) this.flashes.shift();
  }

  /**
   * Watch one car for a drift: when it yaws hard while moving fast, lay a
   * pair of tyre marks at its rear wheels. `prevAngle` is the car's heading
   * last step (kept on the car itself, so any car can drift).
   */
  trackSkid(car, dt) {
    if (!car || car.dead || dt <= 0) return;
    const prev = car.prevAngle === undefined ? car.angle : car.prevAngle;
    let yaw = car.angle - prev;
    while (yaw > Math.PI) yaw -= Math.PI * 2;
    while (yaw < -Math.PI) yaw += Math.PI * 2;
    const yawRate = Math.abs(yaw) / dt;
    car.prevAngle = car.angle;
    if (yawRate < 1.7 || Math.abs(car.speed) < 250) return;
    const rearX = car.x - Math.cos(car.angle) * (car.length * 0.32);
    const rearY = car.y - Math.sin(car.angle) * (car.length * 0.32);
    const side = Math.cos(car.angle + Math.PI / 2);
    const sideY = Math.sin(car.angle + Math.PI / 2);
    const half = car.width * 0.32;
    this.skids.push(makeSkid(rearX + side * half, rearY + sideY * half, car.angle));
    this.skids.push(makeSkid(rearX - side * half, rearY - sideY * half, car.angle));
    while (this.skids.length > MAX_SKIDS) this.skids.shift();
  }

  /** Skidmarks go under the cars, straight onto the asphalt. */
  drawSkids(ctx) {
    if (this.skids.length === 0) return;
    ctx.save();
    for (const s of this.skids) {
      const a = clamp(s.life / s.maxLife, 0, 1) * 0.42;
      ctx.strokeStyle = 'rgba(12,12,14,' + a.toFixed(3) + ')';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.angle) * 12, s.y - Math.sin(s.angle) * 12);
      ctx.lineTo(s.x + Math.cos(s.angle) * 12, s.y + Math.sin(s.angle) * 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Muzzle flashes go over the world: a bright four-point star plus a
   * short cone of fire along the barrel. */
  drawFlashes(ctx) {
    if (this.flashes.length === 0) return;
    ctx.save();
    for (const f of this.flashes) {
      const t = clamp(f.life / (f.big ? 0.09 : 0.06), 0, 1);
      const r = (f.big ? 22 : 13) * (0.6 + t * 0.4);
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      ctx.fillStyle = 'rgba(255,233,163,' + (0.55 + t * 0.45).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.45, r * 0.28);
      ctx.lineTo(-r * 0.2, 0);
      ctx.lineTo(-r * 0.45, -r * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,154,61,' + (0.4 + t * 0.4).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(-f.angle);
      ctx.translate(-f.x, -f.y);
    }
    ctx.restore();
  }
}

/**
 * Particle kinds, shared by the spawners in main.js and the renderer:
 * a plain dot fades, a spark streaks and dies fast, smoke drifts up and
 * swells, fire flickers orange while it climbs. Each particle carries its
 * own kind so one list can hold all of them.
 */
export function sparkBurst(list, x, y, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = (speed || 140) * (0.4 + Math.random() * 0.8);
    list.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.3 + Math.random() * 0.15, maxLife: 0.45,
      color: '#ffe9a3', size: 2, kind: 'spark',
    });
  }
}

export function smokePuff(list, x, y, count, big) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 12 + Math.random() * 26;
    list.push({
      x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 14,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s - 22,
      life: 1.1 + Math.random() * 0.5, maxLife: 1.6,
      color: 'rgba(96,96,96,0.55)', size: big ? 9 + Math.random() * 6 : 5 + Math.random() * 4,
      kind: 'smoke',
    });
  }
}

export function fireBurst(list, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 30 + Math.random() * 90;
    list.push({
      x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
      life: 0.45 + Math.random() * 0.3, maxLife: 0.75,
      color: ['#ff9a3d', '#ff5d5d', '#ffd76a'][i % 3], size: 4 + Math.random() * 5,
      kind: 'fire',
    });
  }
}

export function blastBurst(list, x, y) {
  fireBurst(list, x, y, 14);
  smokePuff(list, x, y, 10, true);
  sparkBurst(list, x, y, 12, 260);
}
