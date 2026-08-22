Gavel designer wood textures

walnut/, rubberwood/, and ebony/ hold 1K PBR maps (color, normal, roughness)
used by the 3D preview — the three woods we offer.

All three share one grain scan and differ only in albedo, which is why they read
as the same turned part under the same light, the way the product photos do.

  Source: ambientCG Wood066 (https://ambientcg.com), licensed CC0 — no
  attribution required, free for commercial use.

Albedo is recolored onto color stops measured off the Gavels Fast product
photos in "app/temp/Gavels Fast - Core Products/Gavels & Sound Blocks
(Walnut, Rubberwood, Ebony)". To re-measure after new photos land:

  node scripts/sample-gavel-wood-colors.mjs

Then paste the stops into scripts/build-gavel-wood-textures.mjs and regenerate
the maps plus the picker thumbnails in public/images/gavel:

  node scripts/build-gavel-wood-textures.mjs

The source is downsampled from the 4K-JPG archive, which is far too heavy to
ship. Keep the archive in app/temp/gavelImages (gitignored).

The build rotates each map 90 degrees so the grain runs along the turned axis,
which is the direction LatheGeometry maps V.
