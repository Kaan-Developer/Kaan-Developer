/**
 * snake-core.mjs — pure logic for the custom contribution snake.
 * No Node/DOM dependencies, so it runs in Actions AND in a browser test page.
 *
 * Rule set (deliberately the opposite of the default "eat the greens" snake):
 *   1. One cell move per frame.
 *   2. Always prefer an EMPTY (no-contribution) neighbour. Among empties, take the
 *      least-recently visited one (random tie-break) so the snake keeps exploring.
 *   3. NEVER step onto a contributed cell while an empty cell is reachable.
 *      A reachable empty cell is one connected to the head through empty cells; the
 *      first step of such a path is always an empty neighbour, so "no empty neighbour"
 *      ⇔ "no empty cell reachable without crossing green".
 *   4. Only then step onto a RANDOM contributed neighbour. The cell is not "eaten" —
 *      it keeps its colour after the snake passes.
 *   5. The CSS animation loops forever: no start/end state, no game-over.
 */

export const SNAKE_LENGTH = 4;
export const FRAME_MS = 130;
export const CELL = 12;
export const GAP = 3;
export const PAD = 4;

export const THEMES = {
  dark: {
    empty: "#161B22",
    levels: ["#0E4429", "#006D32", "#26A641", "#39D353"],
    head: "#448EFF",
    body: "#246BFE",
    tail: "#1859E8",
  },
  light: {
    empty: "#EBEDF0",
    levels: ["#9BE9A8", "#40C463", "#30A14E", "#216E39"],
    head: "#246BFE",
    body: "#1859E8",
    tail: "#1859E8",
  },
};

export const LEVEL = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

// ── deterministic rng ──────────────────────────────────────────────
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── calendar → grid ────────────────────────────────────────────────
/** Random sparse calendar resembling a young account (for tests / SNAKE_MOCK). */
export function mockCalendar(rng, density = 0.18) {
  const weeks = [];
  for (let w = 0; w < 53; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const lvl = rng() < density ? 1 + Math.floor(rng() * 4) : 0;
      days.push({
        date: `mock-${w}-${d}`,
        weekday: d,
        contributionCount: lvl * 2,
        contributionLevel: Object.keys(LEVEL)[lvl],
      });
    }
    weeks.push({ contributionDays: days });
  }
  return weeks;
}

/** grid[x][y] = 0 (empty) | 1..4 (contributed) | null (no such day in a partial week) */
export function buildGrid(weeks) {
  const cols = weeks.length;
  const rows = 7;
  const grid = Array.from({ length: cols }, () => new Array(rows).fill(null));
  const meta = Array.from({ length: cols }, () => new Array(rows).fill(null));
  weeks.forEach((week, x) => {
    for (const day of week.contributionDays) {
      grid[x][day.weekday] = LEVEL[day.contributionLevel] ?? 0;
      meta[x][day.weekday] = day;
    }
  });
  return { grid, meta, cols, rows };
}

// ── simulation ─────────────────────────────────────────────────────
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const key = (c) => `${c.x},${c.y}`;

export function simulate({ grid, cols, rows }, frames, rng, length = SNAKE_LENGTH) {
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const inBounds = (x, y) => x >= 0 && x < cols && y >= 0 && y < rows && grid[x][y] !== null;
  const isEmpty = (x, y) => grid[x][y] === 0;
  const lastVisit = Array.from({ length: cols }, () => new Array(rows).fill(-1));

  // Start on the first empty cell; fall back to any cell.
  let start = null;
  for (let x = 0; x < cols && !start; x++)
    for (let y = 0; y < rows && !start; y++) if (inBounds(x, y) && isEmpty(x, y)) start = { x, y };
  if (!start)
    for (let x = 0; x < cols && !start; x++)
      for (let y = 0; y < rows && !start; y++) if (inBounds(x, y)) start = { x, y };

  let snake = Array.from({ length }, () => ({ ...start }));
  const path = [snake.map((s) => ({ ...s }))];
  let greenSteps = 0;
  let violations = 0; // moved onto green while an empty neighbour existed — must stay 0

  for (let t = 0; t < frames; t++) {
    const head = snake[0];
    const prev = snake[1];
    // The tail vacates its cell this frame, so only segments 0..n-2 block.
    const blocked = new Set(snake.slice(0, -1).map(key));

    const neighbours = DIRS.map(([dx, dy]) => ({ x: head.x + dx, y: head.y + dy })).filter(
      (c) => inBounds(c.x, c.y) && !blocked.has(key(c)),
    );
    const empties = neighbours.filter((c) => isEmpty(c.x, c.y));

    let next;
    if (empties.length > 0) {
      // RULES 2 & 3: an empty cell is reachable → must take it (least recently visited).
      const oldest = Math.min(...empties.map((c) => lastVisit[c.x][c.y]));
      next = pick(empties.filter((c) => lastVisit[c.x][c.y] === oldest));
    } else if (neighbours.length > 0) {
      // RULE 4: no empty reachable → random contributed neighbour (avoid a pointless U-turn).
      const notBack = neighbours.filter((c) => !(prev && c.x === prev.x && c.y === prev.y));
      next = pick(notBack.length ? notBack : neighbours);
      greenSteps++;
    } else {
      // Fully boxed in by own body — practically impossible with length 4 on 7 rows.
      next = { ...snake[snake.length - 1] };
    }

    if (!isEmpty(next.x, next.y) && empties.length > 0) violations++;

    lastVisit[next.x][next.y] = t;
    snake = [next, ...snake.slice(0, -1)];
    path.push(snake.map((s) => ({ ...s })));
  }

  return { path, greenSteps, violations };
}

// ── svg ────────────────────────────────────────────────────────────
const px = (i) => PAD + i * (CELL + GAP);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** Drop keyframes that sit on a straight line between neighbours (linear timing makes them redundant). */
function compressTrack(points) {
  const keep = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i === 0 || i === points.length - 1) {
      keep.push({ ...p, i });
      continue;
    }
    const a = points[i - 1];
    const b = points[i + 1];
    const collinear = a.x + b.x === 2 * p.x && a.y + b.y === 2 * p.y;
    if (!collinear) keep.push({ ...p, i });
  }
  return keep;
}

export function renderSvg({ grid, meta, cols, rows }, path, theme, login, { titles = true } = {}) {
  const t = THEMES[theme];
  const width = PAD * 2 + cols * (CELL + GAP) - GAP;
  const height = PAD * 2 + rows * (CELL + GAP) - GAP;
  const n = path.length;
  const duration = ((n - 1) * FRAME_MS) / 1000;

  let cells = "";
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const lvl = grid[x][y];
      if (lvl === null) continue;
      const fill = lvl === 0 ? t.empty : t.levels[lvl - 1];
      const d = meta[x][y];
      const title = titles && d ? `<title>${esc(d.date)}: ${d.contributionCount} contributions</title>` : "";
      cells += `<rect x="${px(x)}" y="${px(y)}" width="${CELL}" height="${CELL}" rx="2" fill="${fill}">${title}</rect>`;
    }
  }

  let css = `.seg{animation-duration:${duration}s;animation-iteration-count:infinite;animation-timing-function:linear;animation-fill-mode:both;will-change:transform}`;
  let segs = "";
  const len = path[0].length;
  for (let s = 0; s < len; s++) {
    const track = compressTrack(path.map((frame) => frame[s]));
    const frames = track
      .map((p) => `${((p.i / (n - 1)) * 100).toFixed(3)}%{transform:translate(${px(p.x)}px,${px(p.y)}px)}`)
      .join("");
    css += `@keyframes seg${s}{${frames}}.seg${s}{animation-name:seg${s}}`;

    const isHead = s === 0;
    const isTail = s === len - 1;
    const fill = isHead ? t.head : isTail ? t.tail : t.body;
    const inset = isHead ? 0 : Math.min(3, s);
    const size = CELL - inset * 2;
    segs += `<rect class="seg seg${s}" x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${isHead ? 3 : 2}" fill="${fill}"/>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="t">` +
    `<title id="t">${esc(login)} — contribution graph with a snake moving through the empty days</title>` +
    `<style>${css}</style>` +
    `<g>${cells}</g>` +
    `<g>${segs}</g>` +
    `</svg>`
  );
}
