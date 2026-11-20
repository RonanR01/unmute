/**
 * Prépare le brouillon des notes de version en français, à partir des messages
 * de commit depuis l'étiquette précédente. Le mainteneur le relit et le
 * réécrit avant de publier (spécification 002, FR-009).
 *
 *   bun scripts/release-notes.ts --channel beta [--since v0.1.0-beta.1]
 *
 * `feat` va dans « Nouveautés », `fix` dans « Corrections », le reste dans
 * « Autres changements » ; `chore`, `docs` et les fusions sont ignorés.
 */
import { execFileSync } from "child_process";
import { join } from "path";
import { currentVersion } from "./set-version";

export type Channel = "prerelease-unsigned" | "beta" | "stable";

export const UNSIGNED_WARNING = `> [!WARNING]
> **Préversion non signée**, réservée à des testeurs de confiance. Tysta n'est pas encore signé par son éditeur, donc le système affiche une alerte à l'installation.
>
> - **macOS** : au premier lancement, faire un clic droit sur Tysta dans le dossier Applications, puis choisir **Ouvrir** et confirmer. Si macOS refuse, ouvrir Réglages Système → Confidentialité et sécurité, puis cliquer sur **Ouvrir quand même**.
> - **Windows** : dans la fenêtre « Windows a protégé votre ordinateur », cliquer sur **Informations complémentaires**, puis sur **Exécuter quand même**.
> - **Linux** : aucune alerte ; vérifier le fichier avec \`SHA256SUMS.txt\`.`;

const SECTIONS = [
  { type: "feat", title: "Nouveautés" },
  { type: "fix", title: "Corrections" },
  { type: "other", title: "Autres changements" },
] as const;

const IGNORED = new Set(["chore", "docs", "ci", "style"]);
const CONVENTIONAL = /^(\w+)(?:\([^)]*\))?(!)?:\s*(.+)$/;

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function classify(subject: string): { section: string; text: string } | null {
  if (/^Merge (branch|pull request|remote-tracking)/.test(subject)) return null;
  const match = CONVENTIONAL.exec(subject);
  if (!match) return { section: "other", text: capitalize(subject.trim()) };
  const type = match[1].toLowerCase();
  if (IGNORED.has(type)) return null;
  const section = type === "feat" || type === "fix" ? type : "other";
  return { section, text: capitalize(match[3].trim()) };
}

export function renderNotes(input: {
  version: string;
  channel: Channel;
  previousTag: string | null;
  commits: string[];
}): string {
  const parts: string[] = [];
  if (input.channel === "prerelease-unsigned") parts.push(UNSIGNED_WARNING);

  const grouped = new Map<string, string[]>();
  for (const subject of input.commits) {
    const entry = classify(subject);
    if (!entry) continue;
    const list = grouped.get(entry.section) ?? [];
    list.push(entry.text);
    grouped.set(entry.section, list);
  }

  if (input.previousTag) {
    parts.push(
      `Changements de Tysta ${input.version} depuis ${input.previousTag}.`,
    );
  } else {
    parts.push(`Première version de Tysta (${input.version}).`);
  }

  // La première version n'a pas d'historique propre à lister : tout le passé
  // du dépôt appartient à Handy.
  if (input.previousTag) {
    for (const { type, title } of SECTIONS) {
      const items = grouped.get(type);
      if (!items || items.length === 0) continue;
      parts.push(
        `## ${title}\n\n${items.map((item) => `- ${item}`).join("\n")}`,
      );
    }
  }

  parts.push(
    "Les empreintes des fichiers sont dans `SHA256SUMS.txt` ; la liste des composants dans `sbom-rust.cdx.json` et `sbom-interface.cdx.json`.",
  );
  return parts.join("\n\n") + "\n";
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function previousTagOf(cwd: string): string | null {
  try {
    return git(
      ["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", "HEAD"],
      cwd,
    );
  } catch {
    return null;
  }
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const channel = option("--channel") as Channel | undefined;
  if (
    !channel ||
    !["prerelease-unsigned", "beta", "stable"].includes(channel)
  ) {
    console.error(
      "Usage : bun scripts/release-notes.ts --channel prerelease-unsigned|beta|stable [--since <étiquette>]",
    );
    process.exit(2);
  }

  const previousTag = option("--since") ?? previousTagOf(root);
  const range = previousTag ? [`${previousTag}..HEAD`] : ["HEAD"];
  const log = git(["log", "--no-merges", "--format=%s", ...range], root);
  const commits = log ? log.split("\n") : [];

  process.stdout.write(
    renderNotes({
      version: currentVersion(root),
      channel,
      previousTag,
      commits,
    }),
  );
}
