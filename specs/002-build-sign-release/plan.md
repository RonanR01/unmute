# Implementation Plan: Build, signature et publication

**Branch**: `002-build-sign-release` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-build-sign-release/spec.md`

## Summary

Adapter les chaînes de construction héritées de Handy pour qu'une seule action du mainteneur produise un brouillon de version Tysta pour quatre variantes : Mac Apple Silicon, Mac Intel, Windows x64 et Linux x64. Le brouillon contient les installeurs, les notes de version en français, deux listes des composants CycloneDX et un fichier d'empreintes.

Trois canaux :

- **Préversion non signée** : utilisable dès maintenant.
- **Bêta** : signature et notarisation obligatoires.
- **Stable** : signature et notarisation obligatoires.

Pour la bêta et la stable, la publication échoue avant toute construction si un secret manque. Un contrôle des licences bloque la publication et les demandes de fusion. La numérotation repart à `0.1.0-beta.1`. La signature Windows passe par un fichier de configuration et un script dédiés, prêts pour un certificat SSL.com eSigner (voir [research.md](research.md)).

## Technical Context

**Language/Version**: YAML GitHub Actions, scripts TypeScript exécutés par Bun (même forme que `scripts/*.ts`), PowerShell pour la signature Windows, Rust stable (inchangé).

**Primary Dependencies**:

- Déjà en place : `tauri-apps/tauri-action@v0`, `actions/github-script`.
- Nouveaux, en CI seulement : `cargo-deny`, `cargo-cyclonedx`, `@cyclonedx/cyclonedx-npm` (repli : `anchore/sbom-action`) et le `CodeSignTool` de SSL.com.
- L'application elle-même ne gagne aucune dépendance.

**Storage**: pages des versions GitHub (installeurs, SBOM, `SHA256SUMS.txt`, notes).

**Testing**:

- `bun test` pour les trois scripts (`set-version`, `check-licenses`, `release-notes`), tests écrits d'abord.
- `actionlint` sur les workflows.
- Tests de fumée des paquets existants dans `build.yml`, corrigés pour le binaire `tysta`.
- Une préversion réelle de bout en bout (voir [quickstart.md](quickstart.md)).

**Target Platform**: GitHub Actions (`macos-26`, `macos-latest`, `windows-latest`, `ubuntu-22.04`, `ubuntu-24.04`), qui produit pour macOS 11 et plus, Windows 10 et 11 x64, et Linux x64.

**Project Type**: application de bureau (Tauri 2). Cette feature ne touche que la chaîne de publication.

**Performance Goals**: un brouillon complet en moins d'une heure (SC-001). Les constructions tournent en parallèle et la notarisation est la plus lente.

**Constraints**:

- Aucun cache de construction pour une version (FR-014).
- Aucun secret hors de `release.yml` (FR-015).
- Aucun nom Handy dans les fichiers publiés (FR-003).

**Scale/Scope**: neuf workflows existants, dont cinq modifiés ; trois scripts et deux fichiers de configuration nouveaux ; un document pour le mainteneur.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principe                   | Verdict | Justification                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Local d'abord           | ✅      | Rien ne change dans l'application. Aucun nouvel appel réseau ; le registre des flux (x-flux) n'est pas touché.                                                                                                                                                                                                            |
| II. Le français d'abord    | ✅      | Les notes de version sont en français. Rien ne touche la transcription.                                                                                                                                                                                                                                                   |
| III. Dictée instantanée    | ✅      | Sans objet : aucun code de l'application n'est modifié.                                                                                                                                                                                                                                                                   |
| IV. Fidélité               | ✅      | Sans objet.                                                                                                                                                                                                                                                                                                               |
| V. Prêt pour la DSI        | ✅      | C'est l'objet de la feature : signature, notarisation, CI reproductible, notes, SBOM et licences. Seule la gestion par MDM ou GPO reste hors périmètre, comme le prévoit la constitution (« DEVRAIT »).                                                                                                                   |
| VI. Respect de l'amont     | ✅      | L'attribution de Handy est conservée. Les noms internes du moteur (`/usr/lib/Handy`, crate `handy`, cache Nix `handy-computer`) restent. Seuls changent les noms de fichiers publiés et le binaire testé, déjà renommé `tysta`. Les workflows restent proches de ceux de Handy, pour que leurs corrections se reprennent. |
| VII. Tester avant d'écrire | ✅      | Les trois scripts sont développés tests d'abord. Les tests de fumée existants (Linux, Windows) sont corrigés pour le binaire `tysta`, et un test de fumée macOS est ajouté (T006b) : l'application construite est lancée sur les trois systèmes à chaque construction.                                                    |
| VIII. Accessible           | ✅      | Sans objet.                                                                                                                                                                                                                                                                                                               |
| IX. Sobre                  | ✅      | Les installeurs n'embarquent pas les modèles de transcription. Seul le modèle de détection de voix, de quelques Mo, est inclus, comme aujourd'hui.                                                                                                                                                                        |
| X. Simple                  | ✅      | Aucune dépendance applicative. Les quatre outils de CI sont justifiés dans [research.md](research.md) (R3, R6, R7). Une seule chaîne sert les trois canaux.                                                                                                                                                               |

Revue après la phase 1 : aucun écart. La seule complexité nouvelle est l'entrée `channel` de `release.yml`, qui remplace un second workflow.

## Project Structure

### Documentation (this feature)

```text
specs/002-build-sign-release/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── release-workflow.md   # Entrées, contrôles et sorties de release.yml
│   └── release-assets.md     # Noms et contenu des fichiers d'une version
└── tasks.md                  # /speckit-tasks
```

### Source Code (repository root)

```text
.github/workflows/
├── release.yml           # Modifié : canal, dry-run, contrôle des secrets, licences, SBOM, empreintes, quatre variantes
├── build.yml             # Modifié : préfixe tysta, tests de fumée sur tysta, config de signature Windows, plus de TAURI_SIGNING_*
├── main-build.yml        # Modifié : quatre variantes, sans signature
├── pr-test-build.yml     # Modifié : sans signature, préfixe tysta
├── build-test.yml        # Modifié : préfixe tysta
└── code-quality.yml      # Modifié : contrôle des licences

scripts/
├── set-version.ts            # Nouveau : met la version aux trois endroits, refuse de redescendre
├── set-version.test.ts
├── check-licenses.ts         # Nouveau : licences des dépendances npm de production
├── check-licenses.test.ts
├── release-notes.ts          # Nouveau : brouillon de notes en français depuis les commits
├── release-notes.test.ts
└── ci/sign-windows.ps1       # Nouveau : appel unique au fournisseur de signature Windows

licenses-allowed.json                 # Nouveau : licences autorisées et exceptions, lues par les deux contrôles
src-tauri/deny.toml                   # Nouveau : cargo-deny, construit depuis la même liste
src-tauri/tauri.conf.json             # Modifié : signCommand retiré, version 0.1.0-beta.1
src-tauri/tauri.sign-windows.conf.json  # Nouveau : signCommand vers scripts/ci/sign-windows.ps1
src-tauri/Cargo.toml, package.json    # Modifiés : version 0.1.0-beta.1
docs/publier.md                       # Nouveau : publier une version, secrets à créer, renouvellement
```

**Structure Decision**: aucune nouvelle structure de code applicatif. La feature vit dans `.github/workflows/`, dans `scripts/` (scripts Bun, comme `check-translations.ts`) et dans un document pour le mainteneur dans `docs/`, à côté des pages d'aide.

## Complexity Tracking

Aucun écart à la constitution à justifier.
