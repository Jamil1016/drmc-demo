// Reports source files that no Next.js entry point (page, layout, route,
// error/loading boundary, proxy) reaches through imports, and imports that do
// not resolve. Tests count as reachable only through the module they test.
//
//   node scripts/check-unused.mjs        (exit 1 when something is unused)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const norm = (p) => p.split(path.sep).join("/");
const rel = (p) => norm(path.relative(ROOT, p));
const EXTS = ["", ".ts", ".tsx", ".js", ".mjs", ".css", "/index.ts", "/index.tsx"];
const ENTRY_RE = /^(page|layout|route|error|global-error|loading|not-found|icon)\.(tsx|ts|svg)$/;

function listFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.join(path.dirname(from), spec);
  else return null; // a package
  for (const ext of EXTS) {
    const p = base + ext;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return undefined;
}

const seen = new Set();
const unresolved = [];
function walk(file) {
  if (seen.has(file)) return;
  seen.add(file);
  if (!/\.(tsx?|mjs|js)$/.test(file)) return;
  const src = fs.readFileSync(file, "utf8");
  const re = /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1] ?? m[2];
    const target = resolveImport(file, spec);
    if (target === undefined) unresolved.push(`${rel(file)} -> ${spec}`);
    else if (target) walk(target);
  }
}

const all = ["app", "components", "lib"].flatMap((d) => listFiles(path.join(ROOT, d)));
const entries = all.filter((f) => rel(f).startsWith("app/") && ENTRY_RE.test(path.basename(f)));
if (fs.existsSync(path.join(ROOT, "proxy.ts"))) entries.push(path.join(ROOT, "proxy.ts"));
entries.forEach(walk);

const isTest = (f) => /\.test\.ts$/.test(f);
const unused = all.filter((f) => !seen.has(f) && !isTest(f)).map(rel);
const orphanTests = all
  .filter(isTest)
  .filter((t) => ![".ts", ".tsx"].some((e) => seen.has(t.replace(/\.test\.ts$/, e))))
  .map(rel);

console.log(`entry points: ${entries.length}, reachable files: ${seen.size}, total: ${all.length}`);
if (unresolved.length) console.log("UNRESOLVED IMPORTS:\n  " + unresolved.join("\n  "));
if (unused.length) console.log("UNUSED FILES:\n  " + unused.join("\n  "));
if (orphanTests.length) console.log("TESTS WITHOUT A REACHABLE SUBJECT:\n  " + orphanTests.join("\n  "));
if (!unresolved.length && !unused.length && !orphanTests.length) console.log("ok: no unused files, no unresolved imports");
process.exitCode = unresolved.length || unused.length || orphanTests.length ? 1 : 0;
