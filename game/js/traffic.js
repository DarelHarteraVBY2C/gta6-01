// Solmar Bay traffic: cars that drive the road grid like locals, and pedestrians
// who stroll the sidewalks and run when things get loud. Both are simple, cheap
// and numerous enough that the city feels alive from the minimap to the street.
import { rand, randi, pick, clamp, dist, angleLerp, angleDiff } from './utils.js';
import { AVENUES, STREETS, isOnRoad, randomRoadPoint, resolveBuildings, clampToCity } from './city.js';
import { Car, driveCar } from './vehicles.js';

const TRAFFIC_TYPES = ['sedan', 'sedan', 'coupe', 'van', 'taxi', 'sedan'];
const PED_COLORS = ['#e8e0d0', '#d0a080', '#8090c0', '#c0d080', '#e08080', '#a0a0a0', '#e8c090', '#90c0c0'];
const PED_SHIRTS = ['#c94a4a', '#4a7fb5', '#5da24a', '#e8b73a', '#8a7f9e', '#d8d8d8', '#c96a3b', '#4a9e8f'];

/** A traffic car: a Car plus the road it follows and the lane it keeps. */
export class TrafficCar extends Car {
  constructor(x, y, angle, typeName, opts) {
    super(x, y, angle, typeName, opts);
    this.driver = 'traffic';
    this.cruise = rand(opts.rng, 120, 210);
    this.waitTimer = 0;
    this.stuckTimer = 0;
  }
}

/** Spawn `count` traffic cars on roads, spread across the city. */
export function spawnTraffic(city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const p = randomRoadPoint(rng);
    const horizontal = rng() < 0.5;
    const angle = horizontal ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const type = pick(rng, TRAFFIC_TYPES);
    cars.push(new TrafficCar(p.x, p.y, angle, type, { rng }));
  }
  return cars;
}

/** Drive one traffic car: stay on its road, turn at intersections, stop for cars ahead. */
export function updateTrafficCar(car, dt, city, allCars, rng) {
  if (car.dead) return;
  // Keep the car glued to its lane: nudge it back onto the nearest road line.
  const onH = AVENUES.some((a) => Math.abs(car.y - a) < 55);
  const onV = STREETS.some((s) => Math.abs(car.x - s) < 55);
  const horizontal = Math.abs(Math.cos(car.angle)) > Math.abs(Math.sin(car.angle));
  if (horizontal && onH) {
    const a = AVENUES.reduce((best, v) => (Math.abs(car.y - v) < Math.abs(car.y - best) ? v : best), AVENUES[0]);
    const lane = a + (Math.cos(car.angle) > 0 ? 16 : -16);
    car.y += (lane - car.y) * Math.min(1, dt * 3);
  } else if (!horizontal && onV) {
    const s = STREETS.reduce((best, v) => (Math.abs(car.x - v) < Math.abs(car.x - best) ? v : best), STREETS[0]);
    const lane = s + (Math.sin(car.angle) > 0 ? -16 : 16);
    car.x += (lane - car.x) * Math.min(1, dt * 3);
  }
  // Look ahead: stop when another car is close in front.
  let blocked = false;
  const fx = car.x + Math.cos(car.angle) * 62;
  const fy = car.y + Math.sin(car.angle) * 62;
  for (const other of allCars) {
    if (other === car || other.dead) continue;
    if (dist(fx, fy, other.x, other.y) < 34) { blocked = true; break; }
  }
  // At an intersection, sometimes turn onto the crossing road.
  const atCrossing = (horizontal && STREETS.some((s) => Math.abs(car.x - s) < 26))
    || (!horizontal && AVENUES.some((a) => Math.abs(car.y - a) < 26));
  if (atCrossing && rng() < dt * 0.55) {
    const turn = pick(rng, [-Math.PI / 2, Math.PI / 2]);
    car.angle += turn;
  }
  const input = { up: !blocked && car.waitTimer <= 0, down: false, left: false, right: false };
  if (car.waitTimer > 0) car.waitTimer -= dt;
  const before = { x: car.x, y: car.y };
  driveCar(car, input, dt, city, allCars);
  // Traffic never speeds: cap it at its cruise speed.
  if (car.speed > car.cruise) car.speed = car.cruise;
  if (car.speed < -20) car.speed = -20;
  // If it got wedged against a wall, back it out.
  if (dist(before.x, before.y, car.x, car.y) < 1 && input.up) {
    car.stuckTimer += dt;
    if (car.stuckTimer > 1.2) {
      car.angle += Math.PI;
      car.stuckTimer = 0;
    }
  } else {
    car.stuckTimer = 0;
  }
}

/** A pedestrian: walks sidewalks, crosses roads now and then, flees danger. */
export class Ped {
  constructor(x, y, rng) {
    this.x = x;
    this.y = y;
    this.angle = rand(rng, 0, Math.PI * 2);
    this.speed = rand(rng, 28, 55);
    this.shirt = pick(rng, PED_SHIRTS);
    this.skin = pick(rng, PED_COLORS);
    this.fleeTimer = 0;
    this.fleeX = 0;
    this.fleeY = 0;
    this.dead = false;
    this.fallTimer = 0; // lying on the ground after being hit
    this.walkPhase = rand(rng, 0, Math.PI * 2);
  }
}

/** Spawn `count` pedestrians on sidewalks near roads. */
export function spawnPeds(city, rng, count, avoidX, avoidY) {
  const peds = [];
  let tries = 0;
  while (peds.length < count && tries < count * 10) {
    tries += 1;
    const p = randomRoadPoint(rng);
    const onSidewalk = !isOnRoad(p.x, p.y);
    const px = p.x + rand(rng, -70, 70);
    const py = p.y + rand(rng, -70, 70);
    if (Math.abs(px - avoidX) < 200 && Math.abs(py - avoidY) < 200) continue;
    if (city.buildings.some((b) => px > b.x - 10 && px < b.x + b.w + 10 && py > b.y - 10 && py < b.y + b.h + 10)) continue;
    peds.push(new Ped(px, py, rng));
  }
  return peds;
}

/** Scare every pedestrian within `radius` of (x, y) so they run away from it. */
export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (ped.dead || ped.fallTimer > 0) continue;
    const d = dist(ped.x, ped.y, x, y);
    if (d < radius) {
      ped.fleeTimer = 2.2;
      ped.fleeX = x;
      ped.fleeY = y;
    }
  }
}

/** Walk one pedestrian; `danger` is an optional {x, y} that makes them flee. */
export function updatePed(ped, dt, city, rng) {
  if (ped.dead) return;
  if (ped.fallTimer > 0) {
    ped.fallTimer -= dt;
    return;
  }
  ped.walkPhase += dt * 7;
  let speed = ped.speed;
  if (ped.fleeTimer > 0) {
    ped.fleeTimer -= dt;
    speed = 170;
    ped.angle = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
  } else if (rng() < dt * 0.12) {
    // Wander: pick a new heading, usually along the street.
    ped.angle += pick(rng, [-Math.PI / 2, Math.PI / 2, Math.PI, 0]);
  }
  ped.x += Math.cos(ped.angle) * speed * dt;
  ped.y += Math.sin(ped.angle) * speed * dt;
  const fixed = resolveBuildings(city, ped.x, ped.y, 10);
  ped.x = fixed.x;
  ped.y = fixed.y;
  const clamped = clampToCity(ped.x, ped.y, 12);
  ped.x = clamped.x;
  ped.y = clamped.y;
}
