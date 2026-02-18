 // Gettysburg Mini Tactics (vanilla JS)
// Features:
// - PvP or PvE (AI controls Confederacy)
// - Difficulty slider: 1 Easy, 2 Normal, 3 Hard, 4 Robert Mode (Lee)
// - Event cards
// - Campaign mode: 3 battles with Union survivors carrying over (+1 HP between battles)
// - Animations: move pop, hit flash, damage float
// - Between-battle Command Phase with scaling costs + roster preview

const SIZE = 8;

// HIGH_GROUND mutable so campaign levels can swap it
let HIGH_GROUND = new Set([
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

// Campaign levels (Union roster carries over)
const CAMPAIGN_LEVELS = [
  {
    name: "Day 1: Meeting Engagement",
    highGround: new Set([key(6,6), key(7,6), key(6,7), key(7,7)]),
    setup: () => ([
      makeUnit("U1", "Union", "INF", 7, 1),
      makeUnit("U2", "Union", "INF", 7, 3),
      makeUnit("U3", "Union", "ART", 6, 2),
      makeUnit("U4", "Union", "CAV", 7, 5),

      makeUnit("C1", "Confed", "INF", 0, 4),
      makeUnit("C2", "Confed", "INF", 0, 6),
      makeUnit("C3", "Confed", "ART", 1, 5),
      makeUnit("C4", "Confed", "CAV", 0, 2),
    ]),
    winCondition: { type: "eliminate" },
  },
  {
    name: "Day 2: Little Round Top",
    highGround: new Set([key(5,6), key(6,5), key(6,6), key(6,7), key(7,6), key(7,7)]),
    setup: () => ([
      makeUnit("C5", "Confed", "INF", 0, 3),
      makeUnit("C6", "Confed", "INF", 0, 5),
      makeUnit("C7", "Confed", "ART", 1, 4),
      makeUnit("C8", "Confed", "CAV", 0, 1),
    ]),
    winCondition: { type: "holdHill", side: "Union", turns: 3 },
  },
  {
    name: "Day 3: Pickett’s Charge",
    highGround: new Set([key(6,3), key(6,4), key(7,3), key(7,4)]),
    setup: () => ([
      makeUnit("C9",  "Confed", "INF", 0, 2),
      makeUnit("C10", "Confed", "INF", 0, 4),
      makeUnit("C11", "Confed", "INF", 0, 6),
      makeUnit("C12", "Confed", "ART", 1, 5),
    ]),
    winCondition: { type: "eliminate" },
  },
];

// Command Phase: base costs
const UPGRADE_BASE_COST = {
  heal: 2,
  reinforce: 3,
  artillery: 4,
  morale: 3,
};
function upgradeCost(type) {
  const uses = state?.campaign?.upgradeUses?.[type] || 0;
  return (UPGRADE_BASE_COST[type] || 999) + uses; // linear scaling
}

// --- Game State ---
let state = null;

// --- DOM ---
const boardEl = document.getElementById("board");
const turnSideEl = document.getElementById("turnSide");
const turnPhaseEl = document.getElementById("turnPhase");
const selectedInfoEl = document.getElementById("selectedInfo");
const logEl = document.getElementById("log");
const modeLabelEl = document.getElementById("modeLabel");
const campaignLabelEl = document.getElementById("campaignLabel");
const battleNameEl = document.getElementById("battleName");

document.getElementById("btnEndTurn").addEventListener("click", endTurn);
document.getElementById("btnReset").addEventListener("click", reset);

const modeSelectEl = document.getElementById("modeSelect");
const aiNoteEl = document.getElementById("aiNote");

const difficultyEl = document.getElementById("difficulty");
const difficultyLabelEl = document.getElementById("difficultyLabel");
const difficultyWrapEl = document.getElementById("difficultyWrap");

const btnCampaign = document.getElementById("btnCampaign");

// Command overlay DOM
const commandOverlay = document.getElementById("commandOverlay");
const cpDisplay = document.getElementById("cpDisplay");
const btnNextBattle = document.getElementById("btnNextBattle");
const rosterPreviewEl = document.getElementById("rosterPreview");
const commandNoteEl = document.getElementById("commandNote");

const costHealEl = document.getElementById("cost-heal");
const costReinforceEl = document.getElementById("cost-reinforce");
const costArtilleryEl = document.getElementById("cost-artillery");
const costMoraleEl = document.getElementById("cost-morale");

// Event UI DOM
const btnDrawEvent = document.getElementById("btnDrawEvent");
const btnPlayEvent = document.getElementById("btnPlayEvent");
const eventHandEl = document.getElementById("eventHand");
const eventActiveEl = document.getElementById("eventActive");
const eventHintEl = document.getElementById("eventHint");

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

// --- Anim Helpers ---
function flashUnitAt(r, c, cls) {
  const idx = r * SIZE + c;
  const cell = boardEl.children[idx];
  if (!cell) return;
  const unitEl = cell.querySelector(".unit");
  if (!unitEl) return;
  unitEl.classList.add(cls);
  setTimeout(() => unitEl.classList.remove(cls), 170);
}

function showDamageAt(r, c, dmg) {
  const idx = r * SIZE + c;
  const cell = boardEl.children[idx];
  if (!cell) return;
  const pop = document.createElement("div");
  pop.className = "dmgPop";
  pop.textContent = `-${dmg}`;
  cell.appendChild(pop);
  setTimeout(() => pop.remove(), 700);
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

    // Event
    hand: [],
    selectedCardId: null,
    effects: { turnAtkMod: { Union: 0, Confed: 0 } },
    drawnThisTurn: false,

    // Campaign
    campaign: {
      active: false,
      levelIndex: 0,
      roster: null,
      hillHoldCount: 0,
      commandPoints: 0,
      upgradeUses: { heal: 0, reinforce: 0, artillery: 0, morale: 0 },
    },
  };

  // Default skirmish hills
  HIGH_GROUND = new Set([
    key(6, 6), key(7, 6), key(6, 7), key(7, 7), key(5, 6), key(6, 5)
  ]);

  // Default skirmish units
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

  // UI
  closeCommandPhase();
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
  return {
    id, side, typeKey,
    name: t.name, symbol: t.symbol,
    hp: t.hp, atk: t.atk, def: t.def,
    move: t.move, range: t.range,
    r, c
  };
}

// --- Campaign ---
function startCampaign() {
  state.campaign.active = true;
  state.campaign.levelIndex = 0;
  state.campaign.roster = null;
  state.campaign.hillHoldCount = 0;

  state.campaign.commandPoints = 0;
  state.campaign.upgradeUses = { heal: 0, reinforce: 0, artillery: 0, morale: 0 };

  log("=== CAMPAIGN START ===");
  loadCampaignLevel(0);
}

function loadCampaignLevel(i) {
  const lvl = CAMPAIGN_LEVELS[i];
  HIGH_GROUND = lvl.highGround;

  state.turnSide = "Union";
  state.phase = "Move";
  state.selectedUnitId = null;

  state.hand = [];
  state.selectedCardId = null;
  state.effects.turnAtkMod = { Union: 0, Confed: 0 };
  state.drawnThisTurn = false;

  state.campaign.hillHoldCount = 0;

  let units = lvl.setup();

  // Carry-over roster replaces Union units when available
  if (state.campaign.roster) {
    units = units.filter(u => u.side !== "Union").concat(state.campaign.roster.map(u => ({ ...u })));

    // Between-battle heal (Union +1 HP capped)
    for (const u of units) {
      if (u.side === "Union") {
        const maxHp = UNIT_TYPES[u.typeKey].hp;
        u.hp = Math.min(maxHp, u.hp + 1);
      }
    }
  }

  // Ensure acted map exists for all units
  state.units = units;
  state.acted = {};
  for (const u of state.units) state.acted[u.id] = { moved: false, attacked: false };

  log(`=== ${lvl.name} (Battle ${i + 1}/${CAMPAIGN_LEVELS.length}) ===`);
  render();
  maybeRunAI();
}

function handleBattleEnd(winner) {
  log(`BATTLE OVER: ${winner} wins.`);

  if (!state.campaign.active) {
    log("GAME OVER.");
    return;
  }

  if (winner !== "Union") {
    log(`CAMPAIGN FAILED on ${CAMPAIGN_LEVELS[state.campaign.levelIndex].name}.`);
    state.campaign.active = false;
    render();
    return;
  }

  // Save Union survivors to roster
  const survivors = state.units
    .filter(u => u.side === "Union")
    .map(u => ({ ...u }));

  state.campaign.roster = survivors;

  // Award Command Points (base + survivors bonus)
  const baseCP = 3;
  const survivorBonus = survivors.length;
  const gain = baseCP + survivorBonus;
  state.campaign.commandPoints += gain;
  log(`Union gains ${gain} Command Points (base ${baseCP} + survivors ${survivorBonus}).`);

  // Next level?
  const next = state.campaign.levelIndex + 1;
  if (next >= CAMPAIGN_LEVELS.length) {
    log("=== CAMPAIGN COMPLETE: Union Victory at Gettysburg! ===");
    state.campaign.active = false;
    render();
    return;
  }

  state.campaign.levelIndex = next;

  // Open command phase instead of immediately loading next battle
  openCommandPhase();
}

function checkWinCondition() {
  const unionAlive = state.units.some(u => u.side === "Union");
  const confedAlive = state.units.some(u => u.side === "Confed");

  // elimination ends battle always
  if (!unionAlive || !confedAlive) {
    return { over: true, winner: unionAlive ? "Union" : "Confed" };
  }

  if (!state.campaign.active) return { over: false };

  const lvl = CAMPAIGN_LEVELS[state.campaign.levelIndex];
  const wc = lvl.winCondition;

  if (wc.type === "holdHill") {
    if (state.campaign.hillHoldCount >= wc.turns) {
      return { over: true, winner: wc.side };
    }
  }

  return { over: false };
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
  const existing = new Set(state.units.map(u => u.id).concat((state.campaign.roster || []).map(u => u.id)));
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
  const instance = {
    instanceId: `${card.id}-${cryptoRandomId()}`,
    cardId: card.id,
    title: card.title,
    text: card.text
  };
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

// --- Command Phase ---
function openCommandPhase() {
  commandOverlay.classList.remove("hidden");
  commandNoteEl.textContent = "";
  refreshCommandUI();
}

function closeCommandPhase() {
  commandOverlay.classList.add("hidden");
}

function refreshCommandUI() {
  cpDisplay.textContent = `CP: ${state.campaign.commandPoints}`;

  costHealEl.textContent = `(${upgradeCost("heal")} CP)`;
  costReinforceEl.textContent = `(${upgradeCost("reinforce")} CP)`;
  costArtilleryEl.textContent = `(${upgradeCost("artillery")} CP)`;
  costMoraleEl.textContent = `(${upgradeCost("morale")} CP)`;

  renderRosterPreview();
}

function renderRosterPreview() {
  const roster = state.campaign.roster || [];
  rosterPreviewEl.innerHTML = "";

  if (roster.length === 0) {
    rosterPreviewEl.textContent = "No survivors in roster.";
    return;
  }

  for (const u of roster) {
    const maxHp = UNIT_TYPES[u.typeKey].hp;

    const row = document.createElement("div");
    row.className = "rosterRow";

    const left = document.createElement("div");
    left.innerHTML = `
      <div class="rosterId">${u.id} <span class="badgeTiny">${u.symbol}</span></div>
      <div class="rosterMeta">${u.name}</div>
    `;

    const right = document.createElement("div");
    right.className = "rosterStats";
    right.innerHTML = `
      HP ${u.hp}/${maxHp}<br/>
      ATK ${u.atk} • DEF ${u.def}<br/>
      MOV ${u.move} • RNG ${u.range}
    `;

    row.appendChild(left);
    row.appendChild(right);
    rosterPreviewEl.appendChild(row);
  }
}

function spendCommandPoints(type) {
  const roster = state.campaign.roster;
  if (!state.campaign.active || !roster) return;

  const cost = upgradeCost(type);
  if (state.campaign.commandPoints < cost) {
    commandNoteEl.textContent = `Not enough CP. Need ${cost}.`;
    return;
  }

  // Spend CP + record use (for scaling)
  state.campaign.commandPoints -= cost;
  state.campaign.upgradeUses[type] = (state.campaign.upgradeUses[type] || 0) + 1;

  if (type === "heal") {
    roster.forEach(u => {
      const maxHp = UNIT_TYPES[u.typeKey].hp;
      u.hp = maxHp;
    });
    commandNoteEl.textContent = `Healed all units. Cost ${cost} CP.`;
  }

  else if (type === "reinforce") {
    const id = makeReinforcementId("Union");
    // r/c here are placeholders; units will appear via roster on next load
    roster.push(makeUnit(id, "Union", "INF", 7, 4));
    commandNoteEl.textContent = `Added Infantry (${id}). Cost ${cost} CP.`;
  }

  else if (type === "artillery") {
    let upgraded = 0;
    roster.forEach(u => {
      if (u.typeKey === "ART") { u.range += 1; upgraded++; }
    });
    commandNoteEl.textContent = upgraded
      ? `Upgraded ${upgraded} artillery unit(s). Cost ${cost} CP.`
      : `No artillery to upgrade (still cost ${cost} CP).`;
  }

  else if (type === "morale") {
    roster.forEach(u => { u.atk += 1; });
    commandNoteEl.textContent = `Inspired troops (+1 ATK). Cost ${cost} CP.`;
  }

  refreshCommandUI();
}

// --- Turn / Phase ---
function endTurn() {
  if (isGameOverRaw()) return;

  // Campaign holdHill: when Union ends their turn, check if Union holds hill
  if (state.campaign.active) {
    const lvl = CAMPAIGN_LEVELS[state.campaign.levelIndex];
    if (lvl.winCondition.type === "holdHill" && state.turnSide === "Union") {
      const unionOnHill = state.units.some(u => u.side === "Union" && isHill(u.r, u.c));
      if (unionOnHill) {
        state.campaign.hillHoldCount += 1;
        log(`Union holds the hill (${state.campaign.hillHoldCount}/${lvl.winCondition.turns}).`);
      } else {
        log("Union does not hold the hill this turn.");
      }
    }
  }

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

  const result = checkWinCondition();
  if (result.over) {
    handleBattleEnd(result.winner);
    return;
  }

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

// --- Combat (returns animation info) ---
function resolveAttack(attacker, defender) {
  const atkHill = isHill(attacker.r, attacker.c) ? 1 : 0;
  const defHill = isHill(defender.r, defender.c) ? 1 : 0;
  const roll = Math.random() < 0.5 ? 0 : 1;

  const sideMod = state.effects.turnAtkMod[attacker.side] || 0;
  const raw = (attacker.atk + atkHill) - (defender.def + defHill) + roll + sideMod;
  const dmg = Math.max(1, raw);

  const attackerPos = { r: attacker.r, c: attacker.c };
  const defenderPos = { r: defender.r, c: defender.c };

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

  return { attackerPos, defenderPos, dmg };
}

function isGameOverRaw() {
  const unionAlive = state.units.some(u => u.side === "Union");
  const confedAlive = state.units.some(u => u.side === "Confed");
  return !unionAlive || !confedAlive;
}

// --- Click Handling (animation-safe: render once, animate after) ---
function onCellClick(r, c) {
  if (isGameOverRaw()) return;
  if (state.mode === "pve" && state.turnSide === "Confed") return;

  const clickedUnit = unitAt(r, c);
  const selected = getUnit(state.selectedUnitId);

  // select your unit
  if (clickedUnit && clickedUnit.side === state.turnSide) {
    state.selectedUnitId = clickedUnit.id;
    state.phase = state.acted[clickedUnit.id].moved ? "Attack" : "Move";
    render();
    return;
  }

  if (!selected) return;
  if (selected.side !== state.turnSide) return;

  const act = state.acted[selected.id];

  // MOVE
  if (state.phase === "Move") {
    if (act.moved) {
      state.phase = "Attack";
      render();
      return;
    }

    const moves = computeMoveTargets(selected);
    if (moves.some(t => t.r === r && t.c === c)) {
      selected.r = r;
      selected.c = c;
      act.moved = true;
      log(`${selected.side} ${selected.symbol} (${selected.id}) moves to (${r},${c}).`);

      advancePhaseIfNeeded();
      render();
      flashUnitAt(r, c, "animMove");
      return;
    }
  }

  // ATTACK
  if (state.phase === "Attack") {
    if (act.attacked) {
      state.selectedUnitId = null;
      render();
      return;
    }

    if (!clickedUnit || clickedUnit.side === selected.side) return;

    const targets = computeAttackTargets(selected);
    if (targets.some(t => t.r === r && t.c === c)) {
      const info = resolveAttack(selected, clickedUnit);
      act.attacked = true;

      const result = checkWinCondition();
      if (result.over) {
        render();
        flashUnitAt(info.attackerPos.r, info.attackerPos.c, "animMove");
        flashUnitAt(info.defenderPos.r, info.defenderPos.c, "animHit");
        showDamageAt(info.defenderPos.r, info.defenderPos.c, info.dmg);
        handleBattleEnd(result.winner);
        return;
      }

      advancePhaseIfNeeded();
      render();
      flashUnitAt(info.attackerPos.r, info.attackerPos.c, "animMove");
      flashUnitAt(info.defenderPos.r, info.defenderPos.c, "animHit");
      showDamageAt(info.defenderPos.r, info.defenderPos.c, info.dmg);
      return;
    }
  }
}

// --- AI (Confederacy) ---
function maybeRunAI() {
  if (state.mode !== "pve") return;
  if (isGameOverRaw()) return;
  if (state.turnSide !== "Confed") return;

  setTimeout(() => {
    aiTakeTurn();
    render();
  }, 250);
}

function aiTakeTurn() {
  if (isGameOverRaw()) return;

  log(`AI (Confederacy) acting — ${diffName(state.difficulty)}.`);

  const easyRandom = state.difficulty === 1;

  if (!state.drawnThisTurn) drawEventCard();

  if (state.difficulty === 4) aiPlayBestEvent(true);
  else if (!easyRandom || Math.random() < 0.6) aiPlayBestEvent(false);

  const aiUnits = state.units.filter(u => u.side === "Confed");
  const enemies = state.units.filter(u => u.side === "Union");
  if (enemies.length === 0) return;

  const focus = state.difficulty === 4 ? pickFocusTarget(enemies) : null;

  for (const u of aiUnits) {
    const act = state.acted[u.id] || { moved: false, attacked: false };
    state.acted[u.id] = act;

    if (state.difficulty === 1 && Math.random() < 0.35) {
      aiRandomUnitTurn(u, act);
      continue;
    }

    // attack first
    if (!act.attacked) {
      const targets = computeAttackTargets(u);
      if (targets.length > 0) {
        const best = aiPickBestAttack(u, targets, focus);
        if (best) {
          const def = unitAt(best.r, best.c);
          if (def) {
            const info = resolveAttack(u, def);
            act.attacked = true;

            render();
            flashUnitAt(info.attackerPos.r, info.attackerPos.c, "animMove");
            flashUnitAt(info.defenderPos.r, info.defenderPos.c, "animHit");
            showDamageAt(info.defenderPos.r, info.defenderPos.c, info.dmg);

            const result = checkWinCondition();
            if (result.over) {
              handleBattleEnd(result.winner);
              return;
            }
          }
        }
      }
    }

    // move
    if (!act.moved) {
      const move = aiPickBestMove(u, focus);
      if (move) {
        u.r = move.r; u.c = move.c;
        act.moved = true;
        log(`AI moves ${u.symbol} (${u.id}) to (${u.r},${u.c}).`);
        render();
        flashUnitAt(u.r, u.c, "animMove");
      }
    }

    // attack after move
    if (!act.attacked) {
      const targets = computeAttackTargets(u);
      if (targets.length > 0) {
        const best = aiPickBestAttack(u, targets, focus);
        if (best) {
          const def = unitAt(best.r, best.c);
          if (def) {
            const info = resolveAttack(u, def);
            act.attacked = true;

            render();
            flashUnitAt(info.attackerPos.r, info.attackerPos.c, "animMove");
            flashUnitAt(info.defenderPos.r, info.defenderPos.c, "animHit");
            showDamageAt(info.defenderPos.r, info.defenderPos.c, info.dmg);

            const result = checkWinCondition();
            if (result.over) {
              handleBattleEnd(result.winner);
              return;
            }
          }
        }
      }
    }
  }

  if (!isGameOverRaw()) endTurn();
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
      render();
      flashUnitAt(u.r, u.c, "animMove");
    }
  }

  if (!act.attacked) {
    const targets = computeAttackTargets(u);
    if (targets.length) {
      const t = targets[Math.floor(Math.random() * targets.length)];
      const def = unitAt(t.r, t.c);
      if (def) {
        const info = resolveAttack(u, def);
        act.attacked = true;

        render();
        flashUnitAt(info.attackerPos.r, info.attackerPos.c, "animMove");
        flashUnitAt(info.defenderPos.r, info.defenderPos.c, "animHit");
        showDamageAt(info.defenderPos.r, info.defenderPos.c, info.dmg);

        const result = checkWinCondition();
        if (result.over) handleBattleEnd(result.winner);
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
      render();
      flashUnitAt(u.r, u.c, "animMove");
    }
  }
}

function aiPlayBestEvent(force) {
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
  return best;
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
      score += defender.typeKey === "ART" ? 1.1 : 0;
      score += (defender.hp <= 2 ? 0.8 : 0);
    }

    if (state.difficulty === 4) {
      if (focusTarget && defender.id === focusTarget.id) score += 2.0;
      score += defender.typeKey === "ART" ? 1.6 : (defender.typeKey === "CAV" ? 0.8 : 0.2);
      score += (1 - defender.def) * 0.6;
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

  const focus = state.difficulty === 4 && focusTarget ? focusTarget : null;

  let best = null;
  let bestScore = -Infinity;

  for (const m of moves) {
    const dist = focus
      ? (Math.abs(m.r - focus.r) + Math.abs(m.c - focus.c))
      : nearestEnemyDistanceFrom(m.r, m.c, enemies);

    let score = -dist;

    if (isHill(m.r, m.c)) {
      score += (state.difficulty === 1 ? 0.2 : state.difficulty === 2 ? 0.6 : state.difficulty === 3 ? 1.1 : 1.5);
    }

    const temp = { ...unit, r: m.r, c: m.c };
    score += computeAttackTargets(temp).length > 0 ? 2.0 : 0;

    if (state.difficulty >= 3) {
      const threatened = countThreatsAt(m.r, m.c, enemies);
      const artThreat = artilleryThreatAt(m.r, m.c, enemies);
      score -= threatened * (state.difficulty === 3 ? 0.8 : 0.55);
      score -= artThreat * (state.difficulty === 3 ? 0.8 : 0.55);
    } else if (state.difficulty === 2) {
      score -= countThreatsAt(m.r, m.c, enemies) * 0.35;
    }

    if (state.difficulty === 4) {
      score += (m.c <= 2 || m.c >= 5) ? 0.25 : 0;
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

  // Campaign HUD
  if (state.campaign.active) {
    const i = state.campaign.levelIndex;
    campaignLabelEl.textContent = `Battle ${i + 1}/${CAMPAIGN_LEVELS.length}`;
    battleNameEl.textContent = CAMPAIGN_LEVELS[i].name;
    btnCampaign.textContent = "Restart Campaign";
  } else {
    campaignLabelEl.textContent = "Off";
    battleNameEl.textContent = "Skirmish";
    btnCampaign.textContent = "Start Campaign";
  }

  const selected = getUnit(state.selectedUnitId);
  if (selected) {
    const hill = isHill(selected.r, selected.c) ? " (High Ground)" : "";
    selectedInfoEl.textContent = `${selected.side} ${selected.symbol} ${selected.id} | HP ${selected.hp}${hill}`;
  } else {
    selectedInfoEl.textContent = "None";
  }

  // Board rebuild
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
    : (state.drawnThisTurn
      ? "Card drawn this turn. Select a card and click Play Selected."
      : "You can draw 1 card per turn.");
}

// --- UI wiring ---
btnDrawEvent.addEventListener("click", drawEventCard);
btnPlayEvent.addEventListener("click", playSelectedEvent);

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

// Campaign button: start/restart campaign; forces PvE
btnCampaign.addEventListener("click", () => {
  if (state.mode !== "pve") {
    state.mode = "pve";
    modeSelectEl.value = "pve";
  }
  startCampaign();
});

// Command upgrades click handlers
document.querySelectorAll(".commandOptions button").forEach(btn => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.upgrade;
    spendCommandPoints(type);
  });
});

btnNextBattle.addEventListener("click", () => {
  closeCommandPhase();
  loadCampaignLevel(state.campaign.levelIndex);
});

// Boot
reset();
