// Screenshot scenes behind ?shot=chase|drive|foot|police. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by
// scripted inputs, so the frame is what real play looks like and the same seed
// always gives the same frame. The cover (chase) shows a police pursuit with
// the wanted level, the minimap and a mission objective in one screen.
import { Car } from './vehicles.js';
import { spawnPoliceCar } from './police.js';

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

/**
 * Set the game to the named scene and return the screen to draw.
 * Any unknown name stages the chase (the cover).
 */
export function stageShot(name, game) {
  const shot = name || 'chase';
  if (shot === 'drive') return stageDrive(game);
  if (shot === 'foot') return stageFoot(game);
  if (shot === 'police') return stagePolice(game);
  return stageChase(game);
}

/** Cover: a three-star pursuit down the avenue, mission objective on the HUD. */
function stageChase(game) {
  game.resetWorld(20261119);
  game.startFreePlay();
  game.missions.startMission(3); // Hot Wheels: escape to the hideout
  game.missions.stepIndex = 2; // the escape step
  game.missions.onStepStart();
  putPlayerInCar(game, 'sports', 700, 1450, 0, 250);
  game.wanted.add(120); // three stars
  // Three cruisers closing in from behind and the side, on the roads.
  placePolice(game, 440, 1470);
  placePolice(game, 320, 1420);
  placePolice(game, 1050, 1050);
  playForward(game, 4, () => ({ up: true, down: false, left: false, right: false, run: false }));
  return { screen: 'play' };
}

/** Cruising downtown in traffic at golden hour, no heat. */
function stageDrive(game) {
  game.resetWorld(20261119);
  game.startFreePlay();
  putPlayerInCar(game, 'sedan', 650, 650, 0, 250);
  playForward(game, 4, () => ({ up: true, down: false, left: false, right: false, run: false }));
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
