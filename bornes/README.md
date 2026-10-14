# Géoportail des bornes de recharge — Bruxelles et Belgique

Carte web libre et gratuite des bornes de recharge pour véhicules électriques, centrée sur Bruxelles
et couvrant toute la Belgique. Mise à jour automatique chaque nuit.

**Sources** : à Bruxelles, le registre officiel de **Bruxelles Mobilité** (1 752 sites, 8 257 points de charge) ;
en Flandre, le service public de la Région flamande quand il répond ; partout, **OpenStreetMap**.
Les doublons entre sources sont fusionnés automatiquement.

## Ce que fait le géoportail

**Quatre vues**
- **Carte** : chaque borne colorée selon sa vitesse de recharge, regroupée quand on dézoome.
- **Densité** : carte de chaleur pour repérer les zones bien ou mal équipées.
- **Statistiques** : bornes par opérateur, par vitesse, par prise, par commune, puissance moyenne par opérateur, moyens de paiement.
- **Liste** : tableau triable (puissance, opérateur, commune, distance) ; un clic place la borne sur la carte.

**Fonds de plan** : plan OpenStreetMap, vue satellite (Esri), clair et sombre (CARTO).

**Filtres**
- Vitesse de recharge (lente, accélérée, rapide, ultra-rapide) et curseur de puissance minimale (7 à 300 kW)
- Type de borne : courant AC ou DC, type de prise (Type 2, CCS, CHAdeMO, Tesla…)
- Opérateur (variantes regroupées : « TotalEnergies Charging Services » → TotalEnergies), région, commune, recherche libre
- Type de lieu (voirie, parking, parking couvert, souterrain), véhicule (voiture, vélo, poids lourd), source des données,
  puissance publiée seulement (sans estimation)
- Accès (public, clients, privé), recharge gratuite ou payante, ouverte 24 h/24, paiement par carte bancaire,
  2 points de charge ou plus, tarif affiché

**Autres outils** : boutons Bruxelles / Toute la Belgique, « Bornes autour de moi » (tri par distance),
export CSV des bornes filtrées, et dans chaque fiche des liens vers l'itinéraire Google Maps, Street View et OpenStreetMap.

## Contenu du dépôt

| Fichier | Rôle |
| --- | --- |
| `index.html` | Le géoportail. Un seul fichier, aucun serveur requis. |
| `scripts/fetch_bornes.py` | Collecte les bornes via l'API Overpass, rattache chaque borne à sa commune et écrit `data/`. Python 3.10+, sans dépendance. |
| `data/bornes.geojson`, `data/bornes.csv`, `data/stats.json` | Données générées. Livrées avec les bornes de Bruxelles : la carte fonctionne dès la mise en ligne. |
| `sources/evse_bruxelles.csv` | Copie du registre Bruxelles Mobilité, utilisée si son service en ligne ne répond pas. |
| `.github/workflows/mise-a-jour-donnees.yml` | Relance la collecte chaque nuit et publie les nouvelles données. |
| `OPERATEURS.md` | Les opérateurs présents à Bruxelles et le cadre des concessions. |
| `CLAUDE.md` | Contexte du projet pour Claude. |

## Mise en ligne en 5 minutes (GitHub Pages, gratuit)

1. Créez un compte sur github.com puis un dépôt **public**, par exemple `bornes-belgique`.
2. Envoyez ces fichiers dans le dépôt (bouton *Add file → Upload files*, en gardant les dossiers).
3. *Settings → Actions → General* : cochez **Read and write permissions**, puis *Save*.
4. Onglet *Actions* → **Mise à jour des données** → *Run workflow*. Attendez 5 à 15 minutes : le dossier `data/` apparaît.
5. *Settings → Pages* : *Source = Deploy from a branch*, branche `main`, dossier `/ (root)`.
   Le site est en ligne à `https://<votre-compte>.github.io/bornes-belgique/`.

## Tester sur votre ordinateur

```bash
python scripts/fetch_bornes.py     # crée data/ (5 à 15 minutes)
python -m http.server 8000         # puis ouvrez http://localhost:8000
```

Sans le dossier `data/`, la page interroge OpenStreetMap en direct, pour Bruxelles uniquement.

## À savoir sur la puissance affichée

Le registre bruxellois ne publie pas la puissance en kW (seulement la tension et le type de courant).
Pour ces bornes, la puissance est **estimée** (monophasé ≈ 7,4 kW, triphasé ≈ 22 kW, continu ≥ 50 kW) et affichée avec « ≈ ».
La case « Puissance publiée uniquement » masque ces estimations.

## Pourquoi pas Google Maps ou Chargemap ?

Google Maps, Chargemap et la carte d'electrify.brussels interdisent la copie de leurs données.
OpenStreetMap est sous licence libre (ODbL) : on peut les réutiliser, les publier et les corriger.
La couverture bruxelloise d'OSM est bonne mais pas complète ; chaque correction faite sur OSM apparaît ici le lendemain.

## Licences

- Code : MIT (voir `LICENSE`).
- Données : © contributeurs OpenStreetMap, licence ODbL 1.0 ; Bruxelles Mobilité (data.mobility.brussels) ;
  Departement Mobiliteit en Openbare Werken (Vlaamse overheid). Citez ces sources en cas de réutilisation.
- Imagerie satellite : © Esri et ses fournisseurs. Fonds clair et sombre : © CARTO.

## Corriger ou compléter les données

Une borne manque ou est fausse ? Modifiez-la sur [openstreetmap.org](https://www.openstreetmap.org)
(objet `amenity=charging_station`, avec si possible `operator`, `socket:*`, `socket:*:output`, `capacity`, `fee`,
`opening_hours` et `payment:*`). La correction apparaît sur la carte après la collecte suivante.
