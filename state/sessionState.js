const state = new Map();

export function setState(tgId, step, temp = {}) {
  state.set(tgId, { step, temp });
}

export function getState(tgId) {
  return state.get(tgId) || { step: null, temp: {} };
}

export function clearState(tgId) {
  state.delete(tgId);
}
