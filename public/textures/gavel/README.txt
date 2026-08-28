Gavel designer textures

Wood
====

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

Metal
=====

metal-gold/ and metal-silver/ hold 1K maps for the gavel band and the stand
plaque. Unlike the woods, the albedo is not handed straight to the material:
the band and plate artwork is composited on a canvas alongside the engraving,
so color.jpg is tiled into that canvas as a pattern and only normal.jpg and
roughness.jpg reach the 3D material.

  Source: ambientCG Metal042A (gold) and Metal041A (silver), licensed CC0 — no
  attribution required, free for commercial use.

  node scripts/build-gavel-metal-textures.mjs

Keep the 4K-JPG sets in app/temp (gitignored); the build finds them by name.

The scans supply micro-relief only. The hues come from the product photos, the
albedo is high-passed so the scans' cloudy mottling cannot sit under the
engraving, roughness is remapped well above the scanned near-mirror values, and
a directional brush is added — the scans are hammered, the hardware is brushed.
Together those are what keep the metal from throwing a glare in the viewer.

Both maps tile texel for texel with the artwork rather than fitting one repeat
per surface, so the band and plaque share a brush of the same real-world size.
Anything that changes GAVEL_BAND_TEXTURE_*_PX or STAND_PLATE_TEXTURE_*_PX
therefore changes the grain size on that part.
