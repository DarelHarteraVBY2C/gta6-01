// Solmar Bay vehicles: car types, arcade top-down driving physics, parking and
// collisions. Every car on the street — parked, traffic, police or the player's —
// is one of these.
import { clamp, rand, pick, angleLerp, angleDiff, dist, pushCircleOutOfRect } from './utils.js';
import { isOnRoad, randomRoadPoint } from './city.js';

export const CAR_TYPES = {
  sedan: { name: 'Solmar Sedan', color: '#4a7fb5', maxSpeed: 400, accel: 380, turn: 2.7, length: 46, width: 22, hp: 100 },
  coupe: { name: 'Viento Coupe', color: '#c94a4a', maxSpeed: 470, accel: 430, turn: 2.9, length: 44, width: 21, hp: 90 },
  sports: { name: 'Falco GT', color: '#e8b73a', maxSpeed: 560, accel: 520, turn: 3.1, length: 46, width: 22, hp: 85 },
  taxi: { name: 'Bay Taxi', color: '#e8c53a', maxSpeed: 390, accel: 380, turn: 2.7, length: 46, width: 22, hp: 100 },
  van: { name: 'Harbor Van', color: '#7d8a99', maxSpeed: 330, accel: 300, turn: 2.3, length: 54, width: 24, hp: 130 },
  truck: { name: 'Port Truck', color: '#5a6b4a', maxSpeed: 310, accel: 280, turn: 2.1, length: 60, width: 26, hp: 160 },
  police: { name: 'SBPD Cruiser', color: '#1c2733', maxSpeed: 500, accel: 480, turn: 3.0, length: 48, width: 23, hp: 120 },
  swat: { name: 'SBPD SWAT Van', color: '#232a33', maxSpeed: 430, accel: 400, turn: 2.4, length: 56, width: 26, hp: 220 },
  bike: { name: 'Solmar Streak', color: '#e86a2a', maxSpeed: 620, accel: 640, turn: 3.7, length: 34, width: 14, hp: 60 },
};

const PARKED_COLORS = ['#4a7fb5', '#c94a4a', '#5da24a', '#8a7f9e', '#d8d8d8', '#3b3b3b', '#c96a3b', '#4a9e8f'];

export class Car {
  constructor(x, y, angle, typeName, opts) {
    const type = CAR_TYPES[typeName] || CAR_TYPES.sedan;
    const o = opts || {};
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.type = typeName;
    this.def = type;
    this.color = o.color || type.color;
    this.speed = 0;
    this.hp = type.hp;
    this.maxHp = type.hp; // raised by garage armor plating
    this.driver = o.driver || null; // 'player' | 'traffic' | 'police' | null (parked)
    this.dead = false;
    this.smoke = 0; // seconds of smoke left after a hard hit
    this.collideCooldown = 0; // seconds until this car can take crash damage again
    this.lightPhase = 0;
    this.id = Car.nextId;
    Car.nextId += 1;
  }

  get length() { return this.def.length; }
  get width() { return this.def.width; }

  /** Front bumper world position (for ramming and headlights). */
  front() {
    return { x: this.x + Math.cos(this.angle) * this.length * 0.5, y: this.y + Math.sin(this.angle) * this.length * 0.5 };
  }
}
Car.nextId = 1;

/**
 * One step of arcade driving. `input` is {up, down, left, right} booleans.
 * `speedBonus` multiplies the top speed (garage engine tuning for the
 * player's car). Returns true when the car hit something solid this step.
 */
export function driveCar(car, input, dt, city, others, speedBonus) {
  const def = car.def;
  const bonus = speedBonus || 1;
  let hit = false;
  if (car.collideCooldown > 0) car.collideCooldown -= dt;
  if (input.up) car.speed += def.accel * dt;
  if (input.down) {
    if (car.speed > 20) car.speed -= def.accel * 1.4 * dt; // brake
    else car.speed -= def.accel * 0.55 * dt; // reverse
  }
  if (!input.up && !input.down) {
    // Rolling drag.
    car.speed -= car.speed * 1.4 * dt;
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  car.speed = clamp(car.speed, -170, def.maxSpeed * bonus);
  // Steering bites harder the faster the car goes, and reverses when reversing.
  const speedFactor = clamp(Math.abs(car.speed) / 160, 0, 1);
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  car.angle += steer * def.turn * speedFactor * dt * (car.speed < 0 ? -1 : 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const ox = car.x;
  const oy = car.y;
  car.x = nx;
  car.y = ny;
  // Buildings: slide along them instead of stopping dead.
  const r = Math.max(car.length, car.width) * 0.5;
  if (city) {
    const resolved = tryMove(car, ox, oy, city, r);
    if (resolved) hit = true;
  }
  // Other cars: shove apart and trade momentum. The faster car keeps most
  // of its speed and pushes the slower one aside, so a chase does not die
  // the first time two bumpers touch.
  if (others) {
    for (const other of others) {
      if (other === car || other.dead) continue;
      const d = dist(car.x, car.y, other.x, other.y);
      const min = (car.length + other.length) * 0.42;
      if (d > 0.01 && d < min) {
        const overlap = min - d;
        const ux = (car.x - other.x) / d;
        const uy = (car.y - other.y) / d;
        car.x += ux * overlap * 0.35;
        car.y += uy * overlap * 0.35;
        other.x -= ux * overlap * 0.65;
        other.y -= uy * overlap * 0.65;
        const rel = car.speed - other.speed;
        car.speed -= rel * 0.35;
        other.speed += rel * 0.35;
        // Crash damage, but at most once per half second per car: without
        // the cooldown a sustained overlap melts a car's hp in ~1s.
        // (Gated on this car's cooldown only: parked cars never run
        // driveCar, so their cooldown would never tick down.)
        if (Math.abs(rel) > 60 && car.collideCooldown <= 0) {
          car.hp -= 2;
          other.hp -= 2;
          car.collideCooldown = 0.5;
          other.collideCooldown = 0.5;
        }
        hit = true;
      }
    }
  }
  if (car.hp < 40) car.smoke = Math.max(car.smoke, 0.4);
  return hit;
}

/** Move the car, sliding along building walls; returns true on a wall hit. */
function tryMove(car, ox, oy, city, r) {
  // Escape hatch: if the car is already inside a building (shoved there by
  // a police ram or a collision), push it out along the smallest
  // penetration axis first — otherwise no step can ever move it again.
  for (const b of city.buildings) {
    const fixed = pushCircleOutOfRect(car.x, car.y, r, b);
    if (fixed) { car.x = fixed.x; car.y = fixed.y; break; }
  }
  // Try the full step, then each axis alone, so the car slides along walls.
  if (!collidesAt(city, car.x, car.y, r)) return false;
  // Revert to the previous position, then try x-only and y-only.
  const stepX = car.x - ox;
  const stepY = car.y - oy;
  car.x = ox;
  car.y = oy;
  const testX = ox + stepX;
  if (!collidesAt(city, testX, oy, r * 0.9)) {
    car.x = testX;
    car.y = oy;
  } else if (!collidesAt(city, ox, oy + stepY, r * 0.9)) {
    car.x = ox;
    car.y = oy + stepY;
  }
  car.speed *= 0.55; // scrub speed on a wall scrape
  return true;
}

export function collidesAt(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r < b.x || x - r > b.x + b.w || y + r < b.y || y - r > b.y + b.h) continue;
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < r * r * 0.64) return true;
  }
  return false;
}

/** Park `count` cars along roads, away from (avoidX, avoidY). */
export function spawnParkedCars(city, rng, count, avoidX, avoidY) {
  const cars = [];
  let tries = 0;
  while (cars.length < count && tries < count * 12) {
    tries += 1;
    const p = randomRoadPoint(rng);
    if (Math.abs(p.x - avoidX) < 260 && Math.abs(p.y - avoidY) < 260) continue;
    const near = cars.some((c) => dist(c.x, c.y, p.x, p.y) < 90);
    if (near) continue;
    const horizontal = isOnRoad(p.x + 40, p.y) && !isOnRoad(p.x, p.y + 40);
    const angle = horizontal ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const type = pick(rng, ['sedan', 'sedan', 'coupe', 'van', 'taxi', 'sports', 'bike']);
    const car = new Car(p.x, p.y, angle, type, { color: type === 'taxi' ? CAR_TYPES.taxi.color : pick(rng, PARKED_COLORS), driver: null });
    cars.push(car);
  }
  return cars;
}

/** Steer a police car toward a target point (pursuit with a little prediction). */
export function steerToward(car, tx, ty, dt, aggression) {
  const targetAngle = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(car.angle, targetAngle);
  car.angle = angleLerp(car.angle, targetAngle, car.def.turn * dt * (0.7 + aggression * 0.3));
  const input = { up: Math.abs(diff) < 1.9, down: false, left: diff < -0.08, right: diff > 0.08 };
  return input;
}
