# Géoportail minier de la province du Kasaï

Application statique en français avec Leaflet 1.9.4 intégré. Les filtres portent sur l’unité administrative, le statut du fichier cadastral, l’échéance, le type et la période de délivrance. La recherche couvre le code, le titulaire et les substances.

## Démarrer en local

Depuis le dossier de ce README, lancer `python3 -m http.server 8000 --bind 127.0.0.1` sur Mac ou `python -m http.server 8000 --bind 127.0.0.1` sur Windows, puis ouvrir [le géoportail local](http://127.0.0.1:8000/). Le fond OpenStreetMap nécessite une connexion Internet. Les bibliothèques et les couches cadastrales sont servies localement.

Pour un double-clic dans Safari ou Chrome, utiliser le fichier autonome `Geoportail-Kasai.html` du dossier parent. Il contient déjà les couches et le code. L’ouverture directe de l’ancien `index.html` via `file://` bloquait le chargement des modules et des GeoJSON. La version actuelle redirige ce mode d’ouverture vers le fichier autonome si les dossiers conservent leur structure. Le service de tuiles OpenStreetMap exige un référent HTTP pour les pages web. Le fichier autonome ouvert via `file://` affiche les couches intégrées.

Si seul le fichier autonome est copié sur le Mac, lancer le même serveur depuis le dossier contenant ce fichier, puis ouvrir [le fichier autonome via HTTP](http://127.0.0.1:8000/Geoportail-Kasai.html) pour activer le fond OpenStreetMap.

## Exporter une carte

Ouvrir **Créer une carte**, cliquer sur **Sélectionner une zone**, puis placer quatre points dans l’ordre du contour. La ligne de prévisualisation suit le pointeur et la boucle se ferme au quatrième point. Les exports découpent la carte selon le polygone obtenu. Sans sélection, l’export utilise la vue affichée. **PNG HD** et **PDF** téléchargent une carte avec le nord, l’échelle, le titre, la légende des couches actives et les attributions. Les filtres et les couches actives s’appliquent. Le PDF est une page A4 contenant la carte en haute définition. Le fond OSM reprend les tuiles chargées au niveau de zoom courant. Zoomer avant de sélectionner pour obtenir davantage de détail du fond. Le portail n’effectue aucun téléchargement de tuiles supplémentaire pour l’export. [Politique d’utilisation des tuiles OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/)

Pour ajouter la légende cadastrale à la carte exportée, cliquer sur le carré minier, puis sur **Inclure la fiche dans la carte**. La fiche reprend les attributs du dossier source. Le crédit « Édité par Wilfrid Lutete » figure sur les deux formats.

## Provenance des données

| Couche | Source et traitement |
| --- | --- |
| Permis | Shapefile fourni `PERIMETRE/PERIMETRE.shp`, WGS 84. Intersection avec chaque unité administrative du Kasaï, conservation des champs du dossier et normalisation des dates. L'identifiant technique vient du numéro d'entité du shapefile. Les surfaces et références sources décrivent le dossier d'origine. Cliquer sur un permis pour ouvrir sa fiche. |
| Unités | Référentiel Géographique Commun et OCHA RDC, geoBoundaries COD ADM2, millésime 2019, identifiant COD-ADM2-63176286, CC BY 3.0 IGO. Extraction des unités des deux provinces. |
| Provinces | Union géométrique des unités sélectionnées. Les limites correspondent au référentiel de 2019. |
| Cours d’eau | HydroRIVERS v1.0 et tronçons nommés OpenStreetMap (ODbL), découpés aux mêmes limites. Les noms disponibles apparaissent au survol et les principaux sont affichés sur la carte. Les exports placent les étiquettes qui tiennent dans le cadrage. |
| Localités | [GeoNames](https://www.geonames.org/about.html), CC BY. Points habités de l’extrait national CD situés dans les unités du portail, hors lieux historiques, abandonnés et sections de localités. Les chefs-lieux provinciaux sont étiquetés. |
| Satellite Esri HD | [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9), fond par défaut via HTTP ou HTTPS. Les images et leur résolution varient suivant le lieu. Les attributions du service sont incluses dans les cartes exportées. |
| Satellite NASA | [NASA Earthdata / GIBS](https://nasa-gibs.github.io/gibs-api-docs/access-basics/), Landsat WELD, composite annuel 2000 en fausses couleurs via WMTS. Zoom natif jusqu’au niveau 12, puis agrandissement. |

Le statut cadastral est lu tel quel. La couleur représente l’échéance calendaire au jour courant en RDC, selon `Expiry_D`. Une date future ne suffit pas à confirmer un droit valide. Une date passée ne renseigne pas sur un éventuel renouvellement. Les dates absentes, non reconnues ou sentinelles de 1900 sont affichées comme non renseignées. La date d’extraction cadastrale n’est pas fournie. La carte ArcGIS de référence contient notamment des couches intitulées « Droit actif Juillet 2023 » et « Droit octroyés Juillet 2023 ». Le portail tire ses permis du fichier fourni.

Le code du portail relève de la licence MIT et Leaflet de sa licence BSD 2 clauses. La licence des fichiers cadastraux n’a pas été fournie. Avant un dépôt public, confirmer les droits de redistribution sur `data/permis.geojson` ou déployer avec une source cadastrale autorisée. Les clauses des autres sources continuent de s’appliquer. [OCHA](https://data.humdata.org/dataset/drc-administrative-boundaries-levels-0-2) · [geoBoundaries](https://www.geoboundaries.org/api/current/gbOpen/COD/ADM2/) · [HydroRIVERS](https://www.hydrosheds.org/products/hydrorivers)

## GitHub Pages et GeoServer

| Critère | GitHub Pages | GeoServer |
| --- | --- | --- |
| Rôle | Publie l’interface et les instantanés GeoJSON du dépôt | Publie les couches comme services cartographiques et vectoriels |
| Filtres | Exécutés dans le navigateur | WFS permet les requêtes normalisées sur les entités et les attributs |
| Maintenance | Mise à jour des fichiers du dépôt | Serveur à administrer, avec PostGIS pour des mises à jour régulières |
| Interopérabilité | GeoJSON RFC 7946 à télécharger | WMS 1.3.0 pour les cartes, WFS 2.0.0 pour les entités, OGC API Features si l’extension compatible est installée |

L’architecture proposée utilise **GitHub pour le code**, **GitHub Pages pour l’interface** et **GeoServer pour les services OGC**. Les fichiers GeoJSON locaux permettent de démarrer avec Pages seul. Publier `index.html`, `style.css`, `app.js`, `cartographie.js`, `vendor/` et les données autorisées depuis la racine du dépôt ou un artefact Pages. Le modèle d’URL du fournisseur de tuiles peut être configuré avec une balise `meta` nommée `osm-tiles` si nécessaire. [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) · [Services GeoServer](https://docs.geoserver.org/main/en/user/services/index.html)

### Publier les couches OGC

1. Importer les quatre GeoJSON dans PostGIS avec GDAL. Utiliser des tables WGS 84, des dates ISO sous forme de texte et un type multi homogène, par exemple `ogr2ogr -f PostgreSQL PG:service=kasai data/permis.geojson -nln permis -nlt PROMOTE_TO_MULTI -fieldTypeToString Date,DateTime -lco GEOMETRY_NAME=geom`. Répéter avec les tables `provinces`, `unites` et `cours_eau`. Le service PostgreSQL est défini séparément.
2. Créer un espace de travail `kasai` dans GeoServer, ouvrir l’entrepôt PostGIS, puis publier chaque table avec le SCR déclaré EPSG:4326. Remplir les titres, attributions et emprises des couches. Utiliser HTTPS et attribuer à GeoServer un compte PostGIS de lecture.
3. Vérifier les documents de capacités sur `/geoserver/kasai/wms?service=WMS&version=1.3.0&request=GetCapabilities` et `/geoserver/kasai/wfs?service=WFS&version=2.0.0&request=GetCapabilities`. Tester un GetMap et un GetFeature sur chaque couche, y compris depuis QGIS. Pour une validation de conformité du déploiement, utiliser les tests OGC applicables. [OGC Validator](https://cite.opengeospatial.org/teamengine/)
4. Pour brancher le portail sur GeoServer, le paramètre `?wfs=https://serveur/geoserver/kasai/wfs` active la lecture WFS 2.0 des tables `kasai:provinces`, `kasai:unites`, `kasai:permis` et `kasai:cours_eau` avec les mêmes attributs. Autoriser par CORS l’origine de l’interface. Vérifier les résultats, les détails et l’export avec cette URL.

## Régénérer l’instantané

Enregistrer les sources suivantes à côté de `scripts/preparer.py`. Conserver le shapefile fourni dans le dossier frère `PERIMETRE/`.

- [Limites ADM2](https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/COD/ADM2/geoBoundaries-COD-ADM2.geojson) sous `adm2-source.geojson`.
- [HydroRIVERS Afrique](https://data.hydrosheds.org/file/hydrorivers/HydroRIVERS_v10_af_shp.zip) sous `rivers-source.zip`.
- [GeoNames RDC](https://download.geonames.org/export/dump/CD.zip) sous `geonames-source.zip`.
- Extraire via [Overpass](https://overpass-turbo.eu/) les lignes nommées et enregistrer la réponse JSON sous `osm-source.json`. Requête `[out:json][timeout:60];way["waterway"~"^(river|stream|canal)$"]["name"](-7.6,19.2,-2,23.5);out geom;`.

Exécuter `python scripts/preparer.py` avec GDAL et Shapely 2. Sous Windows, l’environnement Python livré avec QGIS 3.34 peut être utilisé via `python-qgis.bat`. Les archives sources sont ignorées par Git.
