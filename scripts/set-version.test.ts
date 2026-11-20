import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { compareVersions, parseVersion, setVersion } from "./set-version";

const PACKAGE_JSON = `{
  "name": "handy-app",
  "private": true,
  "version": "0.10.1",
  "type": "module"
}
`;

const CARGO_TOML = `[package]
name = "handy"
version = "0.10.1"
edition = "2021"

[dependencies]
serde = { version = "1.0.0" }
`;

const CARGO_LOCK = `[[package]]
name = "serde"
version = "1.0.0"

[[package]]
name = "handy"
version = "0.10.1"
dependencies = [
 "serde",
]
`;

const TAURI_CONF = `{
  "productName": "Tysta",
  "version": "0.10.1",
  "identifier": "com.example"
}
`;

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "set-version-"));
  mkdirSync(join(root, "src-tauri"));
  writeFileSync(join(root, "package.json"), PACKAGE_JSON);
  writeFileSync(join(root, "src-tauri/Cargo.toml"), CARGO_TOML);
  writeFileSync(join(root, "src-tauri/Cargo.lock"), CARGO_LOCK);
  writeFileSync(join(root, "src-tauri/tauri.conf.json"), TAURI_CONF);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("parseVersion", () => {
  test("accepte un numéro SemVer avec ou sans suffixe", () => {
    expect(parseVersion("0.1.0")).not.toBeNull();
    expect(parseVersion("0.1.0-beta.1")).not.toBeNull();
  });

  test("refuse ce qui n'est pas du SemVer", () => {
    expect(parseVersion("0.1")).toBeNull();
    expect(parseVersion("v0.1.0")).toBeNull();
    expect(parseVersion("0.1.0-")).toBeNull();
    expect(parseVersion("01.1.0")).toBeNull();
  });
});

describe("compareVersions", () => {
  test("une préversion précède la version finale", () => {
    expect(compareVersions("0.1.0-beta.1", "0.1.0")).toBeLessThan(0);
  });

  test("les suffixes numériques se comparent comme des nombres", () => {
    expect(compareVersions("0.1.0-beta.2", "0.1.0-beta.10")).toBeLessThan(0);
  });

  test("ordre majeur, mineur, correctif", () => {
    expect(compareVersions("0.10.1", "0.2.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });
});

describe("setVersion", () => {
  test("met à jour les quatre fichiers", () => {
    // Tysta repart à 0.1.0 : le seul retour en arrière permis, depuis la numérotation de Handy.
    setVersion(root, "0.1.0-beta.1", { allowRestart: true });
    expect(JSON.parse(read("package.json")).version).toBe("0.1.0-beta.1");
    expect(JSON.parse(read("src-tauri/tauri.conf.json")).version).toBe(
      "0.1.0-beta.1",
    );
    expect(read("src-tauri/Cargo.toml")).toContain('version = "0.1.0-beta.1"');
    expect(read("src-tauri/Cargo.lock")).toContain(
      'name = "handy"\nversion = "0.1.0-beta.1"',
    );
  });

  test("ne touche ni aux dépendances ni à la mise en forme", () => {
    setVersion(root, "0.11.0");
    expect(read("src-tauri/Cargo.toml")).toBe(
      CARGO_TOML.replace('version = "0.10.1"', 'version = "0.11.0"'),
    );
    expect(read("src-tauri/Cargo.lock")).toContain(
      'name = "serde"\nversion = "1.0.0"',
    );
    expect(read("package.json")).toBe(
      PACKAGE_JSON.replace('"0.10.1"', '"0.11.0"'),
    );
  });

  test("refuse un numéro inférieur ou égal", () => {
    expect(() => setVersion(root, "0.10.1")).toThrow(/supérieur/);
    expect(() => setVersion(root, "0.9.0")).toThrow(/supérieur/);
    expect(read("package.json")).toBe(PACKAGE_JSON);
  });

  test("refuse un numéro qui n'est pas du SemVer", () => {
    expect(() => setVersion(root, "0.11")).toThrow(/SemVer/);
  });

  test("refuse des fichiers dont les numéros divergent", () => {
    writeFileSync(
      join(root, "package.json"),
      PACKAGE_JSON.replace("0.10.1", "0.10.2"),
    );
    expect(() => setVersion(root, "0.11.0")).toThrow(/divergentes/);
  });
});
