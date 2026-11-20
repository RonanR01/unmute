/**
 * Vérifie que chaque dépendance npm de production installée a une licence
 * compatible avec un usage commercial, selon licenses-allowed.json (la même
 * liste que src-tauri/deny.toml pour les crates Rust).
 *
 *   bun scripts/check-licenses.ts
 *
 * Échoue en nommant chaque paquet refusé et sa licence. Les dépendances de
 * développement ne sont pas livrées et ne sont pas vérifiées.
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";

export interface LicenseException {
  package: string;
  ecosystem: "npm" | "cargo";
  license: string;
  reason: string;
}

export interface LicensePolicy {
  allowed: string[];
  exceptions: LicenseException[];
}

export interface PackageLicense {
  name: string;
  version: string;
  license: string | null;
}

// ---------------------------------------------------------------------------
// Expressions SPDX : OR, AND, WITH et parenthèses.

function tokenize(expression: string): string[] {
  return expression
    .replace(/\(/g, " ( ")
    .replace(/\)/g, " ) ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Vrai si l'expression SPDX est satisfaite par la liste autorisée. */
export function isAllowed(expression: string, allowed: Set<string>): boolean {
  const tokens = tokenize(expression);
  let position = 0;

  const peek = () => tokens[position];
  const next = () => tokens[position++];

  // Une erreur de syntaxe rend l'expression illisible, donc refusée.
  const fail = (): never => {
    throw new Error("expression SPDX illisible");
  };

  const parseAtom = (): boolean => {
    const token = next();
    if (token === undefined) fail();
    if (token === "(") {
      const value = parseOr();
      if (next() !== ")") fail();
      return value;
    }
    if (token === ")" || token === "AND" || token === "OR" || token === "WITH")
      fail();
    if (peek() === "WITH") {
      next();
      const exception = next();
      if (exception === undefined) fail();
      return allowed.has(`${token} WITH ${exception}`);
    }
    return allowed.has(token);
  };

  const parseAnd = (): boolean => {
    let value = parseAtom();
    while (peek() === "AND") {
      next();
      // Évaluer les deux côtés pour valider toute la syntaxe.
      const right = parseAtom();
      value = value && right;
    }
    return value;
  };

  const parseOr = (): boolean => {
    let value = parseAnd();
    while (peek() === "OR") {
      next();
      const right = parseAnd();
      value = value || right;
    }
    return value;
  };

  try {
    if (tokens.length === 0) return false;
    const value = parseOr();
    if (position !== tokens.length) return false;
    return value;
  } catch {
    return false;
  }
}

/** Les paquets dont la licence n'est pas autorisée. */
export function checkPackages(
  packages: PackageLicense[],
  policy: LicensePolicy,
): PackageLicense[] {
  const allowed = new Set(policy.allowed);
  const exceptions = new Map(
    policy.exceptions
      .filter((exception) => exception.ecosystem === "npm")
      .map((exception) => [exception.package, exception.license]),
  );
  return packages.filter((pkg) => {
    const license = pkg.license ?? exceptions.get(pkg.name) ?? "";
    return !isAllowed(license, allowed);
  });
}

// ---------------------------------------------------------------------------
// Parcours de node_modules, comme la résolution de Node.

interface Manifest {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: Array<{ type?: string } | string>;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function readManifest(dir: string): Manifest {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

function licenseOf(manifest: Manifest): string | null {
  if (typeof manifest.license === "string") return manifest.license;
  if (manifest.license?.type) return manifest.license.type;
  if (Array.isArray(manifest.licenses) && manifest.licenses.length > 0) {
    return manifest.licenses
      .map((entry) => (typeof entry === "string" ? entry : entry.type))
      .filter(Boolean)
      .join(" OR ");
  }
  return null;
}

/** Cherche `name` dans node_modules depuis `fromDir` en remontant jusqu'à `root`. */
function resolvePackage(
  name: string,
  fromDir: string,
  root: string,
): string | null {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (dir === root) return null;
    const parent = dirname(dir);
    // Sortir du node_modules courant : …/node_modules/a → …
    dir = parent.endsWith("node_modules") ? dirname(parent) : parent;
    if (dir.length < root.length) return null;
  }
}

/** Les dépendances de production installées, triées par nom puis version. */
export function collectProductionPackages(root: string): PackageLicense[] {
  const seen = new Map<string, PackageLicense>();
  const missing: string[] = [];
  const queue: Array<{ dir: string; manifest: Manifest }> = [
    { dir: root, manifest: readManifest(root) },
  ];

  while (queue.length > 0) {
    const { dir, manifest } = queue.shift()!;
    const required = Object.keys(manifest.dependencies ?? {});
    const optional = Object.keys(manifest.optionalDependencies ?? {});
    for (const name of [...required, ...optional]) {
      const location = resolvePackage(name, dir, root);
      if (!location) {
        // Une dépendance optionnelle peut manquer (autre plateforme).
        if (required.includes(name))
          missing.push(`${name} (requis par ${manifest.name ?? dir})`);
        continue;
      }
      if (seen.has(location)) continue;
      const dependency = readManifest(location);
      seen.set(location, {
        name: dependency.name ?? name,
        version: dependency.version ?? "?",
        license: licenseOf(dependency),
      });
      queue.push({ dir: location, manifest: dependency });
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Dépendances non installées (lancer bun install) :\n  ${missing.join("\n  ")}`,
    );
  }

  const unique = new Map<string, PackageLicense>();
  for (const pkg of seen.values())
    unique.set(`${pkg.name}@${pkg.version}`, pkg);
  return [...unique.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

export function loadPolicy(root: string): LicensePolicy {
  const raw = JSON.parse(
    readFileSync(join(root, "licenses-allowed.json"), "utf8"),
  );
  return { allowed: raw.allowed, exceptions: raw.exceptions ?? [] };
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  try {
    const packages = collectProductionPackages(root);
    const violations = checkPackages(packages, loadPolicy(root));
    if (violations.length > 0) {
      console.error(
        `Licences refusées (${violations.length}) — voir licenses-allowed.json :`,
      );
      for (const pkg of violations) {
        console.error(
          `  ${pkg.name}@${pkg.version} : ${pkg.license ?? "aucune licence déclarée"}`,
        );
      }
      process.exit(1);
    }
    console.log(
      `Licences autorisées pour les ${packages.length} dépendances npm de production.`,
    );
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
