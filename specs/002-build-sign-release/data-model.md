# Modèle de données : Build, signature et publication

Rien n'est stocké dans l'application. Les « données » sont les versions publiées et les fichiers de configuration de la chaîne.

## Version

| Champ        | Description                                                            | Règle                                                                                                            |
| ------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `numero`     | SemVer, par exemple `0.1.0-beta.1`                                     | Identique dans `package.json`, `Cargo.toml` et `tauri.conf.json`. Strictement supérieur à la version précédente. |
| `canal`      | `prerelease-unsigned`, `beta` ou `stable`                              | `stable` n'a pas de suffixe. `beta` et `prerelease-unsigned` en ont un.                                          |
| `etiquette`  | `v{numero}`                                                            | Unique : la publication refuse une étiquette existante.                                                          |
| `titre`      | `Tysta {numero}`, suivi de « (préversion non signée) » si c'est le cas |                                                                                                                  |
| `etat`       | `brouillon`, puis `publiée`                                            | Seul le mainteneur fait passer à `publiée`.                                                                      |
| `prerelease` | booléen GitHub                                                         | `true` pour `beta` et `prerelease-unsigned`, `false` pour `stable`.                                              |
| `notes`      | Markdown en français                                                   | Avertissement en tête pour `prerelease-unsigned`.                                                                |
| `fichiers`   | voir [contracts/release-assets.md](contracts/release-assets.md)        |                                                                                                                  |

### Transitions

```text
(lancement) ──contrôles OK──▶ brouillon ──relecture du mainteneur──▶ publiée
     │                            │
     └─contrôle KO─▶ échec        └─construction KO─▶ brouillon incomplet (jamais publié automatiquement)
```

## Liste des licences autorisées (`licenses-allowed.json`)

```json
{
  "allowed": ["MIT", "Apache-2.0", "…"],
  "exceptions": [
    {
      "package": "tauri-nspanel",
      "ecosystem": "cargo",
      "license": "MIT OR Apache-2.0",
      "reason": "Dépendance Git sans licence dans ses métadonnées ; licence constatée dans le dépôt."
    }
  ]
}
```

- Une expression SPDX avec `OR` passe si l'une des branches est autorisée. Avec `AND`, toutes les branches doivent l'être.
- Une dépendance sans licence et sans exception fait échouer le contrôle.

## Secret de signature

| Secret                                                                 | Canal        | Rôle                                                                         |
| ---------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD` | beta, stable | Certificat Developer ID Application en base64 (.p12) et trousseau temporaire |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`                          | beta, stable | Notarisation                                                                 |
| `ES_USERNAME`, `ES_PASSWORD`, `ES_CREDENTIAL_ID`, `ES_TOTP_SECRET`     | beta, stable | Signature Windows SSL.com eSigner                                            |

La liste exacte est la source de vérité du contrôle des secrets de `release.yml` et de `docs/publier.md`.
