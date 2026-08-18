Gavel designer wood textures

walnut/, oak/, ebony/, and purple/ hold 1K PBR maps (color, normal, roughness)
used by the 3D preview.

Source: ambientCG (https://ambientcg.com), licensed CC0 — no attribution
required, free for commercial use.
  walnut = Wood066
  oak    = WoodFloor065A (one board cropped out of the floor set)
  ebony  = darkened Wood066, not a separate scan
  purple = Wood066 colorized to the stained plum product photos

These are downsampled from the 4K-JPG archives, which are far too heavy to
ship. Keep the archives in app/temp/gavelImages (gitignored) and regenerate
with:

  node scripts/build-gavel-wood-textures.mjs

The build rotates each map 90 degrees so the grain runs along the turned axis,
which is the direction LatheGeometry maps V.
