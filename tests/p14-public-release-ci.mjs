import { readFileSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const required = [
  "LICENSE",
  "README.md",
  "AUDIT.md",
  "METHODOLOGY.md",
  "ENGINEERING_LIMITATIONS.md",
  "THIRD_PARTY_NOTICES.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "RELEASE_NOTES.md",
  "public/LICENSE.txt",
  "public/THIRD_PARTY_NOTICES.txt",
  "examples/field-v1/network.csv",
  "examples/field-v1/customers.csv",
  "examples/field-v1/measurements.template.csv",
  "examples/field-v1/ami.template.csv",
  "examples/field-v1/generate-example.mjs",
  ".github/workflows/public-beta-release.yml",
];

for (const path of required) {
  if (!existsSync(path)) throw new Error(`P14 required public-release file missing: ${path}`);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (pkg.version !== "0.4.0-beta.1") throw new Error(`Unexpected public beta version: ${pkg.version}`);
if (pkg.license !== "MIT") throw new Error(`Expected MIT package license, got ${pkg.license}`);
if (!String(pkg.description || "").includes("three-phase")) throw new Error("package.json description does not identify the engineering product scope.");
if (pkg.scripts?.["release:check"] !== "node tests/p14-public-release-ci.mjs") throw new Error("release:check script is not wired to P14 contract.");

const license = readFileSync("LICENSE", "utf8");
if (!license.startsWith("MIT License")) throw new Error("Root LICENSE is not MIT.");
if (!license.includes("Copyright (c) 2026 Ari Sulistiono")) throw new Error("Root LICENSE copyright holder/year missing.");
if (readFileSync("public/LICENSE.txt", "utf8") !== license) throw new Error("Static build LICENSE.txt diverges from root LICENSE.");

const readme = readFileSync("README.md", "utf8");
for (const phrase of [
  "Public Engineering Beta",
  "v0.4.0-beta.1",
  "PSS®SINCAL",
  "not proof of electricity theft",
  "Field Dataset v1",
  "P13",
  "MIT",
]) {
  if (!readme.includes(phrase)) throw new Error(`README public contract missing: ${phrase}`);
}
if (readme.includes("Choose and add the project license before public release")) throw new Error("README still contains pre-release license blocker text.");

const methodology = readFileSync("METHODOLOGY.md", "utf8");
for (const phrase of [
  "64 of 96 intervals",
  "32 of 96 intervals",
  "Real Field Mode path",
  "does **not** run the synthetic auto-calibration routine over user data",
  "measured source energy",
  "unexplained energy",
  "runpp_3ph()",
]) {
  if (!methodology.includes(phrase)) throw new Error(`Methodology contract missing: ${phrase}`);
}

const limits = readFileSync("ENGINEERING_LIMITATIONS.md", "utf8");
for (const phrase of [
  "Public Engineering Beta",
  "production Distribution Management System",
  "universally more accurate than PSS®SINCAL",
  "guaranteed detector of electricity theft",
  "single-source",
]) {
  if (!limits.includes(phrase)) throw new Error(`Engineering limitation missing: ${phrase}`);
}

const notices = readFileSync("THIRD_PARTY_NOTICES.md", "utf8");
for (const phrase of ["Pyodide", "0.28.3", "pandapower", "3.1.2", "BSD 3-Clause", "Mozilla Public License 2.0", "Lucide", "ISC"]) {
  if (!notices.includes(phrase)) throw new Error(`Third-party notice missing: ${phrase}`);
}
const staticNotices = readFileSync("public/THIRD_PARTY_NOTICES.txt", "utf8");
if (!staticNotices.includes("pandapower 3.1.2") || !staticNotices.includes("Pyodide 0.28.3")) {
  throw new Error("Static attribution index does not expose pinned browser runtime notices.");
}

const audit = readFileSync("AUDIT.md", "utf8");
if (!audit.includes("Public Engineering Beta")) throw new Error("AUDIT.md maturity verdict is stale.");
if (audit.includes("Choose the repository license")) throw new Error("AUDIT.md still lists license selection as remaining work.");

const releaseNotes = readFileSync("RELEASE_NOTES.md", "utf8");
if (!releaseNotes.startsWith("# Smart Distribution Loss v0.4.0-beta.1")) throw new Error("Release notes version mismatch.");
if (!releaseNotes.includes("P13")) throw new Error("Release notes do not describe current engineering milestone.");

const html = readFileSync("index.html", "utf8");
if (!html.includes("Public Engineering Beta")) throw new Error("Public HTML metadata does not identify beta maturity.");
if (!html.includes("unexplained-energy")) throw new Error("Public HTML metadata omits P13 scope.");

const workflow = readFileSync(".github/workflows/public-beta-release.yml", "utf8");
if (!workflow.includes('EXPECTED_VERSION: "0.4.0-beta.1"')) throw new Error("Release workflow is not guarded to the approved beta version.");
if (!workflow.includes("--prerelease")) throw new Error("Release workflow must create a GitHub prerelease, not a stable release.");

const generator = spawnSync(process.execPath, ["examples/field-v1/generate-example.mjs"], { encoding: "utf8" });
if (generator.status !== 0) throw new Error(`Example generator failed:\n${generator.stdout}\n${generator.stderr}`);
try {
  const ami = readFileSync("examples/field-v1/ami.csv", "utf8").trim().split(/\r?\n/);
  const measurements = readFileSync("examples/field-v1/measurements.csv", "utf8").trim().split(/\r?\n/);
  if (ami.length !== 289) throw new Error(`Expected 288 AMI points + header, got ${ami.length - 1}`);
  if (measurements.length !== 97) throw new Error(`Expected 96 source measurements + header, got ${measurements.length - 1}`);
  if (!ami.every((line, index) => index === 0 || line.endsWith(",GOOD"))) throw new Error("Generated AMI example contains non-GOOD quality rows.");
  if (!measurements.every((line, index) => index === 0 || line.endsWith(",GOOD"))) throw new Error("Generated source measurement example contains non-GOOD quality rows.");
} finally {
  rmSync("examples/field-v1/ami.csv", { force: true });
  rmSync("examples/field-v1/measurements.csv", { force: true });
}

console.log("P14 public-release gate PASS: license, attribution, methodology, claim boundary, public metadata, deterministic Field Dataset v1 example, and prerelease automation are all present and version-locked.");
