[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![make.fun rank](https://make.fun/badge/gta6-01/DarelHarteraVBY2C/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![make.fun reward](https://make.fun/badge/gta6-01/DarelHarteraVBY2C/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Solmar Bay: Sunset Hustle

An original open-world crime game in the spirit of GTA 6 — built from scratch
in plain HTML5 Canvas and JavaScript, no libraries, no network, no assets to
download. You are **Danny Cole**, a getaway driver in the sun-soaked coastal
city of **Solmar Bay**. Run five jobs for the fixer Vera, steal cars, outrun
the Solmar Bay Police Department, and take the city for yourself.

Everything is original: the city, the characters, the vehicles, the story and
the music. Nothing is taken from any commercial game.

## The city

Solmar Bay is a 3400 × 2600 open world: six avenues and eight streets of
traffic, downtown glass towers, Old Town, Casino Row, the Harbor Port with its
cranes and containers, a park, and a boardwalk beach with palms and the sea.
Traffic cars drive the grid, pedestrians stroll the sidewalks (and run when
things get loud), and the SBPD answers every crime with a wanted level from
one to five stars.

## Systems

- **On foot and by car** — walk, run, punch, shoot; steal any parked or
  driven car (press E) and drive it with arcade physics
- **Wanted level + police** — stealing, hitting pedestrians, shooting and
  crashing raise your heat; cruisers chase and ram you, and at three stars
  the SBPD sets up roadblocks. Lie low and the heat cools off — or get
  busted and lose 10% of your cash
- **Missions + story** — five jobs for Vera: *Wheels Up*, *The Drop*,
  *Payback*, *Hot Wheels* and *The Big Score*, with markers, an objective
  banner, a minimap and an off-screen arrow
- **Combat** — fists and a pistol, armed Harbor Crew gunmen, car explosions
- **Side work** — taxi fares (steal a taxi and passengers appear) and cash
  bundles hidden around the city
- **HUD + minimap** — health, armour, cash, wanted stars, speed, district
  name, and a live minimap with police, traffic and the mission marker
- **Start screen, pause, save** — progress saves to localStorage after every
  mission; continue where you left off
- **Sound** — fully synthesized WebAudio: engine hum, two-tone sirens,
  gunshots, and a sunset-drive music loop (M to mute)

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move on foot / drive |
| Shift | Run |
| E | Steal / exit car, grab a package |
| F | Punch |
| Mouse + click (or Space) | Aim and shoot |
| P / Esc | Pause |
| M | Mute |
| Enter | Confirm / retry |

## Play it

Serve `game/` with any static server and open `index.html` in desktop
Chrome, for example:

```sh
cd game
python3 -m http.server 8080
# open http://localhost:8080
```

No build step, no network request — every file the game loads is under
`game/`.

## Layout

```
game/
  index.html        page shell
  style.css         page chrome
  js/
    main.js         boot, state machine, loop, combat resolution, save
    city.js         the city: roads, buildings, beach, park, port
    player.js       Danny on foot: move, punch, shoot, steal
    vehicles.js     car types, driving physics, parking, collisions
    traffic.js      traffic AI and pedestrians
    police.js       wanted system, cruiser pursuit, roadblocks, busts
    missions.js     the five-job story, taxi fares, cash bundles
    hud.js          health, stars, cash, objective, minimap
    render.js       golden-hour rendering, camera, menus
    audio.js        synthesized WebAudio: engine, sirens, music
    shots.js        deterministic screenshot scenes (?shot=chase|drive|foot|police)
    utils.js        seeded RNG and math helpers
```

## Entry program

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to the output directory and writes `dossier.json` with the vendored
`vendor/makefun-game.ts` library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).
