# 南京地铁 · Nanjing Metro

<div align="center">
  <a href="README.md">中文</a> · <b>English</b>
</div>

> **Explore the network, find toilets, and follow the lines through Nanjing.**
> An independent local website with station information and interactive 3D cruising.

## Live site

**https://nanjing.atompower.cn/metro/**

Direct links: [Network map](https://nanjing.atompower.cn/metro/) · [Stations & toilets](https://nanjing.atompower.cn/metro/#station-info) · [Exit guide](https://nanjing.atompower.cn/metro/exits.html) · [Transfer lab](https://nanjing.atompower.cn/metro/transfer.html) · [Line personality](https://nanjing.atompower.cn/metro/quiz.html) · [Network records](https://nanjing.atompower.cn/metro/records.html) · [3D cruise](https://nanjing.atompower.cn/metro/terrain.html)

The site is fully static and can also be self-hosted as described in section 5.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/AFAP/nanjing-metro)](https://github.com/AFAP/nanjing-metro/releases)
[![Build](https://github.com/AFAP/nanjing-metro/actions/workflows/release.yml/badge.svg)](https://github.com/AFAP/nanjing-metro/actions/workflows/release.yml)

## 1. What it solves

A single place for route maps, station information, toilet locations, and ground elevations.

```text
Public sources → data/ → Local server / static website → Search and cruise
```

## 2. Features

- ✅ Color route map with line highlighting, zoom, and station lookup.
- ✅ Structured data for 15 lines and 263 stations, retaining toilet sources.
- ✅ Exit guide: official exit notes turned into a searchable index with exit numbers and walking distances (2,766 places across 180 stations).
- ✅ Transfer lab: station autocomplete plus fewest-transfer and fewest-stop options, with out-of-station changes flagged.
- ✅ Line personality: six questions pick the line most like you and list places along it.
- ✅ Network records: busiest interchange, lines with the most interchange stations, longest and shortest names, all counted from the official directory.
- ✅ 3D cruising with pause/resume, reverse, speed, scrubbing, and station stepping.
- ✅ Rotate, pan, and zoom freely; ground profiles follow the selected station.
- ✅ Shared sticky navigation and persistent City Green / Paper & Ink styles.

![3D cruise](screenshot/cruise.png)

## 3. Directory structure

```text
src/          # Web sources and bundled Three.js
data/         # Public structured data and collection notes
scripts/      # Packaging, collection, and validation
docs/         # Version history
screenshot/   # Page preview
server.mjs    # Local server
```

## 4. Quick start

```bash
npm start
```

Requires Node.js 22 or newer, with no runtime installation needed. Open `http://localhost:4173/`; the 3D page is `http://localhost:4173/terrain.html`. On Windows, you can also run `启动网站.cmd`.

## 5. Usage and deployment

| Action | Method |
| --- | --- |
| Find toilets | Search names or filter by line in “站点 · 厕所” |
| Find an exit | Search a place name (such as “总统府”) in “出站即达”, or open a station to see where each exit leads |
| Plan a transfer | Enter two stations in “换乘实验室” for a suggested route |
| Start cruising | Select a line on the 3D page and click “开始巡航” |
| Explore manually | Drag to rotate, right-drag to pan, and wheel or pinch to zoom; cruising pauses |
| Switch style | Use the top style selector; the choice persists across pages |
| Add local information | Open `/?edit=1#station-info`; records remain local |

Generate static files:

```bash
npm run build
```

Deploy the generated `dist/` directory to static hosting, or download a Release archive. Static hosting cannot save local records. Back up `data/manual-reviews.json` before replacing sources and restarting after an upgrade.

## 6. Security and privacy

**The local server binds only to `127.0.0.1`. Personal records, environment files, deployment settings, and raw caches are excluded from Git and static packages.**

Pages omit human verification badges. The data retains `human_verified`. See [SECURITY.md](SECURITY.md).

## 7. Development and releases

```bash
npm test
npm run build
```

`src/` contains web sources. `data/` is the single public dataset source, copied during packaging. Three.js 0.180.0 is bundled; its license is in `src/vendor/THREE-LICENSE.txt`.

Actions supports manual builds. Pushing a `v*` tag publishes an archive, SHA-256 checksum, and generated release notes. `dist/` is excluded from Git.

Python collection scripts are optional maintenance tools and require raw caches. Caches and intermediate parsed files are not distributed; dependencies are pinned in `scripts/requirements.txt`.

## 8. Related documents

- [Data fields and scope](data/README.md)
- [Toilet data coverage](data/collection-report.md)
- [3D sources and precision](data/3d-research.md)
- [Version history](docs/CHANGELOG.md)
- [Third-party sources and licenses](NOTICE.md)

The 2D guide keeps an April 2026 snapshot (14 lines, without Line 6). Station and 3D route data were collected on October 1, 2026: 15 lines, 263 stations, 37 of them interchanges. Coordinates are available for 262 stations; Hongshan Xincheng remains unlocated. Heights are ground estimates. Complete absolute rail elevations are unavailable; relative layers are never converted to meters.

## 9. License

MIT © 2026 contributors. Third-party materials retain their own rights and licenses; see [NOTICE.md](NOTICE.md).

This independent guide is not the official Nanjing Metro website. Follow official announcements and station signs for operations and facilities. Elevation data is not suitable for engineering measurement.
