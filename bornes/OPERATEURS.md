# Opérateurs de bornes de recharge à Bruxelles

Chiffres du registre officiel de **Bruxelles Mobilité** (couche `evse`, data.mobility.brussels),
copie du 14 octobre 2026 : **1 752 sites, 8 257 points de charge, 59 opérateurs**.
Le géoportail recalcule ces chiffres chaque nuit (onglet *Statistiques*).

## Le cadre bruxellois

- **electrify.brussels** : programme de la Région de Bruxelles-Capitale. Objectif de 22 000 points de recharge
  accessibles au public d'ici 2035.
- **Sibelga** organise les concessions de bornes en voirie, sous le contrôle de Bruxelles Environnement,
  Bruxelles Mobilité et BRUGEL (régulateur).
- Concessions en voirie : **TotalEnergies** (réseau historique, ex-Pitpoint, et jusqu'à 2 000 points ajoutés en 2024-2025)
  et **ENGIE Vianeo** (835 bornes, soit 1 640 points, attribuées en mars 2026 ; déploiement en cours).

## Tous les opérateurs du registre

« Sites » = emplacements ; « Points » = points de charge ; « DC » = sites avec recharge rapide en courant continu.

| Opérateur | Sites | Points | DC |
| --- | ---: | ---: | ---: |
| EnergyVision | 823 | 1759 | 2 |
| TotalEnergies | 423 | 935 |  |
| Blue Corner | 69 | 320 | 1 |
| Mobiflow | 40 | 785 | 3 |
| D’Ieteren Energy | 38 | 181 |  |
| EZ Charge | 31 | 244 | 2 |
| Mobility Plus | 25 | 528 | 3 |
| Allego | 23 | 292 | 6 |
| Interparking | 21 | 658 |  |
| Blink Charging | 18 | 428 |  |
| EVBox | 18 | 76 |  |
| DATS 24 (Colruyt) | 16 | 51 | 2 |
| Optiload | 15 | 32 | 4 |
| Non renseigné | 14 | 243 | 1 |
| E-Flux | 13 | 103 | 1 |
| Tesla | 12 | 34 | 1 |
| Electra | 11 | 71 | 11 |
| Shell Recharge | 11 | 110 | 6 |
| 50five | 10 | 128 |  |
| Eneco | 9 | 89 |  |
| Lidl | 7 | 33 | 1 |
| ENGIE Vianeo | 6 | 75 | 1 |
| ChargePoint | 6 | 14 | 1 |
| NUMOBI | 6 | 50 |  |
| PluginCompany | 6 | 29 |  |
| Certipower | 6 | 31 | 1 |
| Pluginvest | 5 | 44 |  |
| Smappee | 5 | 12 |  |
| emyon | 5 | 17 |  |
| Spirii | 5 | 27 | 5 |
| EV-Point | 4 | 14 |  |
| Blulinc | 4 | 7 |  |
| EVECHARGE | 4 | 15 |  |
| Wattif | 3 | 13 |  |
| Luminus | 3 | 33 |  |
| Q8 | 3 | 54 |  |
| Optimile | 3 | 14 |  |
| Maxem Energy | 3 | 30 |  |
| Chargewell | 3 | 459 |  |
| Powerdot | 3 | 28 | 3 |
| Eranovum | 2 | 10 | 2 |
| Monta ApS | 2 | 7 |  |
| Go Watts | 2 | 36 |  |
| Volvo Charging | 1 | 6 | 1 |
| Powerland | 1 | 6 | 1 |
| Schneider Electric | 1 | 2 |  |
| DRIVECO | 1 | 4 | 1 |
| Robo Charge | 1 | 4 |  |
| Securex | 1 | 16 |  |
| E+DRIVE | 1 | 14 |  |
| Mobilize Power Solutions | 1 | 4 |  |
| Stroohm | 1 | 16 |  |
| CenEnergy | 1 | 12 |  |
| emosS | 1 | 15 |  |
| Electricea | 1 | 18 |  |
| Ecotap | 1 | 1 | 1 |
| PowerGo | 1 | 10 |  |
| Fastned | 1 | 8 | 1 |
| eCarUp AG | 1 | 2 |  |

Lecture rapide :
- **EnergyVision** et **TotalEnergies** exploitent à eux deux 71 % des sites (surtout des bornes en voirie de 2 points).
- Les grands parkings (**Interparking**, **Mobiflow**, **Mobility Plus**, **Blink**) ont peu de sites mais beaucoup de points.
- La recharge rapide (DC) est rare à Bruxelles : 62 sites, surtout **Electra**, **Allego**, **Shell Recharge**, **Spirii**.

## Ce que le registre ne publie pas

- **La puissance en kW** : le champ `power` contient une tension (230 V, 400 V, 1 000 V). Le géoportail estime
  la puissance d'après le type de courant (monophasé ≈ 7,4 kW, triphasé ≈ 22 kW, continu ≥ 50 kW) et l'affiche avec « ≈ ».
- **Les prix, les horaires et l'adresse** : ils sont repris d'OpenStreetMap quand la même borne y est cartographiée (moins de 40 m).

## Autres sources ajoutées au projet

- **Flandre** : service WFS du Departement MOW (`beleid:laadpunten_public`). Le script l'utilise s'il répond ;
  sinon la Flandre reste couverte par OpenStreetMap.
- **Wallonie** : pas de registre public des emplacements. ORES publie seulement des **comptages** de bornes déclarées
  (jeu « declarations_bornes_rechargement_formulaires_clients_mensuel », odwb.be, licence CC0) : 2 353 bornes publiques
  sur 27 685 déclarées. La Wallonie reste couverte par OpenStreetMap.

## Sources

- Bruxelles Mobilité, couche evse : https://data.mobility.brussels/geoserver/bm_equipment/wfs
- ENGIE Vianeo, communiqué du 18 mars 2026 : https://www.engie-vianeo.com/en/belgium/public-charging-stations-brussels/
- MobilityPlaza, 30 juillet 2024 (TotalEnergies) : https://portal-dev.mobilityplaza.org/news/2000-additional-totalenergies-charging-points-in-brussels
- BRUGEL, décisions 336 et 367 (concessions 2026) : https://brugel.brussels
- ORES / ODWB : https://www.odwb.be/explore/dataset/declarations_bornes_rechargement_formulaires_clients_mensuel/
