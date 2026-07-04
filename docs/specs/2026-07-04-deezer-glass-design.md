# Deezer Glass — visualiseur « now playing » liquid glass

- **Date** : 2026-07-04
- **Statut** : design validé, prêt pour le plan d'implémentation
- **Plateforme** : Windows 10/11 uniquement (dépend de SMTC)
- **Nature** : application Electron autonome (aucun lien avec le repo judas)

---

## 1. Objectif

Une application Electron **sobre et ultra-esthétique** qui reproduit l'expérience « now playing »
d'Apple Music (pochette + infos + **paroles synchronisées**) pour **Deezer**, avec un rendu
**liquid glass spectaculaire** et un fond **caméléon** recoloré par la pochette. L'app peut aussi
afficher le **clip vidéo** du morceau (YouTube), intégré dans la même fenêtre.

Référence visuelle : la vue plein écran d'Apple Music (pochette + infos à gauche, paroles
défilantes surlignées à droite, fond ambiant flou tiré de la pochette). Ce n'est **pas** un
visualiseur de spectre audio : le rendu est piloté par la pochette et la position de lecture,
pas par une FFT.

## 2. Décisions (verrouillées)

| Sujet | Choix | Raison |
|---|---|---|
| Source audio / lecture | **Overlay « now playing » via Windows SMTC** — l'app ne joue pas l'audio | Seul modèle légal donnant les morceaux **complets** ; fidèle à la photo (art-driven) |
| Pont SMTC | **Addon natif Rust** (napi-rs + crate `windows`), in-process | Rust déjà installé ; N-API stable entre versions d'Electron ; pochette propre ; pas de sidecar |
| Renderer | **Vite + TypeScript vanilla** | Léger pour une boucle d'animation/canvas ; pas d'overhead framework |
| Matière du verre | **Liquid glass spectaculaire** (réfraction + reflet) | Choix utilisateur |
| Couleur | **Caméléon pur** (couleurs extraites de la pochette, aucun accent fixe) | Choix utilisateur ; fidèle Apple |
| Paroles | **Synchronisées** via LRCLIB (gratuit, sans clé) | Cœur visuel de la référence |
| Clip vidéo | **YouTube, intégré dans l'écran** (bascule pochette ↔ clip), muet, re-synchronisé | Choix utilisateur |
| Contrôles de lecture | **Aucun (passif)** en v1 ; capacité exposée mais non câblée | Plus sobre ; évite la fiabilité variable des contrôles SMTC |
| Packaging | **electron-builder** (installeur Windows) | Distribution pour la com' |

Le « sobre » vit dans la **composition** (typo retenue, beaucoup de vide, zéro fioriture d'UI),
pas dans la matière du verre.

## 3. Périmètre

**Dans la v1**
- Lecture de la session média Windows courante (titre, artiste, album, pochette, position, état).
- Fond ambiant caméléon + panneau liquid glass + infos morceau + barre de progression fluide.
- Paroles synchronisées (LRCLIB) avec surlignage/défilement ; replis gracieux.
- Bascule pochette ↔ clip YouTube (muet, re-synchronisé) dans la même fenêtre.
- Fenêtre *frameless* déplaçable, mémorisation taille/position, plein écran (F11).
- Installeur Windows.

**Hors v1 (YAGNI)**
- Contrôles de lecture (play/pause/next) — capacité exposée dans l'addon, non câblée.
- Recherche / navigation de bibliothèque.
- Panneau de réglages.
- Fenêtre clip séparée / multi-écran (on a choisi l'intégré).
- macOS / Linux (SMTC = Windows only).

## 4. Architecture

Trois briques + un addon natif.

```
 Windows SMTC ──► native/smtc (Rust, napi-rs) ──► main (Electron/Node) ──IPC──► renderer (Vite/TS)
                    events + snapshot            normalise, LRCLIB, clip        tout le visuel
```

- **Addon Rust `smtc`** (in-process) — s'abonne à SMTC, émet un snapshot normalisé à chaque
  changement via une `ThreadsafeFunction`. Contrôles exposés mais non utilisés en v1.
- **Main Electron** — crée la fenêtre *frameless*, charge l'addon, relaie l'état au renderer par
  IPC ; effectue **le réseau côté Node** (LRCLIB, résolution clip) pour éviter le CORS, avec cache
  disque dans `userData`.
- **Preload** — `contextIsolation: true`, `nodeIntegration: false` ; expose une API minimale et sûre
  via `contextBridge`.
- **Renderer (Vite + TS vanilla)** — aucun accès Node ; possède fond, verre, paroles, clip,
  extraction de palette, interpolation de position.

## 5. Contrats de données

### 5.1 Snapshot « now playing » (addon → main → renderer)

```ts
type PlaybackStatus = 'playing' | 'paused' | 'stopped' | 'none';

interface NowPlaying {
  trackId: string;        // identité stable = `${normArtist}|${normTitle}|${durationMs}`
  title: string;
  artist: string;
  album: string;
  artDataUrl: string | null;   // data:image/<type>;base64,....  (pochette SMTC)
  positionMs: number;          // position au moment lastUpdatedMs
  durationMs: number;
  lastUpdatedMs: number;       // epoch ms (LastUpdatedTime de la timeline SMTC)
  rate: number;                // PlaybackRate, défaut 1
  status: PlaybackStatus;
}
```

Le renderer **interpole** la position chaque frame :
`estPos = status==='playing' ? clamp(positionMs + (Date.now() - lastUpdatedMs) * rate, 0, durationMs) : positionMs`.
Re-synchro à chaque nouveau snapshot timeline.

### 5.2 Paroles (renderer → main → renderer)

```ts
interface LyricLine { timeMs: number; text: string; }
interface Lyrics {
  synced: LyricLine[] | null;   // trié par timeMs
  plain: string | null;         // fallback non synchronisé
  source: 'lrclib';
}
```

### 5.3 Clip (renderer → main → renderer)

```ts
interface ClipResult { embedUrl: string | null; videoId: string | null; }
```

### 5.4 IPC / API preload

- main → renderer : `nowplaying:update` (`NowPlaying`).
- renderer → main (invoke) : `lyrics:get(track)` → `Lyrics` ; `clip:resolve(track)` → `ClipResult`.
- fenêtre : `win:minimize`, `win:close`, `win:toggleFullscreen`.
- exposé : `window.np = { onUpdate(cb), getLyrics(track), resolveClip(track), win: { minimize, close, toggleFullscreen } }`.

## 6. Pont SMTC (Rust, napi-rs)

Crate `windows`, features : `Media_Control`, `Foundation`, `Foundation_Collections`,
`Storage_Streams`.

- `GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.get()?` → manager.
- `manager.GetCurrentSession()` (peut être nul si rien ne joue).
- Handlers : `CurrentSessionChanged` (re-hook la session courante), puis sur la session :
  `MediaPropertiesChanged`, `PlaybackInfoChanged`, `TimelinePropertiesChanged`.
- Lecture :
  - `session.TryGetMediaPropertiesAsync()?.get()?` → `Title`, `Artist`, `AlbumTitle`, `Thumbnail`.
  - Pochette : `Thumbnail.OpenReadAsync()?.get()?` → lecture via `DataReader` → octets → base64
    (+ type MIME du `ContentType`).
  - `session.GetPlaybackInfo()?` → `PlaybackStatus`, `PlaybackRate` (Option), `Controls`.
  - `session.GetTimelineProperties()?` → `Position`, `EndTime` (durée), `LastUpdatedTime`.
- napi-rs : `start(cb)` crée une `ThreadsafeFunction` ; chaque event assemble un `NowPlaying` et
  appelle `tsfn` en non-bloquant. `stop()` retire les handlers. Le manager/la session sont gardés
  vivants dans une struct ; abonnement sur un thread dédié.
- **ABI** : napi-rs cible N-API (stable) → **un seul binaire** `.node` fonctionne sur toutes les
  versions d'Electron, pas de rebuild par version.
- **Session suivie (v1)** : la session **courante** de Windows. Prévu (non v1) : filtre optionnel
  sur l'`SourceAppUserModelId` de Deezer (app bureau **ou** onglet navigateur).

## 7. Rendu (le cœur)

### 7.1 Caméléon (extraction de palette)
À chaque nouvelle `artDataUrl` : dessin sur un canvas offscreen → échantillonnage (petit sampler
histogramme/luminance maison, **sans dépendance** ; `node-vibrant` en alternative) → palette
(dominante + vibrante + sombre). Écriture de variables CSS `--art-1`, `--art-2`, `--art-accent`,
`--art-ink`. Tout (fond, teinte du verre, reflet, ligne de parole active) en découle, avec
**cross-fade** (~600 ms) au changement de `trackId`.

### 7.2 Fond ambiant
Deux couches empilées, cross-fade au changement de titre :
1. la pochette agrandie ×1.3, floutée ~60px, légèrement désaturée, en **dérive lente**
   (translate/scale, ~30 s) pour la « vie » ;
2. un voile de dégradé (mesh) issu de la palette, faible opacité, pour unifier.

### 7.3 Verre liquide (spectaculaire)
Panneau héro flottant, empilement :
1. `backdrop-filter: blur(20–24px) saturate(180%)` — le givre.
2. **Réfraction** : filtre SVG `feTurbulence` + `feDisplacementMap` appliqué à une copie floutée du
   fond positionnée derrière le panneau → le fond se déforme à travers le verre.
3. **Reflet spéculaire** animé — un sheen diagonal translucide qui dérive lentement + liseré clair
   (`inset 0 1px 0 rgba(255,255,255,.5)`).
4. Coins ~24 px.
5. **Couche WebGL de réfraction** pour le panneau héro : **option bornée** (raw WebGL ou `regl`).
   Baseline livrable = CSS `backdrop-filter` + SVG displacement + sheen ; le WebGL est une
   amélioration, pas un prérequis. À ne pas transformer en puits sans fond.

### 7.4 Paroles synchronisées
LRC parsé → tableau `LyricLine[]`. La ligne active (`time ≤ estPos < nextTime`) est surlignée
(blanc vif ou `--art-accent`), auto-scrollée au centre ; voisines atténuées avec fondus haut/bas
(`mask-image: linear-gradient`). Si non synchronisées → paroles simples centrées, sans surlignage.
Si aucune → état « paroles indisponibles ». Fidèle à la photo.

## 8. Sources externes

### 8.1 Paroles — LRCLIB
`GET https://lrclib.net/api/get?artist=<a>&track=<t>&album=<al>&duration=<sec>` (gratuit, sans clé,
appelé **côté main**). `syncedLyrics` (LRC `[mm:ss.xx]`) si dispo, sinon `plainLyrics`, sinon 404.
Matching robuste : normalisation (retire `feat.`, parenthèses, casse/espaces) + durée ±2 s pour
départager. Repli sur `/api/search` si `/api/get` échoue. **Cache disque** JSON dans `userData`
indexé par `trackId`.

### 8.2 Clip — YouTube (keyless)
Bascule pochette ↔ clip dans la **même** fenêtre (crossfade), dans le même cadre de verre.
- Primaire : `<iframe>` sandboxé `youtube-nocookie.com/embed?listType=search&list=<"artist title">&autoplay=1&mute=1&controls=0&modestbranding=1`.
- Repli (dépréciation possible de `listType=search`) : résolveur no-key **côté main** — fetch de la
  page de résultats, extraction du premier `videoId`, embed par id.
- Player **muet** (l'audio reste Deezer) ; `seekTo(estPos)` à l'ouverture et re-synchro si dérive
  > 1 s (IFrame API via `postMessage`). Synchro best-effort (décalages d'intro tolérés).

## 9. Fenêtre / chrome
Fenêtre `frame: false`, `backgroundColor: '#0b0f17'`, non transparente (la scène est opaque).
Bandeau supérieur `-webkit-app-region: drag` ; contrôles interactifs en `no-drag`. Boutons
fermer/minimiser discrets qui apparaissent au survol (glassy). Mémorisation des bounds dans
`userData`. Plein écran F11. Pas de barre de menu.

## 10. Cas limites (état calme, jamais un crash)

| Situation | Comportement |
|---|---|
| Deezer éteint / aucune session | État « en attente de lecture » (panneau de verre + invite discrète) |
| Pochette absente | Dégradé de secours dérivé d'un hash du titre |
| LRCLIB 404 / hors-ligne | Paroles simples si dispo, sinon « paroles indisponibles » ; le reste tourne |
| Clip introuvable | Pochette conservée, bouton clip désactivé discrètement |
| Addon/SMTC indisponible (vieux Windows) | Main intercepte ; état « SMTC indisponible » ; l'app tourne |
| Changements de titre rapides | Debounce sur `trackId` (paroles/clip/palette ne s'exécutent que sur identité stable) |

## 11. Sécurité
`contextIsolation: true`, `nodeIntegration: false`, `sandbox` renderer, preload minimal.
CSP stricte dans `index.html` : `default-src 'self'; img-src 'self' data:;
frame-src https://www.youtube-nocookie.com https://www.youtube.com; script-src 'self'`.
Le réseau LRCLIB se fait côté main (Node), pas dans le renderer. Seuls domaines sortants :
`lrclib.net`, `youtube-nocookie.com` / `youtube.com`.

## 12. Arborescence

```
deezer-glass/
  package.json
  electron.vite.config.ts        electron-vite (main + preload + renderer)
  electron-builder.yml
  src/
    main/
      main.ts                    fenêtre, IPC, cycle de vie
      smtc.ts                    charge l'addon natif, normalise les snapshots
      lyrics.ts                  LRCLIB fetch + parse LRC + cache
      clip.ts                    résolution YouTube (keyless + repli)
      store.ts                   bounds fenêtre + cache paroles (userData)
    preload/
      preload.ts                 contextBridge (window.np)
    renderer/
      index.html                 (CSP)
      main.ts                    bootstrap, souscription IPC, state
      state.ts                   store d'état + interpolation de position
      ui/
        background.ts            fond flou dérivant + voile de palette
        glass.ts                 panneau liquid glass (backdrop + displacement + sheen)
        refraction.ts            couche WebGL héro (option bornée)
        lyrics.ts                colonne paroles + scroll + surlignage
        clip.ts                  bascule pochette ↔ iframe YouTube
        palette.ts               extraction de couleur (caméléon)
        progress.ts              barre + temps
        chrome.ts                bandeau/déplacement/boutons fenêtre
      styles/
        glass.svg                filtre feTurbulence/feDisplacementMap
        app.css
  native/
    smtc/
      Cargo.toml                 napi-rs + windows crate
      build.rs                   napi-build
      src/lib.rs                 pont SMTC
  build/                         icônes, ressources electron-builder
```

## 13. Stack & dépendances
- **Runtime** : Electron, `electron-vite`, TypeScript.
- **Natif** : `napi`, `napi-derive`, `napi-build` (Rust) ; crate `windows`.
- **Palette** : sampler maison (0 dépendance) ; `node-vibrant` en option.
- **WebGL** (option héro) : raw WebGL ou `regl`.
- **Packaging** : `electron-builder` (cible `nsis` Windows). L'artefact `.node` de l'addon est
  empaqueté comme ressource, hors asar.

## 14. Risques & inconnues
- **SMTC variable selon l'app source** : les champs (position, pochette) dépendent de ce que Deezer
  expose (app bureau vs onglet navigateur). Mitigation : interpolation + repli d'affichage.
- **`listType=search` déprécié** par Google : mitigé par le résolveur no-key côté main.
- **Réfraction WebGL** : seul vrai risque de scope → bornée en option ; le chemin CSS+SVG reste la
  baseline livrable.
- **Lecture/format de la pochette** : décodage robuste (types multiples) requis.
- **Précision de synchro paroles/clip** : dépend de la fraîcheur de la timeline SMTC ; best-effort.

## 15. Critères d'acceptation (v1)
1. Au lancement, l'app affiche le morceau Deezer courant (titre/artiste/pochette) en ~1 s, ou un
   état d'attente calme si rien ne joue.
2. La barre de progression avance en continu et colle à Deezer à ~0,5 s près.
3. Les paroles synchronisées défilent et surlignent la bonne ligne dans le temps quand elles
   existent ; repli gracieux sinon.
4. Le fond et le verre se recolorent selon la pochette (caméléon), avec cross-fade au changement de
   titre.
5. La bascule clip affiche une vidéo YouTube muette grossièrement synchronisée, puis revient à la
   pochette.
6. Pause / changement de titre dans Deezer se reflètent dans l'app.
7. Aucun crash sur : Deezer fermé, hors-ligne, pochette absente, paroles absentes, skips rapides.
