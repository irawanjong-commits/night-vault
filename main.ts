// Night Vault - make.fun program/v1 entrypoint (authored for this entry).
// Validates the shipped game + screenshots, copies them deterministically to the
// output directory, writes a sha256 manifest, then builds dossier.json with the
// vendored make.fun library. Node 22 standard library only.
import { createHash } from "node:crypto";
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync,
  statSync, writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const ONE_MIB = 1024 * 1024;
const SHOT_CAP = 262144; // 256 KiB per screenshot

function fail(message: string): never {
  throw new Error("[night-vault] preflight failed: " + message);
}

// Recursively list regular files under dir, as sorted POSIX-style relative paths.
function listFiles(dir: string, base: string): string[] {
  const found: string[] = [];
  const walk = (cur: string): void => {
    const entries = readdirSync(cur, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const full = join(cur, e.name);
      if (e.isSymbolicLink()) fail("symbolic link is not shippable: " + full);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) found.push(relative(base, full).split(sep).join("/"));
    }
  };
  walk(dir);
  return found.sort();
}

function sha256Of(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

// ---- Preflight: game/ -------------------------------------------------------
const gameDir = join(here, "game");
if (!existsSync(gameDir) || !statSync(gameDir).isDirectory()) fail("game/ directory is missing");
const indexHtml = join(gameDir, "index.html");
if (!existsSync(indexHtml)) fail("game/index.html is missing");
const indexBytes = statSync(indexHtml).size;
if (indexBytes === 0) fail("game/index.html is empty");
if (indexBytes > ONE_MIB) fail("game/index.html exceeds 1 MiB (" + indexBytes + " bytes)");
const gameFiles = listFiles(gameDir, gameDir);
if (gameFiles.length < 2) fail("game/ should contain index.html plus source modules");
if (gameFiles.length > 993) fail("game/ has too many files: " + gameFiles.length);
let gameBytes = 0;
for (const rel of gameFiles) {
  const size = statSync(join(gameDir, rel)).size;
  if (size === 0) fail("empty file in game/: " + rel);
  gameBytes += size;
}
if (gameBytes > 50331648) fail("game/ exceeds 48 MiB in total");
const htmlText = readFileSync(indexHtml, "utf8");
if (!htmlText.includes("<canvas")) fail("game/index.html has no <canvas> element");
if (!htmlText.includes("src/main.js")) fail("game/index.html does not load src/main.js");

// ---- Preflight: screenshots/ -------------------------------------------------
const shotsDir = join(here, "screenshots");
if (!existsSync(shotsDir) || !statSync(shotsDir).isDirectory()) fail("screenshots/ directory is missing");
const shotFiles = listFiles(shotsDir, shotsDir)
  .filter((n) => /\.(jpe?g|png)$/i.test(n));
if (shotFiles.length < 3 || shotFiles.length > 4) {
  fail("expected 3-4 screenshots, found " + shotFiles.length);
}
for (const rel of shotFiles) {
  const p = join(shotsDir, rel);
  const size = statSync(p).size;
  if (size > SHOT_CAP) fail("screenshot over 256 KiB: " + rel + " (" + size + " bytes)");
  const head = readFileSync(p).subarray(0, 3);
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e;
  if (!isJpeg && !isPng) fail("screenshot is neither JPEG nor PNG: " + rel);
}

// ---- Deterministic copy -------------------------------------------------------
mkdirSync(outDir, { recursive: true });
for (const name of ["game", "screenshots"]) {
  const target = join(outDir, name);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
}
const shipped: { path: string; bytes: number; sha256: string }[] = [];
function copySorted(srcDir: string, relBase: string): void {
  for (const rel of listFiles(srcDir, srcDir)) {
    const dest = join(outDir, relBase, rel);
    mkdirSync(join(dest, ".."), { recursive: true });
    cpSync(join(srcDir, rel), dest);
    shipped.push({
      path: relBase + "/" + rel,
      bytes: statSync(dest).size,
      sha256: sha256Of(dest),
    });
  }
}
copySorted(gameDir, "game");
copySorted(shotsDir, "screenshots");
shipped.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

// ---- Manifest + dossier -------------------------------------------------------
const manifest = {
  game: "Night Vault",
  generated_by: "night-vault main.ts",
  file_count: shipped.length,
  total_bytes: shipped.reduce((sum, f) => sum + f.bytes, 0),
  files: shipped,
};
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(
  join(outDir, "dossier.json"),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
console.log("[night-vault] shipped " + shipped.length + " files (" + manifest.total_bytes + " bytes) to " + outDir);
