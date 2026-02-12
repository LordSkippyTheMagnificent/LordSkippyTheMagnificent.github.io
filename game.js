// Gettysburg Mini Tactics (vanilla JS)
// Difficulty slider: 1 Easy, 2 Normal, 3 Hard, 4 Robert Mode (Lee)

const SIZE = 8;

const HIGH_GROUND = new Set([
  key(6, 6), key(7, 6), key(6, 7), key(7, 7), key(5, 6), key(6, 5)
]);

const UNIT_TYPES = {
  INF: { name: "Infantry", symbol: "INF", hp: 5, atk: 2, def: 1, move: 2, range: 1 },
  ART: { name: "Artillery", symbol: "ART", hp: 4, atk: 3, def: 0, move: 1, range: 2 },
  CAV: { name: "Cavalry",  symbol: "CAV", hp: 4, atk: 2, def: 1, move: 3, range: 1 },
};

const EVENT_CARDS = [
  {
    id: "reinforcements",
    title: "Reinforcements Arrive",
    text: "Spawn 1 Infantry on your back row (if an empty tile exists).",
    play: (side) => {
      const spawnRow = side === "Union" ? 7 : 0;
      const cols = side === "Union" ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
      for (const c of cols) {
        if (!unitAt(spawnRow, c)) {
          const id = makeReinforcementId(side);
          state.units.push(makeUnit(id, side, "INF", spawnRow, c));
          state.acted[id] = { moved: false, attacked: false };
          log(`${side} plays Reinforcements: INF (${id}) deployed at (${spawnRow},${c}).`);
          return { ok: true };
        }
      }
      return { ok: false, reason: "No empty tile on your back row." };
    },
  },
  {
    id: "ammo_shortage",
    title: "Ammo Shortage",
    text: "This turn, your attacks deal -1 damage (minimum damage still applies).",
    play: (side) => {
      state.effects.turnAtkMod[side] -= 1;
      log(`${side} plays Ammo Shortage: -1 damage to ${side} attacks this turn.`);
      return { ok: true };
    },
  },
];

// --- Game State ---
let state = null;

// --- DOM ---
const boardEl = document.getElementById("board");
const turnSideEl = document.getElementById("turnSide");
const turnPhaseEl = document.getElementById("turnPhase");
const selectedInfoEl = document.getElementById("selectedInfo");
const logEl = document.getElementById("log");
const modeLabelEl = document.getElementById("modeLabel");

document.getElementById("btnEndTurn").addEventListener("click", endTurn);
document.getElementById("btnReset").addEventListener("click", reset);

const modeSelectEl = document.getElementById("modeSelect");
const aiNoteEl = document.getElementById("aiNote");

const difficultyEl = document.getElementById("difficulty");
const difficultyLabelEl = document.getElementById("difficultyLabel");
const difficultyWrapEl = document.getElementById("difficultyWrap");

modeSelectEl.addEventListener("change", () => {
  state.mode = modeSelectEl.value;
  render();
  maybeRunAI();
});

difficultyEl.addEventListener("input", () => {
  state.difficulty = Number(difficultyEl.value);
  difficultyLabelEl.textContent = diffName(state.difficulty);
  render();
});

const btnDrawEvent = document.getElementById("btnDrawEvent");
const btnPlayEvent = document.getElementById("btnPlayEvent");
const eventHandEl = document.getElementById("eventHand");
const eventActiveEl = document.getElementById("eventActive");
const eventHintEl = document.getElementById("eventHint");

btnDrawEvent.addEventListener("click", drawEventCard);
btnPlayEvent.addEventListener("click", playSelectedEvent);

// --- Helpers ---
function key(r, c) { return `${r},${c}`; }
function isHill(r, c) { return HIGH_GROUND.has(key(r, c)); }
function otherSide(side) { return side === "Union" ? "Confed" : "Union"; }
function diffName(d) {
  if (d === 1) return "Easy";
  if (d === 2) return "Normal";
  if (d === 3) return "Hard";
  return "Robert Mode (Lee)";
}

function log(msg) {
  const div = document.createElement("div");
  div.className = "entry";
  div.textContent = msg;
  logEl.prepend(div);
}

function cryptoRandomId() {
  if (window.crypto && crypto.getRandomValues) {
    const arr = new Uint32Array(2);
    crypto.getRandomValues(arr);
    return `${arr[0].toString(16)}${arr[1].toString(16)}`;
  }
  return `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

// --- Setup ---
function reset() {
  state = {
    mode: modeSelectEl ? modeSelectEl.value : "pvp",
    difficulty: difficultyEl ? Number(difficultyEl.value) : 2,
    turnSide: "Union",
    phase: "Move",
    selectedUnitId: null,
    units: [],
    acted: {},

    hand: [],
    selectedCardId: null,
    effects: { turnAtkMod: { Union: 0, Confed: 0 } },
    drawnThisTurn: false,
  };

  state.units = [
    makeUnit("U1", "Union", "INF", 7, 1),
    makeUnit("U2", "Union", "INF", 7, 3),
    makeUnit("U3", "Union", "ART", 6, 2),
    makeUnit("U4", "Union", "CAV", 7, 5),

    makeUnit("C1", "Confed", "INF", 0, 4),
    makeUnit("C2", "Confed", "INF", 0, 6),
    makeUnit("C3", "Confed", "ART", 1, 5),
    makeUnit("C4", "Confed", "CAV", 0, 2),
  ];

  state.acted = {};
  for (const u of state.units) state.acted[u.id] = { moved: false, attacked: false };

  logEl.innerHTML = "";
  log("New game started. Union to move.");
  log("Mode: " + (state.mode === "pve" ? "Single Player (Human vs AI)" : "Two Player (Human vs Human)"));
  log("AI Difficulty: " + diffName(state.difficulty));
  difficultyLabelEl.textContent = diffName(state.difficulty);

  render();
  maybeRunAI();
}

function makeUnit(id, side, typeKey, r, c) {
  const t = UNIT_TYPES[typeKey];
  return { id, side, typeKey, name: t.name, symbol: t.symbol, hp: t.hp, atk: t.atk, def: t.def, move: t.move, range: t.range, r, c };
}

// --- Querying Units ---
function unitAt(r, c) {
  return state.units.find(u => u.r === r && u.c === c) || null;
}
function getUnit(id) {
  return state.units.find(u => u.id === id) || null;
}

// --- Event Cards ---
function makeReinforcementId(side) {
  const prefix = side === "Union" ? "U" : "C";
  let n = 1;
  const existing = new Set(state.units.map(u => u.id));
  while (existing.has(`${prefix}R${n}`)) n++;
  return `${prefix}R${n}`;
}

function randomEventCard() {
  const i = Math.floor(Math.random() * EVENT_CARDS.length);
  return EVENT_CARDS[i];
}

function drawEventCard() {
  if (state.drawnThisTurn) {
    log("You already drew an event card this turn.");
    return;
  }
  const card = randomEventCard();
  const instance = { instanceId: `${card.id}-${cryptoRandomId()}`, cardId: card.id, title: card.title, text: card.text };
  state.hand.push(instance);
  state.selectedCardId = instance.instanceId;
  state.drawnThisTurn = true;
  log(`${state.turnSide} draws an event card: ${card.title}.`);
  render();
}

function playSelectedEvent() {
  const side = state.turnSide;
  const selectedId = state.selectedCardId;
  if (!selectedId) return;

  const idx = state.hand.findIndex(c => c.instanceId === selectedId);
  if (idx === -1) return;

  const instance = state.hand[idx];
  const def = EVENT_CARDS.find(c => c.id === instance.cardId);
  if (!def) return;

  const result = def.play(side);
  if (!result.ok) {
    log(`Cannot play "${def.title}": ${result.reason}`);
    render();
    return;
  }

  state.hand.splice(idx, 1);
  state.selectedCardId = null;
  render();
}

// --- Turn / Phase ---
function endTurn() {
  if (isGameOver()) return;

  state.selectedUnitId = null;
  state.phase = "Move";
  state.turnSide = otherSide(state.turnSide);

  for (const u of state.units) {
    if (u.side === state.turnSide) state.acted[u.id] = { moved: false, attacked: false };
  }

  state.effects.turnAtkMod[state.turnSide] = 0;
  state.drawnThisTurn = false;

  log(`${state.turnSide} turn begins.`);
  render();
  maybeRunAI();
}

function advancePhaseIfNeeded() {
  const u = getUnit(state.selectedUnitId);
  if (!u) return;
  const act = state.acted[u.id];
  if (state.phase === "Move" && act.moved) state.phase = "Attack";
  if (state.phase === "Attack" && act.attacked) state.selectedUnitId = null;
}

// --- Movement / Attack Options ---
function computeMoveTargets(unit) {
  const targets = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (unitAt(r, c)) continue;
      const dist = Math.abs(unit.r - r) + Math.abs(unit.c - c);
      if (dist > 0 && dist <= unit.move) targets.push({ r, c });
    }
  }
  return targets;
}

function computeAttackTargets(unit) {
  const targets = [];
  for (const enemy of state.units) {
    if (enemy.side === unit.side) continue;
    const dist = Math.abs(unit.r - enemy.r) + Math.abs(unit.c - enemy.c);
    if (dist > 0 && dist <= unit.range) targets.push({ r: enemy.r, c: enemy.c });
  }
  return targets;
}

// --- Combat ---
function attack(attacker, defender) {
  const atkHill = isHill(attacker.r, attacker.c) ? 1 : 0;
  const defHill = isHill(defender.r, defender.c) ? 1 : 0;
  const roll = Math.random() < 0.5 ? 0 : 1;

  const sideMod = state.effects.turnAtkMod[attacker.side] || 0;
  const raw = (attacker.atk + atkHill) - (defender.def + defHill) + roll + sideMod;
  const dmg = Math.max(1, raw);

  defender.hp -= dmg;

  log(
    `${attacker.side} ${attacker.symbol} (${attacker.id}) hits ` +
    `${defender.side} ${defender.symbol} (${defender.id}) for ${dmg}.` +
    `${atkHill ? " [High Ground +1 ATK]" : ""}` +
    `${defHill ? " [Target on High Ground +1 DEF]" : ""}` +
    `${sideMod ? ` [Event ATK mod ${sideMod}]` : ""}`
  );

  if (defender.hp <= 0) {
    log(`${defender.side} ${defender.symbol} (${defender.id}) is eliminated.`);
    state.units = state.units.filter(u => u.id !== defender.id);
  }

  if (isGameOver()) {
    const unionAlive = state.units.some(u => u.side === "Union");
    log(`GAME OVER: ${unionAlive ? "Union" : "Confederacy"} wins!`);
  }
}

function isGameOver() {
  const unionAlive = state.units.some(u => u.side === "Union");
  const confedAlive = state.units.some(u => u.side === "Confed");
  return !unionAlive || !confedAlive;
}

// --- Click Handling ---
function onCellClick(r, c) {
  if (isGameOver()) return;
  if (state.mode === "pve" && state.turnSide === "Confed") return;

  const clickedUnit = unitAt(r, c);
  const selected = getUnit(state.selectedUnitId);

  if (clickedUnit && clickedUnit.side === state.turnSide) {
    state.selectedUnitId = clickedUnit.id;
    state.phase = state.acted[clickedUnit.id].moved ? "Attack" : "Move";
    render();
    return;
  }

  if (!selected) return;
  if (selected.side !== state.turnSide) return;

  const act = state.acted[selected.id];

  if (state.phase === "Move") {
    if (act.moved) {
      state.phase = "Attack";
      render();
      return;
    }
    const moves = computeMoveTargets(selected);
    if (moves.some(t => t.r === r && t.c === c)) {
      selected.r = r; selected.c = c;
      act.moved = true;
      log(`${selected.side} ${selected.symbol} (${selected.id}) moves to (${r},${c}).`);
      advancePhaseIfNeeded();
      render();
      return;
    }
  }

  if (state.phase === "Attack") {
    if (act.attacked) {
      state.selectedUnitId = null;
      render();
      return;
    }
    if (!clickedUnit || clickedUnit.side === selected.side) return;
    const targets = computeAttackTargets(selected);
    if (targets.some(t => t.r === r && t.c === c)) {
      attack(selected, clickedUnit);
      act.attacked = true;
      advancePhaseIfNeeded();
      render();
      return;
    }
  }
}

// --- AI (Confederacy) ---
function maybeRunAI() {
  if (state.mode !== "pve") return;
  if (isGameOver()) return;
  if (state.turnSide !== "Confed") return;

  setTimeout(() => {
    aiTakeTurn();
    render();
  }, 250);
}

function aiTakeTurn() {
  if (isGameOver()) return;

  log(`AI (Confederacy) acting — ${diffName(state.difficulty)}.`);

  const easyRandom = state.difficulty === 1;

  if (!state.drawnThisTurn) drawEventCard();

  // In Robert Mode: always attempt to play an event
  if (state.difficulty === 4) {
    aiPlayBestEvent(true);
  } else {
    if (!easyRandom || Math.random() < 0.6) aiPlayBestEvent(false);
  }

  const aiUnits = state.units.filter(u => u.side === "Confed");
  const enemies = state.units.filter(u => u.side === "Union");
  if (enemies.length === 0) return;

  // Robert Mode: pick a "focus target" the AI wants to concentrate on
  const focus = state.difficulty === 4 ? pickFocusTarget(enemies) : null;

  for (const u of aiUnits) {
    const act = state.acted[u.id] || { moved: false, attacked: false };
    state.acted[u.id] = act;

    if (state.difficulty === 1 && Math.random() < 0.35) {
      aiRandomUnitTurn(u, act);
      continue;
    }

    // Attack first if possible
    if (!act.attacked) {
      const targets = computeAttackTargets(u);
      if (targets.length > 0) {
        const best = aiPickBestAttack(u, targets, focus);
        if (best) {
          const def = unitAt(best.r, best.c);
          if (def) {
            attack(u, def);
            act.attacked = true;
          }
        }
      }
    }

    // Move
    if (!act.moved) {
      const move = aiPickBestMove(u, focus);
      if (move) {
        u.r = move.r; u.c = move.c;
        act.moved = true;
        log(`AI moves ${u.symbol} (${u.id}) to (${u.r},${u.c}).`);
      }
    }

    // Attack after moving
    if (!act.attacked) {
      const targets = computeAttackTargets(u);
      if (targets.length > 0) {
        const best = aiPickBestAttack(u, targets, focus);
        if (best) {
          const def = unitAt(best.r, best.c);
          if (def) {
            attack(u, def);
            act.attacked = true;
          }
        }
      }
    }
  }

  if (!isGameOver()) endTurn();
}

function aiRandomUnitTurn(u, act) {
  const order = Math.random() < 0.5 ? "moveFirst" : "attackFirst";
  if (order === "moveFirst" && !act.moved) {
    const moves = computeMoveTargets(u);
    if (moves.length) {
      const m = moves[Math.floor(Math.random() * moves.length)];
      u.r = m.r; u.c = m.c;
      act.moved = true;
      log(`AI (easy) randomly moves ${u.symbol} (${u.id}) to (${u.r},${u.c}).`);
    }
  }
  if (!act.attacked) {
    const targets = computeAttackTargets(u);
    if (targets.length) {
      const t = targets[Math.floor(Math.random() * targets.length)];
      const def = unitAt(t.r, t.c);
      if (def) {
        attack(u, def);
        act.attacked = true;
      }
    }
  }
  if (order === "attackFirst" && !act.moved) {
    const moves = computeMoveTargets(u);
    if (moves.length) {
      const m = moves[Math.floor(Math.random() * moves.length)];
      u.r = m.r; u.c = m.c;
      act.moved = true;
      log(`AI (easy) randomly moves ${u.symbol} (${u.id}) to (${u.r},${u.c}).`);
    }
  }
}

function aiPlayBestEvent(force) {
  // If force=true, always try to play something if possible.
  // Robert Mode: prioritize Reinforcements, then Ammo Shortage.
  const reinf = state.hand.find(c => c.cardId === "reinforcements");
  if (reinf) {
    const side = state.turnSide;
    const res = EVENT_CARDS.find(c => c.id === "reinforcements").play(side);
    if (res.ok) {
      state.hand = state.hand.filter(c => c.instanceId !== reinf.instanceId);
      state.selectedCardId = null;
      return;
    }
  }

  const ammo = state.hand.find(c => c.cardId === "ammo_shortage");
  if (ammo && (force || Math.random() < 0.85)) {
    const side = state.turnSide;
    EVENT_CARDS.find(c => c.id === "ammo_shortage").play(side);
    state.hand = state.hand.filter(c => c.instanceId !== ammo.instanceId);
    state.selectedCardId = null;
  }
}

function pickFocusTarget(enemies) {
  // Robert Mode focus target:
  // prioritize ART, then low HP, then high ground occupants
  let best = null;
  let bestScore = -Infinity;

  for (const e of enemies) {
    let score = 0;
    if (e.typeKey === "ART") score += 3.0;
    else if (e.typeKey === "CAV") score += 1.2;
    else score += 0.6;

    score += (5 - e.hp) * 0.7;
    if (isHill(e.r, e.c)) score += 1.0;

    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best; // a unit object
}

function aiPickBestAttack(attacker, targets, focusTarget) {
  let best = null;
  let bestScore = -Infinity;

  for (const t of targets) {
    const defender = unitAt(t.r, t.c);
    if (!defender) continue;

    const est = estimateDamage(attacker, defender);
    const killBonus = est >= defender.hp ? 100 : 0;

    let score = est + killBonus;

    if (state.difficulty >= 2) score += (5 - defender.hp) * 0.15;

    if (state.difficulty >= 3) {
      const typeBonus = defender.typeKey === "ART" ? 1.1 : 0;
      score += typeBonus;
      score += (defender.hp <= 2 ? 0.8 : 0);
    }

    if (state.difficulty === 4) {
      // Robert Mode: concentrate fire on focus target
      if (focusTarget && defender.id === focusTarget.id) score += 2.0;

      // prioritize artillery/cav, punish low-defense
      score += defender.typeKey === "ART" ? 1.6 : (defender.typeKey === "CAV" ? 0.8 : 0.2);
      score += (1 - defender.def) * 0.6;

      // slightly prefer attacking units on/near hills
      if (isHill(defender.r, defender.c)) score += 0.8;
    }

    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  return best;
}

function estimateDamage(attacker, defender) {
  const atkHill = isHill(attacker.r, attacker.c) ? 1 : 0;
  const defHill = isHill(defender.r, defender.c) ? 1 : 0;
  const sideMod = state.effects.turnAtkMod[attacker.side] || 0;

  const expectedRoll = 0.5;
  const raw = (attacker.atk + atkHill) - (defender.def + defHill) + expectedRoll + sideMod;
  return Math.max(1, raw);
}

function aiPickBestMove(unit, focusTarget) {
  const moves = computeMoveTargets(unit);
  if (moves.length === 0) return null;

  const enemies = state.units.filter(u => u.side !== unit.side);
  if (enemies.length === 0) return null;

  // If Robert Mode, bias toward moving toward focus target
  const focus = state.difficulty === 4 && focusTarget ? focusTarget : null;

  let best = null;
  let bestScore = -Infinity;

  for (const m of moves) {
    const dist = focus
      ? (Math.abs(m.r - focus.r) + Math.abs(m.c - focus.c))
      : nearestEnemyDistanceFrom(m.r, m.c, enemies);

    let score = -dist;

    // high ground preference grows with difficulty; Robert is strongest
    if (isHill(m.r, m.c)) score += (state.difficulty === 1 ? 0.2 : state.difficulty === 2 ? 0.6 : state.difficulty === 3 ? 1.1 : 1.5);

    // enable an attack
    const temp = { ...unit, r: m.r, c: m.c };
    const canAttack = computeAttackTargets(temp).length > 0 ? 2.0 : 0;
    score += canAttack;

    if (state.difficulty >= 3) {
      const threatened = countThreatsAt(m.r, m.c, enemies);
      score -= threatened * (state.difficulty === 3 ? 0.8 : 0.55); // Robert is a bit bolder
      score -= artilleryThreatAt(m.r, m.c, enemies) * (state.difficulty === 3 ? 0.8 : 0.55);
    } else if (state.difficulty === 2) {
      const threatened = countThreatsAt(m.r, m.c, enemies);
      score -= threatened * 0.35;
    }

    if (state.difficulty === 4) {
      // Robert Mode: mild "flank" preference (avoid straight-line clustering)
      // Encourage lateral movement if it still closes distance.
      score += (m.c <= 2 || m.c >= 5) ? 0.25 : 0;

      // Also: prefer squares that threaten multiple enemies next turn (pressure)
      score += projectedThreat(temp, enemies) * 0.25;
    }

    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }

  return best;
}

function nearestEnemyDistanceFrom(r, c, enemies) {
  let best = Infinity;
  for (const e of enemies) {
    const d = Math.abs(r - e.r) + Math.abs(c - e.c);
    if (d < best) best = d;
  }
  return best;
}

function countThreatsAt(r, c, enemies) {
  let n = 0;
  for (const e of enemies) {
    const d = Math.abs(r - e.r) + Math.abs(c - e.c);
    if (d > 0 && d <= e.range) n++;
  }
  return n;
}

function artilleryThreatAt(r, c, enemies) {
  let n = 0;
  for (const e of enemies) {
    if (e.typeKey !== "ART") continue;
    const d = Math.abs(r - e.r) + Math.abs(c - e.c);
    if (d > 0 && d <= e.range) n++;
  }
  return n;
}

function projectedThreat(unitLike, enemies) {
  // How many enemies would be in range if unitLike attacks next turn (pressure measure)
  let n = 0;
  for (const e of enemies) {
    const d = Math.abs(unitLike.r - e.r) + Math.abs(unitLike.c - e.c);
    if (d > 0 && d <= unitLike.range) n++;
  }
  return n;
}

// --- Rendering ---
function render() {
  turnSideEl.textContent = state.turnSide;
  turnPhaseEl.textContent = state.phase;
  modeLabelEl.textContent = state.mode === "pve" ? "Single Player" : "Two Player";
  aiNoteEl.style.opacity = state.mode === "pve" ? "1" : "0.35";

  difficultyWrapEl.style.opacity = state.mode === "pve" ? "1" : "0.35";
  difficultyLabelEl.textContent = diffName(state.difficulty);

  const selected = getUnit(state.selectedUnitId);
  if (selected) {
    const hill = isHill(selected.r, selected.c) ? " (High Ground)" : "";
    selectedInfoEl.textContent = `${selected.side} ${selected.symbol} ${selected.id} | HP ${selected.hp}${hill}`;
  } else {
    selectedInfoEl.textContent = "None";
  }

  boardEl.innerHTML = "";
  const highlights = getHighlights();

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      if (isHill(r, c)) cell.classList.add("hill");

      const h = highlights[key(r, c)];
      if (h === "move") cell.classList.add("highlight-move");
      if (h === "attack") cell.classList.add("highlight-attack");

      if (selected && selected.r === r && selected.c === c) cell.classList.add("selected");

      const u = unitAt(r, c);
      if (u) {
        const unitEl = document.createElement("div");
        unitEl.className = `unit ${u.side === "Union" ? "union" : "confed"}`;
        unitEl.textContent = u.symbol;

        const badges = document.createElement("div");
        badges.className = "badges";

        const hp = document.createElement("span");
        hp.className = "badge";
        hp.textContent = `HP ${u.hp}`;

        badges.appendChild(hp);
        cell.appendChild(unitEl);
        cell.appendChild(badges);
      }

      cell.addEventListener("click", () => onCellClick(r, c));
      boardEl.appendChild(cell);
    }
  }

  renderEventUI();
}

function getHighlights() {
  const out = {};
  const selected = getUnit(state.selectedUnitId);
  if (!selected) return out;

  if (state.mode === "pve" && state.turnSide === "Confed") return out;
  if (selected.side !== state.turnSide) return out;

  const act = state.acted[selected.id];

  if (state.phase === "Move" && !act.moved) {
    for (const t of computeMoveTargets(selected)) out[key(t.r, t.c)] = "move";
  }

  if (state.phase === "Attack" && !act.attacked) {
    for (const t of computeAttackTargets(selected)) out[key(t.r, t.c)] = "attack";
  }

  return out;
}

function renderEventUI() {
  const aiTurn = state.mode === "pve" && state.turnSide === "Confed";
  btnDrawEvent.disabled = aiTurn || state.drawnThisTurn;
  btnPlayEvent.disabled = aiTurn || !state.selectedCardId;

  eventHandEl.innerHTML = "";
  if (state.hand.length === 0) {
    const empty = document.createElement("div");
    empty.className = "eventHint";
    empty.textContent = "No cards in hand.";
    eventHandEl.appendChild(empty);
  } else {
    for (const c of state.hand) {
      const div = document.createElement("div");
      div.className = "card";
      if (c.instanceId === state.selectedCardId) div.classList.add("selected");

      div.innerHTML = `
        <div class="cardTitle">${c.title}</div>
        <div class="cardText">${c.text}</div>
      `;

      div.addEventListener("click", () => {
        if (aiTurn) return;
        state.selectedCardId = c.instanceId;
        render();
      });

      eventHandEl.appendChild(div);
    }
  }

  const mod = state.effects.turnAtkMod[state.turnSide] || 0;
  const lines = [];
  lines.push(`<b>${state.turnSide} active effects (this turn)</b>`);
  lines.push(mod !== 0 ? `• Attack damage modifier: ${mod}` : `• None`);
  eventActiveEl.innerHTML = lines.join("<br/>");

  eventHintEl.textContent = aiTurn
    ? `AI is acting (${diffName(state.difficulty)}). Event actions are disabled.`
    : (state.drawnThisTurn ? "Card drawn this turn. Select a card and click Play Selected." : "You can draw 1 card per turn.");
}

// Boot
reset();
