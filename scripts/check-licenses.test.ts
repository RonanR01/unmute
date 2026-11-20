import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  checkPackages,
  collectProductionPackages,
  isAllowed,
  type LicensePolicy,
} from "./check-licenses";

const policy: LicensePolicy = {
  allowed: ["MIT", "Apache-2.0", "Apache-2.0 WITH LLVM-exception", "OFL-1.1"],
  exceptions: [
    {
      package: "sans-licence",
      ecosystem: "npm",
      license: "MIT",
      reason: "constatée dans le dépôt",
    },
    {
      package: "tauri-nspanel",
      ecosystem: "cargo",
      license: "MIT",
      reason: "concerne cargo, pas npm",
    },
  ],
};
const allowed = new Set(policy.allowed);

describe("isAllowed", () => {
  test("une expression OR passe si une branche est autorisée", () => {
    expect(isAllowed("GPL-3.0-only OR MIT", allowed)).toBe(true);
  });

  test("une expression AND échoue si une branche est refusée", () => {
    expect(isAllowed("MIT AND GPL-3.0-only", allowed)).toBe(false);
    expect(isAllowed("MIT AND Apache-2.0", allowed)).toBe(true);
  });

  test("les parenthèses et WITH sont compris", () => {
    expect(isAllowed("(MIT OR GPL-2.0) AND OFL-1.1", allowed)).toBe(true);
    expect(isAllowed("Apache-2.0 WITH LLVM-exception", allowed)).toBe(true);
    expect(isAllowed("GPL-2.0 WITH Classpath-exception-2.0", allowed)).toBe(
      false,
    );
  });

  test("une licence vide ou illisible est refusée", () => {
    expect(isAllowed("", allowed)).toBe(false);
    expect(isAllowed("SEE LICENSE IN LICENSE.txt", allowed)).toBe(false);
  });
});

describe("checkPackages", () => {
  test("nomme le paquet et sa licence quand elle est refusée", () => {
    const violations = checkPackages(
      [
        { name: "ok", version: "1.0.0", license: "MIT" },
        { name: "copyleft", version: "2.0.0", license: "GPL-3.0-only" },
      ],
      policy,
    );
    expect(violations).toEqual([
      { name: "copyleft", version: "2.0.0", license: "GPL-3.0-only" },
    ]);
  });

  test("un paquet sans licence est refusé, sauf exception npm", () => {
    const violations = checkPackages(
      [
        { name: "inconnu", version: "1.0.0", license: null },
        { name: "sans-licence", version: "1.0.0", license: null },
        { name: "tauri-nspanel", version: "1.0.0", license: null },
      ],
      policy,
    );
    expect(violations.map((v) => v.name)).toEqual(["inconnu", "tauri-nspanel"]);
  });
});

describe("collectProductionPackages", () => {
  let root: string;

  const writePackage = (dir: string, manifest: Record<string, unknown>) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify(manifest));
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "check-licenses-"));
    writePackage(root, {
      name: "app",
      dependencies: { a: "^1" },
      optionalDependencies: { absent: "^1" },
      devDependencies: { outil: "^1" },
    });
    writePackage(join(root, "node_modules/a"), {
      name: "a",
      version: "1.0.0",
      license: "MIT",
      dependencies: { b: "^1" },
    });
    // b est imbriqué sous a : la résolution remonte comme celle de Node.
    writePackage(join(root, "node_modules/a/node_modules/b"), {
      name: "b",
      version: "1.2.0",
      licenses: [{ type: "MIT" }, { type: "Apache-2.0" }],
    });
    writePackage(join(root, "node_modules/outil"), {
      name: "outil",
      version: "1.0.0",
      license: "GPL-3.0-only",
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("suit les dépendances de production et ignore celles de développement", () => {
    const packages = collectProductionPackages(root);
    expect(packages).toEqual([
      { name: "a", version: "1.0.0", license: "MIT" },
      { name: "b", version: "1.2.0", license: "MIT OR Apache-2.0" },
    ]);
  });
});
