# Validation : Build, signature et publication

## Prérequis

- Les Actions sont activées sur le dépôt (Settings → Actions → General → « Allow all actions »). Une bifurcation les a désactivées par défaut.
- Bun et Rust installés en local pour les tests des scripts.

## 1. Scripts (en local)

```bash
bun test scripts/
```

Attendu : tous les tests passent (`set-version`, `check-licenses`, `release-notes`).

```bash
bun scripts/check-licenses.ts
```

```bash
cd src-tauri && cargo deny check licenses
```

Attendu : aucune licence refusée.

## 2. Préversion non signée (sans certificat, dès maintenant)

1. `bun scripts/set-version.ts 0.1.0-beta.1`, puis commiter et pousser.
2. Lancer **Release** dans Actions avec `channel = prerelease-unsigned`.
3. Attendu :
   - un brouillon « Tysta 0.1.0-beta.1 (préversion non signée) » avec les fichiers de [release-assets.md](contracts/release-assets.md) et sans MSI ;
   - des notes qui commencent par l'avertissement ;
   - aucun fichier nommé handy.
4. Télécharger les fichiers et `SHA256SUMS.txt`, puis lancer `shasum -a 256 -c SHA256SUMS.txt`.
5. Installer sur le Mac M1 et le Galaxy Book2 360 en passant l'alerte comme le disent les notes. Tysta démarre et une dictée fonctionne.

## 3. Garde-fous

| Action                                                                                | Attendu                                                          |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Relancer **Release** sans changer le numéro                                           | Échec « la version existe déjà ».                                |
| Lancer **Release** avec `channel = beta` sans secrets                                 | Échec avant toute construction, qui liste les secrets manquants. |
| Lancer **Release** avec `channel = stable` sur `0.1.0-beta.1`                         | Échec : une version stable ne porte pas de suffixe.              |
| Ajouter en local une dépendance sous GPL, puis lancer `bun scripts/check-licenses.ts` | Échec qui nomme le paquet.                                       |

## 4. Bêta signée (une fois les certificats obtenus)

1. Créer les secrets listés dans [docs/publier.md](../../docs/publier.md).
2. `bun scripts/set-version.ts 0.1.0-beta.2`, lancer **Release** avec `channel = beta`.
3. Attendu : les vérifications de signature de [release-assets.md](contracts/release-assets.md) réussissent. Sur un Mac et un PC Windows neufs, l'installation se fait sans alerte d'éditeur inconnu et l'éditeur affiché est le tien.
