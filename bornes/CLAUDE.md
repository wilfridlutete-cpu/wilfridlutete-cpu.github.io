# Contexte du projet pour Claude

Projet : carte publique et gratuite des bornes de recharge pour véhicules électriques en Belgique (Bruxelles, Flandre, Wallonie).
En ligne : https://wilfridlutete-cpu.github.io/bornes/ (dossier bornes/ du dépôt du portfolio).

## Règles
- Tout reste gratuit et sans serveur : site statique sur GitHub Pages, collecte par GitHub Actions.
- Pas de clé d'API dans le code publié. Une clé éventuelle (Open Charge Map…) va dans les *Secrets* GitHub et n'est utilisée que par le script de collecte.
- Données OSM sous ODbL : la mention « © contributeurs OpenStreetMap » reste visible sur la carte.
- Pas de données copiées depuis Google Maps, Chargemap ou electrify.brussels (conditions d'utilisation) : les liens Google Maps (itinéraire, Street View) sont de simples liens sortants.
- Interface en français ; une version néerlandaise est prévue (fichier de traduction, pas de duplication de la page).
- `index.html` reste un seul fichier sans étape de build. Bibliothèques chargées depuis unpkg, versions figées
  (leaflet 1.9.4, leaflet.markercluster 1.5.3, leaflet.heat 0.2.0).
- Le script `scripts/fetch_bornes.py` n'utilise que la bibliothèque standard Python.
- Ne jamais écraser `data/` par une collecte incomplète (garde-fou : moins de 1 000 bornes OSM = échec).

## Sources de données (`scripts/fetch_bornes.py`)
1. Bruxelles Mobilité, couche WFS `bm_equipment:evse` (registre officiel, prioritaire à Bruxelles).
   Repli hors ligne : `sources/evse_bruxelles.csv` (Lambert 2008, EPSG:3812, converti sans dépendance).
   Le champ `power` est une tension en volts : la puissance en kW est estimée (puissance_estimee = true).
2. Flandre, WFS MOW `beleid:laadpunten_public` (facultatif, champs repérés par mots-clés).
3. OpenStreetMap via Overpass, toute la Belgique. Une borne OSM à moins de 40 m d'une borne officielle est un doublon :
   elle est écartée mais complète la borne officielle (nom, horaires, tarif…).
`python scripts/fetch_bornes.py --hors-ligne` reconstruit `data/` pour Bruxelles seulement, depuis la copie locale.

## Schéma d'une borne (`data/bornes.geojson`, propriétés)
source (Bruxelles Mobilité | OpenStreetMap | Vlaanderen (MOW)), osm_id (vide si absent d'OSM), ref (identifiant officiel),
type_lieu (Voirie | Parking | Parking couvert | Parking souterrain | Autre | ""), puissance_estimee (booléen),
vehicules (liste : Voiture, Vélo, Poids lourd), nom, operateur (texte OSM brut), reseau (opérateur regroupé : TotalEnergies, ENGIE Vianeo…),
region (Bruxelles-Capitale | Flandre | Wallonie), commune (commune administrative OSM, sinon addr:city ; pour une borne officielle, celle de la borne OSM la plus proche), adresse,
puissance_kw (nombre ou null), classe (lente | acceleree | rapide | ultra | inconnue), courant (AC | DC | ""),
prises (liste), points, payant (oui | non | ""), tarif (tag charge), paiement (liste : Carte bancaire, Application,
Badge RFID, Sans identification), stationnement_payant (oui | non | ""), acces, horaires, h24 (booléen), verifie_le.
Le fichier publié omet les propriétés vides ou par défaut ; la page les recrée (fonction upgrade).
Le regroupement des opérateurs (liste RESEAUX) existe en double : script Python et index.html. Les garder identiques.

## Seuils de puissance
lente < 22 kW ≤ accélérée < 50 kW ≤ rapide < 150 kW ≤ ultra-rapide. DC = prise CCS/CHAdeMO/Tesla ou ≥ 50 kW.

## Vues de la page
Carte (points colorés par vitesse, regroupés), Trajet et recharge (planificateur), Densité (carte de chaleur), Statistiques (barres), Liste (triable, distance).
Fonds de plan : OSM, satellite Esri, CARTO clair et sombre.
Couleurs : vert forêt (#0d3b2e, structure et texte) et vert feuille (#3ccf7a, actions) pour l'énergie propre ; ambre (#f2b632) réservé à l'ultra-rapide.
Régions : boutons Toute la Belgique / Bruxelles / Flandre / Wallonie (zoom sur la région). Barre de recherche : une adresse (Nominatim, repli Photon/komoot ; bulle « Itinéraire et recharge jusqu'ici ») ou un trajet
(« Ixelles → Namur », « Ixelles - Namur », « de Bruxelles à Liège », « … vers … ») qui ouvre l'onglet Trajet et lance le calcul (fonction lireTrajet).
Clic sur une borne : zoom + fiche ; « Vue 3D de la rue » ouvre MapLibre GL 4.7.1 (unpkg, chargé à la demande) avec le style
OpenFreeMap « liberty » (bâtiments en relief, gratuit, sans clé) et l'imagerie Esri en option.

## Trajet et recharge (onglet « Trajet et recharge »)
- Itinéraire : OSRM public (router.project-osrm.org, gratuit, sans clé) ; géocodage : chercherLieu (Nominatim, puis Photon si échec).
- Bornes candidates : à moins de « écart max. » km de la route (projection locale, polyligne simplifiée à 150 m),
  accès non privé, véhicule Voiture, atteignables avant la réserve choisie.
- Trois catégories selon la puissance de la borne : rapide ≥ 50 kW, moyenne 22–49 kW, lente < 22 kW (inconnue : DC → 50 kW, sinon 11 kW).
- Prix, dans l'ordre : `payant = non` → gratuit ; tag OSM `charge` lisible (fonction lireTarif) ; PRIX_OPERATEUR (tarifs publics connus) ;
  sinon prix de référence par classe, réglables dans le formulaire.
- Durée : énergie / (min(puissance borne, puissance voiture) × 0,8 en DC ou 0,92 en AC). Énergie facturée = énergie batterie × 1,07.
- Classement : coût + (durée de charge + détour) × valeur du temps (€/h). Un premier choix et deux autres par catégorie.
- Pas de connexion directe à la voiture (API constructeur = clé secrète + serveur, contraire aux règles). Niveau de batterie saisi à la main
  ou passé dans l'URL : `?batterie=45&depart=…&arrivee=…&vehicule=vw-id3`. Réglages mémorisés en localStorage (`bornes-trajet`).

## Vérifier un changement
1. `python scripts/fetch_bornes.py` se termine sans erreur et affiche un total par région.
2. `python -m http.server 8000`, ouvrir http://localhost:8000 : la carte s'affiche, les filtres changent le compteur, une fenêtre s'ouvre au clic, les 5 onglets fonctionnent ; l'onglet Trajet calcule un trajet (ex. `?batterie=15&depart=Bruxelles&arrivee=Namur`).
3. Tester aussi en largeur mobile (environ 400 px).
