# Tysta

Tysta est une application de dictée vocale pour le bureau : vous appuyez sur un raccourci, vous parlez, le texte s'écrit dans l'app en cours. La transcription se fait sur votre machine, avec le modèle de votre choix.

Tysta ajoute à ce moteur un historique complet de vos dictées et des Insights sur votre usage : mots dictés, débit, durée, activité par jour et profil de voix.

## Un fork de Handy

Tysta est un fork de [Handy](https://github.com/cjpais/Handy), de CJ Pais et ses contributeurs, publié sous licence MIT. Le moteur de transcription, la gestion des modèles et le collage du texte viennent de Handy ; la licence d'origine est conservée dans [LICENSE](LICENSE).

Ce que Tysta change :

- une interface à quatre écrans : Dictées, Insights, Dictionnaire, Paramètres ;
- des métadonnées par dictée : app active, durée, nombre de mots, modèle, latence ;
- une rétention de l'audio séparée de celle du texte ;
- pas de mise à jour automatique, pour ne pas réinstaller Handy par-dessus.

## Télécharger

Les versions sont sur la [page des versions](https://github.com/RonanR01/unmute/releases) : un `.dmg` pour Mac (Apple Silicon ou Intel), un `.exe` pour Windows, et un `.deb`, un `.rpm` ou un `.AppImage` pour Linux. [La dernière version stable](https://github.com/RonanR01/unmute/releases/latest) est toujours à la même adresse. Chaque version liste ses composants (`sbom-*.cdx.json`) et l'empreinte de ses fichiers (`SHA256SUMS.txt`).

Tysta est en bêta. Les préversions marquées « non signée » sont réservées à des testeurs : le système affiche une alerte à l'installation, et leurs notes expliquent comment la passer.

## Tout reste local

Aucune donnée ne quitte la machine, sauf si vous activez un post-traitement par un fournisseur cloud. Les dictées sont dans `history.db` et les enregistrements dans `recordings/`, sous le dossier de données de l'app (`~/Library/Application Support/com.ronan.tysta/` sur macOS).

## Développement

Il faut [Rust](https://rustup.rs/), [Bun](https://bun.sh/) et cmake.

```bash
bun install
```

```bash
CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri dev
```

Le détail par plateforme est dans [BUILD.md](BUILD.md), et les consignes pour les assistants de code dans [AGENTS.md](AGENTS.md).

## Dépannage

Voir [docs/depannage.md](docs/depannage.md), et [docs/linux.md](docs/linux.md) pour l'installation sous Linux. Le moteur étant celui de Handy, son [guide de dépannage](https://github.com/cjpais/Handy#troubleshooting) couvre le reste.

## Licence

MIT, voir [LICENSE](LICENSE).
