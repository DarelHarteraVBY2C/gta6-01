// Solmar Bay: Sunset Hustle — the game itself. Boots the canvas, owns the
// state machine (title, play, pause, wasted, busted, finished), steps the
// simulation, resolves combat, and saves to localStorage. Every other module
// plugs into this Game object.
//
// The game: an original open-world crime game (GTA-style, no Rockstar
// assets). Danny Cole, getaway driver in the coastal city Solmar Bay.
// 8 story missions for Vera (car theft, deliveries, shootouts, a checkpoint
// street race, a 3-star getaway run, a bank heist, and the Harbor Heist finale); wanted 0-5 stars with
// police cruisers, SWAT vans at 4 stars, roadblocks at 3 stars and the Air One helicopter at
// 5 stars; car theft, traffic, pedestrians, taxi fares, cash bundles,
// garage engine/armor upgrades, combat (fists + pistol + shotgun), HUD + minimap,
// save to localStorage, synthesized WebAudio.
import { mulberry32, rand, clamp, dist } from './utils.js';
import { generateCity, CITY_WIDTH, CITY_HEIGHT } from './city.js';
import { AudioEngine } from './audio.js';
import { Player } from './player.js';
import { Car, driveCar, spawnParkedCars, steerToward } from './vehicles.js';
import { spawnTraffic, updateTrafficCar, spawnPeds, updatePed, scarePeds } from './traffic.js';
import { Wanted, spawnPoliceCar, updatePoliceCar, policeCountFor, nearestPoliceDistance, makeRoadblock, policeWaypoint, HELI_ENABLED, spawnHelicopter, updateHelicopter, spawnSwatVan, swatCountFor } from './police.js';
import { MissionManager, STORY } from './missions.js';
import { Collectibles, drawCollectibles } from './collectibles.js';
import { drawHUD } from './hud.js';
import { Camera, drawWorld, drawTitleScreen, drawPauseScreen, drawEndScreen, VIEW_W, VIEW_H } from './render.js';
import { stageShot } from './shots.js';

const CITY_SEED = 20261119;
const START_POS = { x: 700, y: 300 };
const SAVE_KEY = 'solmar-bay-save-v1';
const BULLET_SPEED = 950;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = new AudioEngine();
    this.camera = new Camera();
    this.rng = mulberry32(CITY_SEED);
    this.state = 'title';
    this.time = 0;
    this.playTime = 0;
    this.shake = 0;
    this.particles = [];
    this.bullets = [];
    this.menuButtons = [];
    this.mouse = { x: VIEW_W / 2, y: VIEW_H / 2, down: false };
    this.shotMode = false;
    this.finishedShown = false;
    this.roadblockSpawned = false;
    this.keys = {};
    this.resetWorld(CITY_SEED);
    this.loadTitleButtons();
    this.bindInput(canvas);
  }

  // ---- world setup -------------------------------------------------------

  resetWorld(seed) {
    this.rng = mulberry32(seed);
    this.city = generateCity(CITY_SEED);
    this.player = new Player(START_POS.x, START_POS.y);
    this.cars = spawnParkedCars(this.city, this.rng, 16, START_POS.x, START_POS.y);
    // A Solmar Streak bike is always parked outside Vera's Garage: the
    // fastest way across town, for players who find it first.
    this.cars.push(new Car(860, 700, Math.PI / 2, 'bike', { color: '#e86a2a', driver: null }));
    this.cars.push(...spawnTraffic(this.city, this.rng, 26));
    this.peds = spawnPeds(this.city, this.rng, 44, START_POS.x, START_POS.y);
    this.police = [];
    this.heli = null; // Air One: the police helicopter (5 stars only)
    this.wanted = new Wanted();
    this.missions = new MissionManager(this);
    this.missions.seedPickups(this.rng);
    this.collectibles = new Collectibles(); // hidden packages + shell crates
    this.particles = [];
    this.bullets = [];
    this.time = 0;
    this.shake = 0;
    this.roadblockSpawned = false;
    this.finishedShown = false;
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.camera.zoom = 1;
  }

  startFreePlay() {
    this.state = 'play';
    this.menuButtons = [];
  }

  newGame() {
    this.resetWorld(CITY_SEED);
    this.playTime = 0;
    this.state = 'play';
    this.missions.startMission(0);
  }

  continueGame() {
    const save = this.readSave();
    this.resetWorld(CITY_SEED);
    if (save) {
      this.player.cash = save.cash;
      this.player.hp = save.hp;
      this.player.armor = save.armor;
      this.player.engineLevel = save.engineLevel || 0;
      this.player.armorLevel = save.armorLevel || 0;
      this.player.x = save.playerX;
      this.player.y = save.playerY;
      this.playTime = save.playTime || 0;
      if (save.weapon === 'pistol') this.player.givePistol(save.ammo || 12);
      else if (save.weapon === 'shotgun') this.player.giveShotgun(save.ammo || 6);
      this.missions.completedCount = save.completedCount || 0;
      this.state = 'play';
      this.missions.startMission(save.missionIndex || 0);
    } else {
      this.newGame();
    }
  }

  // ---- save / load ---------------------------------------------------------

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        missionIndex: this.missions.missionIndex,
        completedCount: this.missions.completedCount,
        cash: Math.floor(this.player.cash),
        hp: Math.floor(this.player.hp),
        armor: Math.floor(this.player.armor),
        engineLevel: this.player.engineLevel,
        armorLevel: this.player.armorLevel,
        playerX: Math.round(this.player.x),
        playerY: Math.round(this.player.y),
        playTime: Math.round(this.playTime),
        weapon: this.player.weapon,
        ammo: this.player.ammo,
      }));
    } catch (e) { /* storage unavailable: the game still plays */ }
  }

  readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // ---- input ---------------------------------------------------------------

  bindInput(canvas) {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.keys[e.key.toLowerCase()] = true;
      this.audio.ensure();
      this.onKeyPress(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - rect.left) * (VIEW_W / rect.width);
      this.mouse.y = (e.clientY - rect.top) * (VIEW_H / rect.height);
      this.updateHover();
    });
    canvas.addEventListener('mousedown', (e) => {
      this.audio.ensure();
      if (e.button !== 0) return;
      this.mouse.down = true;
      if (this.state === 'play') this.tryShoot();
      else this.clickMenu();
    });
    canvas.addEventListener('mouseup', () => { this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onKeyPress(key) {
    if (key === 'm') {
      const muted = this.audio.toggleMute();
      this.missions.showMessage(muted ? 'Sound off' : 'Sound on', 1.5);
      this.loadTitleButtons();
      return;
    }
    if (this.state === 'title') {
      if (key === 'enter') this.readSave() ? this.continueGame() : this.newGame();
      if (key === 'n') this.newGame();
      return;
    }
    if (this.state === 'pause') {
      if (key === 'p' || key === 'escape' || key === 'enter') this.state = 'play';
      return;
    }
    if (this.state === 'wasted' || this.state === 'busted') {
      if (key === 'enter') this.retryAfterEnd();
      return;
    }
    if (this.state === 'finished') {
      if (key === 'enter') this.state = 'play';
      if (key === 'escape') { this.state = 'title'; this.loadTitleButtons(); }
      return;
    }
    if (this.state !== 'play') return;
    if (key === 'p' || key === 'escape') {
      this.state = 'pause';
      this.loadPauseButtons();
      return;
    }
    if (key === 'e') this.interactKey();
    if (key === 'f') this.punchKey();
    if (key === ' ') this.tryShoot();
    if (key === 'g') this.garageKey('engine');
    if (key === 'h') this.garageKey('armor');
  }

  /** Vera's Garage: tune the car you are driving. G buys an engine level
   * (+8% top speed, $400), H buys armor plating (+25 max car HP, $300),
   * each up to level 3. Only works parked at the garage in a car. */
  garageKey(kind) {
    const player = this.player;
    if (!player.inCar) return;
    if (dist(player.x, player.y, 780, 650) > 90) return;
    const level = kind === 'engine' ? player.engineLevel : player.armorLevel;
    const cost = kind === 'engine' ? 400 : 300;
    if (level >= 3) {
      this.missions.showMessage('Already maxed out.', 2);
      return;
    }
    if (player.cash < cost) {
      this.missions.showMessage('Not enough cash — need $' + cost + '.', 2);
      return;
    }
    player.cash -= cost;
    if (kind === 'engine') {
      player.engineLevel += 1;
      this.missions.showMessage('Engine tuned to Lv ' + player.engineLevel + ' — faster top speed!', 3);
    } else {
      player.armorLevel += 1;
      const car = player.car;
      car.maxHp = car.def.hp + 25 * player.armorLevel;
      car.hp = Math.min(car.hp + 25, car.maxHp);
      this.missions.showMessage('Armor plating Lv ' + player.armorLevel + ' — +25 max car HP!', 3);
    }
    this.audio.pickup();
    this.saveGame();
  }

  interactKey() {
    const player = this.player;
    // Mission pickups work even from the driver's seat, so a player who drives
    // up to a package does not have to guess that they must get out first.
    if (this.missions.interact()) return;
    if (player.inCar) {
      player.exitCar();
      this.audio.uiClick();
      return;
    }
    const car = player.nearestStealableCar(this.cars);
    if (car) {
      const occupied = car.driver === 'traffic';
      player.enterCar(car);
      this.audio.uiClick();
      if (occupied) {
        this.wanted.add(25);
        this.missions.showMessage('You jacked a car! The owner is calling the SBPD.', 3);
        scarePeds(this.peds, player.x, player.y, 260);
      } else {
        this.wanted.add(10);
      }
    }
  }

  punchKey() {
    const player = this.player;
    if (!player.startPunch()) return;
    this.audio.punch();
  }

  /** World position under the mouse cursor, for aiming. */
  mouseWorld() {
    const cam = this.camera;
    return {
      x: (this.mouse.x - VIEW_W / 2) / cam.zoom + cam.x,
      y: (this.mouse.y - VIEW_H / 2) / cam.zoom + cam.y,
    };
  }

  tryShoot() {
    const player = this.player;
    if (this.state !== 'play' || player.inCar) return;
    const target = this.mouseWorld();
    if (!player.shoot(target.x, target.y)) return;
    if (player.weapon === 'shotgun') this.audio.shotgun();
    else this.audio.gunshot();
    // One bullet per pellet: the shotgun fans five pellets around the aim.
    const base = Math.atan2(target.y - player.y, target.x - player.x);
    for (let i = 0; i < player.shotPellets; i += 1) {
      const a = base + (i - (player.shotPellets - 1) / 2) * player.shotSpread;
      this.fireBullet(player.x, player.y, player.x + Math.cos(a) * 100, player.y + Math.sin(a) * 100, 'player', player.shotDamage);
    }
    scarePeds(this.peds, player.x, player.y, 320);
    if (nearestPoliceDistance(this.police, player.x, player.y) < 700) this.wanted.add(8);
  }

  fireBullet(x, y, tx, ty, from, dmg) {
    const angle = Math.atan2(ty - y, tx - x) + (from === 'enemy' ? (Math.random() - 0.5) * 0.22 : 0);
    this.bullets.push({
      x: x + Math.cos(angle) * 20, y: y + Math.sin(angle) * 20,
      vx: Math.cos(angle) * BULLET_SPEED, vy: Math.sin(angle) * BULLET_SPEED,
      life: 0.5, from, dmg: dmg || 34,
    });
  }

  /** An enemy fires at the player. */
  enemyShoot(enemy, player) {
    this.audio.gunshot();
    this.fireBullet(enemy.x, enemy.y, player.x, player.y, 'enemy');
  }

  retryAfterEnd() {
    const missionIndex = this.missions.missionIndex;
    this.resetWorld(CITY_SEED);
    this.player.cash = Math.floor(this.player.cash * 0.9);
    this.state = 'play';
    this.missions.startMission(Math.min(missionIndex, STORY.length - 1));
    this.missions.showMessage('Back on the street. Don\'t blow it this time.', 3);
  }

  makeRoadblock(headingAngle) {
    return makeRoadblock(this.city, this.rng, this.player.x, this.player.y, headingAngle);
  }

  /** Debug/test hook: the next road-grid waypoint toward (tx, ty) for the
   * player's car, using the same L-shaped routing the police use. */
  waypointTo(tx, ty) {
    const car = this.player.car || this.player;
    return policeWaypoint(car, tx, ty);
  }

  /** Debug/test hook: steer the player's car toward (tx, ty) using the
   * same helper the police use (it turns the car in place, then drives). */
  steerTo(tx, ty) {
    const car = this.player.car || this.player;
    return steerToward(car, tx, ty, 1 / 60, 0.8);
  }

  // ---- menus ---------------------------------------------------------------

  loadTitleButtons() {
    const save = this.readSave();
    const cx = VIEW_W / 2 - 130;
    this.menuButtons = [
      { label: save ? 'Continue' : 'New Game', action: 'continue', x: cx, y: 320, w: 260, h: 48, hover: false },
      { label: 'New Game', action: 'new', x: cx, y: 380, w: 260, h: 48, hover: false },
      { label: this.audio.muted ? 'Sound: Off' : 'Sound: On', action: 'sound', x: cx, y: 440, w: 260, h: 48, hover: false },
    ];
  }

  loadPauseButtons() {
    const cx = VIEW_W / 2 - 130;
    this.menuButtons = [
      { label: 'Resume', action: 'resume', x: cx, y: 300, w: 260, h: 48, hover: false },
      { label: 'Restart Mission', action: 'restart', x: cx, y: 360, w: 260, h: 48, hover: false },
      { label: 'Save & Quit to Title', action: 'quit', x: cx, y: 420, w: 260, h: 48, hover: false },
      { label: this.audio.muted ? 'Sound: Off' : 'Sound: On', action: 'sound', x: cx, y: 480, w: 260, h: 48, hover: false },
    ];
  }

  updateHover() {
    for (const b of this.menuButtons) {
      b.hover = this.mouse.x >= b.x && this.mouse.x <= b.x + b.w && this.mouse.y >= b.y && this.mouse.y <= b.y + b.h;
    }
  }

  clickMenu() {
    this.updateHover();
    const b = this.menuButtons.find((btn) => btn.hover);
    if (!b) return;
    this.audio.ensure();
    this.audio.uiClick();
    if (b.action === 'continue') this.continueGame();
    else if (b.action === 'new') this.newGame();
    else if (b.action === 'resume') this.state = 'play';
    else if (b.action === 'restart') { this.missions.retryMission(); this.state = 'play'; }
    else if (b.action === 'quit') { this.saveGame(); this.state = 'title'; this.loadTitleButtons(); }
    else if (b.action === 'sound') {
      this.audio.toggleMute();
      if (this.state === 'title') this.loadTitleButtons();
      else this.loadPauseButtons();
    }
  }

  // ---- simulation ----------------------------------------------------------

  inputState() {
    const k = this.keys;
    return {
      up: !!(k.w || k.arrowup),
      down: !!(k.s || k.arrowdown),
      left: !!(k.a || k.arrowleft),
      right: !!(k.d || k.arrowright),
      run: !!k.shift,
      punch: !!k.f,
    };
  }

  /** One simulation step. Used by the frame loop and by the shot stager. */
  step(dt, input) {
    if (this.state !== 'play') return;
    this.time += dt;
    this.playTime += dt;
    const player = this.player;
    const allCars = [...this.cars, ...this.police];

    // Player: drive or walk.
    if (player.inCar) {
      const car = player.car;
      const speedBonus = 1 + player.engineLevel * 0.08; // garage tuning
      const hit = driveCar(car, input, dt, this.city, allCars, speedBonus);
      if (hit && Math.abs(car.speed) > 240) {
        this.audio.crash();
        this.shake = Math.min(1, this.shake + 0.4);
        this.spawnSparks(car.x, car.y, 8);
      }
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      if (car.hp <= 0) this.explodeCar(car);
    } else {
      player.updateOnFoot(input, dt, this.city);
      this.resolvePunch();
    }
    if (player.punchTimer > 0) player.punchTimer -= dt;
    if (player.shootCooldown > 0) player.shootCooldown -= dt;
    if (player.hurtTimer > 0) player.hurtTimer -= dt;
    if (player.dead) {
      this.state = 'wasted';
      this.audio.missionFail();
      player.cash = Math.floor(player.cash * 0.9);
      return;
    }

    // Traffic and pedestrians.
    for (const car of this.cars) {
      if (car.driver === 'traffic') updateTrafficCar(car, dt, this.city, allCars, this.rng);
      else if (car.hp <= 0 && !car.dead) this.explodeCar(car);
    }
    for (const ped of this.peds) updatePed(ped, dt, this.city, this.rng);

    // Police: keep the hunt at the wanted level's strength.
    const want = policeCountFor(this.wanted.level);
    while (this.police.filter((c) => !c.dead && c.type !== 'swat').length < want) {
      this.police.push(spawnPoliceCar(this.city, this.rng, player.x, player.y));
    }
    // SWAT vans roll out at four stars, on top of the cruisers: one van
    // at four stars, two at five. They are slower but far tougher, and
    // their ram hits more than twice as hard as a cruiser's.
    const wantSwat = swatCountFor(this.wanted.level);
    while (this.police.filter((c) => !c.dead && c.type === 'swat').length < wantSwat) {
      this.police.push(spawnSwatVan(this.city, this.rng, player.x, player.y));
    }
    if (this.wanted.level >= 3 && !this.roadblockSpawned) {
      this.roadblockSpawned = true;
      this.police.push(...this.makeRoadblock(player.inCar ? player.car.angle : player.angle));
      this.missions.showMessage('SBPD roadblock ahead!', 3);
    }
    if (this.wanted.level < 3) this.roadblockSpawned = false;
    // Air One: the helicopter shadows the player at 5 stars and leaves
    // when the heat drops. It flies above the buildings, so it can never
    // get stuck on the road grid.
    if (HELI_ENABLED && this.wanted.level >= 5 && !this.heli) {
      this.heli = spawnHelicopter(player.x, player.y);
      this.missions.showMessage('Air One is overhead. Lose them, Danny!', 3);
    }
    if (this.heli && updateHelicopter(this.heli, dt, player, this.wanted.level) === 'despawn') {
      this.heli = null;
    }
    const policeNear = nearestPoliceDistance(this.police, player.x, player.y) < 500;
    for (const car of [...this.police]) {
      const event = updatePoliceCar(car, dt, this.city, allCars, player, this.rng);
      if (event === 'ram') {
        this.audio.crash();
        this.shake = Math.min(1, this.shake + 0.5);
        this.spawnSparks(player.x, player.y, 10);
      }
      if (event === 'bust') {
        this.state = 'busted';
        this.audio.missionFail();
        this.wanted.reset();
        player.cash = Math.floor(player.cash * 0.9);
        player.bustedTimer = 0;
        return;
      }
      if (car.hp <= 0 && !car.dead) this.explodeCar(car);
    }
    this.wanted.update(dt, policeNear);

    // Missions, enemies, bullets, particles.
    this.missions.update(dt);
    this.collectibles.update(this);
    this.missions.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateParticles(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.6);
    if (this.missions.completedCount >= STORY.length && !this.finishedShown) {
      this.finishedShown = true;
      this.state = 'finished';
      this.audio.missionDone();
    }

    // Camera follows the player.
    const vx = player.inCar ? Math.cos(player.car.angle) * player.car.speed : 0;
    const vy = player.inCar ? Math.sin(player.car.angle) * player.car.speed : 0;
    this.camera.update(dt, player.x, player.y, vx, vy, player.inCar, player.inCar ? Math.abs(player.car.speed) / player.car.def.maxSpeed : 0);

    // Engine and siren follow the action.
    const speedRatio = player.inCar ? Math.abs(player.car.speed) / player.car.def.maxSpeed : 0;
    this.audio.setEngine(speedRatio, player.inCar && input.up);
    this.audio.setSiren(nearestPoliceDistance(this.police, player.x, player.y));
  }

  /** Resolve a punch mid-swing against enemies, pedestrians and cars. */
  resolvePunch() {
    const player = this.player;
    if (player.punchTimer <= 0 || player.punchTimer > 0.2 || player.punchHitDone) return;
    player.punchHitDone = true;
    const pt = player.punchPoint();
    let hitSomething = false;
    for (const enemy of this.missions.enemies) {
      if (enemy.dead) continue;
      if (dist(pt.x, pt.y, enemy.x, enemy.y) < 42) {
        enemy.hp -= 25;
        enemy.x += Math.cos(player.angle) * 18;
        enemy.y += Math.sin(player.angle) * 18;
        hitSomething = true;
        if (enemy.hp <= 0) {
          enemy.dead = true;
          this.missions.kills += 1;
          this.spawnSparks(enemy.x, enemy.y, 6);
        }
      }
    }
    for (const ped of this.peds) {
      if (ped.dead || ped.fallTimer > 0) continue;
      if (dist(pt.x, pt.y, ped.x, ped.y) < 34) {
        ped.fallTimer = 3;
        this.wanted.add(15);
        scarePeds(this.peds, ped.x, ped.y, 200);
        hitSomething = true;
      }
    }
    if (hitSomething) this.audio.punch();
  }

  updateBullets(dt) {
    const player = this.player;
    for (const b of [...this.bullets]) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      // Buildings stop bullets.
      if (!dead && this.city.buildings.some((r) => b.x > r.x && b.x < r.x + r.w && b.y > r.y && b.y < r.y + r.h)) {
        this.spawnSparks(b.x, b.y, 3);
        dead = true;
      }
      if (!dead && b.from === 'player') {
        for (const enemy of this.missions.enemies) {
          if (enemy.dead) continue;
          if (dist(b.x, b.y, enemy.x, enemy.y) < 16) {
            enemy.hp -= b.dmg; // pistol 34, shotgun pellet 12
            this.spawnSparks(b.x, b.y, 5);
            dead = true;
            if (enemy.hp <= 0) {
              enemy.dead = true;
              this.missions.kills += 1;
              player.cash += 25;
            }
            break;
          }
        }
        if (!dead) {
          for (const ped of this.peds) {
            if (ped.dead || ped.fallTimer > 0) continue;
            if (dist(b.x, b.y, ped.x, ped.y) < 13) {
              ped.fallTimer = 4;
              this.wanted.add(30);
              scarePeds(this.peds, ped.x, ped.y, 260);
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (const car of [...this.cars, ...this.police]) {
            if (car.dead || car.driver === 'player') continue;
            if (dist(b.x, b.y, car.x, car.y) < 24) {
              car.hp -= Math.max(1, Math.round(b.dmg * 0.3)); // pistol 10, pellet 4
              this.spawnSparks(b.x, b.y, 4);
              dead = true;
              break;
            }
          }
        }
      }
      if (!dead && b.from === 'enemy') {
        if (!player.inCar && dist(b.x, b.y, player.x, player.y) < 15) {
          player.takeDamage(8);
          dead = true;
        } else if (player.inCar && dist(b.x, b.y, player.car.x, player.car.y) < 26) {
          player.car.hp -= 4;
          dead = true;
        }
      }
      if (dead) this.bullets.splice(this.bullets.indexOf(b), 1);
    }
  }

  explodeCar(car) {
    if (car.dead) return;
    car.dead = true;
    this.audio.explosion();
    this.shake = 1;
    this.spawnExplosion(car.x, car.y);
    scarePeds(this.peds, car.x, car.y, 400);
    if (this.player.car === car) {
      this.player.exitCar();
      this.player.takeDamage(25);
      this.player.x = car.x + 40;
      this.player.y = car.y;
    }
    if (car.driver === 'traffic') car.driver = null;
  }

  spawnSparks(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 140;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.35, maxLife: 0.35, color: '#ffe9a3', size: 2 + Math.random() * 2,
      });
    }
  }

  // Frozen dust puffs: fixed positions, zero velocity, full life, so they
  // read as a still dust cloud in a staged ?shot= render (and as lingering
  // dust behind a drifting car in normal play).
  spawnDust(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + 0.7;
      const r = 8 + (i % 3) * 10;
      this.particles.push({
        x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: 0, vy: 0,
        life: 1, maxLife: 1, color: 'rgba(210,185,140,0.85)', size: 5 + (i % 3) * 2,
      });
    }
  }

  spawnExplosion(x, y) {
    for (let i = 0; i < 26; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 220;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.9, maxLife: 0.9, color: ['#ff9a3d', '#ff5d5d', '#5a5a5a'][i % 3], size: 3 + Math.random() * 5,
      });
    }
  }

  updateParticles(dt) {
    for (const pt of [...this.particles]) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.94;
      pt.vy *= 0.94;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(this.particles.indexOf(pt), 1);
    }
  }

  // ---- frame loop ------------------------------------------------------------

  frame(now) {
    const dt = Math.min(0.05, (now - (this.lastNow || now)) / 1000 || 0.016);
    this.lastNow = now;
    if (!this.shotMode && this.state === 'play') {
      this.step(dt, this.inputState());
    }
    const ctx = this.ctx;
    if (this.state === 'title') drawTitleScreen(ctx, this);
    else if (this.state === 'pause') { drawWorld(ctx, this); drawHUD(ctx, this, VIEW_W, VIEW_H); drawPauseScreen(ctx, this); }
    else if (this.state === 'wasted') { drawWorld(ctx, this); drawEndScreen(ctx, this, 'wasted'); }
    else if (this.state === 'busted') { drawWorld(ctx, this); drawEndScreen(ctx, this, 'busted'); }
    else if (this.state === 'finished') { drawWorld(ctx, this); drawEndScreen(ctx, this, 'finished'); }
    else { drawWorld(ctx, this); drawHUD(ctx, this, VIEW_W, VIEW_H); }
    requestAnimationFrame((t) => this.frame(t));
  }

  start() {
    requestAnimationFrame((t) => this.frame(t));
  }
}

// ---- boot ------------------------------------------------------------------

const canvas = document.getElementById('game');
const game = new Game(canvas);
window.__solmar = game; // debug handle: tests and screenshots read the live state

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) {
  const seed = Number.parseInt(params.get('seed') || '20261119', 10) || 20261119;
  game.resetWorld(seed);
  game.shotMode = true;
  const staged = stageShot(shot, game);
  game.state = staged.screen === 'play' ? 'play' : 'title';
  game.start();
  window.__shotReady = true;
} else {
  game.start();
}
