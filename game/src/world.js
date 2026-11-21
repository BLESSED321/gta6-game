// The game's rules and state, with no drawing and no browser in it: a city
// larger than the screen, the player on foot and in cars, traffic, pedestrians,
// police, a wanted system, missions, money and health. step() advances one
// fixed step and returns what happened as bit flags, so the caller can react
// without the world knowing about screens or sound.
// Re-authored: two safehouses — the Getaway mission ends at whichever one the
// player reaches — and police rams use the gentler WANTED.ramDamage.
import { CAR_SIZE, CAR_TYPES, CROWD, HEALTH, MISSIONS, PLAYER, ROADS, SAFEHOUSES, WANTED, WORLD } from './config.js';

export const EVENT_HIT = 1;
export const EVENT_CASH = 2;
export const EVENT_OVER = 4;
export const EVENT_MISSION = 8;
export const EVENT_WANTED = 16;

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
/** Push a circle out of an axis-aligned rectangle; returns true if it hit. */
function circleRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 === 0) return { x: 0, y: -r };
  const d = Math.sqrt(d2);
  return { x: (dx / d) * (r - d), y: (dy / d) * (r - d) };
}
function onRoad(x, y) {
  const r = ROADS.width / 2;
  for (const rx of ROADS.vertical) if (Math.abs(x - rx) <= r) return true;
  for (const ry of ROADS.horizontal) if (Math.abs(y - ry) <= r) return true;
  return false;
}
function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of ROADS.vertical) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y }; }
  }
  for (const ry of ROADS.horizontal) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x, y: ry }; }
  }
  return best;
}
/** Whichever safehouse is nearer to (x, y). */
function nearestSafehouse(x, y) {
  let best = SAFEHOUSES[0];
  let bestD = dist(x, y, best.x, best.y);
  for (const s of SAFEHOUSES) {
    const d = dist(x, y, s.x, s.y);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

export function createWorld(random) {
  // ---- City layout (deterministic from the seed) -------------------------
  const buildings = [];
  const parks = [];
  const water = { x: 2860, y: 2060, w: 340, h: 340 };
  const xs = [0, 460, 1060, 1660, 2260, 2860];
  const xe = [340, 940, 1540, 2140, 2740, 3200];
  const ys = [0, 460, 1060, 1660, 2260];
  const ye = [340, 940, 1540, 2140, 2400];
  const roofColors = ['#3d4454', '#464d5e', '#39404f', '#4a5162'];
  for (let ci = 0; ci < xs.length; ci += 1) {
    for (let ri = 0; ri < ys.length; ri += 1) {
      const bx = xs[ci];
      const by = ys[ri];
      const bw = xe[ci] - bx;
      const bh = ye[ri] - by;
      if (bx >= water.x && by >= water.y) continue; // the beach / water corner
      if ((ci === 2 && ri === 2) || (ci === 4 && ri === 0)) {
        parks.push({ x: bx + 20, y: by + 20, w: bw - 40, h: bh - 40 });
        continue;
      }
      const count = 1 + Math.floor(random() * 2);
      for (let k = 0; k < count; k += 1) {
        const w = 90 + random() * Math.max(40, bw - 200);
        const h = 80 + random() * Math.max(40, bh - 180);
        const x = bx + 20 + random() * Math.max(1, bw - w - 40);
        const y = by + 20 + random() * Math.max(1, bh - h - 40);
        buildings.push({ x, y, w, h, color: roofColors[Math.floor(random() * roofColors.length)] });
      }
    }
  }
  // Fixed landmarks, so missions always have somewhere to point at.
  const docks = { x: 3050, y: 1500 };
  const safehouse = SAFEHOUSES[0];
  const safehouse2 = SAFEHOUSES[1];
  const sprayShop = { x: 1600, y: 2200 };
  const pickupSpot = { x: 2200, y: 1000 };

  // ---- Entities -----------------------------------------------------------
  const player = {
    x: 1600, y: 900, angle: -Math.PI / 2, health: HEALTH.max,
    invulnerable: 0, punchCooldown: 0, inCar: null, facing: -Math.PI / 2,
  };
  const cars = [];
  const peds = [];
  const pickups = [];
  const state = {
    player, cars, peds, pickups, buildings, parks, water,
    docks, safehouse, safehouse2, sprayShop, pickupSpot,
    money: 0, score: 0, elapsed: 0,
    wanted: 0, lastCrime: -999, hideTimer: 0, policeTimer: 0,
    missionIndex: 0, missionStage: 'steal', bags: 0, bagsTotal: 3,
    marker: null, toast: '', toastTimer: 0,
    over: false, overReason: '', bustedTimer: 0,
    missionsDone: false, carsStolen: 0, pedsHit: 0,
  };

  function makeCar(type, x, y, angle, driver) {
    const t = CAR_TYPES[type];
    return {
      type, x, y, angle, speed: 0, health: t.health, driver,
      color: t.color, topSpeed: t.topSpeed, accel: t.accel, brake: t.brake,
      steer: t.steer, grip: t.grip, isPolice: type === 'police', ramCd: 0,
      roadAxis: 'v', road: x, dir: 1, lane: 20, stuck: 0, reverseTimer: 0, stolen: false,
    };
  }
  function spawnTrafficCar() {
    const types = ['sedan', 'sedan', 'taxi', 'van', 'sedan', 'sports'];
    const type = types[Math.floor(random() * types.length)];
    const vertical = random() < 0.5;
    let x;
    let y;
    let angle;
    if (vertical) {
      x = ROADS.vertical[Math.floor(random() * ROADS.vertical.length)] + (random() < 0.5 ? -20 : 20);
      y = 100 + random() * (WORLD.height - 200);
      angle = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      y = ROADS.horizontal[Math.floor(random() * ROADS.horizontal.length)] + (random() < 0.5 ? -20 : 20);
      x = 100 + random() * (WORLD.width - 200);
      angle = random() < 0.5 ? 0 : Math.PI;
    }
    const car = makeCar(type, x, y, angle, 'traffic');
    car.speed = 120 + random() * 80;
    car.roadAxis = vertical ? 'v' : 'h';
    car.road = vertical ? x : y;
    car.dir = vertical ? (angle > 0 ? 1 : -1) : (angle === 0 ? 1 : -1);
    cars.push(car);
    return car;
  }
  function spawnPed(x, y) {
    const px = x !== undefined ? x : 100 + random() * (WORLD.width - 200);
    const py = y !== undefined ? y : 100 + random() * (WORLD.height - 200);
    const ped = {
      x: px, y: py, angle: random() * TAU, speed: 50 + random() * 40,
      tx: px, ty: py, health: 100, isCop: false, flee: 0, down: false, downTimer: 0,
    };
    peds.push(ped);
    return ped;
  }
  function addPickup(kind, x, y, value) {
    pickups.push({ kind, x, y, value, active: true, bob: random() * TAU });
  }
  function setToast(text, seconds) {
    state.toast = text;
    state.toastTimer = seconds || 3.5;
  }
  function addCrime(stars) {
    state.wanted = clamp(state.wanted + stars, 0, WANTED.maxStars);
    state.lastCrime = state.elapsed;
    state.hideTimer = 0;
  }
  function missionDef() {
    return MISSIONS[state.missionIndex] || null;
  }
  function setMarker(x, y, label, color) {
    state.marker = { x, y, label, color: color || '#4ade80' };
  }
  function startMission(index) {
    state.missionIndex = index;
    const def = MISSIONS[index];
    if (!def) { state.missionsDone = true; state.marker = null; return; }
    if (index === 0) {
      state.missionStage = 'steal';
      const car = state.missionCar;
      setMarker(car.x, car.y, 'Steal the Comet GT', '#ff5d73');
      setToast(`Mission ${def.id}: ${def.name} — ${def.brief}`);
    } else if (index === 1) {
      state.missionStage = 'pickup';
      setMarker(pickupSpot.x, pickupSpot.y, 'Pick up the package', '#4ade80');
      setToast(`Mission ${def.id}: ${def.name} — ${def.brief}`);
    } else if (index === 2) {
      state.missionStage = 'escape';
      addCrime(2);
      const near = nearestSafehouse(player.x, player.y);
      setMarker(near.x, near.y, 'Reach a safehouse', '#f2c94c');
      setToast(`Mission ${def.id}: ${def.name} — ${def.brief}`);
    } else if (index === 3) {
      state.missionStage = 'bags';
      state.bags = 0;
      addPickup('bag', 1600, 400, 0);
      addPickup('bag', 400, 1600, 0);
      addPickup('bag', 2800, 1000, 0);
      setMarker(1600, 400, 'Cash bag 1 of 3', '#4ade80');
      setToast(`Mission ${def.id}: ${def.name} — ${def.brief}`);
    }
  }
  function completeMission() {
    const def = missionDef();
    if (!def) return;
    state.money += def.reward;
    state.score += def.reward;
    setToast(`Mission complete: ${def.name} — +$${def.reward}`);
    startMission(state.missionIndex + 1);
  }

  function reset() {
    player.x = 1600;
    player.y = 900;
    player.angle = -Math.PI / 2;
    player.facing = -Math.PI / 2;
    player.health = HEALTH.max;
    player.invulnerable = 0;
    player.punchCooldown = 0;
    player.inCar = null;
    cars.length = 0;
    peds.length = 0;
    pickups.length = 0;
    state.money = 0;
    state.score = 0;
    state.elapsed = 0;
    state.wanted = 0;
    state.lastCrime = -999;
    state.hideTimer = 0;
    state.policeTimer = 0;
    state.missionIndex = 0;
    state.missionStage = 'steal';
    state.bags = 0;
    state.over = false;
    state.overReason = '';
    state.bustedTimer = 0;
    state.missionsDone = false;
    state.carsStolen = 0;
    state.pedsHit = 0;
    // The mission car: a red sports car parked on Ocean Drive, ready to steal.
    const missionCar = makeCar('sports', 1000, 340, 0, 'parked');
    cars.push(missionCar);
    state.missionCar = missionCar;
    // Parked cars around the city.
    const parkedSpots = [
      ['sedan', 400, 460, Math.PI / 2], ['taxi', 2200, 460, 0], ['van', 1600, 1060, Math.PI],
      ['sedan', 2800, 1060, -Math.PI / 2], ['sports', 400, 1660, 0], ['sedan', 2200, 1660, Math.PI / 2],
      ['taxi', 1000, 2200, 0], ['van', 2800, 2200, -Math.PI / 2], ['sedan', 1600, 460, Math.PI],
    ];
    for (const [type, x, y, angle] of parkedSpots) cars.push(makeCar(type, x, y, angle, 'parked'));
    for (let i = 0; i < CROWD.traffic; i += 1) spawnTrafficCar();
    for (let i = 0; i < CROWD.pedestrians; i += 1) spawnPed();
    // Loose cash and health pickups on the sidewalks.
    addPickup('cash', 1060, 460, 50);
    addPickup('cash', 2260, 1060, 30);
    addPickup('cash', 460, 1660, 40);
    addPickup('cash', 1660, 2260, 50);
    addPickup('health', 1060, 1660, 0);
    addPickup('health', 2260, 460, 0);
    startMission(0);
  }

  // ---- Collisions ----------------------------------------------------------
  function collideBuildings(x, y, r) {
    let px = x;
    let py = y;
    for (const b of buildings) {
      const push = circleRect(px, py, r, b);
      if (push) { px += push.x; py += push.y; }
    }
    const wPush = circleRect(px, py, r, water);
    if (wPush) { px += wPush.x; py += wPush.y; }
    return { x: px, y: py };
  }

  function enterCar() {
    if (player.inCar) {
      const car = player.inCar;
      player.inCar = null;
      car.driver = 'parked';
      car.speed = 0;
      player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 44;
      player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 44;
      const fixed = collideBuildings(player.x, player.y, PLAYER.radius);
      player.x = fixed.x;
      player.y = fixed.y;
      return true;
    }
    let best = null;
    let bestD = 80;
    for (const car of cars) {
      if (car.isPolice && car.driver === 'police') continue;
      if (car.driver === 'wrecked' || car.health <= 0) continue; // a wreck is not a ride
      const d = dist(player.x, player.y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (!best) return false;
    player.inCar = best;
    if (best.driver !== 'player') {
      if (best.driver === 'parked' || best.driver === 'traffic') {
        if (!best.stolen) {
          best.stolen = true;
          state.carsStolen += 1;
          addCrime(1);
          setToast('Car stolen! The cops have been called.');
        }
      }
      best.driver = 'player';
    }
    player.x = best.x;
    player.y = best.y;
    if (state.missionStage === 'steal' && best === state.missionCar) completeMission();
    return true;
  }

  function punch() {
    if (player.punchCooldown > 0 || player.inCar) return;
    player.punchCooldown = PLAYER.punchCooldown;
    const fx = player.x + Math.cos(player.facing) * PLAYER.punchRange;
    const fy = player.y + Math.sin(player.facing) * PLAYER.punchRange;
    for (const ped of peds) {
      if (ped.down) continue;
      if (dist(fx, fy, ped.x, ped.y) < 34) {
        ped.health -= PLAYER.punchDamage;
        ped.flee = 3;
        if (ped.isCop) addCrime(1);
        if (ped.health <= 0) { ped.down = true; ped.downTimer = 6; }
        return;
      }
    }
  }

  function nearestPoliceDistance() {
    let best = Infinity;
    for (const car of cars) if (car.isPolice) best = Math.min(best, dist(player.x, player.y, car.x, car.y));
    for (const ped of peds) if (ped.isCop && !ped.down) best = Math.min(best, dist(player.x, player.y, ped.x, ped.y));
    return best;
  }

  function spawnPolice() {
    const wantCars = Math.min(3, state.wanted);
    const haveCars = cars.filter((c) => c.isPolice).length;
    if (haveCars < wantCars) {
      const angle = random() * TAU;
      const x = clamp(player.x + Math.cos(angle) * 900, 100, WORLD.width - 100);
      const y = clamp(player.y + Math.sin(angle) * 700, 100, WORLD.height - 100);
      const near = nearestRoadPoint(x, y);
      const car = makeCar('police', near.x, near.y, angleTo(near.x, near.y, player.x, player.y), 'police');
      cars.push(car);
    }
    const wantCops = Math.min(4, state.wanted + 1);
    const haveCops = peds.filter((p) => p.isCop && !p.down).length;
    if (haveCops < wantCops && random() < 0.02) {
      const angle = random() * TAU;
      const cop = spawnPed(
        clamp(player.x + Math.cos(angle) * 500, 60, WORLD.width - 60),
        clamp(player.y + Math.sin(angle) * 500, 60, WORLD.height - 60),
      );
      cop.isCop = true;
      cop.speed = 170;
    }
  }

  function stepCar(car, dt, throttle, steer) {
    const t = CAR_TYPES[car.type];
    if (throttle > 0) car.speed += t.accel * throttle * dt;
    else if (throttle < 0) car.speed += (car.speed > 0 ? -t.brake : t.accel * 0.6) * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
    car.speed = clamp(car.speed, -t.topSpeed * 0.45, t.topSpeed);
    const turn = steer * t.steer * clamp(Math.abs(car.speed) / 200, 0, 1) * (car.speed < 0 ? -1 : 1);
    car.angle += turn * dt;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const fixed = collideBuildings(nx, ny, 26);
    if (fixed.x !== nx || fixed.y !== ny) {
      if (Math.abs(car.speed) > 240) {
        car.health -= 4;
        if (car === player.inCar && player.invulnerable === 0) {
          player.health -= 3;
          player.invulnerable = 0.8;
        }
      }
      car.speed *= 0.45;
    }
    car.x = clamp(fixed.x, 30, WORLD.width - 30);
    car.y = clamp(fixed.y, 30, WORLD.height - 30);
  }

  function stepTraffic(car, dt) {
    // Follow its road; at an intersection, sometimes turn onto the cross road.
    const speed = 130 + (car.type === 'sports' ? 60 : 0);
    car.speed = speed;
    const ahead = car.roadAxis === 'v'
      ? { x: car.x, y: car.y + car.dir * speed * dt }
      : { x: car.x + car.dir * speed * dt, y: car.y };
    let turned = false;
    if (car.roadAxis === 'v') {
      for (const hy of ROADS.horizontal) {
        if (Math.abs(car.y - hy) < 6 && Math.abs(ahead.y - hy) < speed * dt + 6 && random() < 0.3) {
          car.roadAxis = 'h';
          car.road = hy;
          car.y = hy + car.lane;
          car.dir = random() < 0.5 ? 1 : -1;
          car.angle = car.dir > 0 ? 0 : Math.PI;
          turned = true;
          break;
        }
      }
    } else {
      for (const vx of ROADS.vertical) {
        if (Math.abs(car.x - vx) < 6 && Math.abs(ahead.x - vx) < speed * dt + 6 && random() < 0.3) {
          car.roadAxis = 'v';
          car.road = vx;
          car.x = vx + car.lane;
          car.dir = random() < 0.5 ? 1 : -1;
          car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          turned = true;
          break;
        }
      }
    }
    if (!turned) {
      car.x = ahead.x;
      car.y = ahead.y;
    }
    // Keep on the road: nudge back toward the lane centre.
    if (car.roadAxis === 'v') car.x += (car.road + car.lane - car.x) * 0.1;
    else car.y += (car.road + car.lane - car.y) * 0.1;
    const fixed = collideBuildings(car.x, car.y, 24);
    car.x = fixed.x;
    car.y = fixed.y;
    if (car.x <= 40 || car.x >= WORLD.width - 40 || car.y <= 40 || car.y >= WORLD.height - 40) {
      car.dir *= -1;
      car.angle += Math.PI;
    }
  }

  function stepPoliceCar(car, dt) {
    if (car.health <= 0) { car.driver = 'wrecked'; return; }
    const target = angleTo(car.x, car.y, player.x, player.y);
    const diff = angleDiff(car.angle, target);
    const d = dist(car.x, car.y, player.x, player.y);
    // If the cruiser is wedged against a building, back out and try again.
    if (car.reverseTimer > 0) {
      car.reverseTimer -= dt;
      stepCar(car, dt, -1, -clamp(diff * 1.6, -1, 1));
      return;
    }
    if (Math.abs(car.speed) < 40 && d > 150) car.stuck += dt;
    else car.stuck = 0;
    if (car.stuck > 1.5) {
      car.reverseTimer = 1.0;
      car.stuck = 0;
      stepCar(car, dt, -1, 0);
      return;
    }
    const steer = clamp(diff * 1.6, -1, 1);
    stepCar(car, dt, d > 120 ? 1 : 0.4, steer);
    // Ram the player's car: one shove at a time, with a cooldown, so a chase
    // is a threat, not an instant wreck.
    if (car.ramCd > 0) car.ramCd -= dt;
    if (player.inCar && car.ramCd <= 0) {
      const pc = player.inCar;
      if (dist(car.x, car.y, pc.x, pc.y) < 52) {
        pc.health -= WANTED.ramDamage;
        pc.speed *= 0.9;
        car.ramCd = 1.2;
        car.speed *= 0.7;
        if (pc.health <= 0) {
          pc.driver = 'wrecked';
          player.inCar = null;
          player.x = pc.x + 50;
          player.y = pc.y;
          player.health -= 15;
          setToast('Your car is wrecked!');
        }
      }
    }
  }

  function stepPed(ped, dt) {
    if (ped.down) {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) { ped.down = false; ped.health = 100; }
      return;
    }
    // Move one axis at a time so a wall stops one direction and the
    // pedestrian slides along it instead of getting stuck on a corner.
    function movePed(angle, speed) {
      const fx = collideBuildings(ped.x + Math.cos(angle) * speed * dt, ped.y, 12);
      ped.x = fx.x;
      const fy = collideBuildings(ped.x, ped.y + Math.sin(angle) * speed * dt, 12);
      ped.y = fy.y;
      ped.angle = angle;
    }
    if (ped.flee > 0) {
      ped.flee -= dt;
      const away = angleTo(player.x, player.y, ped.x, ped.y);
      movePed(away, ped.speed * 1.6);
    } else if (ped.isCop) {
      const d = dist(ped.x, ped.y, player.x, player.y);
      if (d < 700) {
        const toward = angleTo(ped.x, ped.y, player.x, player.y);
        movePed(toward, ped.speed);
        if (!player.inCar && d < 26) {
          state.bustedTimer += dt;
          if (state.bustedTimer > 1.2) {
            state.over = true;
            state.overReason = 'busted';
          }
        }
      } else {
        state.bustedTimer = 0;
      }
    } else {
      if (dist(ped.x, ped.y, ped.tx, ped.ty) < 20 || (ped.tx === ped.x && ped.ty === ped.y)) {
        // Pick a new stroll target on a sidewalk near a road.
        const vertical = random() < 0.5;
        if (vertical) {
          ped.tx = ROADS.vertical[Math.floor(random() * ROADS.vertical.length)] + (random() < 0.5 ? -80 : 80);
          ped.ty = 100 + random() * (WORLD.height - 200);
        } else {
          ped.ty = ROADS.horizontal[Math.floor(random() * ROADS.horizontal.length)] + (random() < 0.5 ? -80 : 80);
          ped.tx = 100 + random() * (WORLD.width - 200);
        }
      }
      const toward = angleTo(ped.x, ped.y, ped.tx, ped.ty);
      movePed(toward, ped.speed);
    }
    ped.x = clamp(ped.x, 20, WORLD.width - 20);
    ped.y = clamp(ped.y, 20, WORLD.height - 20);
  }

  // ---- One fixed step -------------------------------------------------------
  /**
   * Advance the world one step. `input` is { move: {x, y}, run, actions } from
   * the loop (or a scripted autopilot in shots.js). `harmless` runs the city
   * as a backdrop: nobody scores, nobody gets hurt, no crimes are committed.
   * Returns event flags for the caller to announce.
   */
  function step(dt, input, harmless) {
    let events = 0;
    if (state.over) return events;
    state.elapsed += dt;
    if (state.toastTimer > 0) state.toastTimer -= dt;
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (player.punchCooldown > 0) player.punchCooldown -= dt;
    const move = input.move || { x: 0, y: 0 };
    const actions = input.actions || 0;

    // --- Player ------------------------------------------------------------
    if (player.inCar) {
      const car = player.inCar;
      const throttle = move.y < 0 ? 1 : move.y > 0 ? -1 : 0;
      const steer = move.x;
      stepCar(car, dt, throttle, steer);
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      if (actions & 4) enterCar(); // E: get out
      if (car.health <= 0) {
        car.driver = 'wrecked';
        player.inCar = null;
        player.x = car.x + 50;
        player.y = car.y;
        setToast('Your car is wrecked!');
      }
    } else {
      const len = Math.hypot(move.x, move.y) || 1;
      const speed = (input.run ? PLAYER.runSpeed : PLAYER.walkSpeed);
      const dx = (move.x / len) * speed * dt * (move.x || move.y ? 1 : 0);
      const dy = (move.y / len) * speed * dt * (move.x || move.y ? 1 : 0);
      if (move.x || move.y) player.facing = Math.atan2(move.y, move.x);
      // Move one axis at a time so a wall stops one direction and the
      // player slides along it instead of getting stuck on a corner.
      const fx = collideBuildings(player.x + dx, player.y, PLAYER.radius);
      player.x = clamp(fx.x, 20, WORLD.width - 20);
      const fy = collideBuildings(player.x, player.y + dy, PLAYER.radius);
      player.y = clamp(fy.y, 20, WORLD.height - 20);
      if (actions & 4) enterCar(); // E: get in
      if (actions & 8) punch(); // F: punch
    }

    // --- Traffic and police cars -------------------------------------------
    for (const car of cars) {
      if (car.driver === 'player') continue;
      if (car.driver === 'police') stepPoliceCar(car, dt);
      else if (car.driver === 'traffic') stepTraffic(car, dt);
    }
    // Car-car collisions (simple circle push-apart).
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const d = dist(a.x, a.y, b.x, b.y);
        if (d < 52 && d > 0.01) {
          const push = (52 - d) / 2;
          const ux = (b.x - a.x) / d;
          const uy = (b.y - a.y) / d;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
          const hard = Math.abs(a.speed) + Math.abs(b.speed) > 260;
          a.speed *= 0.7;
          b.speed *= 0.7;
          if (hard && (a === player.inCar || b === player.inCar) && player.invulnerable <= 0 && !harmless) {
            player.health -= 8;
            player.invulnerable = 0.8;
            events |= EVENT_HIT;
          }
        }
      }
    }
    // Traffic cars hitting pedestrians (a crime if the player is driving).
    if (!harmless) {
      for (const car of cars) {
        if (Math.abs(car.speed) < 60) continue;
        for (const ped of peds) {
          if (ped.down) continue;
          if (dist(car.x, car.y, ped.x, ped.y) < 30) {
            ped.down = true;
            ped.downTimer = 8;
            ped.health = 0;
            state.pedsHit += 1;
            if (car === player.inCar) {
              addCrime(1);
              events |= EVENT_WANTED;
              setToast('You hit a pedestrian!');
            }
          }
        }
      }
    }

    // --- Pedestrians --------------------------------------------------------
    for (const ped of peds) stepPed(ped, dt);

    // --- Pickups ------------------------------------------------------------
    for (const pickup of pickups) {
      if (!pickup.active) continue;
      pickup.bob += dt * 3;
      const d = dist(player.x, player.y, pickup.x, pickup.y);
      if (d < 44 && !harmless) {
        pickup.active = false;
        if (pickup.kind === 'cash') {
          state.money += pickup.value;
          state.score += pickup.value;
          events |= EVENT_CASH;
          setToast(`+$${pickup.value} cash`);
        } else if (pickup.kind === 'health') {
          player.health = Math.min(HEALTH.max, player.health + HEALTH.pickupHeal);
          setToast('Health restored');
        } else if (pickup.kind === 'bag') {
          state.bags += 1;
          state.score += 50;
          if (state.bags >= state.bagsTotal) {
            state.missionStage = 'deliver';
            setMarker(docks.x, docks.y, 'Deliver the cash to the docks', '#4ade80');
            setToast('All 3 bags grabbed — deliver them to the docks!');
          } else {
            const remaining = pickups.filter((p) => p.kind === 'bag' && p.active);
            if (remaining.length > 0) setMarker(remaining[0].x, remaining[0].y, `Cash bag ${state.bags + 1} of 3`, '#4ade80');
            setToast(`Cash bag ${state.bags} of 3`);
          }
        }
      }
    }

    // --- Missions -----------------------------------------------------------
    if (!harmless && state.marker) {
      const m = state.marker;
      const d = dist(player.x, player.y, m.x, m.y);
      if (d < 60) {
        if (state.missionStage === 'pickup') {
          state.missionStage = 'deliver';
          setMarker(docks.x, docks.y, 'Deliver the package to the docks', '#4ade80');
          setToast('Package collected — take it to the docks!');
        } else if (state.missionStage === 'deliver') {
          completeMission();
          events |= EVENT_MISSION;
        } else if (state.missionStage === 'escape') {
          state.wanted = 0;
          completeMission();
          events |= EVENT_MISSION;
        }
      }
    }
    // Escape also completes at the OTHER safehouse, not only the marked one.
    if (!harmless && state.missionStage === 'escape' && !state.over) {
      for (const s of SAFEHOUSES) {
        if (dist(player.x, player.y, s.x, s.y) < 60) {
          state.wanted = 0;
          completeMission();
          events |= EVENT_MISSION;
          break;
        }
      }
    }

    // --- Wanted: spawn police, decay when hidden ---------------------------
    if (!harmless && state.wanted > 0) {
      state.policeTimer -= dt;
      if (state.policeTimer <= 0) {
        spawnPolice();
        state.policeTimer = 2;
      }
      if (state.elapsed - state.lastCrime > WANTED.decayDelay && nearestPoliceDistance() > 420) {
        state.hideTimer += dt;
        if (state.hideTimer >= WANTED.decayInterval) {
          state.wanted -= 1;
          state.hideTimer = 0;
          if (state.wanted === 0) setToast('You lost the cops.');
        }
      } else {
        state.hideTimer = 0;
      }
    }
    // Pay 'N Spray: drive through the garage to clear your wanted level.
    if (!harmless && player.inCar && state.wanted > 0 && dist(player.x, player.y, sprayShop.x, sprayShop.y) < 70) {
      if (state.money >= WANTED.sprayCost) {
        state.money -= WANTED.sprayCost;
        state.wanted = 0;
        setToast(`Pay 'N Spray: wanted level cleared (-$${WANTED.sprayCost})`);
      }
    }

    // --- Health / game over --------------------------------------------------
    if (!harmless && player.health <= 0 && !state.over) {
      player.health = 0;
      state.over = true;
      state.overReason = 'wasted';
      events |= EVENT_OVER;
    }
    if (state.over) events |= EVENT_OVER;
    return events;
  }

  // ---- Helpers for the loop, the shots and the play-tests ------------------
  function placePlayer(x, y) {
    player.x = x;
    player.y = y;
    player.inCar = null;
  }
  function forceOver(reason) {
    state.over = true;
    state.overReason = reason || 'wasted';
    if (reason === 'wasted') player.health = 0;
  }
  function setWanted(stars) {
    state.wanted = clamp(stars, 0, WANTED.maxStars);
    state.lastCrime = state.elapsed;
  }
  function debugInfo() {
    return {
      x: Math.round(player.x), y: Math.round(player.y),
      inCar: player.inCar ? player.inCar.type : null,
      money: state.money, score: state.score, health: Math.round(player.health),
      wanted: state.wanted, mission: state.missionIndex + 1, stage: state.missionStage,
      over: state.over, overReason: state.overReason, marker: state.marker,
    };
  }

  reset();
  return {
    state, reset, step, enterCar, punch, placePlayer, forceOver, setWanted,
    setMarker, startMission, debugInfo, nearestSafehouse,
  };
}
