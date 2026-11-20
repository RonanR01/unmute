import { describe, expect, test } from "bun:test";
import { renderNotes, UNSIGNED_WARNING } from "./release-notes";

const commits = [
  "feat: draw the recording waveform from the voice itself",
  "fix(paste): keep the clipboard when pasting fails",
  "refactor: split the insights manager",
  "chore: bump dependencies",
  "docs: explain the release process",
  "feat!: rename to Tysta",
  "Merge branch 'main' into feature",
  "a commit without a prefix",
];

describe("renderNotes", () => {
  test("regroupe par type et ignore chore et docs", () => {
    const notes = renderNotes({
      version: "0.1.0-beta.2",
      channel: "beta",
      previousTag: "v0.1.0-beta.1",
      commits,
    });
    expect(notes).toContain("## Nouveautés");
    expect(notes).toContain(
      "- Draw the recording waveform from the voice itself",
    );
    expect(notes).toContain("- Rename to Tysta");
    expect(notes).toContain("## Corrections");
    expect(notes).toContain("- Keep the clipboard when pasting fails");
    expect(notes).toContain("## Autres changements");
    expect(notes).toContain("- Split the insights manager");
    expect(notes).toContain("- A commit without a prefix");
    expect(notes).not.toContain("bump dependencies");
    expect(notes).not.toContain("release process");
    expect(notes).not.toContain("Merge branch");
    expect(notes).toContain("depuis v0.1.0-beta.1");
  });

  test("les sections suivent l'ordre Nouveautés, Corrections, Autres", () => {
    const notes = renderNotes({
      version: "0.2.0",
      channel: "stable",
      previousTag: "v0.1.0",
      commits,
    });
    const order = [
      "## Nouveautés",
      "## Corrections",
      "## Autres changements",
    ].map((heading) => notes.indexOf(heading));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  test("une préversion non signée commence par l'avertissement", () => {
    const notes = renderNotes({
      version: "0.1.0-beta.1",
      channel: "prerelease-unsigned",
      previousTag: null,
      commits,
    });
    expect(notes.startsWith(UNSIGNED_WARNING)).toBe(true);
    expect(notes).toContain("Ouvrir");
    expect(notes).toContain("Exécuter quand même");
  });

  test("une bêta ou une stable n'a pas l'avertissement", () => {
    const notes = renderNotes({
      version: "0.1.0",
      channel: "stable",
      previousTag: "v0.1.0-beta.3",
      commits,
    });
    expect(notes).not.toContain(UNSIGNED_WARNING);
  });

  test("la première version, sans étiquette précédente, le dit", () => {
    const notes = renderNotes({
      version: "0.1.0-beta.1",
      channel: "beta",
      previousTag: null,
      commits: [],
    });
    expect(notes).toContain("Première version de Tysta");
    expect(notes).not.toContain("## Nouveautés");
  });
});
