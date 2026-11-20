---
description: "Tâches de la feature 002 : build, signature et publication"
---

# Tasks: Build, signature et publication

**Input**: Design documents from `/specs/002-build-sign-release/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: les trois scripts Bun sont écrits tests d'abord (constitution, principe VII). Les workflows sont vérifiés par `actionlint` puis par une exécution réelle.

**Organization**: une phase par récit utilisateur de la spécification.

## Format: `[ID] [P?] [Story] Description`

- **[P]** : parallélisable (fichiers différents, aucune dépendance en cours).
- **[Story]** : récit concerné (US1 à US4).

## Phase 1: Setup

**Purpose**: outillage local et état de départ

- [x] T001 Installer `actionlint` en local et vérifier que `actionlint .github/workflows/*.yml` tourne sur les workflows actuels ; noter les erreurs préexistantes dans `specs/002-build-sign-release/research.md` (section État de départ) pour ne pas les confondre avec des régressions
- [x] T002 [P] Ajouter le script `"test:scripts": "bun test scripts/"` dans `package.json`

---

## Phase 2: Foundational

**Purpose**: la numérotation, dont dépendent tous les récits

**⚠️ CRITICAL**: aucun récit ne peut être publié avant cette phase

- [x] T003 Écrire `scripts/set-version.test.ts` (tests d'abord) pour [data-model.md](data-model.md) `Version.numero` : met à jour les trois fichiers, refuse un numéro inférieur ou égal au numéro actuel, refuse un numéro qui n'est pas du SemVer, préserve la mise en forme des fichiers ; vérifier que les tests échouent
- [x] T004 Implémenter `scripts/set-version.ts` (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, puis `src-tauri/Cargo.lock` via `cargo update -p handy --offline` ou équivalent) jusqu'à ce que `bun test scripts/set-version.test.ts` passe
- [x] T005 Passer la version à `0.1.0-beta.1` avec `bun scripts/set-version.ts 0.1.0-beta.1` et vérifier que l'écran « À propos » l'affiche (`bun run build` sans erreur)

**Checkpoint**: la version de Tysta est indépendante de celle de Handy

---

## Phase 3: User Story 1 - Publier une version en une action (Priority: P1) 🎯 MVP

**Goal**: une préversion non signée sort en une action, avec quatre variantes nommées Tysta.

**Independent Test**: [quickstart.md](quickstart.md) section 2 et les trois premières lignes de la section 3.

- [X] T006 [P] [US1] Dans `.github/workflows/build.yml` : remplacer le défaut `asset-prefix: "handy"` par `"Tysta"`, et dans les tests de fumée Linux et Windows remplacer le binaire testé `usr/bin/handy` / `handy.exe` / `Handy.AppImage` par `tysta` / `tysta.exe` / `Tysta.AppImage`, en gardant `/usr/lib/Handy` (chemin interne, principe VI)
- [X] T006b [US1] Ajouter à `.github/workflows/build.yml` un test de fumée macOS, après la construction et pour chaque variante Mac : lancer `Tysta.app/Contents/MacOS/tysta --list-devices` depuis le paquet produit et échouer si le code de retour n'est pas 0 (constitution, principe VII)
- [X] T007 [P] [US1] Dans `.github/workflows/build.yml` : retirer `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` de l'étape « Build with Tauri » (FR-017)
- [X] T008 [P] [US1] Réduire la matrice de `.github/workflows/main-build.yml` aux quatre plateformes de la bêta, soit cinq constructions (`macos-26` aarch64, `macos-latest` x86_64, `ubuntu-22.04` deb, `ubuntu-24.04` appimage+rpm, `windows-latest` x64) et passer `sign-binaries: false`
- [X] T009 [P] [US1] Dans `.github/workflows/pr-test-build.yml` et `.github/workflows/build-test.yml` : `sign-binaries: false` et préfixes `tysta-pr-…` / `tysta-test`
- [X] T010 [US1] Réécrire `.github/workflows/release.yml` selon [contracts/release-workflow.md](contracts/release-workflow.md) : entrées `channel` et `dry-run`, tâche `preflight` avec les contrôles 1 à 3 (versions concordantes, canal cohérent avec [data-model.md](data-model.md) `Version.canal`, étiquette inexistante selon `Version.etiquette`), matrice réduite aux cinq constructions de T008, `sign-binaries` à `false` pour `prerelease-unsigned`, préfixe `Tysta-non-signee` dans ce cas, `no-cache: true` conservé, `timeout-minutes: 90` sur les constructions macOS pour borner l'attente de la notarisation ; le contrôle 3 explique, si un brouillon d'une exécution échouée porte déjà l'étiquette, qu'il faut le supprimer avant de relancer
- [X] T011 [US1] Dans `.github/workflows/release.yml` : création du brouillon avec `target_commitish` fixé au SHA construit (`github.sha`), `Version.titre`, `Version.etat` = brouillon et `Version.prerelease` ([data-model.md](data-model.md)) ; pour `prerelease-unsigned`, corps limité à l'avertissement de [research.md](research.md) R8 en attendant US3 ; aucune création de version si `dry-run`
- [X] T012 [US1] Sous Windows, ne produire le MSI que pour une version sans suffixe : passer `--bundles nsis` quand `Version.numero` ([data-model.md](data-model.md)) a un suffixe. Fait dans `.github/workflows/build.yml` (étape « Choose Windows installers »), pour que `main-build`, `pr-test-build` et `build-test` en profitent aussi
- [X] T013 [US1] Lancer `actionlint .github/workflows/*.yml` et corriger toute nouvelle erreur
- [ ] T014 [US1] ⏳ attend l'activation des Actions — Faire activer les Actions sur le dépôt par le mainteneur, pousser, lancer **Release** en `dry-run`, puis sans `dry-run` en `prerelease-unsigned` ; corriger [contracts/release-assets.md](contracts/release-assets.md) si les noms produits diffèrent ; dérouler [quickstart.md](quickstart.md) sections 2 et 3

**Checkpoint**: une préversion non signée de Tysta peut être distribuée à des testeurs (SC-007)

---

## Phase 4: User Story 2 - Installer Tysta sans alerte de sécurité (Priority: P1)

**Goal**: les canaux `beta` et `stable` signent et notarisent, et échouent clairement sans secrets.

**Independent Test**: [quickstart.md](quickstart.md) section 3 (ligne `beta` sans secrets) tout de suite, section 4 une fois les certificats obtenus.

- [X] T015 [P] [US2] Retirer `signCommand` de `src-tauri/tauri.conf.json` et créer `src-tauri/tauri.sign-windows.conf.json` qui le définit en appelant `powershell -File ../scripts/ci/sign-windows.ps1 %1` ([research.md](research.md) R3)
- [X] T016 [P] [US2] Écrire `scripts/ci/sign-windows.ps1` : signe le fichier reçu avec `CodeSignTool` de SSL.com eSigner à partir des secrets de [data-model.md](data-model.md) `Secret de signature` (ligne Windows), télécharge `CodeSignTool` dans une version figée, échoue avec un message clair si un secret manque, n'affiche jamais de valeur de secret
- [X] T017 [US2] Dans `.github/workflows/build.yml` : quand `sign-binaries` est vrai sous Windows, ajouter `--config src-tauri/tauri.sign-windows.conf.json` aux arguments de construction, passer les secrets `ES_*` à l'étape de construction, retirer l'installation de `trusted-signing-cli` et les variables `AZURE_*`
- [X] T018 [US2] Ajouter à la tâche `preflight` de `.github/workflows/release.yml` le contrôle 4 de [contracts/release-workflow.md](contracts/release-workflow.md) : pour `beta` et `stable`, lister les secrets de [data-model.md](data-model.md) `Secret de signature` absents et échouer en les nommant
- [X] T019 [US2] Ajouter à `.github/workflows/build.yml` une vérification après construction, pour `sign-binaries` vrai : `codesign --verify --deep --strict`, `spctl -a -t exec` et `xcrun stapler validate` sur macOS, `Get-AuthenticodeSignature` = `Valid` sous Windows ([contracts/release-assets.md](contracts/release-assets.md))
- [X] T020 [US2] Ajouter à `.github/workflows/release.yml` une tâche finale `checksums` : télécharger les fichiers du brouillon, échouer si un nom de fichier contient `handy` (insensible à la casse, FR-003 et SC-006), produire `SHA256SUMS.txt` et le joindre ([research.md](research.md) R10)
- [X] T021 [P] [US2] Rédiger `docs/publier.md` : publier une version pas à pas, les secrets à créer (noms et rôle, sans valeurs), comment obtenir le certificat Developer ID et le certificat SSL.com au nom d'un particulier, comment les renouveler, quoi faire après un échec partiel (supprimer le brouillon et son étiquette, puis relancer), et le passage futur à une structure (conversion du compte Apple, nouveau certificat Windows)
- [ ] T022 [US2] ⏳ attend l'activation des Actions — `actionlint`, puis lancer **Release** en `beta` sans secrets et vérifier l'échec attendu ([quickstart.md](quickstart.md) section 3)

**Checkpoint**: la chaîne signée est prête ; il ne manque que les certificats du mainteneur

---

## Phase 5: User Story 3 - Savoir ce que contient une version (Priority: P2)

**Goal**: notes en français, listes des composants et contrôle des licences.

**Independent Test**: un brouillon contient les notes, `sbom-rust.cdx.json` et `sbom-interface.cdx.json` ; une dépendance sous GPL fait échouer le contrôle ([quickstart.md](quickstart.md) section 3, dernière ligne).

- [X] T023 [P] [US3] Créer `licenses-allowed.json` à la racine selon [data-model.md](data-model.md) `Liste des licences autorisées`, avec la liste de [research.md](research.md) R7, OFL-1.1 et l'exception `tauri-nspanel` ; vérifier la licence de `tauri-nspanel` dans son dépôt avant de l'inscrire
- [X] T024 [P] [US3] Écrire `scripts/check-licenses.test.ts` (tests d'abord) : expression `OR` dont une branche est autorisée → acceptée ; `AND` avec une branche refusée → refusée ; paquet sans licence ni exception → refusé ; exception → acceptée ; dépendances de développement ignorées
- [X] T025 [US3] Implémenter `scripts/check-licenses.ts` (parcours des dépendances de production installées dans `node_modules`, lecture de `licenses-allowed.json`, sortie qui nomme paquet et licence) jusqu'à ce que les tests passent ; ajouter `"check:licenses"` dans `package.json`
- [X] T026 [US3] Créer `src-tauri/deny.toml` (section `[licenses]` reprenant `licenses-allowed.json`, exception `tauri-nspanel`) et vérifier `cargo deny check licenses` en local
- [X] T027 [US3] Ajouter les deux contrôles de licences à `.github/workflows/code-quality.yml` et comme contrôle 5 de la tâche `preflight` de `.github/workflows/release.yml`
- [X] T028 [P] [US3] Écrire `scripts/release-notes.test.ts` (tests d'abord) pour [data-model.md](data-model.md) `Version.notes` : regroupement `feat` → « Nouveautés », `fix` → « Corrections », autres → « Autres changements », `chore` et `docs` ignorés, avertissement en tête pour `prerelease-unsigned`, première version sans étiquette précédente
- [X] T029 [US3] Implémenter `scripts/release-notes.ts` (commits depuis l'étiquette précédente, sortie Markdown en français) jusqu'à ce que les tests passent
- [X] T030 [US3] Dans `.github/workflows/release.yml` : remplir le corps du brouillon avec `bun scripts/release-notes.ts --channel <canal>` (récupération complète de l'historique pour les étiquettes)
- [X] T031 [US3] Dans `.github/workflows/release.yml` : tâche `sbom` qui produit `sbom-rust.cdx.json` (`cargo cyclonedx`) et `sbom-interface.cdx.json` (`@cyclonedx/cyclonedx-npm --omit dev`, repli `anchore/sbom-action` selon [research.md](research.md) R6) et les joint au brouillon

**Checkpoint**: une DSI peut évaluer une version

---

## Phase 6: User Story 4 - Télécharger la dernière version à une adresse fixe (Priority: P2)

**Goal**: l'adresse fixe mène toujours à la dernière version stable.

**Independent Test**: après une préversion puis une bêta, `releases/latest` ne pointe sur aucune des deux tant qu'aucune stable n'existe.

- [X] T032 [US4] Dans `.github/workflows/release.yml` : `make_latest` à `false` pour `beta` et `prerelease-unsigned`, `true` pour `stable`, selon [data-model.md](data-model.md) `Version.prerelease`
- [X] T033 [P] [US4] Vérifier que `TYSTA_RELEASES_URL` dans `src/lib/constants/links.ts` et le code des versions portables (`src/components/update-checker/portableInstaller.ts`) pointent sur `releases/latest` ; documenter l'adresse fixe dans `docs/publier.md`

---

## Phase 7: Polish

- [X] T034 [P] Mettre à jour `AGENTS.md` (section commandes : `bun run test:scripts`, `bun run check:licenses`, lien vers `docs/publier.md`) et `README.md` (où télécharger Tysta)
- [X] T035 Lancer `bun run lint`, `bun run format:check`, `bun run test:scripts`, `bun run check:translations` et `bun run build`
- [X] T036 Mettre à jour la ligne 002 du backlog (statut et état) et `specs/002-build-sign-release/checklists/requirements.md` si nécessaire

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → US1** : US1 a besoin de la version `0.1.0-beta.1`.
- **US2** dépend de T010 (la tâche `preflight` existe) ; T015, T016 et T021 peuvent démarrer en même temps que US1.
- **US3** dépend de T010 pour T027, T030 et T031 ; T023 à T029 sont indépendants de US1.
- **US4** dépend de T011.
- **Polish** en dernier.

Dans chaque récit, les tests précèdent l'implémentation de leur script (T003 → T004, T024 → T025, T028 → T029).

## Parallel Example

```text
Pendant US1 (T006–T009 en parallèle, fichiers différents) :
  T015 + T016 + T021 (signature et documentation)
  T023 + T024 + T028 (licences et notes, tests d'abord)
```

## Implementation Strategy

1. **MVP** : phases 1, 2 et US1. Une préversion non signée part chez des testeurs de confiance.
2. **US2** : la chaîne signée est prête et attend les certificats ; vérifiée par l'échec propre en `beta`.
3. **US3**, puis **US4** : la version devient évaluable par une DSI et trouvable à une adresse fixe.
4. Première bêta signée dès que les certificats existent ([quickstart.md](quickstart.md) section 4).
