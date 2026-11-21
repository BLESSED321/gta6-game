// The screenshot scenes behind ?shot=start|play|end. Each one plays the real
// rules forward from a fresh world, steered by a simple autopilot, so the frame
// is what a short game really looks like and the same seed always gives the
// same frame.
import { STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const TAU = Math.PI * 2;
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** Walk toward a point: the move vector for world.step. */
function walkToward(state, tx, ty) {
  const p = state.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return { move: { x: dx / len, y: dy / len }, run: true, actions: 0 };
}
/** Drive toward a waypoint: throttle and steering for world.step. */
function driveToward(state, tx, ty) {
  const car = state.player.inCar;
  if (!car) return { move: { x: 0, y: 0 }, run: false, actions: 0 };
  const desired = angleTo(car.x, car.y, tx, ty);
  const steer = clamp(angleDiff(car.angle, desired) * 1.8, -1, 1);
  return { move: { x: steer, y: -1 }, run: false, actions: 0 };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name !== 'play' && name !== 'end') {
    // Title: the player on foot beside the red Comet GT, city alive behind.
    world.placePlayer(940, 430);
    for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP, { move: { x: 0, y: 0 }, run: false, actions: 0 }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    // Drive the mission: steal the Comet GT, then run the package route along
    // the roads, with two wanted stars and police in pursuit.
    const missionCar = state.missionCar;
    world.placePlayer(missionCar.x - 60, missionCar.y + 20);
    // Walk to the car and get in.
    for (let i = 0; i < 600; i += 1) {
      const d = dist(state.player.x, state.player.y, missionCar.x, missionCar.y);
      if (d < 70) break;
      world.step(STEP, walkToward(state, missionCar.x, missionCar.y), false);
    }
    world.enterCar();
    world.setWanted(2);
    // Waypoints along the roads to the pickup marker at (2200, 1000).
    const waypoints = [
      { x: 1000, y: 400 },
      { x: 2200, y: 400 },
      { x: 2200, y: 1000 },
    ];
    let wp = 0;
    let stuck = 0;
    let lastX = state.player.x;
    let lastY = state.player.y;
    for (let i = 0; i < 26 / STEP; i += 1) {
      if (wp >= waypoints.length) break;
      const target = waypoints[wp];
      if (dist(state.player.x, state.player.y, target.x, target.y) < 70) { wp += 1; continue; }
      world.step(STEP, driveToward(state, target.x, target.y), false);
      if (i % 60 === 0) {
        if (dist(state.player.x, state.player.y, lastX, lastY) < 20) {
          stuck += 1;
          // Reverse out of a jam, then carry on.
          for (let j = 0; j < 30; j += 1) world.step(STEP, { move: { x: 0, y: 1 }, run: false, actions: 0 }, false);
          if (stuck > 2) { wp += 1; stuck = 0; }
        }
        lastX = state.player.x;
        lastY = state.player.y;
      }
      if (state.over) break;
    }
    // Drive right onto the marker so the package is collected in the frame.
    for (let i = 0; i < 4 / STEP && state.missionStage === 'pickup'; i += 1) {
      const m = state.marker;
      if (!m) break;
      world.step(STEP, driveToward(state, m.x, m.y), false);
      if (state.over) break;
    }
    return { screen: SCREEN_PLAY, best: state.score };
  }
  // End: cornered on foot, three stars, the cops close in until busted.
  world.placePlayer(1600, 1000);
  state.player.health = 20;
  world.setWanted(3);
  for (let i = 0; i < 60 / STEP; i += 1) {
    world.step(STEP, { move: { x: 0, y: 0 }, run: false, actions: 0 }, false);
    if (state.over) break;
  }
  if (!state.over) world.forceOver('busted');
  return { screen: SCREEN_OVER, best: state.score };
}
