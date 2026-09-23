#!/usr/bin/env node
/**
 * generate-snake.mjs — CLI entry point (Node 18+, zero dependencies).
 * Writes dist/snake-dark.svg and dist/snake-light.svg.
 * All rules live in ./snake-core.mjs — see the header comment there.
 *
 * Env:
 *   GITHUB_TOKEN   token with public read access (Actions' default token works)
 *   GITHUB_USER    login whose contribution calendar is drawn
 *   SNAKE_FRAMES   moves per loop (default 480)
 *   SNAKE_SEED     integer seed; defaults to today's date so output is stable per day
 *   SNAKE_MOCK=1   skip the network and use a random grid (local testing)
 */

import { mkdir, writeFile } from "node:fs/promises";
import { THEMES, mulberry32, mockCalendar, buildGrid, simulate, renderSvg } from "./snake-core.mjs";

const USER = process.env.GITHUB_USER;
const TOKEN = process.env.GITHUB_TOKEN;
const MOCK = process.env.SNAKE_MOCK === "1";
const FRAMES = Number(process.env.SNAKE_FRAMES ?? 480);
const OUT_DIR = "dist";

const todaySeed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""));
const rng = mulberry32(Number(process.env.SNAKE_SEED ?? todaySeed));

async function fetchCalendar(login) {
  const query = `
    query ($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            weeks { contributionDays { date weekday contributionCount contributionLevel } }
          }
        }
      }
    }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "contribution-snake-generator",
    },
    body: JSON.stringify({ query, variables: { login } }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL responded ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data.user.contributionsCollection.contributionCalendar.weeks;
}

async function main() {
  if (!MOCK && (!USER || !TOKEN)) {
    console.error("GITHUB_USER and GITHUB_TOKEN are required (or set SNAKE_MOCK=1).");
    process.exit(1);
  }
  const login = USER ?? "mock-user";
  const weeks = MOCK ? mockCalendar(rng) : await fetchCalendar(login);
  const board = buildGrid(weeks);
  const { path, greenSteps, violations } = simulate(board, FRAMES, rng);

  if (violations > 0) {
    // Guard: the core rule must never be broken. Fail the run loudly instead of publishing.
    throw new Error(`rule violation: snake moved onto a contributed cell ${violations}× while an empty cell was reachable`);
  }

  await mkdir(OUT_DIR, { recursive: true });
  for (const theme of Object.keys(THEMES)) {
    const svg = renderSvg(board, path, theme, login, { titles: !MOCK });
    await writeFile(`${OUT_DIR}/snake-${theme}.svg`, svg, "utf8");
    console.log(`wrote ${OUT_DIR}/snake-${theme}.svg (${(svg.length / 1024).toFixed(1)} KB)`);
  }
  const total = board.grid.flat().filter((v) => v !== null).length;
  const green = board.grid.flat().filter((v) => v > 0).length;
  console.log(
    `grid ${board.cols}×${board.rows} · ${green}/${total} contributed cells · ${FRAMES} moves · ${greenSteps} forced moves onto contributed cells · 0 rule violations`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
