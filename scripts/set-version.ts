/**
 * Met le numéro de version de Tysta aux quatre endroits qui le portent :
 * package.json, src-tauri/Cargo.toml, src-tauri/Cargo.lock et
 * src-tauri/tauri.conf.json. Refuse un numéro qui n'est pas du SemVer ou qui
 * ne dépasse pas le numéro actuel.
 *
 *   bun scripts/set-version.ts 0.1.0-beta.2
 *   bun scripts/set-version.ts --check     # affiche le numéro, échoue s'ils divergent
 *
 * `--restart` permet, une seule fois, de repartir à 0.1.0 depuis la
 * numérotation héritée de Handy (0.10.x).
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/;

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

export function parseVersion(version: string): ParsedVersion | null {
  const match = SEMVER.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

/** Ordre SemVer : négatif si a < b, 0 si égaux, positif si a > b. */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) throw new Error(`Numéro SemVer invalide : ${!va ? a : b}`);
  for (const key of ["major", "minor", "patch"] as const) {
    if (va[key] !== vb[key]) return va[key] - vb[key];
  }
  if (va.prerelease.length === 0 || vb.prerelease.length === 0) {
    return vb.prerelease.length - va.prerelease.length;
  }
  const length = Math.max(va.prerelease.length, vb.prerelease.length);
  for (let i = 0; i < length; i++) {
    const pa = va.prerelease[i];
    const pb = vb.prerelease[i];
    if (pa === undefined) return -1;
    if (pb === undefined) return 1;
    if (pa === pb) continue;
    const na = /^\d+$/.test(pa);
    const nb = /^\d+$/.test(pb);
    if (na && nb) return Number(pa) - Number(pb);
    if (na) return -1;
    if (nb) return 1;
    return pa < pb ? -1 : 1;
  }
  return 0;
}

const FILES = {
  packageJson: "package.json",
  cargoToml: "src-tauri/Cargo.toml",
  cargoLock: "src-tauri/Cargo.lock",
  tauriConf: "src-tauri/tauri.conf.json",
};

// Le premier `version = "…"` de la section [package] de Cargo.toml.
const CARGO_TOML_VERSION = /(\[package\][^[]*?\nversion = ")([^"]+)(")/;
// L'entrée du crate `handy` dans Cargo.lock (le moteur garde le nom de Handy).
const CARGO_LOCK_VERSION = /(\nname = "handy"\nversion = ")([^"]+)(")/;
// La clé `version` de premier niveau d'un fichier JSON mis en forme.
const JSON_VERSION = /(\n {2}"version": ")([^"]+)(")/;

function extract(content: string, pattern: RegExp, file: string): string {
  const match = pattern.exec(content);
  if (!match) throw new Error(`Numéro de version introuvable dans ${file}`);
  return match[2];
}

/** Les numéros portés par chaque fichier, sans rien modifier. */
export function readVersions(root: string): Record<string, string> {
  const read = (file: string) => readFileSync(join(root, file), "utf8");
  return {
    [FILES.packageJson]: extract(
      read(FILES.packageJson),
      JSON_VERSION,
      FILES.packageJson,
    ),
    [FILES.cargoToml]: extract(
      read(FILES.cargoToml),
      CARGO_TOML_VERSION,
      FILES.cargoToml,
    ),
    [FILES.cargoLock]: extract(
      read(FILES.cargoLock),
      CARGO_LOCK_VERSION,
      FILES.cargoLock,
    ),
    [FILES.tauriConf]: extract(
      read(FILES.tauriConf),
      JSON_VERSION,
      FILES.tauriConf,
    ),
  };
}

/** Le numéro commun aux quatre fichiers ; échoue s'ils divergent. */
export function currentVersion(root: string): string {
  const versions = readVersions(root);
  const distinct = new Set(Object.values(versions));
  if (distinct.size !== 1) {
    const detail = Object.entries(versions)
      .map(([file, version]) => `  ${file} : ${version}`)
      .join("\n");
    throw new Error(`Versions divergentes :\n${detail}`);
  }
  return [...distinct][0];
}

export function setVersion(
  root: string,
  next: string,
  options: { allowRestart?: boolean } = {},
): void {
  if (!parseVersion(next)) {
    throw new Error(
      `« ${next} » n'est pas un numéro SemVer (ex. 0.1.0-beta.1).`,
    );
  }
  const current = currentVersion(root);
  if (!options.allowRestart && compareVersions(next, current) <= 0) {
    throw new Error(
      `Le nouveau numéro doit être supérieur au numéro actuel (${current}).`,
    );
  }

  const replace = (file: string, pattern: RegExp) => {
    const path = join(root, file);
    const content = readFileSync(path, "utf8");
    writeFileSync(path, content.replace(pattern, `$1${next}$3`));
  };
  replace(FILES.packageJson, JSON_VERSION);
  replace(FILES.cargoToml, CARGO_TOML_VERSION);
  replace(FILES.cargoLock, CARGO_LOCK_VERSION);
  replace(FILES.tauriConf, JSON_VERSION);
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const args = process.argv.slice(2);
  try {
    if (args[0] === "--check") {
      console.log(currentVersion(root));
    } else {
      const next = args.find((arg) => !arg.startsWith("--"));
      if (!next) {
        console.error(
          "Usage : bun scripts/set-version.ts <numéro> | --check [--restart]",
        );
        process.exit(2);
      }
      const before = currentVersion(root);
      setVersion(root, next, { allowRestart: args.includes("--restart") });
      console.log(`Version : ${before} → ${next}`);
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
