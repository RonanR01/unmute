# Feature Specification: Build, signature et publication

**Feature Branch**: `002-build-sign-release`

**Created**: 2026-11-20

**Status**: Draft

**Input**: User description: "Build, signature et publication de Tysta. Chaque version de Tysta est construite automatiquement pour macOS, Windows et Linux, signée (Apple Developer ID et notarisation sur macOS, Authenticode sur Windows), reproductible depuis la CI, accompagnée de notes de version et publiée à un emplacement de téléchargement stable. Une bêta est visée sur Mac, Windows et Linux. Les workflows hérités de Handy sont présents mais pas adaptés ; il manque les certificats Apple et Windows propres à Tysta et un emplacement de téléchargement. Une liste des composants (SBOM) est produite à chaque version et les licences des dépendances sont compatibles avec un usage commercial. Les mises à jour automatiques (003) et la page de téléchargement du site sont hors périmètre mais s'appuieront sur cet emplacement."

## Contexte

Aujourd'hui, le dépôt de Tysta contient les chaînes de construction héritées de Handy. Elles visent les comptes de signature de Handy (Apple et Azure), nomment les fichiers « handy » et n'ont jamais publié de version de Tysta : le dépôt n'a ni version publiée ni secret de signature. Une version de Tysta ne peut donc être obtenue qu'en la construisant soi-même.

## Clarifications

### Session 2026-11-20

- Q: Sous quel nom Tysta est-il signé sur macOS et Windows ? → A: Le mainteneur, à titre personnel. Un passage ultérieur à une structure dédiée est prévu : sur macOS par conversion du compte Apple (même identifiant d'équipe, les autorisations des utilisateurs sont conservées), sur Windows par un nouveau certificat.
- Q: Que fait-on de la bêta tant que les certificats manquent ? → A: Des préversions non signées, clairement marquées comme telles, pour quelques testeurs de confiance. Toute version publique reste soumise à la signature obligatoire.
- Q: Quelles plateformes la bêta couvre-t-elle ? → A: Mac Apple Silicon et Intel, Windows x64, Linux x64 (deb, rpm, AppImage). Les variantes ARM pour Windows et Linux sont repoussées jusqu'à ce qu'on puisse les tester.
- Q: Quel numéro porte la première version de Tysta ? → A: La numérotation repart à 0.1.0 ; les préversions et bêtas portent un suffixe (0.1.0-beta.1, 0.1.0-beta.2…).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Publier une version en une action (Priority: P1)

Le mainteneur décide de publier une version. Il lance la publication en une seule action. Sans autre intervention, il obtient un brouillon de version qui contient les installeurs pour macOS, Windows et Linux, les notes de version et la liste des composants. Il relit le brouillon puis le publie.

**Why this priority**: sans cela, aucune bêta n'est possible. C'est la base de tout le reste (signature, mises à jour, page de téléchargement).

**Independent Test**: lancer la publication d'une version de test et vérifier que le brouillon contient un installeur par plateforme, nommé Tysta, qui s'installe et démarre.

**Acceptance Scenarios**:

1. **Given** le numéro de version a été augmenté dans le dépôt, **When** le mainteneur lance la publication, **Then** un brouillon de version portant ce numéro est créé avec les installeurs de chaque plateforme prise en charge.
2. **Given** la construction échoue sur une plateforme, **When** les autres plateformes réussissent, **Then** le brouillon n'est pas publié automatiquement et l'échec est visible avec la plateforme en cause.
3. **Given** un brouillon existe déjà pour ce numéro, **When** le mainteneur relance la publication, **Then** il est averti au lieu d'obtenir une seconde version en double.

---

### User Story 2 - Installer Tysta sans alerte de sécurité (Priority: P1)

Un testeur de la bêta télécharge Tysta sur un Mac ou un PC Windows. L'installation se déroule sans message indiquant un développeur non identifié ou une application potentiellement dangereuse, et le système affiche l'éditeur de Tysta.

**Why this priority**: une application de dictée demande l'accès au micro et à l'accessibilité. Une alerte de sécurité à l'installation fait fuir les testeurs et bloque tout déploiement par une DSI (principe V).

**Independent Test**: installer la version publiée sur un Mac et un PC Windows neufs et vérifier qu'aucune alerte d'éditeur inconnu n'apparaît et que l'éditeur affiché est celui de Tysta.

**Acceptance Scenarios**:

1. **Given** un Mac à jour avec les réglages de sécurité par défaut, **When** le testeur ouvre l'installeur téléchargé, **Then** Tysta s'installe et s'ouvre sans alerte « développeur non identifié » ni manipulation dans les réglages.
2. **Given** un PC Windows à jour, **When** le testeur lance l'installeur, **Then** l'éditeur affiché est celui de Tysta et non « éditeur inconnu ».
3. **Given** un installeur Linux, **When** le testeur télécharge ses empreintes, **Then** il peut vérifier que le fichier n'a pas été modifié.
4. **Given** les secrets de signature ne sont pas configurés, **When** la publication d'une version publique est lancée, **Then** elle s'arrête avant de créer des installeurs non signés, avec un message qui nomme le secret manquant.
5. **Given** les secrets de signature ne sont pas configurés, **When** le mainteneur lance explicitement une préversion non signée, **Then** les installeurs sont produits, la version est marquée préversion non signée dans son titre, son nom de fichier et ses notes, et elle n'est jamais présentée comme dernière version.

---

### User Story 3 - Savoir ce que contient une version (Priority: P2)

Un testeur ou une DSI consulte une version publiée. Il y trouve des notes de version en français qui disent ce qui change, et une liste des composants avec leurs licences.

**Why this priority**: exigé par le principe V pour une évaluation par une DSI, mais une bêta reste utilisable sans.

**Independent Test**: ouvrir une version publiée et vérifier la présence des notes de version et d'une liste des composants lisible par un outil standard.

**Acceptance Scenarios**:

1. **Given** une version publiée, **When** on l'ouvre, **Then** elle contient des notes de version en français rédigées pour les utilisateurs.
2. **Given** une version publiée, **When** on télécharge sa liste des composants, **Then** elle couvre les composants du cœur et de l'interface avec leur version et leur licence.
3. **Given** une dépendance porte une licence incompatible avec un usage commercial, **When** la publication est lancée, **Then** elle s'arrête et nomme la dépendance et sa licence.

---

### User Story 4 - Télécharger la dernière version à une adresse fixe (Priority: P2)

Le site, la documentation ou un administrateur pointent vers une adresse qui donne toujours la dernière version publiée, par plateforme, sans être mise à jour à chaque version.

**Why this priority**: la page de téléchargement du site et les mises à jour automatiques (003) s'appuient dessus, mais la bêta peut démarrer avec un lien direct vers la version.

**Independent Test**: publier deux versions successives et vérifier que l'adresse fixe mène à la plus récente pour chaque plateforme.

**Acceptance Scenarios**:

1. **Given** deux versions publiées, **When** on suit l'adresse fixe de la dernière version, **Then** on obtient la plus récente.
2. **Given** une version marquée bêta, **When** on suit l'adresse fixe de la version stable, **Then** on n'obtient pas la bêta.

### Edge Cases

- Le certificat Apple ou Windows expire : la publication échoue avant de produire des installeurs, avec un message qui le dit, au lieu de publier des fichiers non signés.
- La notarisation Apple tarde ou échoue : la publication attend dans une limite raisonnable puis échoue clairement, sans publier l'installeur macOS non notarisé.
- Une construction réussit sur une plateforme et échoue sur une autre : le brouillon garde ce qui a réussi, n'est pas publié, et la relance ne refait que ce qui manque ou repart proprement.
- Le numéro de version n'a pas été augmenté : la publication refuse de recréer une version qui existe déjà.
- Des contributions externes (demandes de fusion) déclenchent des constructions : elles n'ont jamais accès aux secrets de signature.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Le mainteneur DOIT pouvoir lancer la publication d'une version en une seule action, depuis le dépôt.
- **FR-002**: La publication DOIT produire des installeurs pour macOS (Apple Silicon et Intel), Windows x64 et Linux x64 (deb, rpm et AppImage). Les variantes Windows ARM64 et Linux ARM64 ne sont pas publiées tant qu'aucune machine ne permet de les tester.
- **FR-003**: Chaque installeur et chaque fichier publié DOIT porter le nom Tysta et le numéro de version ; aucun ne DOIT porter le nom Handy.
- **FR-004**: Sur macOS, l'application DOIT être signée avec l'identité d'éditeur de Tysta et notarisée par Apple.
- **FR-005**: Sur Windows, l'installeur et l'exécutable DOIVENT être signés avec l'identité d'éditeur de Tysta. Aucune référence au compte de signature de Handy ne DOIT subsister.
- **FR-006**: Les fichiers Linux DOIVENT être accompagnés de leurs empreintes, pour qu'on puisse vérifier leur intégrité.
- **FR-007**: La publication d'une version publique (bêta ou stable) DOIT échouer, sans rien publier, si un secret de signature manque ou si une signature ou une notarisation échoue.
- **FR-007b**: Le mainteneur DOIT pouvoir produire, sur demande explicite, une préversion non signée destinée à quelques testeurs. Elle est marquée « non signée » dans son titre, ses noms de fichiers et ses notes, ne devient jamais la dernière version et ses notes expliquent comment l'ouvrir malgré l'alerte du système.
- **FR-008**: Une version DOIT être créée à l'état de brouillon ; seul le mainteneur la rend publique.
- **FR-009**: Chaque version DOIT contenir des notes de version en français, préparées à partir des changements depuis la version précédente et relues par le mainteneur avant publication.
- **FR-010**: Chaque version DOIT contenir une liste des composants (SBOM) dans un format standard, qui couvre le cœur et l'interface.
- **FR-011**: La publication DOIT échouer si une dépendance porte une licence absente de la liste des licences autorisées pour un usage commercial.
- **FR-012**: Une version DOIT pouvoir être marquée bêta ; une bêta n'est jamais présentée comme la dernière version stable.
- **FR-013**: Une adresse fixe DOIT toujours mener à la dernière version stable publiée.
- **FR-014**: Une version DOIT être reconstruite depuis le dépôt et l'étiquette de la version, sans étape manuelle sur une machine personnelle et sans réutiliser de résultats de construction en cache.
- **FR-015**: Les constructions déclenchées par des contributions externes NE DOIVENT JAMAIS avoir accès aux secrets de signature.
- **FR-016**: Les secrets de signature nécessaires DOIVENT être documentés (nom, rôle, comment les obtenir et les renouveler), sans jamais être écrits dans le dépôt.
- **FR-017**: La signature des mises à jour automatiques NE DOIT PAS utiliser la clé de Handy ; tant que 003 n'est pas fait, aucun fichier de mise à jour n'est publié.
- **FR-018**: La numérotation de Tysta DOIT repartir à 0.1.0, indépendamment de celle de Handy, et ne jamais redescendre. Une préversion ou une bêta porte un suffixe de préversion ; le même numéro est affiché par l'application, les fichiers et l'étiquette de la version.

### Key Entities

- **Version** : un numéro, un état (brouillon, préversion non signée, bêta, stable), une date, des notes de version, des installeurs par plateforme, une liste des composants et des empreintes.
- **Installeur** : un fichier par plateforme et architecture, signé (macOS, Windows) ou accompagné de son empreinte (Linux).
- **Identité d'éditeur** : le nom sous lequel Tysta est signé sur macOS et Windows, et les secrets qui permettent de signer.
- **Liste des licences autorisées** : les licences compatibles avec un usage commercial, contre lesquelles chaque dépendance est vérifiée.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Le mainteneur passe de la décision de publier à un brouillon complet en une seule action et sans intervention, en moins d'une heure.
- **SC-002**: Sur un Mac et un PC Windows à jour, 100 % des installations de la bêta se font sans alerte d'éditeur inconnu.
- **SC-003**: 100 % des versions publiées contiennent des notes de version en français, une liste des composants et des installeurs pour les trois systèmes.
- **SC-004**: Aucune version publiée ne contient de dépendance sous une licence non autorisée.
- **SC-005**: Un premier testeur sur chaque système installe et lance la bêta en moins de 5 minutes à partir de l'adresse de téléchargement.
- **SC-006**: Aucun fichier publié ne porte le nom Handy ni n'est signé par le compte de Handy.
- **SC-007**: Une préversion non signée peut être produite le jour même, sans attendre les certificats.

## Assumptions

- L'emplacement de téléchargement est la page des versions du dépôt GitHub de Tysta, qui est public. Son adresse « dernière version » sert d'adresse fixe. Un stockage chez Scaleway pourra le remplacer plus tard sans changer cette spécification.
- L'éditeur est le mainteneur à titre personnel : compte Apple Developer individuel, certificat de signature de code Windows au nom d'un particulier. Le changement d'éditeur ne DOIT PAS casser les mises à jour automatiques, qui reposent sur leur propre clé. Leur obtention (coût, délais de vérification) est une démarche du mainteneur, hors de cette spécification ; la publication se contente d'échouer clairement tant qu'ils manquent.
- Les variantes repoussées (Windows ARM64, Linux ARM64) restent constructibles plus tard sans changer cette spécification : il suffira de les réactiver une fois testables.
- La liste des licences autorisées part des licences permissives courantes (MIT, Apache 2.0, BSD, ISC, Zlib, MPL 2.0, Unicode, CC0) ; une exception se décide au cas par cas et se note dans le dépôt.
- La publication sur les magasins d'applications (Mac App Store, Microsoft Store) et les paquets de distributions (Flathub, AUR, Nix) sont hors périmètre.
- Les mises à jour automatiques (003) et la page de téléchargement du site sont hors périmètre ; elles s'appuieront sur l'adresse fixe.
