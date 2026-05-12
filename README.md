# NDF Scan — Narbonne Accessoires

PWA de scan de tickets et factures pour générer automatiquement la note de frais Excel au format Narbonne Accessoires.

🌐 **App en ligne** : https://pierrenarb.github.io/ndf-scan/

## Fonctionnement

1. **Scanner** un ticket ou une facture avec l'appareil photo du téléphone
2. **Google Vision OCR** extrait le texte (gratuit jusqu'à 1000 scans/mois)
3. **Parsing automatique** : date, montant TTC, catégorie de dépense, marchand
4. **Vérification utilisateur** avant validation (toujours)
5. **Génération** d'un fichier `.xlsm` au format NDF officiel, formules et macros préservées

## Installation sur téléphone

### Android (Chrome)
1. Ouvre https://pierrenarb.github.io/ndf-scan/
2. Une bannière "Installer l'app" apparaît → tape dessus
3. (Sinon : menu Chrome ⋮ → "Ajouter à l'écran d'accueil")

### iPhone (Safari)
1. Ouvre https://pierrenarb.github.io/ndf-scan/ dans Safari (pas Chrome)
2. Bouton Partager 􀈂 → "Sur l'écran d'accueil"
3. L'icône apparaît comme une vraie app

Une fois installée, l'app fonctionne **hors-ligne** : tu peux scanner même sans réseau, les tickets sont mis en file d'attente et traités au retour de connexion.

## Configuration de la clé API Google Vision

Au premier lancement, l'app demande une clé API Google Cloud Vision. La clé est stockée uniquement sur ton téléphone.

### Comment obtenir une clé (10 minutes)

1. Va sur [console.cloud.google.com](https://console.cloud.google.com/)
2. Crée un projet "NDF-Scan-NarbAcc"
3. Menu → APIs & Services → **Library** → cherche "Cloud Vision API" → **Enable**
4. Menu → APIs & Services → **Credentials** → **+ CREATE CREDENTIALS → API Key**
5. Copie la clé qui s'affiche
6. Clique **Restrict key** → onglet API restrictions → coche uniquement "Cloud Vision API" → Save (important pour la sécurité)
7. Lie un compte de facturation (carte bancaire), **rien n'est débité tant que tu restes sous 1000 unités/mois**

Quota gratuit : 1000 scans / mois / compte, free tier permanent.

## Stack technique

- **Pas de backend** : tout côté navigateur (PWA)
- **OCR** : Google Cloud Vision API `DOCUMENT_TEXT_DETECTION`
- **Extraction structurée** : regex + heuristiques en JavaScript (0 coût)
- **Génération Excel** : SheetJS (lit le template `.xlsm`, écrit dans les cellules de saisie, préserve macros et formules)
- **Hors-ligne** : Service Worker + localStorage
- **Hébergement** : GitHub Pages

## Structure du repo

```
ndf-scan/
├── index.html              # UI de l'app
├── app.js                  # Logique applicative
├── sw.js                   # Service Worker (mode offline)
├── manifest.webmanifest    # Manifeste PWA (installation)
├── NDF_VIERGE.xlsm         # Template officiel Narbonne Accessoires
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

## Limites connues (POC v0.3)

- **5 dates maximum par NDF** (limite du template). Si plus de dates, l'app prévient avant export.
- **Pas de liste déroulante site service** : champ libre actuellement. À enrichir avec le référentiel ANALYTIQUE de SAGE.
- **Justificatifs non joints** au fichier Excel : ils restent stockés dans le navigateur. À envoyer séparément à la compta pour l'instant.
- **Parsing regex** : ~85% de bonne extraction sur tickets standards, à corriger manuellement sinon (l'app force toujours une vérification utilisateur avant validation).

## Roadmap

- [ ] Liste déroulante site service depuis référentiel analytique
- [ ] Multi-NDF auto si > 5 dates
- [ ] Joindre photos en pièces jointes du `.xlsm` ou export ZIP
- [ ] Synchronisation cloud (Drive partagé compta) optionnelle
- [ ] Statistiques mensuelles par utilisateur

## Sécurité

- Aucune donnée n'est envoyée à un serveur Narbonne Accessoires (pas de backend)
- Les images sont envoyées à Google Vision API uniquement (chiffré HTTPS)
- La clé API est stockée dans le `localStorage` du navigateur de chaque utilisateur
- Pour révoquer une clé : Google Cloud Console → Credentials → Delete

## Licence

Propriété de Narbonne Accessoires — usage interne.
