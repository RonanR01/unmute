# Contrat : workflow `release.yml`

Déclenché à la main (`workflow_dispatch`) par un mainteneur.

## Entrées

| Entrée    | Valeurs                                 | Défaut                | Effet                                                   |
| --------- | --------------------------------------- | --------------------- | ------------------------------------------------------- |
| `channel` | `prerelease-unsigned`, `beta`, `stable` | `prerelease-unsigned` | Fixe la signature, l'état de préversion et le marquage. |
| `dry-run` | booléen                                 | `false`               | Construit et contrôle tout, sans créer de version.      |

## Contrôles préalables (tâche `preflight`), dans cet ordre, avant toute construction

1. Le numéro est le même dans `package.json`, `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json`. Sinon : échec « versions divergentes », avec les trois valeurs.
2. Le canal correspond au numéro : `stable` interdit un suffixe, `beta` et `prerelease-unsigned` en exigent un. Sinon : échec qui explique la règle.
3. L'étiquette `v{numero}` n'existe pas, ni comme étiquette ni comme version. Sinon : échec « la version existe déjà, augmente le numéro ».
4. Pour `beta` et `stable`, chaque secret du [modèle de données](../data-model.md#secret-de-signature) est présent. Sinon : échec qui liste les noms des secrets manquants, jamais leurs valeurs.
5. Les licences sont autorisées : `cargo deny check licenses` et `bun scripts/check-licenses.ts`. Sinon : échec qui nomme la dépendance et sa licence.

## Sorties

- Hors `dry-run` : un brouillon de version conforme à [release-assets.md](release-assets.md).
- Dans tous les cas : les artefacts de construction attachés à l'exécution, conservés 7 jours.
- Si une plateforme échoue : le brouillon reste incomplet et l'exécution est en échec, avec la variante en cause.

## Ce que le workflow ne fait jamais

- Publier une version : elle reste un brouillon.
- Signer quand `channel` vaut `prerelease-unsigned`.
- Lire un secret de signature hors de ce workflow.
- Produire des fichiers de mise à jour automatique (003).
