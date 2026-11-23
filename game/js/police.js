// The Solmar Bay Police Department: the wanted system, police cruisers that
// chase and ram, roadblocks at high heat, the Air One helicopter at five
// stars, and getting busted on foot.
import { clamp, dist, rand, pick, angleDiff } from './utils.js';
import { AVENUES, STREETS, randomRoadPointFar } from './city.js';
import { Car, steerToward, driveCar, collidesAt } from './vehicles.js';

export const WANTED_THRESHOLDS = [0, 25, 60, 120, 200, 320];
export const MAX_WANTED = 5;

/** Air One: the police helicopter. Set false to disable it entirely. */
export const HELI_ENABLED = true;

/** How many police cars hunt the player at each wanted level. */
export function policeCountFor(level) {
  return [0, 1, 2, 3, 4, 5][clamp(level, 0, 5)];
}

/** How many SWAT vans join the hunt at each wanted level (on top of cruisers). */
export function swatCountFor(level) {
  return level >= 5 ? 2 : level >= 4 ? 1 : 0;
}

function nearestCoord(value, list) {
  let best = list[0];
  let bd = Math.abs(value - list[0]);
  for (const c of list) {
    const d = Math.abs(value - c);
    if (d < bd) { bd = d; best = c; }
  }
  return { coord: best, dist: bd };
}

/**
 * Pick the next waypoint for a pursuit car so it stays on the road grid
 * instead of driving straight through city blocks. L-shaped routing: when
 * the target shares the car's avenue or street, drive straight at it;
 * otherwise drive along the current road to the target's nearest
 * cross-street, then turn onto it.
 */
export function policeWaypoint(car, tx, ty) {
  const ave = nearestCoord(car.y, AVENUES);
  const st = nearestCoord(car.x, STREETS);
  const onAve = ave.dist < 70;
  const onSt = st.dist < 70;
  if (onAve && Math.abs(ty - ave.coord) < 70) return { x: tx, y: ty };
  if (onSt && Math.abs(tx - st.coord) < 70) return { x: tx, y: ty };
  if (onAve) {
    const sx = nearestCoord(tx, STREETS).coord;
    if (Math.abs(car.x - sx) < 70) {
      // Already at the corner street: head along it toward the target
      // instead of returning our own position (which spins the car).
      return { x: sx, y: nearestCoord(ty, AVENUES).coord };
    }
    return { x: sx, y: ave.coord };
  }
  if (onSt) {
    const ay = nearestCoord(ty, AVENUES).coord;
    if (Math.abs(car.y - ay) < 70) {
      // Already at the corner avenue: head along it toward the target.
      return { x: nearestCoord(tx, STREETS).coord, y: ay };
    }
    return { x: st.coord, y: ay };
  }
  // Off-road (just spawned): head for the nearest road first.
  return ave.dist <= st.dist ? { x: car.x, y: ave.coord } : { x: st.coord, y: car.y };
}

export class Wanted {
  constructor() {
    this.points = 0;
    this.level = 0;
    this.quietTimer = 0; // seconds since the last crime
    this.lastLevel = 0;
  }

  /** Add heat; returns true when the star level went up. */
  add(points) {
    this.points += points;
    this.quietTimer = 0;
    const level = this.levelFromPoints();
    const rose = level > this.level;
    this.level = level;
    return rose;
  }

  levelFromPoints() {
    let level = 0;
    for (let i = 1; i <= MAX_WANTED; i += 1) {
      if (this.points >= WANTED_THRESHOLDS[i]) level = i;
    }
    return level;
  }

  /** Cool off when nobody can see the player; returns true when a star dropped. */
  update(dt, policeNear) {
    this.quietTimer += dt;
    if (policeNear || this.quietTimer < 10) return false;
    if (this.level === 0) return false;
    this.points = Math.max(0, this.points - 9 * dt);
    const level = this.levelFromPoints();
    const fell = level < this.level;
    this.level = level;
    return fell;
  }

  reset() {
    this.points = 0;
    this.level = 0;
    this.quietTimer = 0;
  }
}

/** A police cruiser with a chase target and a ramming urge. */
export class PoliceCar extends Car {
  constructor(x, y, angle) {
    super(x, y, angle, 'police', { driver: 'police' });
    this.ramCooldown = 0;
    this.ramPower = 6; // damage per ram to the player's car
    this.sirenPhase = Math.random() * Math.PI * 2;
    this.stuckT = 0; // seconds spent barely moving while trying to chase
    this.reverseT = 0; // seconds left of the unstick reverse
    this.lastX = x;
    this.lastY = y;
  }
}

/** A SWAT van: slower than a cruiser, far tougher (220 hp), and its ram
 * hits more than twice as hard. The SBPD rolls it out at four stars. */
export class SwatVan extends Car {
  constructor(x, y, angle) {
    super(x, y, angle, 'swat', { driver: 'police' });
    this.ramCooldown = 0;
    this.ramPower = 14; // a van shove hurts: 14 hp per ram
    this.sirenPhase = Math.random() * Math.PI * 2;
    this.stuckT = 0;
    this.reverseT = 0;
    this.lastX = x;
    this.lastY = y;
  }
}

/** Spawn one police car on a road 500-800 px from the player. */
export function spawnPoliceCar(city, rng, px, py) {
  const p = randomRoadPointFar(rng, px, py, 500);
  const angle = Math.atan2(py - p.y, px - p.x);
  return new PoliceCar(p.x, p.y, angle);
}

/** Spawn one SWAT van on a road 500-800 px from the player. */
export function spawnSwatVan(city, rng, px, py) {
  const p = randomRoadPointFar(rng, px, py, 500);
  const angle = Math.atan2(py - p.y, px - p.x);
  return new SwatVan(p.x, p.y, angle);
}

/**
 * Chase the player along the road grid: steer toward the next waypoint,
 * ease off the throttle for sharp corners, and reverse briefly when wedged.
 * Ramming and the on-foot bust timer run on contact. Returns an event
 * string ('ram' | 'bust' | null).
 */
export function updatePoliceCar(car, dt, city, allCars, player, rng) {
  if (car.dead) return null;
  car.lightPhase += dt * 6;
  if (car.ramCooldown > 0) car.ramCooldown -= dt;
  // Predict where the player will be a moment from now, then route there
  // on the roads instead of straight through the buildings.
  const pvx = player.inCar ? Math.cos(player.car.angle) * player.car.speed : 0;
  const pvy = player.inCar ? Math.sin(player.car.angle) * player.car.speed : 0;
  const tx = player.x + pvx * 0.45;
  const ty = player.y + pvy * 0.45;
  const wp = policeWaypoint(car, tx, ty);
  // Slow down for a sharp corner so the turn stays on the road.
  const wantAngle = Math.atan2(wp.y - car.y, wp.x - car.x);
  const sharp = Math.abs(angleDiff(wantAngle, car.angle));
  const input = steerToward(car, wp.x, wp.y, dt, sharp > 0.7 ? 0.35 : 0.8);
  if (car.reverseT > 0) {
    car.reverseT -= dt;
    input.up = false;
    input.down = true;
  } else if (sharp > 2.4) {
    // Waypoint almost behind us: turn first, then power on.
    input.up = false;
  } else {
    input.up = true;
  }
  driveCar(car, input, dt, city, allCars);
  if (car.speed > car.def.maxSpeed) car.speed = car.def.maxSpeed;
  // Unstick: if we barely moved for over a second, back up and try again.
  const moved = dist(car.x, car.y, car.lastX, car.lastY);
  if (moved < 12 * dt + 0.2) {
    car.stuckT += dt;
    if (car.stuckT > 1.1 && car.reverseT <= 0) {
      car.reverseT = 0.8;
      car.stuckT = 0;
    }
  } else {
    car.stuckT = 0;
  }
  car.lastX = car.x;
  car.lastY = car.y;
  // Ram: shove the player's car and hurt it when we touch.
  if (player.inCar && car.ramCooldown <= 0) {
    const d = dist(car.x, car.y, player.car.x, player.car.y);
    if (d < 58) {
      const ux = (player.car.x - car.x) / (d || 1);
      const uy = (player.car.y - car.y) / (d || 1);
      // Shove the player's car, but never into a building: try the full
      // shove, then half, then skip the positional shove (the speed boost
      // still applies). A shove into a block wedges the car permanently.
      const r = Math.max(player.car.length, player.car.width) * 0.5;
      let shove = 26;
      while (shove > 0 && collidesAt(city, player.car.x + ux * shove, player.car.y + uy * shove, r)) shove /= 2;
      player.car.x += ux * shove;
      player.car.y += uy * shove;
      player.car.speed += 120;
      player.car.hp -= car.ramPower || 6; // a SWAT van hits far harder
      car.speed *= 0.6;
      car.ramCooldown = 0.9;
      return 'ram';
    }
  }
  // On foot and cornered: the bust timer runs while a cruiser sits on you.
  if (!player.inCar) {
    const d = dist(car.x, car.y, player.x, player.y);
    if (d < 46 && Math.abs(car.speed) < 60) {
      player.bustedTimer += dt;
      if (player.bustedTimer > 1.4) return 'bust';
    }
  }
  return null;
}

/** A roadblock: two cruisers parked across the road ahead of the player. */
export function makeRoadblock(city, rng, px, py, headingAngle) {
  const ahead = 420;
  const cx = px + Math.cos(headingAngle) * ahead;
  const cy = py + Math.sin(headingAngle) * ahead;
  const perp = headingAngle + Math.PI / 2;
  const cars = [];
  for (const side of [-1, 1]) {
    const car = new PoliceCar(cx + Math.cos(perp) * 42 * side, cy + Math.sin(perp) * 42 * side, perp);
    car.speed = 0;
    cars.push(car);
  }
  return cars;
}

/** Distance to the nearest police car, or Infinity when there is none. */
export function nearestPoliceDistance(police, x, y) {
  let best = Infinity;
  for (const car of police) {
    if (car.dead) continue;
    const d = dist(car.x, car.y, x, y);
    if (d < best) best = d;
  }
  return best;
}

/** Air One: the police helicopter that shadows the player from above. */
export class Helicopter {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle = 0; // heading (faces the player)
    this.rotor = 0; // rotor spin phase
    this.bob = 0; // hover bob phase
  }
}

/** Spawn the helicopter above and behind the player. */
export function spawnHelicopter(px, py) {
  return new Helicopter(px - 120, py - 160);
}

/**
 * Shadow the player from the sky: the heli drifts toward a hover point
 * just above the player and never collides with buildings (it flies over
 * them). Returns 'despawn' when the heat drops below 5 stars.
 */
export function updateHelicopter(heli, dt, player, wantedLevel) {
  if (wantedLevel < 5) return 'despawn';
  heli.rotor += dt * 28;
  heli.bob += dt * 2;
  const tx = player.x - 90;
  const ty = player.y - 130;
  const dx = tx - heli.x;
  const dy = ty - heli.y;
  const d = Math.hypot(dx, dy) || 1;
  // Faster than any car (the Falco GT tops out at 560) so Air One can
  // keep up with a speeding player instead of trailing far behind.
  const speed = Math.min(640, d * 2.2);
  heli.x += (dx / d) * speed * dt;
  heli.y += (dy / d) * speed * dt;
  heli.angle = Math.atan2(player.y - heli.y, player.x - heli.x);
  return null;
}
