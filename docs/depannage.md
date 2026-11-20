# Dépannage

## Les raccourcis ne marchent plus sur macOS (Secure Input)

macOS coupe la frappe aux autres applications quand la saisie sécurisée (Secure Input) est active. C'est normal le temps de taper un mot de passe, mais si une application la laisse allumée, les raccourcis de Tysta ne répondent plus. Tysta l'affiche alors dans un bandeau, avec le nom de l'application en cause quand il le connaît.

Pour la libérer, dans l'ordre :

1. Quitte le champ de mot de passe resté ouvert, ou ferme l'application nommée dans le bandeau.
2. Dans Terminal, décoche **Terminal → Saisie sécurisée au clavier** (dans iTerm2 : **iTerm2 → Secure Keyboard Entry**).
3. Verrouille la session (Ctrl+Cmd+Q) puis déverrouille-la.
4. Si rien n'y fait, ferme la session et rouvre-la.

Pour trouver l'application en cause dans un terminal :

```bash
ioreg -l -w 0 | grep SecureInput
```

Le numéro `kCGSSessionSecureInputPID` est celui du processus ; `ps -p <numéro>` donne son nom.

## Le texte collé est l'ancien contenu du presse-papiers

Si la dictée est juste dans l'historique mais que Tysta colle ce que tu avais copié avant, l'application cible a lu le presse-papiers après sa restauration.

1. Dans la fenêtre de Tysta, `Cmd+Maj+D` (macOS) ou `Ctrl+Maj+D` (Windows, Linux) fait apparaître **Débogage**.
2. Sur macOS et Windows, essaie **Collage fiable (Beta)** avec une méthode de collage par presse-papiers.
3. Sinon, augmente **Délai de collage (après)** et réessaie.

## Linux

Outils de saisie, raccourcis sous Wayland et bibliothèques manquantes : voir [linux.md](linux.md).

## Le reste

Le moteur de Tysta est celui de [Handy](https://github.com/cjpais/Handy). Pour un problème de modèle, de carte graphique ou de démarrage qui n'est pas décrit ici, son [guide de dépannage](https://github.com/cjpais/Handy#troubleshooting) s'applique.
