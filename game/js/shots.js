// Screenshot scenes behind ?shot=chase|drive|foot|police|race|heist|bike|
// shotgun|swat. Each one plays the real rules forward from a fresh world
// for a fixed number of steps, steered by scripted inputs, so the frame is
// what real play looks like and the same seed always gives the same frame.
// The cover (heist) shows the M8 finale escape: five stars, Air One
// overhead, a SWAT van, the wanted level, the minimap and a mission
// objective in one screen.
import { Car } from './vehicles.js';
import { spawnPoliceCar, spawnSwatVan } from './police.js';

const STEP = 1 / 60;

/** Run the simulation forward `seconds` with a scripted input function. */
function playForward(game, seconds, inputFn) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    game.step(STEP, inputFn(i * STEP, game));
  }
  game.camera.update(1, game.player.x, game.player.y, 0, 0, game.player.inCar, 0.4);
}

/** Put Danny in a car of `type` at (x, y) on the given avenue heading,
 * already rolling at `speed` so the frame catches a moving car. */
function putPlayerInCar(game, type, x, y, angle, speed) {
  const car = new Car(x, y, angle, type, { driver: 'player' });
  car.speed = speed || 0;
  game.cars.push(car);
  game.player.enterCar(car);
  return car;
}

/** Place a police cruiser at an exact road spot, facing the player. */
function placePolice(game, x, y) {
  const police = spawnPoliceCar(game.city, game.rng, game.player.x, game.player.y);
  police.x = x;
  police.y = y;
  police.angle = Math.atan2(game.player.y - y, game.player.x - x);
  police.speed = 200;
  game.police.push(police);
  return police;
}

/** Place a SWAT van at an exact road spot, facing the player. */
function placeSwat(game, x, y) {
  const van = spawnSwatVan(game.city, game.rng, game.player.x, game.player.y);
  van.x = x;
  van.y = y;
  van.angle = Math.atan2(game.player.y - y, game.player.x - x);
  van.speed = 180;
  game.police.push(van);
  return van;
}

/**
 * Set the game to the named scene and return the screen to draw.
 * Any unknown name stages the heist (the cover).
 */
export function stageShot(name, game) {
  const shot = name || 'heist';
  if (shot === 'chase') return stageChase(game);
  if (shot === 'drive') return stageDrive(game);
  if (shot === 'foot') return stageFoot(game);
  if (shot === 'police') return stagePolice(game);
  if (shot === 'race') return stageRace(game);
  if (shot === 'bike') return stageBike(game);
  if (shot === 'shotgun') return stageShotgun(game);
  if (shot === 'swat') return stageSwat(game);
  return stageHeist(game);
}

/** Cover: the M8 Harbor Heist escape — five stars, Air One overhead, a
 * SWAT van in the mix, the loot in hand, the hideout ahead. */
function stageHeist(game) {
  game.resetWorld(20261119);
  game.startFreePlay();
  game.missions.startMission(7); // The Harbor Heist: the finale
  game.missions.stepIndex = 3; // the escape step
  game.missions.onStepStart();
  putPlayerInCar(game, 'sports', 3200, 1850, Math.PI, 250);
  game.wanted.add(400); // five stars: Air One + SWAT + roadblock join
  // Cruisers closing in from behind (east, since we flee west) and a SWAT
  // van cutting across from the cross street ahead (off the driving line,
  // so it hunts us instead of head-on wrecking the getaway car).
  placePolice(game, 3350, 1870);
  placePolice(game, 3380, 1820);
  placeSwat(game, 2750, 2050);
  playForward(game, 4, () => ({ up: true, down: false, left: false, right: false, run: false }));
  // Stage the car pristine: a smoking wreck reads as a lost escape, and
  // the cover should show the finale at its best (a fresh car mid-flight).
  if (game.player.car) {
    game.player.car.hp = game.player.car.def.hp;
    game.player.car.smoke = 0;
  }
  // Clear any pickup toast so the cover shows only the mission banner.
  game.missions.message = '';
  game.missions.messageTimer = 0;
  // Frozen dust puffs behind the player's car: the frame reads as motion.
  const rearX = game.player.x - Math.cos(game.player.angle) * 42;
  const rearY = game.player.y - Math.sin(game.player.angle) * 42;
  game.spawnDust(rearX, rearY, 8);
  game.spawnDust(game.player.x - Math.cos(game.player.angle) * 72, game.player.y - Math.sin(game.player.angle) * 72, 5);
  return { screen: 'play' };
}

/** Cover: a five-star pursuit down the avenue — Air One overhead, a
 * roadblock ahead, mission objective on the HUD. */
function stageChase(game) {
  game.resetWorld(20261119);
  game.startFreePlay();
  game.missions.startMission(3); // Hot Wheels: escape to the hideout
  game.missions.stepIndex = 2; // the escape step
  game.missions.onStepStart();
  putPlayerInCar(game, 'sports', 700, 1450, 0, 250);
  game.wanted.add(320); // five stars: Air One + roadblock join the chase
  // Three cruisers closing in from behind and the side, on the roads.
  placePolice(game, 440, 1470);
  placePolice(game, 320, 1420);
  placePolice(game, 1050, 1050);
  playForward(game, 4, () => ({ up: true, down: false, left: false, right: false, run: false }));
  // Stage the car pristine: a smoking wreck reads as a lost chase, and
  // the cover should show the pursuit at its best (a fresh car mid-chase).
  game.player.car.hp = game.player.car.def.hp;
  game.player.car.smoke = 0;
  // Clear any pickup toast so the cover shows only the mission banner.
  game.missions.message = '';
  game.missions.messageTimer = 0;
  // Frozen dust puffs behind the player's car: the frame reads as motion.
  const rearX = game.player.x - Math.cos(game.player.angle) * 42;
  const rearY = game.player.y - Math.sin(game.player.angle) * 42;
  game.spawnDust(rearX, rearY, 5);
  game.spawnDust(game.player.x - Math.cos(game.player.angle) * 72, game.player.y - Math.sin(game.player.angle) * 72, 3);
  return { screen: 'play' };
}

/** Cruising downtown in traffic at golden hour, no heat. */
function stageDrive(game) {
  game.resetWorld(20261119);
  game.startFreePlay();
  putPlayerInCar(game, 'sedan', 650, 650, 0, 250);
  playForward(game, 4, () => ({ up: true, down: false, left: false, right: false, run: false }));
  // A light dust trail so the cruise reads as moving, not parked.
  const rearX = game.player.x - Math.cos(game.player.angle) * 42;
  const rearY = game.player.y - Math.sin(game.player.angle) * 42;
  game.spawnDust(rearX, rearY, 5);
  return { screen: 'play' };
}

/** On foot at the docks, mid-fight with the Harbor Crew. */
function stageFoot(game) {
  game.resetWorld(20261119);
  game.startFreePlay();
  game.missions.startMission(2); // Payback
  game.missions.stepIndex = 1; // the kill step
  game.missions.onStepStart();
  game.player.x = 2960;
  game.player.y = 1450;
  game.player.angle = 0;
  game.player.givePistol(12);
  playForward(game, 2, (t) => {
    if (t > 0.6 && t < 0.9) return { up: true, down: false, left: false, right: true, run: false, punch: true };
    return { up: t < 0.6, down: false, left: false, right: false, run: false };
  });
  // Freeze a punch mid-swing for the shot.
  game.player.punchTimer = 0.2;
  // A frozen muzzle flash at the pistol's barrel tip: the shot reads as
  // a gunfight, not a still life. (Deterministic: fixed offset, no RNG.)
  game.particles.push({
    x: game.player.x + Math.cos(game.player.angle) * 26,
    y: game.player.y + Math.sin(game.player.angle) * 26,
    vx: 0, vy: 0, life: 1, maxLife: 1, color: '#ffe9a3', size: 9,
  });
  game.particles.push({
    x: game.player.x + Math.cos(game.player.angle) * 34,
    y: game.player.y + Math.sin(game.player.angle) * 34,
    vx: 0, vy: 0, life: 1, maxLife: 1, color: '#ff9a3d', size: 5,
  });
  return { screen: 'play' };
}

/** Two stars, a roadblock ahead and cruisers converging on the player. */
function stagePolice(game) {
  game.resetWorld(20261119);
  game.startFreePlay();
  game.missions.startMission(1); // The Drop: the delivery run
  game.missions.stepIndex = 2;
  game.missions.onStepStart();
  putPlayerInCar(game, 'coupe', 2400, 2250, Math.PI, 250);
  game.wanted.add(60); // two stars
  // Two cruisers closing in from behind (east, since we head west).
  placePolice(game, 2700, 2270);
  placePolice(game, 2830, 2210);
  // A roadblock across the avenue ahead of the player.
  const block = game.makeRoadblock(Math.PI);
  game.police.push(...block);
  playForward(game, 2.8, () => ({ up: true, down: false, left: false, right: false, run: false }));
  return { screen: 'play' };
}

/** Street Heat: mid-race down Casino Row, the first checkpoint gate ahead. */
function stageRace(game) {
  game.resetWorld(20261119);
  game.startFreePlay();
  game.missions.startMission(5); // Street Heat
  game.missions.stepIndex = 1; // the race step (gates + 60s clock)
  game.missions.onStepStart();
  putPlayerInCar(game, 'sports', 1500, 650, 0, 300);
  playForward(game, 2.5, () => ({ up: true, down: false, left: false, right: false, run: false }));
  // Frozen dust puffs behind the race car: the frame reads as speed.
  const rearX = game.player.x - Math.cos(game.player.angle) * 42;
  const rearY = game.player.y - Math.sin(game.player.angle) * 42;
  game.spawnDust(rearX, rearY, 8);
  return { screen: 'play' };
}

/** Street Heat on the Solmar Streak: the bike threads dense downtown
 * traffic through the race gates — the fastest ride in the game. */
function stageBike(game) {
  game.resetWorld(20261119);
  game.startFreePlay();
  game.missions.startMission(5); // Street Heat
  game.missions.stepIndex = 1; // the race step (gates + 60s clock)
  game.missions.onStepStart();
  putPlayerInCar(game, 'bike', 1500, 650, 0, 300);
  playForward(game, 2.5, () => ({ up: true, down: false, left: false, right: false, run: false }));
  // Frozen dust puffs behind the bike: the frame reads as speed.
  const rearX = game.player.x - Math.cos(game.player.angle) * 42;
  const rearY = game.player.y - Math.sin(game.player.angle) * 42;
  game.spawnDust(rearX, rearY, 8);
  return { screen: 'play' };
}

/** On foot at the docks with the shotgun: a five-pellet blast frozen
 * mid-flight at the nearest Harbor Crew member. */
function stageShotgun(game) {
  game.resetWorld(20261119);
  game.startFreePlay();
  game.missions.startMission(7); // The Harbor Heist
  game.missions.stepIndex = 1; // the kill step: 6 crew + shotgun granted
  game.missions.onStepStart();
  // Stand just off the vault (the crew spawns in a ring around it) so the
  // fight is in frame; the crew closes in during the first second.
  game.player.x = 3080;
  game.player.y = 1760;
  game.player.angle = 0.5;
  // Hold still while the crew closes in, then freeze one shotgun blast
  // mid-flight at the nearest crew member.
  playForward(game, 1, () => ({ up: false, down: false, left: false, right: false, run: false }));
  const foe = game.missions.enemies.find((e) => !e.dead);
  if (foe) {
    const cam = game.camera;
    game.mouse.x = (foe.x - cam.x) * cam.zoom + 640;
    game.mouse.y = (foe.y - cam.y) * cam.zoom + 360;
    game.tryShoot();
    for (let i = 0; i < 3; i += 1) {
      game.step(STEP, { up: false, down: false, left: false, right: false, run: false });
    }
  }
  // A frozen muzzle flash at the shotgun's barrel tip: the shot reads as
  // a gunfight, not a still life. (Deterministic: fixed offset, no RNG.)
  game.particles.push({
    x: game.player.x + Math.cos(game.player.angle) * 30,
    y: game.player.y + Math.sin(game.player.angle) * 30,
    vx: 0, vy: 0, life: 1, maxLife: 1, color: '#ffe9a3', size: 11,
  });
  game.particles.push({
    x: game.player.x + Math.cos(game.player.angle) * 40,
    y: game.player.y + Math.sin(game.player.angle) * 40,
    vx: 0, vy: 0, life: 1, maxLife: 1, color: '#ff9a3d', size: 6,
  });
  return { screen: 'play' };
}

/** Four stars: a SWAT van and a roadblock ahead, cruisers behind. */
function stageSwat(game) {
  game.resetWorld(20261119);
  game.startFreePlay();
  game.missions.startMission(1); // The Drop: the delivery run
  game.missions.stepIndex = 2;
  game.missions.onStepStart();
  putPlayerInCar(game, 'coupe', 2400, 2250, Math.PI, 250);
  game.wanted.add(200); // four stars: the first SWAT van rolls out
  // Two cruisers closing in from behind (east, since we head west) and a
  // SWAT van holding the avenue just past the roadblock, clear of the
  // pileup so it reads as its own vehicle in the frame.
  placePolice(game, 2700, 2270);
  placePolice(game, 2830, 2210);
  placeSwat(game, 1850, 2320);
  const block = game.makeRoadblock(Math.PI);
  game.police.push(...block);
  playForward(game, 2.8, () => ({ up: true, down: false, left: false, right: false, run: false }));
  // Stage the car pristine: it ploughs into the blockade, and the shot
  // should show the chase at its best, not a wreck.
  if (game.player.car) {
    game.player.car.hp = game.player.car.def.hp;
    game.player.car.smoke = 0;
  }
  // Frame the SWAT van: the chase piles it into the roadblock, where it
  // reads as just another cruiser. Park it clear ahead of the player,
  // nose-to-nose with the getaway car, so the 4-star threat is visible.
  const van = game.police.find((p) => p.type === 'swat');
  if (van && game.player.car) {
    van.x = game.player.x - 280;
    van.y = game.player.y - 60;
    van.angle = Math.atan2(game.player.y - van.y, game.player.x - van.x);
    van.speed = 0;
  }
  return { screen: 'play' };
}
