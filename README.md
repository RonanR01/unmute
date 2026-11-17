# Unwrite

Unwrite est une application de dictée vocale pour le bureau : vous appuyez sur un raccourci, vous parlez, le texte s'écrit dans l'app en cours. La transcription se fait sur votre machine, avec le modèle de votre choix.

Unwrite ajoute à ce moteur un historique complet de vos dictées et des Insights sur votre usage : mots dictés, débit, durée, activité par jour et profil de voix.

## Un fork de Handy

Unwrite est un fork de [Handy](https://github.com/cjpais/Handy), de CJ Pais et ses contributeurs, publié sous licence MIT. Le moteur de transcription, la gestion des modèles et le collage du texte viennent de Handy ; la licence d'origine est conservée dans [LICENSE](LICENSE).

Ce que Unwrite change :

- une interface à quatre écrans : Dictées, Insights, Dictionnaire, Paramètres ;
- des métadonnées par dictée : app active, durée, nombre de mots, modèle, latence ;
- une rétention de l'audio séparée de celle du texte ;
- pas de mise à jour automatique, pour ne pas réinstaller Handy par-dessus.

## Tout reste local

Aucune donnée ne quitte la machine, sauf si vous activez un post-traitement par un fournisseur cloud. Les dictées sont dans `history.db` et les enregistrements dans `recordings/`, sous le dossier de données de l'app (`~/Library/Application Support/com.ronan.unwrite/` sur macOS).

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

Le moteur étant celui de Handy, son [guide de dépannage](https://github.com/cjpais/Handy#troubleshooting) s'applique.

## Licence

MIT, voir [LICENSE](LICENSE).
