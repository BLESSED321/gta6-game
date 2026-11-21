// Drawing only: the city, the camera that follows the player, the HUD and
// the minimap. The 1280x720 logical playfield is scaled to fit the window and
// centred, the margin filled with the backdrop colour. Flat colours and
// canvas shapes only — no images, no network.
// Re-authored under recording 3: both safehouses are drawn, the wanted stars
// carry a WANTED label, and driving shows a speedometer bar as well as the
// mph number.
import { CAR_SIZE, FIELD, FONT, PALETTE, ROADS, WANTED, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** The panel's width; its height grows with its lines. */
const PANEL = { width: 680, top: 150, line: 32, bottom: 76 };
const MINIMAP = { x: 1064, y: 16, w: 200, h: 150 };

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const cam = { x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }
  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }
  function rect(x, y, w, h, color) {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  }
  function circle(x, y, r, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }

  function drawCity(state) {
    const { buildings, parks, water } = state;
    // Ground.
    rect(-100, -100, WORLD.width + 200, WORLD.height + 200, PALETTE.grass);
    // Water corner (south-east) with a sand edge.
    rect(water.x - 24, water.y - 24, water.w + 24, water.h + 24, PALETTE.sand);
    rect(water.x, water.y, water.w, water.h, PALETTE.water);
    // Parks.
    for (const p of parks) {
      rect(p.x, p.y, p.w, p.h, PALETTE.park);
      circle(p.x + p.w * 0.3, p.y + p.h * 0.4, 26, '#2e6b34');
      circle(p.x + p.w * 0.7, p.y + p.h * 0.6, 32, '#2e6b34');
      circle(p.x + p.w * 0.5, p.y + p.h * 0.25, 20, '#2e6b34');
    }
    // Roads: dark strips with sidewalk edges and dashed centre lines.
    for (const rx of ROADS.vertical) {
      rect(rx - ROADS.width / 2, 0, ROADS.width, WORLD.height, PALETTE.road);
      rect(rx - ROADS.width / 2, 0, 10, WORLD.height, PALETTE.sidewalk);
      rect(rx + ROADS.width / 2 - 10, 0, 10, WORLD.height, PALETTE.sidewalk);
    }
    for (const ry of ROADS.horizontal) {
      rect(0, ry - ROADS.width / 2, WORLD.width, ROADS.width, PALETTE.road);
      rect(0, ry - ROADS.width / 2, WORLD.width, 10, PALETTE.sidewalk);
      rect(0, ry + ROADS.width / 2 - 10, WORLD.width, 10, PALETTE.sidewalk);
    }
    context.fillStyle = PALETTE.roadLine;
    for (const rx of ROADS.vertical) {
      for (let y = 20; y < WORLD.height; y += 70) context.fillRect(rx - 3, y, 6, 34);
    }
    for (const ry of ROADS.horizontal) {
      for (let x = 20; x < WORLD.width; x += 70) context.fillRect(x, ry - 3, 34, 6);
    }
    // Buildings: roof, glass windows, and a darker outline.
    for (const b of buildings) {
      rect(b.x - 2, b.y - 2, b.w + 4, b.h + 4, '#232833');
      rect(b.x, b.y, b.w, b.h, b.color);
      context.fillStyle = PALETTE.buildingGlass;
      const cols = Math.max(1, Math.floor(b.w / 46));
      const rows = Math.max(1, Math.floor(b.h / 46));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          context.fillRect(b.x + 14 + c * 46, b.y + 14 + r * 46, 20, 14);
        }
      }
    }
    // Docks, both safehouses and Pay 'N Spray, labelled on the ground.
    rect(state.docks.x - 60, state.docks.y - 40, 120, 80, '#5b4a2e');
    text('DOCKS', state.docks.x, state.docks.y + 6, 20, '#f2c94c', 'center', 'middle');
    rect(state.safehouse.x - 50, state.safehouse.y - 34, 100, 68, '#2e4a3a');
    text('SAFEHOUSE', state.safehouse.x, state.safehouse.y + 6, 16, '#4ade80', 'center', 'middle');
    if (state.safehouse2) {
      rect(state.safehouse2.x - 50, state.safehouse2.y - 34, 100, 68, '#2e4a3a');
      text('SAFEHOUSE 2', state.safehouse2.x, state.safehouse2.y + 6, 15, '#4ade80', 'center', 'middle');
    }
    rect(state.sprayShop.x - 50, state.sprayShop.y - 34, 100, 68, '#4a2e5b');
    text("PAY 'N SPRAY", state.sprayShop.x, state.sprayShop.y + 6, 15, '#e8a34c', 'center', 'middle');
  }

  function drawMarker(state, time) {
    const m = state.marker;
    if (!m) return;
    const pulse = 1 + 0.18 * Math.sin(time * 5);
    context.strokeStyle = m.color;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(m.x, m.y, 30 * pulse, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = m.color;
    context.beginPath();
    context.moveTo(m.x, m.y - 58);
    context.lineTo(m.x - 12, m.y - 34);
    context.lineTo(m.x + 12, m.y - 34);
    context.closePath();
    context.fill();
    text(m.label, m.x, m.y - 68, 18, m.color, 'center', 'middle');
  }

  function drawCar(car, time) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Shadow, body, windshield, roof, wheels.
    rect(-CAR_SIZE.length / 2 + 4, -CAR_SIZE.width / 2 + 4, CAR_SIZE.length, CAR_SIZE.width, 'rgba(0,0,0,0.35)');
    rect(-CAR_SIZE.length / 2, -CAR_SIZE.width / 2, CAR_SIZE.length, CAR_SIZE.width, car.color);
    rect(-6, -CAR_SIZE.width / 2 + 4, 18, CAR_SIZE.width - 8, 'rgba(20,30,45,0.85)');
    rect(8, -CAR_SIZE.width / 2 + 6, 12, CAR_SIZE.width - 12, 'rgba(127,178,217,0.9)');
    context.fillStyle = '#11141b';
    const wl = CAR_SIZE.length / 2 - 8;
    const ww = CAR_SIZE.width / 2 + 2;
    context.fillRect(-wl, -ww, 14, 6);
    context.fillRect(-wl, ww - 6, 14, 6);
    context.fillRect(wl - 14, -ww, 14, 6);
    context.fillRect(wl - 14, ww - 6, 14, 6);
    if (car.isPolice) {
      const flash = Math.floor(time * 4) % 2 === 0;
      circle(-4, 0, 7, flash ? '#ff3b30' : '#3b82ff');
      circle(8, 0, 7, flash ? '#3b82ff' : '#ff3b30');
    }
    if (car.type === 'taxi') {
      rect(-14, -CAR_SIZE.width / 2 - 2, 28, 6, '#11141b');
      text('TAXI', 0, -CAR_SIZE.width / 2 - 8, 11, '#11141b', 'center', 'middle');
    }
    context.restore();
    // Damage smoke for a wrecked car.
    if (car.health < 40) {
      circle(car.x + 14, car.y - 10, 8 + 4 * Math.sin(time * 6), 'rgba(120,120,120,0.5)');
    }
  }

  function drawPed(ped) {
    if (ped.down) {
      context.save();
      context.translate(ped.x, ped.y);
      context.rotate(Math.PI / 2);
      circle(0, 0, 12, ped.isCop ? '#2f6fb2' : '#e8a34c');
      context.restore();
      return;
    }
    circle(ped.x, ped.y, 13, ped.isCop ? '#1d3a5f' : '#8a5a2b');
    circle(ped.x, ped.y, 10, ped.isCop ? '#2f6fb2' : '#e8a34c');
    circle(ped.x + Math.cos(ped.angle) * 5, ped.y + Math.sin(ped.angle) * 5, 4, '#f2c9a0');
  }

  function drawPlayer(state, time) {
    const p = state.player;
    if (p.inCar) return;
    if (p.invulnerable > 0 && Math.floor(time * 10) % 2 === 0) return; // blink after a hit
    circle(p.x, p.y, 14, '#1d3a5f');
    circle(p.x, p.y, 12, PALETTE.player);
    // Facing tick and a white shirt stripe, so the player reads at a glance.
    context.strokeStyle = '#f2f2f2';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(p.x, p.y);
    context.lineTo(p.x + Math.cos(p.facing) * 18, p.y + Math.sin(p.facing) * 18);
    context.stroke();
    circle(p.x, p.y, 5, '#f2f2f2');
  }

  function drawPickups(state, time) {
    for (const pk of state.pickups) {
      if (!pk.active) continue;
      const bob = Math.sin(pk.bob) * 3;
      if (pk.kind === 'cash') {
        rect(pk.x - 12, pk.y - 8 + bob, 24, 16, '#4ade80');
        text('$', pk.x, pk.y + 4 + bob, 15, '#0d3b1e', 'center', 'middle');
      } else if (pk.kind === 'health') {
        rect(pk.x - 13, pk.y - 13 + bob, 26, 26, '#ff5d73');
        rect(pk.x - 3, pk.y - 9 + bob, 6, 18, '#fff');
        rect(pk.x - 9, pk.y - 3 + bob, 18, 6, '#fff');
      } else if (pk.kind === 'bag') {
        rect(pk.x - 11, pk.y - 9 + bob, 22, 18, '#4ade80');
        rect(pk.x - 11, pk.y - 9 + bob, 22, 5, '#2e7d44');
        text('$', pk.x, pk.y + 6 + bob, 14, '#0d3b1e', 'center', 'middle');
      }
    }
  }

  function drawHud(state, time) {
    const p = state.player;
    // Top-left: money, health, wanted stars.
    context.fillStyle = PALETTE.hudBg;
    context.fillRect(12, 12, 330, 92);
    text(`$${state.money}`, 24, 46, 30, PALETTE.gold, 'left', 'middle');
    text('LEONIDA', 24, 76, 15, PALETTE.muted, 'left', 'middle');
    // Health bar.
    rect(24, 88, 180, 12, '#3a2026');
    rect(24, 88, 180 * Math.max(0, p.health / 100), 12, p.health > 30 ? '#4ade80' : '#ff5d73');
    // Wanted stars, top centre, with a label so the row reads at a glance.
    text('WANTED', 640, 16, 13, state.wanted > 0 ? '#ff5d73' : 'rgba(238,241,245,0.5)', 'center', 'middle');
    const stars = state.wanted;
    for (let i = 0; i < WANTED.maxStars; i += 1) {
      text('★', 590 + i * 30, 40, 28, i < stars ? '#ffd23b' : 'rgba(255,255,255,0.25)', 'center', 'middle');
    }
    // Mission objective, under the stars.
    const mission = state.missionIndex < 4
      ? `Mission ${state.missionIndex + 1}/4: ${state.marker ? state.marker.label : 'Free roam'}`
      : 'All missions complete — free roam!';
    text(mission, 640, 66, 18, '#eef1f5', 'center', 'middle');
    if (p.inCar) {
      const mph = Math.round(Math.abs(p.inCar.speed) * 0.2);
      const topMph = Math.round(p.inCar.topSpeed * 0.2);
      text(`${p.inCar.type.toUpperCase()}  •  ${mph} mph`, 640, 92, 16, PALETTE.muted, 'center', 'middle');
      // Speedometer bar: the car's speed as a share of its top speed.
      rect(540, 102, 200, 8, 'rgba(255,255,255,0.18)');
      rect(540, 102, 200 * Math.min(1, Math.abs(p.inCar.speed) / p.inCar.topSpeed), 8, mph > topMph * 0.85 ? '#ff5d73' : '#4ade80');
    }
    // Toast.
    if (state.toastTimer > 0 && state.toast) {
      context.fillStyle = PALETTE.hudBg;
      const w = 40 + state.toast.length * 9;
      context.fillRect(640 - w / 2, 620, w, 40);
      text(state.toast, 640, 646, 18, '#eef1f5', 'center', 'middle');
    }
    // Controls hint, bottom-left.
    text('WASD move/drive  •  E enter car  •  F punch  •  Shift run  •  P pause  •  R restart', 16, 700, 15, 'rgba(238,241,245,0.65)', 'left', 'middle');
    drawMinimap(state);
  }

  function drawMinimap(state) {
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    context.fillStyle = 'rgba(13,17,23,0.85)';
    context.fillRect(MINIMAP.x - 4, MINIMAP.y - 4, MINIMAP.w + 8, MINIMAP.h + 8);
    context.fillStyle = '#2e6b34';
    context.fillRect(MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h);
    context.strokeStyle = '#565d6b';
    context.lineWidth = 2;
    for (const rx of ROADS.vertical) {
      context.beginPath();
      context.moveTo(MINIMAP.x + rx * sx, MINIMAP.y);
      context.lineTo(MINIMAP.x + rx * sx, MINIMAP.y + MINIMAP.h);
      context.stroke();
    }
    for (const ry of ROADS.horizontal) {
      context.beginPath();
      context.moveTo(MINIMAP.x, MINIMAP.y + ry * sy);
      context.lineTo(MINIMAP.x + MINIMAP.w, MINIMAP.y + ry * sy);
      context.stroke();
    }
    if (state.marker) {
      circle(MINIMAP.x + state.marker.x * sx, MINIMAP.y + state.marker.y * sy, 5, state.marker.color);
    }
    for (const car of state.cars) {
      if (car.isPolice) circle(MINIMAP.x + car.x * sx, MINIMAP.y + car.y * sy, 3, '#3b82ff');
    }
    circle(MINIMAP.x + state.player.x * sx, MINIMAP.y + state.player.y * sy, 4, '#fff');
    context.strokeStyle = '#fff';
    context.lineWidth = 1;
    context.strokeRect(MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h);
  }

  function drawPanel(title, lines, prompt, best) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(13,17,23,0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.fillStyle = PALETTE.gold;
    context.fillRect(x, y, PANEL.width, 6);
    text(title, FIELD.width / 2, y + 82, 52, PALETTE.text, 'center', 'middle');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + PANEL.top + i * PANEL.line, 21, PALETTE.muted, 'center', 'middle');
    }
    if (best !== undefined && best !== null) text(`Best score  $${best}`, FIELD.width / 2, y + height - 62, 20, PALETTE.gold, 'center', 'middle');
    text(prompt, FIELD.width / 2, y + height - 34, 22, PALETTE.gold, 'center', 'middle');
  }

  /** Paint one frame: the city through the camera, then the HUD or a panel. */
  function draw(state, screen, best, time) {
    const t = time || 0;
    const p = state.player;
    cam.x = Math.max(0, Math.min(WORLD.width - FIELD.width, p.x - FIELD.width / 2));
    cam.y = Math.max(0, Math.min(WORLD.height - FIELD.height, p.y - FIELD.height / 2));
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.save();
    context.beginPath();
    context.rect(0, 0, FIELD.width, FIELD.height);
    context.clip();
    context.translate(-cam.x, -cam.y);
    drawCity(state);
    drawMarker(state, t);
    drawPickups(state, t);
    for (const car of state.cars) drawCar(car, t);
    for (const ped of state.peds) drawPed(ped);
    drawPlayer(state, t);
    context.restore();
    if (screen === SCREEN_TITLE) {
      drawPanel('LEONIDA NIGHTS', [
        'A GTA-style open world: steal cars, run missions,',
        'outrun the cops and make your fortune in Leonida.',
        'WASD to move and drive  •  E to enter a car  •  F to punch',
        '4 missions  •  5-star wanted  •  2 safehouses  •  free roam',
      ], 'Press Space or click to start', best);
      return;
    }
    drawHud(state, t);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for you.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      const busted = state.overReason === 'busted';
      drawPanel(busted ? 'BUSTED!' : 'WASTED!', [
        busted ? 'The Leonida PD caught you.' : 'You did not survive Leonida.',
        `Money  $${state.money}    Score  $${state.score}`,
        `Missions finished: ${Math.min(state.missionIndex, 4)} of 4    Cars stolen: ${state.carsStolen}`,
      ], 'Press Space or R to play again', best);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
