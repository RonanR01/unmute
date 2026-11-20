# Visuels du site

Les captures d'écran, l'image d'aperçu, les visuels de partage, la vidéo de démonstration et le kit média de Tysta. Ils sont dessinés en HTML avec des données d'exemple, puis capturés par Chrome : ils ne viennent pas de l'app lancée.

```bash
scripts/visuels/render.sh
```

Le résultat va dans `visuels-site/` à la racine du dépôt, qui n'est pas versionné. Il faut Google Chrome (ou `CHROME=<chemin>`), ffmpeg et zip.

- `generate.mjs` : une page HTML par visuel et par image de la vidéo. Les icônes viennent de `lucide-react`, la police de `@fontsource-variable/rethink-sans` et les noms des badges des traductions françaises de l'app.
- `tokens.json`, `bundle.css` : les couleurs, espacements et styles de composants, repris du design system sur claude.ai.
- `logos/` : le signe de Tysta, en clair et en vert sapin.
- `kit-lisez-moi.txt` : le texte joint au kit média.

Quand l'app change (un écran, la pastille d'enregistrement, le nom), il faut reporter le changement dans `generate.mjs`. La pastille reprend l'onde de `src/overlay/Waveform.tsx`.
