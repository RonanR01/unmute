# Tysta sous Linux

Raccourcis et collage dépendent du bureau et du serveur d'affichage (X11 ou Wayland). Cette page dit quoi installer et quoi régler.

## Outil de saisie

Tysta a besoin d'un outil qui envoie la touche de collage (ou tape le texte, en mode direct). Installe celui qui correspond à ton serveur d'affichage :

| Serveur d'affichage | Outil conseillé | Installation                                          |
| ------------------- | --------------- | ----------------------------------------------------- |
| X11                 | `xdotool`       | `sudo apt install xdotool`                            |
| Wayland             | `wtype`         | `sudo apt install wtype`                              |
| Les deux            | `dotool`        | `sudo apt install dotool` (demande le groupe `input`) |

- `dotool` demande d'ajouter ton utilisateur au groupe `input` : `sudo usermod -aG input $USER`, puis déconnexion et reconnexion.
- Ubuntu 26.04 est sous Wayland par défaut et `wtype` n'y fonctionne pas : installe `ydotool` et son service systemd. Le pas-à-pas est dans [troubleshooting/ubuntu-26-04-gnome-wayland](troubleshooting/ubuntu-26-04-gnome-wayland/README.md).

Sans aucun de ces outils, Tysta se rabat sur une saisie générique, souvent capricieuse sous Wayland.

## Méthode de collage

Par défaut, Tysta colle avec **Maj+Inser** (**Presse-papiers (Shift+Insert)** dans **Avancé → Méthode de collage**). Le texte va dans le presse-papiers et dans la sélection primaire, si bien que la même touche colle dans les applications graphiques comme dans les terminaux (kitty, Ghostty, Alacritty, Terminal GNOME). Les deux sont ensuite restaurés.

La saisie **directe** reste possible, mais dépend de la disposition du clavier : sur un clavier AZERTY, elle peut perdre les majuscules et les accents.

## Raccourci global sous Wayland

Sous Wayland, un raccourci global se déclare dans le bureau. La commande à lui donner est `tysta --toggle-transcription`.

**GNOME** : Paramètres → Clavier → Raccourcis clavier → Raccourcis personnalisés, bouton **+**, nom « Dictée Tysta », commande `tysta --toggle-transcription`, puis la combinaison voulue (par exemple Super+O).

**KDE Plasma** : Configuration du système → Raccourcis → Raccourcis personnalisés, Modifier → Nouveau → Raccourci global → Commande/URL, avec la même commande.

**Sway ou i3** (`~/.config/sway/config` ou `~/.config/i3/config`) :

```ini
bindsym $mod+o exec tysta --toggle-transcription
```

**Hyprland** (`~/.config/hypr/hyprland.conf`) :

```ini
bind = $mainMod, O, exec, tysta --toggle-transcription
```

On peut aussi envoyer un signal : `pkill -USR2 -n tysta` bascule la dictée (le signal ne ferme pas l'application). N'utilise pas `SIGUSR1` : WebKitGTK s'en sert en interne, et il peut faire planter l'application.

## Fenêtre de dictée et collage

Sous Linux, la fenêtre de dictée est masquée par défaut (réglage **Overlay** sur **Aucune**) : certains gestionnaires de fenêtres lui donnent le focus, et le texte part alors dans la mauvaise fenêtre. Si tu l'affiches quand même et que le collage échoue, remets-la sur **Aucune** et active le **signal sonore** pour savoir quand Tysta écoute.

## Bibliothèque manquante au démarrage

Si Tysta refuse de démarrer avec `error while loading shared libraries: libgtk-layer-shell.so.0`, installe le paquet de ta distribution :

| Distribution  | Paquet                | Commande                               |
| ------------- | --------------------- | -------------------------------------- |
| Ubuntu/Debian | `libgtk-layer-shell0` | `sudo apt install libgtk-layer-shell0` |
| Fedora/RHEL   | `gtk-layer-shell`     | `sudo dnf install gtk-layer-shell`     |
| Arch Linux    | `gtk-layer-shell`     | `sudo pacman -S gtk-layer-shell`       |

Pour désactiver la couche GTK de la fenêtre de dictée, lance Tysta avec `HANDY_NO_GTK_LAYER_SHELL=1`.

Le reste du dépannage est dans [depannage.md](depannage.md).
