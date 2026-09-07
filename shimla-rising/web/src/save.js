/** localStorage save. Sirf is browser mein rehta hai. */
const KEY = "shimla-rising:v1";

export function saveGame(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      money: state.money,
      completed: [...state.missions.completed],
      available: [...state.missions.available],
      pos: { x: state.player.pos.x, z: state.player.pos.z },
      hour: state.hour,
      quality: state.quality,
      weather: state.weather.mode,
      // awaaz -- Nikhil ne volume ka option maanga tha, wo yaad rehna chahiye
      volume: state.audio?.volume,
      muted: state.audio?.muted,
      voice: state.audio?.voiceName || null,
      savedAt: Date.now(),
    }));
    return true;
  } catch { return false; }        // private mode / site data blocked
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
