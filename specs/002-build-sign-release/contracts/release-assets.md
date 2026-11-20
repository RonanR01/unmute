# Contrat : fichiers d'une version

Le préfixe vaut `Tysta`, ou `Tysta-non-signee` pour une préversion non signée. Le site et les mises à jour automatiques (003) s'appuieront sur ces noms.

Les noms suivent le motif `{préfixe}_[version]_[arch][setup][ext]` de `tauri-action`, réglé dans `release.yml`.

| Fichier                             | Plateforme         | Canal              |
| ----------------------------------- | ------------------ | ------------------ |
| `{préfixe}_{numero}_aarch64.dmg`    | Mac Apple Silicon  | tous               |
| `{préfixe}_{numero}_x64.dmg`        | Mac Intel          | tous               |
| `{préfixe}_{numero}_x64-setup.exe`  | Windows x64 (NSIS) | tous               |
| `{préfixe}_{numero}_x64.msi`        | Windows x64 (MSI)  | `stable` seulement |
| `{préfixe}_{numero}_amd64.deb`      | Linux x64          | tous               |
| `{préfixe}_{numero}_x86_64.rpm`     | Linux x64          | tous               |
| `{préfixe}_{numero}_amd64.AppImage` | Linux x64          | tous               |
| `sbom-rust.cdx.json`                | —                  | tous               |
| `sbom-interface.cdx.json`           | —                  | tous               |
| `SHA256SUMS.txt`                    | —                  | tous               |

## Règles vérifiables

- Aucun nom de fichier ne contient `handy` (quelle que soit la casse).
- `SHA256SUMS.txt` liste tous les autres fichiers, et `shasum -a 256 -c SHA256SUMS.txt` réussit.
- Pour `beta` et `stable` :
  - `codesign --verify --deep --strict` et `spctl -a -t exec` réussissent sur l'app extraite du `.dmg`, et `stapler validate` réussit sur le `.dmg`.
  - `Get-AuthenticodeSignature` renvoie `Valid` sur le `.exe` et le `.msi`.
- Le texte exact des noms produits par `tauri-action` (`[name]_[version]_[arch][ext]`) est vérifié lors de la première préversion, puis ce contrat est corrigé s'il diffère.
