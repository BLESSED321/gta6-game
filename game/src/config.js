// Every tuning number and colour in one place for LEONIDA NIGHTS, a top-down
// open-world crime game in the spirit of GTA 6. The camera shows a 1280x720
// window onto a much larger city; the simulation runs in fixed 1/60 s steps,
// so no rule below depends on the screen size or the display's frame rate.

/** The city is this big, in world pixels; the camera shows 1280x720 of it. */
export const WORLD = { width: 3200, height: 2400 };
/** The camera window, in screen pixels (the starter's logical playfield). */
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** Roads: a grid of avenues (vertical) and streets (horizontal). */
export const ROADS = {
  vertical: [400, 1000, 1600, 2200, 2800],
  horizontal: [400, 1000, 1600, 2200],
  width: 120,
  sidewalk: 26,
};

/** The player on foot. */
export const PLAYER = {
  radius: 14,
  walkSpeed: 210,
  runSpeed: 330,
  punchRange: 34,
  punchDamage: 34,
  punchCooldown: 0.45,
};

/** Car types: every car in the city is one of these. */
export const CAR_TYPES = {
  sedan: { name: 'Sedan', color: '#e8b64c', topSpeed: 420, accel: 260, brake: 420, steer: 2.6, grip: 6.0, health: 100 },
  sports: { name: 'Comet GT', color: '#e5534b', topSpeed: 560, accel: 340, brake: 460, steer: 3.1, grip: 5.2, health: 110 },
  taxi: { name: 'Taxi', color: '#f2c94c', topSpeed: 380, accel: 230, brake: 400, steer: 2.4, grip: 6.5, health: 120 },
  van: { name: 'Van', color: '#7fb069', topSpeed: 340, accel: 200, brake: 380, steer: 2.1, grip: 7.0, health: 140 },
  police: { name: 'Police Cruiser', color: '#2f6fb2', topSpeed: 500, accel: 300, brake: 460, steer: 3.0, grip: 5.6, health: 120 },
};

/** A car's drawn size, in world pixels (length along its heading, width across). */
export const CAR_SIZE = { length: 64, width: 30 };

/** Mission / pickup tuning. */
export const MISSIONS = [
  { id: 1, name: 'Hot Wheels', brief: 'Steal the red Comet GT parked on Ocean Drive.', reward: 200 },
  { id: 2, name: 'Package Run', brief: 'Pick up the package at the green marker, then deliver it to the docks.', reward: 300 },
  { id: 3, name: 'Getaway', brief: 'The cops are on you. Lose them and reach the safehouse.', reward: 400 },
  { id: 4, name: 'The Big Score', brief: 'Grab the 3 cash bags around the city and deliver them to the docks.', reward: 500 },
];

export const WANTED = {
  maxStars: 5,
  decayDelay: 9, // seconds with no crime and no cop nearby before stars start falling
  decayInterval: 6, // seconds per star lost while hidden
  sprayCost: 100, // Pay 'N Spray clears all stars
};

export const HEALTH = { max: 100, pickupHeal: 40 };

export const PALETTE = {
  backdrop: '#0d1117',
  grass: '#2e6b34',
  park: '#3a7d44',
  water: '#1d4e6b',
  sand: '#c9b078',
  road: '#2b2f38',
  roadLine: '#e8d44d',
  sidewalk: '#565d6b',
  building: '#3d4454',
  buildingRoof: '#4a5162',
  buildingGlass: '#7fb2d9',
  player: '#4fc3f7',
  playerShirt: '#f2f2f2',
  ped: '#e8a34c',
  cop: '#2f6fb2',
  cash: '#4ade80',
  health: '#ff5d73',
  marker: '#4ade80',
  markerRed: '#ff5d73',
  markerGold: '#f2c94c',
  hudBg: 'rgba(13, 17, 23, 0.78)',
  panel: '#252b38',
  text: '#eef1f5',
  muted: '#8b93a3',
  gold: '#f2c94c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'leonida-nights.best';

/** How many pedestrians and traffic cars the city holds. */
export const CROWD = { pedestrians: 26, traffic: 14, parked: 10 };
