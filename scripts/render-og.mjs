#!/usr/bin/env node
/**
 * Render the social preview at build time.
 *
 * Twitter, Facebook, LinkedIn, and most messaging apps require a raster image
 * for og:image / twitter:image. Our source-of-truth is `public/og.svg`; this
 * script renders it to `public/og.png` so the file Vite copies into `dist/` is
 * the raster version platforms can actually display.
 *
 * Runs in `prebuild` so every `npm run build` keeps the PNG in sync with the
 * SVG. Idempotent: re-rendering an unchanged SVG produces an identical PNG.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'public/og.svg')
const out = resolve(root, 'public/og.png')

const svg = await readFile(src)
// resvg can't resolve the CSS keyword `system-ui` or platform-specific names
// (Segoe UI / -apple-system / Arial on Linux); without a defaultFontFamily it
// silently picks some arbitrary installed font, which on this image manifested
// as an all-caps display face. Pinning to DejaVu Sans (ubiquitous on Linux,
// including the Ubuntu GitHub Actions runners) makes the rendered output stable
// and matches the lowercase glyphs in the SVG.
const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: {
    loadSystemFonts: true,
    defaultFontFamily: 'DejaVu Sans',
    sansSerifFamily: 'DejaVu Sans',
  },
})
  .render()
  .asPng()

await writeFile(out, png)
console.log(`og.png written (${png.length.toLocaleString()} bytes)`)
