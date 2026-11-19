// Danny Cole, the player: on-foot movement and combat, car entry and exit,
// health and armour, and the cash he carries. Driving itself lives in
// vehicles.js; the player just owns the car he sits in.
import { clamp, dist } from './utils.js';
import { resolveBuildings, clampToCity } from './city.js';

export const PLAYER_RADIUS = 14;
export const PUNCH_RANGE = 46;
export const PUNCH_DAMAGE = 25;
export const PISTOL_DAMAGE = 34;
export const PISTOL_RANGE = 420;

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle = -Math.PI / 2; // facing up the street
    this.hp = 100;
    this.maxHp = 100;
    this.armor = 0;
    this.maxArmor = 100;
    this.cash = 150;
    this.engineLevel = 0; // garage tuning: +8% top speed per level (max 3)
    this.armorLevel = 0; // garage plating: +25 max car HP per level (max 3)
    this.weapon = 'fists'; // 'fists' | 'pistol'
    this.ammo = 0;
    this.reserveAmmo = 0;
    this.car = null; // the Car he drives, or null on foot
    this.punchTimer = 0; // seconds left in the punch animation
    this.punchHitDone = false;
    this.shootCooldown = 0;
    this.hurtTimer = 0; // red flash timer after taking damage
    this.dead = false;
    this.bustedTimer = 0;
  }

  get inCar() { return this.car !== null; }
  get speed() { return this.car ? Math.abs(this.car.speed) : 0; }

  /** Damage that armour absorbs first; returns true when the player dies. */
  takeDamage(amount) {
    if (this.dead) return true;
    let left = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, left);
      this.armor -= absorbed;
      left -= absorbed;
    }
    this.hp -= left;
    this.hurtTimer = 0.35;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
    return this.dead;
  }

  heal(amount) {
    this.hp = clamp(this.hp + amount, 0, this.maxHp);
  }

  addArmor(amount) {
    this.armor = clamp(this.armor + amount, 0, this.maxArmor);
  }

  givePistol(ammo) {
    this.weapon = 'pistol';
    this.ammo = Math.max(this.ammo, ammo);
    this.reserveAmmo += ammo;
  }

  /** Walk or run on foot. `input` is {up, down, left, right, run}. */
  updateOnFoot(input, dt, city) {
    const speed = input.run ? 320 : 205;
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      this.x += mx * speed * dt;
      this.y += my * speed * dt;
      this.angle = Math.atan2(my, mx);
      const fixed = resolveBuildings(city, this.x, this.y, PLAYER_RADIUS);
      this.x = fixed.x;
      this.y = fixed.y;
      const clamped = clampToCity(this.x, this.y, PLAYER_RADIUS);
      this.x = clamped.x;
      this.y = clamped.y;
    }
    if (this.punchTimer > 0) this.punchTimer -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
  }

  /** Start a punch; the actual hit lands in the game loop via punchHit(). */
  startPunch() {
    if (this.punchTimer > 0 || this.inCar) return false;
    this.punchTimer = 0.28;
    this.punchHitDone = false;
    return true;
  }

  /** Point in front of the player where a punch lands. */
  punchPoint() {
    return {
      x: this.x + Math.cos(this.angle) * PUNCH_RANGE,
      y: this.y + Math.sin(this.angle) * PUNCH_RANGE,
    };
  }

  /** Fire the pistol toward (tx, ty); returns true when a shot went off. */
  shoot(tx, ty) {
    if (this.inCar || this.weapon !== 'pistol' || this.ammo <= 0 || this.shootCooldown > 0) return false;
    this.ammo -= 1;
    this.shootCooldown = 0.22;
    this.angle = Math.atan2(ty - this.y, tx - this.x);
    if (this.ammo === 0 && this.reserveAmmo > 0) {
      const reload = Math.min(12, this.reserveAmmo);
      this.ammo = reload;
      this.reserveAmmo -= reload;
    }
    return true;
  }

  /** The nearest car the player could steal, within 70 px, or null. */
  nearestStealableCar(cars) {
    let best = null;
    let bestD = 70;
    for (const car of cars) {
      if (car.dead || car.driver === 'player') continue;
      const d = dist(this.x, this.y, car.x, car.y);
      if (d < bestD) { best = car; bestD = d; }
    }
    return best;
  }

  /** Get into a car (stealing it when it has another driver). */
  enterCar(car) {
    if (car.driver === 'traffic' || car.driver === 'police') car.driver = null;
    this.car = car;
    car.driver = 'player';
    // Garage armor plating raises this car's max HP.
    car.maxHp = car.def.hp + 25 * this.armorLevel;
    this.x = car.x;
    this.y = car.y;
  }

  /** Step out of the car beside it. */
  exitCar() {
    if (!this.car) return;
    const car = this.car;
    car.driver = null;
    const side = { x: this.x + Math.cos(this.angle + Math.PI / 2) * 34, y: this.y + Math.sin(this.angle + Math.PI / 2) * 34 };
    this.x = side.x;
    this.y = side.y;
    this.car = null;
  }
}
