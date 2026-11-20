# Original Next.js starter (archived)

These files are the first upload of World Radar. They were uploaded without their
folder structure and without `package.json`, page components or locale files, so
they could not build. They are kept here for reference only.

The live project now runs as a static site (`index.html`, `assets/`) whose data
(`data/news.json`) is rebuilt every hour by GitHub Actions — see the main README.
The useful parts (deduplication, RSS adapter boundary, locale/RTL list, colour
system) were carried over into `scripts/lib/` and `assets/`.
