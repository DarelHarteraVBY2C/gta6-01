// Solmar Bay missions: a seven-job story for Danny Cole, plus taxi fares and
// cash bundles scattered around the city. Each mission is a list of steps; the
// manager tracks the current step, spawns enemies and markers, and pays out.
import { dist, rand, pick } from './utils.js';
import { randomRoadPoint, randomRoadPointFar } from './city.js';
import { Car } from './vehicles.js';

export const STORY = [
  {
    id: 'wheels-up', name: 'Wheels Up', reward: 300,
    intro: 'Vera needs wheels. Steal a car and bring it to her garage.',
    steps: [
      { type: 'steal', text: 'Steal a car (walk up to one and press E)' },
      { type: 'goto', x: 780, y: 650, r: 70, text: 'Drive to Vera\'s Garage' },
    ],
  },
  {
    id: 'the-drop', name: 'The Drop', reward: 500,
    intro: 'A package is waiting at the pier. The cops know about it. Move fast.',
    steps: [
      { type: 'goto', x: 3050, y: 2220, r: 70, text: 'Go to the pier package' },
      { type: 'pickup', x: 3050, y: 2220, r: 60, text: 'Grab the package (press E)' },
      { type: 'goto', x: 700, y: 2250, r: 70, text: 'Deliver it to the Boardwalk Cafe' },
    ],
  },
  {
    id: 'payback', name: 'Payback', reward: 800,
    intro: 'The Harbor Crew jumped one of Vera\'s drivers. Settle it at the docks.',
    steps: [
      { type: 'goto', x: 3100, y: 1450, r: 80, text: 'Go to the docks' },
      { type: 'kill', count: 4, x: 3100, y: 1450, text: 'Take down the Harbor Crew (0/4)' },
      { type: 'goto', x: 780, y: 650, r: 70, text: 'Report back to Vera\'s Garage' },
    ],
  },
  {
    id: 'hot-wheels', name: 'Hot Wheels', reward: 1200,
    intro: 'A red Falco GT is parked outside the casino. Take it. The whole city will notice.',
    steps: [
      { type: 'goto', x: 2250, y: 650, r: 80, text: 'Go to Casino Row' },
      { type: 'stealTarget', text: 'Steal the red Falco GT (press E)' },
      { type: 'escape', x: 250, y: 1450, r: 80, text: 'Lose the cops — reach the hideout' },
    ],
  },
  {
    id: 'big-score', name: 'The Big Score', reward: 3000,
    intro: 'One last job: the Solmar Bank vault. Grab the cash and vanish.',
    steps: [
      { type: 'goto', x: 1850, y: 1050, r: 80, text: 'Go to Solmar Bank' },
      { type: 'pickup', x: 1850, y: 1050, r: 70, text: 'Grab the vault cash (press E)' },
      { type: 'escape', x: 250, y: 1450, r: 80, text: 'Escape to the hideout with the cash' },
    ],
  },
  {
    id: 'street-heat', name: 'Street Heat', reward: 1500,
    intro: 'Vera put money on you in the underground street race. Bring a fast car and beat the clock.',
    steps: [
      { type: 'goto', x: 780, y: 650, r: 70, text: 'Get a fast car, then reach the start line' },
      {
        type: 'race', timeLimit: 60, r: 70,
        text: 'Street race — hit every checkpoint before the clock runs out',
        gates: [
          { x: 2250, y: 650 },
          { x: 2650, y: 1450 },
          { x: 2250, y: 2250 },
          { x: 650, y: 2250 },
          { x: 780, y: 650 },
        ],
      },
    ],
  },
  {
    id: 'getaway-driver', name: 'The Getaway Driver', reward: 2000,
    intro: 'Three drops, one night, and the whole SBPD on your tail. Grab the package at the docks and don\'t stop.',
    steps: [
      { type: 'goto', x: 3100, y: 1450, r: 80, text: 'Go to the docks pickup' },
      { type: 'pickup', x: 3100, y: 1450, r: 60, text: 'Grab the package (press E)' },
      { type: 'goto', x: 700, y: 2250, r: 70, text: 'Drop 1/3: the Boardwalk Cafe' },
      { type: 'goto', x: 1050, y: 250, r: 70, text: 'Drop 2/3: Old Town' },
      { type: 'goto', x: 2650, y: 650, r: 70, text: 'Drop 3/3: Harbor Port' },
    ],
  },
];

/** A Harbor Crew gunman: walks at the player and shoots when close. */
export class Enemy {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.hp = 100;
    this.angle = 0;
    this.shootCooldown = 1 + Math.random();
    this.dead = false;
    this.walkPhase = Math.random() * 6;
  }
}

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.missionIndex = 0;
    this.stepIndex = 0;
    this.active = false;
    this.enemies = [];
    this.kills = 0;
    this.targetCar = null; // the Falco GT for Hot Wheels
    this.message = '';
    this.messageTimer = 0;
    this.cashPickups = [];
    this.taxi = { state: 'idle', pickup: null, dest: null, timer: 0, fare: 0 };
    this.completedCount = 0;
    this.failed = false;
    this.raceGate = 0; // street race: index of the next checkpoint gate
    this.raceTimer = 0; // street race: seconds left on the clock
  }

  get mission() { return STORY[this.missionIndex] || null; }
  get step() { return this.mission ? this.mission.steps[this.stepIndex] : null; }

  /** Scatter cash bundles around the city (seeded, once per session). */
  seedPickups(rng) {
    this.cashPickups = [];
    for (let i = 0; i < 10; i += 1) {
      const p = randomRoadPoint(rng);
      this.cashPickups.push({ x: p.x, y: p.y, amount: 50 + Math.floor(rng() * 3) * 50, taken: false });
    }
  }

  /** Begin the mission at `missionIndex` (or free roam when past the end). */
  startMission(index) {
    this.missionIndex = index;
    this.stepIndex = 0;
    this.enemies = [];
    this.kills = 0;
    this.targetCar = null;
    this.failed = false;
    const mission = this.mission;
    if (!mission) {
      this.active = false;
      this.showMessage('Free roam — Solmar Bay is yours, Danny.', 4);
      return;
    }
    this.active = true;
    this.showMessage('MISSION: ' + mission.name + ' — ' + mission.intro, 5);
    this.game.audio.missionDone();
    this.onStepStart();
  }

  showMessage(text, seconds) {
    this.message = text;
    this.messageTimer = seconds;
  }

  /** One-off setup when a step begins (spawn enemies, the target car, heat). */
  onStepStart() {
    const step = this.step;
    const game = this.game;
    if (!step) return;
    if (step.type === 'kill') {
      this.enemies = [];
      for (let i = 0; i < step.count; i += 1) {
        const a = (i / step.count) * Math.PI * 2;
        this.enemies.push(new Enemy(step.x + Math.cos(a) * 130, step.y + Math.sin(a) * 130));
      }
      this.kills = 0;
    }
    if (step.type === 'stealTarget') {
      const car = new Car(2250, 590, Math.PI / 2, 'sports', { color: '#d42a2a', driver: null });
      game.cars.push(car);
      this.targetCar = car;
      this.showMessage('There it is — the red Falco GT. Take it.', 4);
    }
    if (step.type === 'race') {
      // Street race: first gate is the start line, clock starts now.
      this.raceGate = 0;
      this.raceTimer = step.timeLimit;
      this.showMessage('Street Heat — hit every checkpoint before the clock runs out!', 4);
    }
    if (this.missionIndex === 2 && this.stepIndex === 0) {
      // Payback hands Danny a pistol.
      game.player.givePistol(12);
      this.showMessage('Vera gave you a pistol. 12 rounds in the mag.', 4);
    }
  }

  /** The map point the HUD arrow and minimap should point at, or null. */
  marker() {
    const step = this.step;
    if (!this.active || !step) {
      if (this.taxi.state === 'toPickup') return { x: this.taxi.pickup.x, y: this.taxi.pickup.y, color: '#4de3ff' };
      if (this.taxi.state === 'toDest') return { x: this.taxi.dest.x, y: this.taxi.dest.y, color: '#4de3ff' };
      return null;
    }
    if (step.type === 'steal') {
      const car = this.game.player.nearestStealableCar(this.game.cars);
      if (car) return { x: car.x, y: car.y, color: '#ffe14d' };
      return null;
    }
    if (step.type === 'stealTarget' && this.targetCar) {
      return { x: this.targetCar.x, y: this.targetCar.y, color: '#ff5d5d' };
    }
    if (step.type === 'kill') {
      const alive = this.enemies.find((e) => !e.dead);
      if (alive) return { x: alive.x, y: alive.y, color: '#ff5d5d' };
      return null;
    }
    if (step.type === 'race') {
      const gate = step.gates[this.raceGate];
      if (gate) return { x: gate.x, y: gate.y, color: '#ff9a3d' };
      return null;
    }
    if (step.x !== undefined) return { x: step.x, y: step.y, color: '#ffe14d' };
    return null;
  }

  objectiveText() {
    if (!this.active || !this.mission) {
      if (this.taxi.state === 'toPickup') return 'Taxi fare: pick up the passenger';
      if (this.taxi.state === 'toDest') return 'Taxi fare: drop the passenger off';
      return 'Free roam — find Vera at her garage to start the next job';
    }
    const step = this.step;
    let text = step.text;
    if (step.type === 'kill') text = 'Take down the Harbor Crew (' + this.kills + '/' + step.count + ')';
    if (step.type === 'race') {
      text = 'Checkpoint ' + this.raceGate + '/' + step.gates.length + ' — ' + Math.ceil(this.raceTimer) + 's left';
    }
    return this.mission.name + ': ' + text;
  }

  /** Advance one step; returns 'complete' when the mission is done. */
  advanceStep() {
    this.stepIndex += 1;
    if (this.stepIndex >= this.mission.steps.length) return 'complete';
    this.onStepStart();
    return 'step';
  }

  /** Finish the mission: pay out, start the next one, then save (so a save
   * made here records the NEXT mission, not the one just finished). */
  completeMission() {
    const mission = this.mission;
    const game = this.game;
    game.player.cash += mission.reward;
    this.completedCount += 1;
    this.showMessage('MISSION COMPLETE — ' + mission.name + '  +$' + mission.reward, 4);
    game.audio.missionDone();
    this.startMission(this.missionIndex + 1);
    game.saveGame();
  }

  failMission(reason) {
    this.failed = true;
    this.showMessage('MISSION FAILED — ' + reason, 4);
    this.game.audio.missionFail();
  }

  /** Retry the current mission from its first step. */
  retryMission() {
    this.startMission(this.missionIndex);
  }

  /** Called when the player presses E: returns true when the key did something. */
  interact() {
    const game = this.game;
    const player = game.player;
    const step = this.step;
    if (this.active && step && step.type === 'pickup' && step.x !== undefined) {
      const d = dist(player.x, player.y, step.x, step.y);
      if (d < step.r + 20) {
        if (this.missionIndex === 4) {
          game.wanted.add(200); // the bank job trips every alarm in the city
          this.showMessage('Vault cash grabbed! Every cop in Solmar Bay is coming.', 4);
        } else if (this.missionIndex === 6) {
          game.wanted.add(120); // the getaway job: three stars from the docks
          this.showMessage('Package grabbed. Three stars — don\'t stop for anyone.', 4);
        } else {
          game.wanted.add(25); // the drop is hot
          this.showMessage('Package grabbed. Cops are on to you — move!', 4);
        }
        game.audio.pickup();
        const done = this.advanceStep();
        if (done === 'complete') this.completeMission();
        return true;
      }
    }
    return false;
  }

  /** Per-frame mission logic: step completion, taxi fares, pickups. */
  update(dt) {
    const game = this.game;
    const player = game.player;
    if (this.messageTimer > 0) this.messageTimer -= dt;
    // Cash bundles.
    for (const bundle of this.cashPickups) {
      if (bundle.taken) continue;
      if (dist(player.x, player.y, bundle.x, bundle.y) < 34) {
        bundle.taken = true;
        player.cash += bundle.amount;
        game.audio.pickup();
        this.showMessage('Found a cash bundle  +$' + bundle.amount, 2.5);
      }
    }
    // Taxi fares: only while driving a taxi and no story step needs the player.
    this.updateTaxi(dt);
    if (!this.active || !this.step) return;
    const step = this.step;
    if (step.type === 'race') {
      // Street race: drive through the gates in order before the clock
      // runs out. Out of time sends Danny back to the start line.
      this.raceTimer -= dt;
      const gate = step.gates[this.raceGate];
      if (gate && dist(player.x, player.y, gate.x, gate.y) < step.r) {
        this.raceGate += 1;
        game.audio.pickup();
        if (this.raceGate >= step.gates.length) {
          const done = this.advanceStep();
          if (done === 'complete') this.completeMission();
        } else {
          this.showMessage('Checkpoint ' + this.raceGate + '/' + step.gates.length + '!', 2);
        }
      } else if (this.raceTimer <= 0) {
        this.showMessage('Out of time — back to the start line.', 4);
        game.audio.missionFail();
        this.retryMission();
      }
      return;
    }
    if (step.type === 'goto' || step.type === 'escape') {
      if (dist(player.x, player.y, step.x, step.y) < step.r) {
        const done = this.advanceStep();
        if (done === 'complete') this.completeMission();
      }
    } else if (step.type === 'steal') {
      if (player.inCar) {
        const done = this.advanceStep();
        if (done === 'complete') this.completeMission();
      }
    } else if (step.type === 'stealTarget') {
      if (player.car === this.targetCar) {
        game.wanted.add(120); // three stars the moment the GT moves
        this.showMessage('The GT is yours — and the whole SBPD knows it.', 4);
        const done = this.advanceStep();
        if (done === 'complete') this.completeMission();
      }
    } else if (step.type === 'kill') {
      if (this.kills >= step.count) {
        const done = this.advanceStep();
        if (done === 'complete') this.completeMission();
      }
    }
  }

  updateTaxi(dt) {
    const game = this.game;
    const player = game.player;
    const taxi = this.taxi;
    if (taxi.state === 'idle') {
      if (player.inCar && player.car.type === 'taxi') {
        taxi.timer -= dt;
        if (taxi.timer <= 0) {
          const p = randomRoadPointFar(game.rng, player.x, player.y, 350);
          taxi.pickup = p;
          taxi.state = 'toPickup';
          this.showMessage('Taxi fare waiting — pick up the passenger (blue marker).', 4);
        }
      } else {
        taxi.timer = 2;
      }
      return;
    }
    if (taxi.state === 'toPickup') {
      if (dist(player.x, player.y, taxi.pickup.x, taxi.pickup.y) < 55) {
        const d = randomRoadPointFar(game.rng, player.x, player.y, 500);
        taxi.dest = d;
        taxi.fare = 40 + Math.floor(game.rng() * 6) * 10;
        taxi.state = 'toDest';
        this.showMessage('Passenger aboard. Drop them at the blue marker.', 3);
      }
      return;
    }
    if (taxi.state === 'toDest') {
      if (dist(player.x, player.y, taxi.dest.x, taxi.dest.y) < 60) {
        player.cash += taxi.fare;
        this.showMessage('Fare complete  +$' + taxi.fare, 3);
        game.audio.pickup();
        taxi.state = 'idle';
        taxi.timer = 3;
      }
    }
  }

  /** Update the gang members: walk at the player, shoot when in range. */
  updateEnemies(dt) {
    const game = this.game;
    const player = game.player;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.walkPhase += dt * 6;
      const d = dist(enemy.x, enemy.y, player.x, player.y);
      enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      if (d > 90) {
        const speed = d > 320 ? 95 : 60;
        enemy.x += Math.cos(enemy.angle) * speed * dt;
        enemy.y += Math.sin(enemy.angle) * speed * dt;
      }
      enemy.shootCooldown -= dt;
      if (d < 340 && enemy.shootCooldown <= 0 && !player.dead) {
        enemy.shootCooldown = 1.1;
        game.enemyShoot(enemy, player);
      }
    }
  }
}
