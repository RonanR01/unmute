# Publier une version de Tysta

Ce guide est pour le mainteneur. Une seule action GitHub construit Tysta pour Mac Apple Silicon, Mac Intel, Windows x64 et Linux x64, puis prépare un **brouillon** de version. Rien n'est publié tant que tu ne l'as pas relu.

## Les trois canaux

| Canal                 | Signature                   | Pour qui                       | Marquage                                            |
| --------------------- | --------------------------- | ------------------------------ | --------------------------------------------------- |
| `prerelease-unsigned` | aucune                      | quelques testeurs de confiance | préversion, « préversion non signée » dans le titre |
| `beta`                | Apple et Windows, notarisée | testeurs, version publique     | préversion                                          |
| `stable`              | Apple et Windows, notarisée | tout le monde                  | dernière version, celle de l'adresse fixe           |

Une version `stable` porte un numéro sans suffixe (`0.2.0`). Les deux autres canaux en exigent un (`0.2.0-beta.1`). Sous Windows, une version à suffixe ne contient que l'installeur `.exe` : le `.msi`, utile au déploiement par GPO, n'est produit que pour une version stable.

## Publier, pas à pas

1. Sur une branche à jour avec `main`, choisis le numéro et mets-le partout d'un coup :

   ```bash
   bun scripts/set-version.ts 0.1.0-beta.2
   ```

   Le script refuse un numéro qui ne dépasse pas le précédent.

2. Commite (`chore: release 0.1.0-beta.2`), fusionne dans `main` et pousse.
3. Dans GitHub, onglet **Actions** → **Release** → **Run workflow**. Choisis la branche `main` et le canal. Coche **dry-run** pour tout construire et contrôler sans créer de version.
4. Le workflow commence par cinq contrôles et s'arrête au premier qui échoue, avant toute construction :
   1. le numéro est le même dans les quatre fichiers ;
   2. le canal correspond au numéro ;
   3. la version n'existe pas encore ;
   4. pour `beta` et `stable`, tous les secrets de signature sont présents ;
   5. toutes les dépendances livrées ont une licence autorisée (`licenses-allowed.json`).
5. Compte environ une heure. À la fin, le brouillon contient les installeurs, `sbom-rust.cdx.json`, `sbom-interface.cdx.json` et `SHA256SUMS.txt`.
6. Dans **Releases**, ouvre le brouillon :
   - réécris les notes : le brouillon liste les messages de commit, à reformuler pour les utilisateurs ;
   - vérifie la liste des fichiers ;
   - publie.

Les fichiers construits restent aussi 7 jours dans l'exécution du workflow, même en `dry-run`.

### Après un échec

- **Un contrôle préalable échoue** : son message dit quoi corriger. Rien n'a été créé, relance après correction.
- **Une construction échoue** : le brouillon reste incomplet et n'est jamais publié. Supprime-le dans **Releases** (avec son étiquette, s'il en a une), corrige, puis relance. Le contrôle 3 refuse de relancer tant que le brouillon existe.
- **La notarisation Apple dépasse 90 minutes** : la construction Mac s'arrête. Le service d'Apple est parfois lent ; supprime le brouillon et relance plus tard.

## L'adresse fixe

`https://github.com/RonanR01/unmute/releases/latest` mène toujours à la dernière version **stable**. Les préversions et les bêtas n'y apparaissent pas. Tant qu'aucune stable n'existe, GitHub renvoie vers la liste des versions. L'application (lien des versions portables) et, plus tard, le site et les mises à jour automatiques (003) s'appuient sur cette adresse. Les noms des fichiers sont décrits dans [le contrat des fichiers](../specs/002-build-sign-release/contracts/release-assets.md).

## Les secrets de signature

Ils se créent dans **Settings → Secrets and variables → Actions → New repository secret**. Ils ne sont lus que par le workflow **Release**, que seul un mainteneur peut lancer. Ne les écris jamais dans le dépôt.

| Secret                       | Rôle                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`          | Certificat « Developer ID Application » exporté en `.p12`, encodé en base64               |
| `APPLE_CERTIFICATE_PASSWORD` | Mot de passe choisi à l'export du `.p12`                                                  |
| `KEYCHAIN_PASSWORD`          | N'importe quel mot de passe fort : il protège le trousseau temporaire de la machine de CI |
| `APPLE_ID`                   | Adresse du compte Apple Developer                                                         |
| `APPLE_PASSWORD`             | Mot de passe d'application créé sur account.apple.com (pas le mot de passe du compte)     |
| `APPLE_TEAM_ID`              | Identifiant d'équipe à 10 caractères, visible dans le compte Apple Developer              |
| `ES_USERNAME`                | Identifiant du compte SSL.com                                                             |
| `ES_PASSWORD`                | Mot de passe du compte SSL.com                                                            |
| `ES_CREDENTIAL_ID`           | Identifiant du certificat dans eSigner                                                    |
| `ES_TOTP_SECRET`             | Secret TOTP d'eSigner (la clé de la double authentification, pas un code à six chiffres)  |

### Obtenir le certificat Apple

1. Inscris-toi au programme Apple Developer à ton nom (99 $ par an).
2. Dans **Certificates, Identifiers & Profiles**, crée un certificat **Developer ID Application**.
3. Installe-le dans le Trousseau de ton Mac, exporte-le en `.p12` avec un mot de passe, puis encode-le :

   ```bash
   base64 -i certificat.p12 | pbcopy
   ```

4. Crée un mot de passe d'application pour la notarisation sur account.apple.com → **Connexion et sécurité**.

Le certificat vaut cinq ans. Pour le renouveler, crée-en un nouveau, puis remplace `APPLE_CERTIFICATE` et `APPLE_CERTIFICATE_PASSWORD`.

### Obtenir le certificat Windows

Un particulier en France ne peut pas utiliser le service de signature de Microsoft, réservé aux particuliers des États-Unis et du Canada. Tysta utilise donc un certificat de signature de code **au nom d'un particulier** chez SSL.com, avec la signature dans le nuage **eSigner**, qui fonctionne depuis la CI sans clé USB.

1. Commande un certificat de signature de code à validation individuelle chez SSL.com et passe la vérification d'identité. Vérifie le tarif et le délai au moment de l'achat.
2. Inscris le certificat à eSigner. Note l'identifiant du certificat (`ES_CREDENTIAL_ID`).
3. À l'inscription à la double authentification, garde la **clé secrète** du QR code : c'est `ES_TOTP_SECRET`. Elle permet à la CI de produire les codes elle-même.

La signature passe par `scripts/ci/sign-windows.ps1`. Pour changer de fournisseur, il suffit de modifier ce script et `src-tauri/tauri.sign-windows.conf.json`. Au renouvellement, mets à jour `ES_CREDENTIAL_ID` si l'identifiant change.

## Passer d'un éditeur personnel à une structure

Les versions sont aujourd'hui signées à ton nom. Pour passer à une société ou une association :

- **macOS** : Apple peut convertir un compte individuel en compte d'organisation, en gardant le même identifiant d'équipe. Les autorisations déjà données par les utilisateurs (Accessibilité, micro) restent valables. Il faut ensuite un nouveau certificat Developer ID au nom de la structure.
- **Windows** : il faut un nouveau certificat au nom de la structure (validation d'organisation). La réputation SmartScreen repart de zéro pour le nouvel éditeur.

Dans les deux cas, seuls les secrets changent, pas les workflows.

## Mises à jour automatiques

Tant que la fonctionnalité 003 n'est pas faite, aucune version ne contient de fichier de mise à jour automatique, et la clé de mise à jour de Handy n'est jamais utilisée.
