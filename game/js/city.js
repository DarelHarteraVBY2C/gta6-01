// Solmar Bay: the city itself. A seeded grid of avenues and streets, blocks of
// buildings, a beach and sea to the south, a park in the middle, and a port to the
// east. Everything is generated from one seed, so the map is identical every run.
import { mulberry32, rand, randi, pick, clamp, circleHitsRect, pushCircleOutOfRect } from './utils.js';

export const CITY_WIDTH = 3400;
export const CITY_HEIGHT = 2600;
export const ROAD_HALF = 55; // half the drivable width of a road
export const WALK_HALF = 70; // half width including the sidewalk strip

// Avenue (horizontal) centre lines and street (vertical) centre lines.
export const AVENUES = [250, 650, 1050, 1450, 1850, 2250];
export const STREETS = [250, 650, 1050, 1450, 1850, 2250, 2650, 3050];

// District names shown on the HUD and the minimap.
export const DISTRICTS = [
  { name: 'Old Town', x: 0, y: 0, w: 900, h: 900 },
  { name: 'Downtown', x: 900, y: 0, w: 1400, h: 1300 },
  { name: 'Harbor Port', x: 2650, y: 0, w: 750, h: 2600 },
  { name: 'Palm Heights', x: 0, y: 900, w: 900, h: 1300 },
  { name: 'Casino Row', x: 1850, y: 900, w: 800, h: 900 },
  { name: 'Boardwalk', x: 0, y: 2200, w: 3400, h: 400 },
];

const BUILDING_PALETTE = [
  '#c9a37e', '#b98d68', '#a8b6c4', '#8fa3b8', '#d8c9a3', '#9db3a4',
  '#c47f6e', '#7e93a8', '#b5a48f', '#94a89a', '#d0b48c', '#8a7f9e',
];
const GLASS_PALETTE = ['#3d5a73', '#2f4a5e', '#4a6b7d', '#35505f'];
const NEON_SIGNS = ['HOTEL', 'CASINO', 'BAR', 'PIZZA', 'MOTEL', 'CLUB', '24H', 'TACOS', 'GYM', 'PAWN'];

/** True when the point is on a drivable road (avenue or street). */
export function isOnRoad(x, y) {
  for (const a of AVENUES) if (Math.abs(y - a) < ROAD_HALF) return true;
  for (const s of STREETS) if (Math.abs(x - s) < ROAD_HALF) return true;
  return false;
}

/** Nearest road centre coordinate for an axis: returns {axis, line, along}. */
export function nearestRoad(x, y) {
  let best = null;
  for (const a of AVENUES) {
    const d = Math.abs(y - a);
    if (!best || d < best.d) best = { axis: 'h', line: a, along: x, d };
  }
  for (const s of STREETS) {
    const d = Math.abs(x - s);
    if (!best || d < best.d) best = { axis: 'v', line: s, along: y, d };
  }
  return best;
}

/** A random point on a random road, from the given rng. */
export function randomRoadPoint(rng) {
  if (rng() < 0.5) {
    const a = pick(rng, AVENUES);
    return { x: rand(rng, 80, CITY_WIDTH - 80), y: a + rand(rng, -30, 30) };
  }
  const s = pick(rng, STREETS);
  return { x: s + rand(rng, -30, 30), y: rand(rng, 80, CITY_HEIGHT - 80) };
}

/** A random road point at least `minDist` away from (x, y). */
export function randomRoadPointFar(rng, x, y, minDist) {
  for (let i = 0; i < 40; i += 1) {
    const p = randomRoadPoint(rng);
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy > minDist * minDist) return p;
  }
  return randomRoadPoint(rng);
}

/** Generate the whole city from a seed. Returns buildings, trees, props and zones. */
export function generateCity(seed) {
  const rng = mulberry32(seed);
  const buildings = [];
  const trees = [];
  const props = []; // {x, y, kind: 'palm'|'lamp'|'hydrant'|'bench'|'container'|'crane'}
  const signs = []; // neon signs on buildings {x, y, text, color}

  // The park block: streets 1450..1850, avenues 1050..1450.
  const park = { x: 1520, y: 1120, w: 260, h: 260 };
  // The beach: everything south of y = 2380 is sand, the sea starts at 2520.
  const beach = { y: 2380, seaY: 2520 };

  // Buildings fill every block between roads, except the park block and the
  // beach strip. A block is split into 1-3 buildings with a small gap.
  for (let si = 0; si < STREETS.length - 1; si += 1) {
    for (let ai = 0; ai < AVENUES.length - 1; ai += 1) {
      const x0 = STREETS[si] + WALK_HALF + 8;
      const x1 = STREETS[si + 1] - WALK_HALF - 8;
      const y0 = AVENUES[ai] + WALK_HALF + 8;
      const y1 = AVENUES[ai + 1] - WALK_HALF - 8;
      if (y0 > beach.y) continue; // beach strip has no buildings
      // Park block: trees and a pond instead of buildings.
      if (x0 >= park.x - 20 && y0 >= park.y - 20 && x1 <= park.x + park.w + 20 && y1 <= park.y + park.h + 20) {
        for (let t = 0; t < 14; t += 1) {
          trees.push({ x: rand(rng, park.x + 15, park.x + park.w - 15), y: rand(rng, park.y + 15, park.y + park.h - 15), r: rand(rng, 10, 16) });
        }
        continue;
      }
      const downtown = x0 > 850 && x0 < 2300 && y0 < 1300;
      const splits = randi(rng, 1, 3);
      const bw = (x1 - x0) / splits;
      for (let k = 0; k < splits; k += 1) {
        const bx = x0 + k * bw + 6;
        const by = y0 + 6;
        const w = bw - 12;
        const h = (y1 - y0) - 12;
        if (w < 40 || h < 40) continue;
        const color = downtown && rng() < 0.55 ? pick(rng, GLASS_PALETTE) : pick(rng, BUILDING_PALETTE);
        buildings.push({
          x: bx, y: by, w, h, color,
          tall: downtown && rng() < 0.5,
          roof: rng(),
        });
        // A neon sign on some buildings facing the street.
        if (rng() < 0.22) {
          signs.push({
            x: bx + w / 2, y: by + 4,
            text: pick(rng, NEON_SIGNS),
            color: pick(rng, ['#ff5d8f', '#4de3ff', '#ffe14d', '#7dff6e', '#ff9a3d']),
          });
        }
      }
    }
  }

  // Palm trees along the boardwalk and the beach, lamps along every avenue.
  for (let x = 120; x < CITY_WIDTH; x += 130) {
    props.push({ x, y: beach.y + 55, kind: 'palm' });
    if (rng() < 0.7) props.push({ x: x + 60, y: beach.y + 110, kind: 'palm' });
  }
  for (const a of AVENUES) {
    for (let x = 330; x < CITY_WIDTH - 100; x += 400) {
      props.push({ x, y: a - ROAD_HALF - 6, kind: 'lamp' });
    }
  }
  // Port containers and cranes on the east edge.
  for (let i = 0; i < 10; i += 1) {
    props.push({ x: rand(rng, 3120, 3320), y: rand(rng, 300, 2100), kind: 'container', color: pick(rng, ['#c96a3b', '#3b7dc9', '#5da24a', '#c9a13b']) });
  }
  for (let i = 0; i < 3; i += 1) {
    props.push({ x: 3260, y: 500 + i * 700, kind: 'crane' });
  }
  // Scattered palms in residential blocks.
  for (let i = 0; i < 26; i += 1) {
    trees.push({ x: rand(rng, 100, 3200), y: rand(rng, 100, 2300), r: rand(rng, 9, 14) });
  }

  return { buildings, trees, props, signs, park, beach };
}

/** Resolve a circle against every building; returns corrected {x, y}. */
export function resolveBuildings(city, x, y, r) {
  let nx = x;
  let ny = y;
  for (const b of city.buildings) {
    if (nx + r < b.x || nx - r > b.x + b.w || ny + r < b.y || ny - r > b.y + b.h) continue;
    const fixed = pushCircleOutOfRect(nx, ny, r, b);
    if (fixed) { nx = fixed.x; ny = fixed.y; }
  }
  return { x: nx, y: ny };
}

/** True when the circle overlaps any building. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (circleHitsRect(x, y, r, b)) return true;
  }
  return false;
}

/** Clamp a point inside the city, keeping out of the sea. */
export function clampToCity(x, y, r) {
  return {
    x: clamp(x, r, CITY_WIDTH - r),
    y: clamp(y, r, CITY_HEIGHT - 120 - r),
  };
}

/** Name of the district containing (x, y). */
export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d.name;
  }
  return 'Solmar Bay';
}
