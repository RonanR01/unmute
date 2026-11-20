# Recherche : Build, signature et publication

Phase 0 du plan. Chaque section donne la décision, sa raison et les options écartées.

## État de départ (relevé le 2026-11-20)

- `.github/workflows/` contient les chaînes de Handy : `release.yml` (publication manuelle, sept variantes), `build.yml` (construction réutilisable, 820 lignes), `main-build.yml` (construction signée à chaque poussée sur `main`), `pr-test-build.yml`, `build-test.yml`, `test.yml`, `code-quality.yml`, `playwright.yml`, `nix-check.yml`.
- Le dépôt `RonanR01/unmute` est une bifurcation publique de Handy. Il n'a ni secret configuré, ni version publiée, ni exécution de workflow : GitHub désactive les Actions sur une bifurcation tant que le propriétaire ne les active pas.
- `actionlint` 1.7.12 sur les workflows hérités : trois remarques `SC2086` de niveau info dans `build.yml` (variables non entre guillemets aux lignes 227, 239 et 249), aucune erreur. Elles sont préexistantes et ne comptent pas comme régressions.
- Le binaire s'appelle déjà `tysta` (`Cargo.toml`, `[[bin]]`). Pourtant, les tests de fumée de `build.yml` cherchent encore `usr/bin/handy` et `handy.exe` : ils échoueraient à la première exécution.
- `src-tauri/tauri.conf.json` :
  - `signCommand` appelle `trusted-signing-cli` sur le compte Azure de Handy (`CJ-Signing`, `cjpais-dev`).
  - `createUpdaterArtifacts` vaut `false`, et la clé publique de mise à jour est celle de Handy.
  - Les bibliothèques Linux s'installent dans `/usr/lib/Handy`. C'est un chemin interne au moteur : il reste tel quel (principe VI).
- La version est 0.10.1 à trois endroits : `package.json`, `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json`.
- Licences :
  - 854 crates Rust. Hors licences permissives, on trouve `webpki-roots` et `webpki-root-certs` (CDLA-Permissive-2.0, permissive), `r-efi` (triple licence dont MIT) et `tauri-nspanel` (dépendance Git sans licence déclarée dans ses métadonnées).
  - 210 paquets npm de production. La seule licence hors liste est celle de la police Rethink Sans (OFL-1.1, compatible avec un usage commercial).

## R1. Emplacement de téléchargement et adresse fixe

- **Décision** : publier sur la page des versions du dépôt GitHub. L'adresse fixe est `https://github.com/RonanR01/unmute/releases/latest`, et une bêta est publiée comme préversion (`prerelease: true`). GitHub n'affiche jamais une préversion comme « latest », ce qui satisfait FR-012 et FR-013 sans autre mécanisme.
- **Raison** : c'est gratuit pour un dépôt public, déjà utilisé par `links.ts` (`TYSTA_RELEASES_URL`) et par le code des versions portables, et cela suffit à une bêta.
- **Écarté** :
  - Stockage objet Scaleway : il faudrait un compte, un domaine et une copie des fichiers. On y viendra avec le site.
  - Liens directs par plateforme sans version (`/releases/latest/download/Tysta.dmg`) : ils obligent à retirer le numéro des noms de fichiers, ce que FR-003 interdit. Le site obtiendra les liens directs par l'API GitHub.

## R2. Signature et notarisation macOS

- **Décision** : garder le chemin de Handy, déjà câblé dans `build.yml`.
  - Le certificat « Developer ID Application » est importé dans un trousseau temporaire.
  - La notarisation passe par l'identifiant Apple, un mot de passe propre à l'application et l'identifiant d'équipe (`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`).
  - `tauri-action` signe, notarise et agrafe le ticket.
- **Raison** : le chemin fonctionne chez Handy et il suffit de lui fournir les secrets de Tysta. Un compte Apple Developer individuel (99 $ par an) donne droit à un certificat Developer ID.
- **Écarté** : la clé d'API App Store Connect, plus robuste, mais qui ajoute trois secrets sans bénéfice pour un seul mainteneur. On pourra y passer plus tard sans rien changer d'autre.

## R3. Signature Windows pour un particulier en France

- **Décision** : un certificat de signature de code au nom d'un particulier (validation individuelle), délivré par SSL.com et signé dans le nuage par son service eSigner (outil `CodeSignTool`, utilisable en CI sans clé matérielle). La commande de signature sort de `tauri.conf.json` et passe dans un fichier de configuration à part, `src-tauri/tauri.sign-windows.conf.json`. Ce fichier n'est ajouté à la construction (`--config`) que quand la signature est demandée. Un seul script, `scripts/ci/sign-windows.ps1`, porte l'appel au fournisseur.
- **Raison** :
  - Depuis juin 2023, les clés de signature de code doivent vivre sur un module matériel. Un certificat classique livré sur clé USB ne peut donc pas signer depuis la CI.
  - Azure Artifact Signing (ex-Trusted Signing), le moins cher, n'accepte les particuliers qu'aux États-Unis et au Canada.
  - SSL.com vend des certificats au nom d'un particulier et fournit la signature dans le nuage, conçue pour la CI.
  - Isoler la commande dans un fichier et un script permet de changer de fournisseur, par exemple au passage à une structure, en ne touchant qu'à ces deux fichiers.
- **Écarté** :
  - Certum SimplySign : moins cher, mais il demande un code à usage unique depuis un téléphone à chaque session, ce qui se prête mal à la CI.
  - Azure Key Vault avec un certificat importé : il faut un coffre HSM payant en plus du certificat.
  - Ne pas signer sous Windows : interdit par FR-005 pour une version publique.
- **À vérifier par le mainteneur** : le tarif exact et le délai de vérification d'identité chez SSL.com au moment de l'achat.

## R4. Préversions non signées

- **Décision** : `release.yml` reçoit deux entrées.
  - `channel` : `prerelease-unsigned`, `beta` ou `stable`.
  - `dry-run` : construit sans créer de version, pour valider la chaîne.
  - Avec `prerelease-unsigned`, la signature est désactivée, le titre de la version et le préfixe des fichiers contiennent `non-signee`, la version est marquée préversion et ses notes commencent par un avertissement standard.
  - Avec `beta` ou `stable`, une première tâche vérifie la présence de chaque secret de signature et échoue en nommant ceux qui manquent, avant toute construction.
- **Raison** : cela satisfait FR-007 et FR-007b avec une seule chaîne, et c'est vérifiable dès aujourd'hui sans certificats.
- **Écarté** : un workflow séparé pour les préversions. Il aurait fallu maintenir deux matrices en parallèle.

## R5. Numérotation et MSI

- **Décision** :
  - La version vit toujours aux trois mêmes endroits. Un script `scripts/set-version.ts` les met à jour ensemble et refuse un numéro inférieur ou égal au précédent.
  - La première version est `0.1.0-beta.1`. Les préversions non signées utilisent la même forme.
  - Sous Windows, une version avec suffixe ne produit que l'installeur NSIS (`.exe`) ; l'installeur MSI n'est produit que pour une version stable.
- **Raison** : WiX, l'outil qui fabrique le MSI, n'accepte qu'un suffixe numérique (`0.1.0-1`), et Tauri refuse `-beta.1` pour ce format. Le MSI sert surtout au déploiement par GPO, qui ne concerne pas une bêta.
- **Écarté** : un suffixe numérique pour toutes les préversions (`0.1.0-1`). Il est moins lisible et ne dit pas qu'il s'agit d'une bêta.

## R6. Liste des composants (SBOM)

- **Décision** : CycloneDX JSON, deux fichiers par version, joints à la version.
  - Rust : `cargo cyclonedx` sur `src-tauri`.
  - Interface : `@cyclonedx/cyclonedx-npm --omit dev` exécuté via `bunx`, sur le `node_modules` installé par Bun.
  - Si cet outil refuse l'arbre de Bun, on se rabat sur `syft` (action `anchore/sbom-action`), qui sait lire les deux écosystèmes ; à vérifier à l'implémentation.
- **Raison** : CycloneDX est le format attendu par les outils d'audit des DSI, et ces outils ne s'exécutent qu'en CI. L'application ne gagne aucune dépendance (principe X).
- **Écarté** : SPDX, aussi standard, mais l'outillage Rust est moins mûr.

## R7. Contrôle des licences

- **Décision** :
  - Rust : `cargo deny check licenses` avec un `src-tauri/deny.toml`. Il autorise MIT, Apache-2.0, Apache-2.0 WITH LLVM-exception, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, Unicode-3.0, Unicode-DFS-2016, CC0-1.0, 0BSD, Unlicense, BSL-1.0, MPL-2.0 et CDLA-Permissive-2.0.
  - Exception nommée pour `tauri-nspanel` : licence MIT ou Apache-2.0 constatée dans son dépôt, mais non déclarée dans ses métadonnées.
  - Interface : un script `scripts/check-licenses.ts` parcourt les dépendances de production installées et applique la même liste, plus OFL-1.1 pour les polices.
  - La liste et les exceptions vivent dans `licenses-allowed.json` à la racine, que les deux contrôles lisent.
  - Le contrôle tourne sur chaque demande de fusion (`code-quality.yml`) et en tête de `release.yml`.
- **Raison** : `cargo-deny` est la référence côté Rust. Côté JS, un script de 50 lignes au format des autres `scripts/*.ts` évite d'ajouter une dépendance.
- **Écarté** : `license-checker` côté npm, une dépendance de plus et peu maintenue.

## R8. Notes de version en français

- **Décision** :
  - `scripts/release-notes.ts` prépare un brouillon à partir des messages de commit depuis l'étiquette précédente.
  - Les préfixes conventionnels sont regroupés en sections : `feat` dans « Nouveautés », `fix` dans « Corrections », le reste dans « Autres changements », sauf `chore` et `docs`, ignorés.
  - Le brouillon est mis dans le corps de la version brouillon, et le mainteneur le réécrit avant de publier.
  - Pour une préversion non signée, un avertissement précède le tout et explique comment ouvrir l'application malgré l'alerte (clic droit puis Ouvrir sur macOS, « Informations complémentaires » puis « Exécuter quand même » sous Windows).
- **Raison** : les notes automatiques de GitHub sont en anglais et listent des demandes de fusion, alors que le dépôt travaille surtout par commits.
- **Écarté** : un fichier `CHANGELOG.md` tenu à la main. C'est une étape oubliable, et FR-009 demande déjà une relecture.

## R9. Reproductibilité et secrets

- **Décision** :
  - `release.yml` garde `no-cache: true`.
  - `main-build.yml` construit sans signature (`sign-binaries: false`) et seulement pour les quatre variantes de la bêta.
  - `pr-test-build.yml` ne signe plus.
  - Les secrets ne sont lus que dans `release.yml`, qui ne se déclenche que manuellement (`workflow_dispatch`) et que seuls les mainteneurs peuvent lancer.
  - Les secrets de mise à jour (`TAURI_SIGNING_*`) sont retirés de `build.yml` jusqu'à 003.
- **Raison** : FR-014, FR-015 et FR-017. Une demande de fusion venue d'une bifurcation n'a de toute façon pas accès aux secrets, mais signer sur `main` à chaque poussée exposait inutilement la clé.

## R10. Empreintes

- **Décision** : une dernière tâche de `release.yml` télécharge tous les fichiers du brouillon, calcule un `SHA256SUMS.txt` et le joint à la version. Elle couvre toutes les plateformes, pas seulement Linux.
- **Raison** : c'est un seul fichier, vérifiable avec `shasum -a 256 -c`, utile aussi aux DSI sous macOS et Windows.
