# Deezer Glass

[English](README.md) · **Français**

Un **visualiseur « now playing » en liquid glass pour Deezer**, sobre et soigné, sur Windows — inspiré du lecteur plein écran d'Apple Music. Il affiche la pochette du morceau en cours, un fond « caméléon » teinté d'après la pochette, les **paroles synchronisées** (karaoké), et — à la demande — le clip vidéo, le tout derrière un panneau de verre liquide spectaculaire.

> **Deezer Glass ne joue pas la musique.** Il reflète ce que Deezer joue déjà, en lisant le système « lecture en cours » de Windows (SMTC). Tu gardes les morceaux complets et ton app Deezer habituelle — Deezer Glass ne fait que rendre ça beau.

![Deezer Glass](docs/screenshot.png)

---

## Fonctionnalités

- **Verre liquide spectaculaire.** Un panneau de verre translucide et réfractif, avec un reflet spéculaire vivant, qui flotte au-dessus de la pochette.
- **Fond caméléon.** Les couleurs dominantes de la pochette sont extraites et pilotent le fond ambiant, la teinte du verre et l'accent — chaque morceau recolore tout l'écran, avec un fondu enchaîné au changement.
- **Paroles synchronisées (karaoké).** La ligne en cours est surlignée et défile automatiquement, en rythme avec le morceau. Les paroles sont récupérées **automatiquement à la meilleure source disponible** : **LRCLIB** pour les paroles synchronisées, avec repli sur **Genius** pour les paroles simples quand aucune version synchronisée n'existe.
- **Pochette en haute résolution.** La vignette basse résolution de Windows s'affiche instantanément, puis est remplacée par la pochette **1000×1000** issue de **l'API Deezer** (repli **iTunes**), pour l'image, le fond et la palette de couleurs.
- **Clip vidéo intégré.** Un clic échange la pochette contre le clip du morceau (**YouTube**), qui remplit le panneau de verre pour la meilleure résolution. La vidéo est **coupée (muette)** — l'audio reste sur Deezer — et se re-synchronise sur la position de lecture.
- **Passif et sobre.** Aucun bouton qui gêne, beaucoup de vide ; fenêtre sans cadre, contrôles révélés au survol, plein écran (F11).

---

## Comment ça marche

Deezer Glass est un **overlay compagnon**, pas un lecteur. Trois briques coopèrent :

1. **Pont SMTC (natif, Rust).** Un petit addon Node, dans le process (construit avec [napi-rs](https://napi.rs/) et la crate [`windows`](https://crates.io/crates/windows)), s'abonne à `GlobalSystemMediaTransportControlsSessionManager` — le système Windows qui alimente l'overlay média. Il émet, sur événement, le titre, l'artiste, l'album, la vignette de pochette, la position et l'état de lecture. La pochette n'est décodée qu'au changement de morceau (pas à chaque tick de position), pour rester léger.
2. **Process principal (Electron / Node).** Reçoit ces instantanés et les relaie à l'interface. Il fait aussi tout le réseau (paroles, pochette HD, résolution du clip) côté Node, pour que l'interface ne fasse elle-même aucune requête externe.
3. **Renderer (Vite / TypeScript).** Gère tout le visuel : le fond flou dérivant, le panneau de verre liquide, l'extraction de couleur, les paroles synchronisées, la bascule vers le clip. La position de lecture est ré-interpolée à chaque frame, pour une barre de progression fluide et un calage des paroles au sous-tick.

Comme l'audio est fourni par Deezer, le visualiseur est **piloté par la pochette** (comme Apple Music), et non par un spectre audio temps réel.

---

## Prérequis

**Pour l'utiliser :**
- **Windows 10 ou 11** (SMTC est propre à Windows — l'app est Windows uniquement, par conception).
- **Deezer en lecture** — l'app Deezer *ou* le lecteur web Deezer dans un navigateur. Deezer Glass reflète la session média que Windows signale à cet instant.

**Pour compiler depuis les sources :**
- **Node.js 18+**
- **Rust** (stable) — pour compiler l'addon SMTC natif.
- **Outils de build MSVC** (Visual Studio Build Tools) — la chaîne Rust par défaut sur Windows.

---

## Installation et lancement (depuis les sources)

```bash
npm install
npm run build:native   # compile l'addon SMTC Rust en binaire .node
npm run dev            # lance l'app (Electron + serveur de dev Vite)
```

Lance un morceau dans Deezer et la fenêtre l'affichera.

### Construire un installeur Windows

```bash
npm run dist           # produit release/Deezer Glass-<version>-setup.exe
```

### Lancer les tests

```bash
npm test               # tests unitaires de la logique pure (paroles, pochette, palette, timing)
```

---

## Sources de données

Tout est récupéré anonymement dans le process principal — **aucun compte ni clé d'API requis** :

| Donnée | Source | Notes |
|--------|--------|-------|
| Lecture en cours | Windows SMTC | La session média active de ton PC |
| Paroles synchro | [LRCLIB](https://lrclib.net) | Gratuit, ouvert, synchronisé (`.lrc`) |
| Paroles simples (repli) | [Genius](https://genius.com) | Quand aucune version synchro n'existe |
| Pochette HD | [API Deezer](https://developers.deezer.com) → iTunes | 1000×1000 |
| Clip vidéo | YouTube | Muet, synchronisé à la position |

---

## Stack technique

Electron · electron-vite · TypeScript (renderer + main) · Rust + napi-rs + la crate `windows` (addon SMTC) · Vitest (tests unitaires) · electron-builder (installeur Windows).

## Structure du projet

```
src/
  shared/     logique pure, testée unitairement (normalisation, paroles/LRC, fournisseurs pochette/paroles, palette, timing)
  main/       process Electron : fenêtre, pont SMTC, réseau paroles/pochette/clip + cache, IPC
  preload/    le pont sûr exposé à l'interface
  renderer/   l'interface (fond, verre, paroles, clip, palette, progression, chrome)
native/smtc/  l'addon SMTC en Rust (napi-rs)
docs/         spécification de conception et plan d'implémentation
```

---

## Remarques

- **Windows uniquement.** Toute l'approche repose sur SMTC, qui n'existe pas sur macOS/Linux.
- **La disponibilité des paroles/du clip varie.** Les paroles synchronisées nécessitent une source horodatée (LRCLIB) ; les morceaux de niche n'auront parfois que des paroles simples (Genius), voire aucune. Le clip est le premier résultat YouTube pertinent — juste pour les morceaux grand public, au mieux sinon.
- **La qualité vidéo** est servie de façon adaptative par YouTube selon la taille du lecteur ; le clip remplit le panneau et demande la meilleure qualité, mais la résolution exacte reste au choix de YouTube.

---

## Auteur

**mitige** — auteur et unique contributeur.
