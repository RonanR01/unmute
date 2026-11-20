# Constitution de Tysta

Tysta est une application de dictée vocale pour macOS, Windows et Linux, dérivée du projet open source Handy (licence MIT). Promesse : la dictée vocale locale qui comprend vraiment le français. Ces principes priment sur toute autre considération. Les mots DOIT et NE DOIT PAS sont impératifs ; DEVRAIT exprime une règle par défaut, dont tout écart est justifié dans le plan.

## Principes

### I. Local d'abord

- L'audio NE DOIT JAMAIS quitter la machine de l'utilisateur, ni être conservé sur disque au-delà du traitement, sauf choix explicite de l'utilisateur.
- La dictée DOIT fonctionner entièrement hors ligne, une fois les modèles téléchargés.
- Toute communication réseau DOIT être listée dans un registre des flux sortants (finalité, données, destination) et documentée pour l'utilisateur. Aucun appel réseau n'est autorisé dans le chemin de dictée, sauf fournisseur de modèle de langage en ligne choisi explicitement par l'utilisateur.
- Le texte dicté et les statistiques restent sur la machine, sauf sauvegarde chiffrée de bout en bout activée par l'utilisateur.

### II. Le français d'abord

- La qualité de reconnaissance DOIT être mesurée sur un corpus de référence en français (accents, franglais, jargon métier, noms propres, ponctuation dictée).
- Toute modification qui touche la transcription DOIT être évaluée sur ce corpus ; une hausse de plus de 1 point du taux d'erreur sur les mots (par exemple de 5 % à 6 %) NE DOIT PAS être fusionnée sans décision explicite.
- L'interface est conçue en français ; tous les textes passent par i18next pour permettre d'autres langues.

### III. La dictée est instantanée

- Du relâchement du raccourci à l'insertion du texte : moins de 500 ms pour une dictée de 10 secondes sur les machines de référence : un Mac Apple Silicon M1 et un Samsung Galaxy Book2 360 (Intel Core i7 de 12e génération, 16 Go, Iris Xe).
- Les traitements d'analyse (statistiques, badges, coach) tournent sur une chaîne différée et NE DOIVENT JAMAIS ralentir ni bloquer la dictée.
- Une panne d'analyse NE DOIT JAMAIS empêcher la dictée.

### IV. Fidélité à ce qui a été dit

- Le nettoyage du texte (hésitations, ponctuation, mise en forme) NE DOIT PAS ajouter d'information ni changer le sens.
- L'utilisateur DOIT pouvoir désactiver le nettoyage et récupérer la transcription brute de ses dictées récentes.

### V. Prêt pour la DSI

- Chaque version publiée DOIT être signée (Apple Developer ID et notarisation, signature Authenticode), reproductible depuis la CI et accompagnée de notes de version.
- Chaque réglage DEVRAIT pouvoir être imposé par l'administrateur (profil MDM sur macOS, registre ou GPO sur Windows), y compris la désactivation des mises à jour automatiques et de la télémétrie.
- Les dépendances DOIVENT avoir une licence compatible avec un usage commercial ; une liste des composants (SBOM) est produite à chaque version.
- Les failles de sécurité DOIVENT être corrigées sous 7 jours si elles sont critiques, sous 30 jours si elles sont hautes, et dans la version suivante pour les autres.

### VI. Respect de l'amont open source

- La mention de licence et l'attribution de Handy DOIVENT être conservées.
- Le moteur garde les noms de Handy (crate `handy`, variables `HANDY_*`) ; seul ce que voit l'utilisateur s'appelle Tysta.
- Les écarts avec Handy DEVRAIENT être isolés dans des modules identifiés, pour faciliter la reprise des évolutions de l'amont.
- Les corrections génériques DEVRAIENT être proposées à l'amont.

### VII. Tester avant d'écrire

- Le cœur métier (chaîne de transcription, dictionnaire, licences, calcul des statistiques et des badges) est développé en écrivant les tests d'abord.
- Chaque feature DOIT être couverte par des tests d'intégration sur macOS et Windows en CI.
- Les échanges avec le plan de contrôle DOIVENT être couverts par des tests de contrat.

### VIII. Accessible

- L'interface DOIT viser le niveau AA du RGAA / WCAG : navigation complète au clavier, compatibilité VoiceOver et NVDA, contrastes suffisants, respect de la réduction des animations.

### IX. Sobre

- Au repos, fenêtre ouverte, l'application DOIT rester sous 250 Mo de mémoire, tous processus compris (cœur et WebKit), et sous 1 % de processeur. Mesure de départ sur Mac M1 : environ 200 Mo et 0,5 %.
- Les modèles sont téléchargés à la demande, jamais embarqués en totalité dans l'installeur.

### X. Simple

- Toute nouvelle dépendance DOIT être justifiée dans le plan.
- On construit ce que la spécification demande, pas ce qui pourrait servir plus tard.

## Contraintes techniques

- Application : Tauri 2, cœur en Rust, interface React, TypeScript, Tailwind et Zustand reprise de Handy.
- Reconnaissance vocale locale : `transcribe-cpp` (Parakeet, Whisper et autres modèles GGUF), détection de voix Silero ; modèle de langage local ou en ligne pour le nettoyage et le coach.
- Données locales : base SQLite, chiffrée si la plateforme le permet.
- Plan de contrôle : Scaleway uniquement (Keycloak, API de licences, PostgreSQL, stockage objet, mails transactionnels). Seule exception : le prestataire de paiement.
- Mises à jour : module de mise à jour Tauri, archives signées, canaux stable et bêta.

## Gouvernance

- Cette constitution prévaut sur toute autre pratique. Chaque plan (`/speckit.plan`) vérifie sa conformité et justifie tout écart.
- Toute modification passe par une pull request qui explique la raison et l'impact, avec un numéro de version : majeur si un principe est retiré ou redéfini, mineur si un principe est ajouté, correctif pour une clarification.

**Version** : 1.0.0 · **Ratifiée le** : 2026-11-20

Le seuil d'erreur et le plafond de mémoire sont provisoires : ils seront revus quand le banc d'essai du français (004) et les premières mesures sur Windows existeront, avec un passage en 1.0.1.
