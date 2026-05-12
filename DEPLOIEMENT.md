# Guide de déploiement — NDF Scan sur GitHub Pages

Suis exactement la même procédure que pour ton repo `Scan-reception`.

## Étape 1 — Créer le repo sur GitHub

1. Va sur https://github.com/new
2. Owner : **pierrenarb**
3. Repository name : **ndf-scan**
4. Visibility : **Public** (obligatoire pour GitHub Pages gratuit)
5. Coche "Add a README file" → décoche pour éviter conflit, on en a déjà un
6. **Create repository**

## Étape 2 — Pousser les fichiers

### Option A — Via l'interface web GitHub (le plus simple)

1. Sur la page du nouveau repo vide, clique **"uploading an existing file"**
2. Glisse-dépose tous les fichiers du dossier `ndf-scan-repo/` :
   - `index.html`
   - `app.js`
   - `sw.js`
   - `manifest.webmanifest`
   - `NDF_VIERGE.xlsm`
   - `README.md`
   - `.gitignore`
   - le dossier `icons/` avec `icon-192.png` et `icon-512.png`
3. Commit message : "Initial commit — POC v0.3"
4. **Commit changes**

### Option B — Via Git en ligne de commande

```bash
cd ndf-scan-repo
git init
git add .
git commit -m "Initial commit — POC v0.3"
git branch -M main
git remote add origin https://github.com/pierrenarb/ndf-scan.git
git push -u origin main
```

## Étape 3 — Activer GitHub Pages

1. Dans le repo `ndf-scan`, va dans **Settings** (onglet en haut à droite)
2. Menu de gauche → **Pages**
3. Section "Build and deployment" :
   - Source : **Deploy from a branch**
   - Branch : **main** / **/(root)**
4. **Save**
5. Attends 1 à 2 minutes que GitHub déploie
6. L'URL apparaît en haut : `https://pierrenarb.github.io/ndf-scan/`

## Étape 4 — Tester sur ton téléphone

1. Ouvre `https://pierrenarb.github.io/ndf-scan/` dans Chrome (Android) ou Safari (iPhone)
2. Une bannière "Installer l'app" devrait apparaître
3. Installe-la sur l'écran d'accueil
4. Lance l'app, configure ta clé Google Vision (cf. README)
5. Scanne un premier ticket

## Étape 5 — Faire tester aux pilotes du siège

Une fois validé sur ton téléphone, envoie aux pilotes :
- L'URL : `https://pierrenarb.github.io/ndf-scan/`
- Instruction d'installation (cf. README, section "Installation sur téléphone")
- **Question importante** : leur clé Google Vision ?
  - **Option 1 (simple)** : chaque pilote crée sa propre clé (5 comptes Google séparés, chacun a son quota gratuit de 1000)
  - **Option 2 (centralisée)** : une seule clé Narbonne Accessoires, distribuée aux pilotes — quota partagé 1000 mais gestion plus simple

Je recommande l'option 1 pour le POC : zéro coordination, chacun installe en autonomie, et le quota est de 1000 × 5 = 5000 tickets/mois cumulés.

## Mises à jour ultérieures

Pour pousser une nouvelle version :

1. Modifie les fichiers en local
2. Dans `sw.js`, incrémente le numéro de version : `const CACHE_NAME = 'ndf-scan-v0.4';`
   (sinon les téléphones gardent l'ancienne version en cache)
3. Push sur GitHub (interface web ou `git push`)
4. GitHub Pages redéploie automatiquement en 1-2 minutes
5. Les utilisateurs récupèrent la mise à jour à la prochaine ouverture de l'app

## Vérifier que tout marche

Une fois en ligne, vérifie sur ordinateur (avant le téléphone) :

1. Ouvre `https://pierrenarb.github.io/ndf-scan/` dans Chrome
2. Ouvre la console développeur (F12) → onglet **Application** → **Service Workers**
3. Tu dois voir `sw.js` activé et "running"
4. Onglet **Manifest** → vérifier que l'icône et les couleurs s'affichent
5. Onglet **Network** → coche "Offline" puis recharge la page → l'app doit toujours fonctionner

Si quelque chose cloche, ouvre une issue sur le repo ou regarde l'onglet **Actions** de GitHub pour voir si le déploiement a échoué.
