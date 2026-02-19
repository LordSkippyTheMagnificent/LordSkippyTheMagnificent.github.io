# Gettysburg Mini Tactics

A lightweight, web-based, turn-based tactics game themed around the **Battle of Gettysburg**.  
Play as the **Union** in a short campaign or skirmish against a friend or the AI.

---

## Core Gameplay
- **8x8 grid** tactics battles.
- Two phases per turn:
  1) **Move**
  2) **Attack**
- Each unit can:
  - move once per turn
  - attack once per turn
- **High ground** provides:
  - **+1 Attack**
  - **+1 Defense**
- Win conditions:
  - Skirmish: eliminate enemy units
  - Campaign: multiple battles + special objectives

---

## Units
All units have HP and simple stats designed for fast play.

- **Infantry (INF)**
  - Balanced baseline unit
  - Good for holding ground and trading efficiently

- **Artillery (ART)**
  - Longer range and strong damage potential
  - Fragile if caught out of position

- **Cavalry (CAV)**
  - Highest mobility
  - Strong for flanking and finishing weakened units

---

## Game Modes
### Two Player (PvP)
Human vs human on the same device.

### Single Player (PvE)
Human vs AI (AI controls Confederacy).
- AI difficulty slider:
  - Easy
  - Normal
  - Hard
  - **Robert Mode (Lee)** — the most aggressive and tactical setting

---

## Event Cards
Each turn, you may draw **one** event card.  
Cards can provide sudden momentum swings or tactical constraints.

Included cards:
- **Reinforcements Arrive** — deploy infantry on your back row if a tile is free
- **Ammo Shortage** — reduces your attack damage for the turn

---

## Campaign Mode (3 Battles)
Campaign mode strings battles into a short arc where survival matters.

### Battles
1) **Day 1: Meeting Engagement** — elimination battle  
2) **Day 2: Little Round Top** — **Union wins by holding high ground for 3 Union turns**  
3) **Day 3: Pickett’s Charge** — elimination battle  

### Carry-Over Survivors
Union units that survive carry into the next battle with their remaining HP.
- Survivors heal **+1 HP** between battles (capped at max HP).

---

## Between-Battle Command Phase
After each campaign victory, you enter a Command Phase where you can spend **Command Points (CP)** to strengthen your surviving roster before the next battle.

### Command Points
CP gained after each victory:
- **3 base**
- plus **+1 CP per Union survivor**

### Upgrades (with scaling cost)
Each time you buy an upgrade in the same campaign, its cost increases.

- **Heal All Units**
- **Add Infantry**
- **Upgrade Artillery (+1 Range)**
- **Inspire Troops (+1 ATK)**

### Roster Preview
Command Phase includes a live roster panel showing:
- HP, ATK, DEF, MOV, RNG
for every surviving Union unit.

---

## Controls
- Click a unit to select it.
- Click a highlighted tile to move (Move phase).
- Click a highlighted enemy to attack (Attack phase).
- Click **End Turn** to switch sides.

---

## Running Locally
This is a static web game.

Option A: open `index.html` directly  
Option B (recommended): run a local server:

- VS Code “Live Server” extension, or
- Python:
  - `python -m http.server 8000`

Then open:
- `http://localhost:8000`

---

## Roadmap Ideas
- More terrain types (woods, fences, roads, rivers)
- Morale + fatigue systems
- More event cards (entrenchment, fog, forced march)
- Veteran units + upgrades that persist across campaigns
- Victory/defeat overlay + battle intro screens
