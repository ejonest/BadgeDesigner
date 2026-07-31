import { join } from "node:path";
import sharp from "sharp";
import {
  runBleedJobs,
  signedDistanceRoundedRect,
  SOURCE_DIR,
} from "./lib/mockup-bleed.mjs";

/**
 * Composite a reconstructed continuation of the original sushi illustration
 * into the lower-right bleed. The reconstruction completes the actual plate,
 * chopsticks and nigiri; it is not made from reflected or stretched edge
 * pixels. The original artwork remains untouched inside the painted edge,
 * apart from a narrow seam blend that is still outside the trim line.
 */
async function completeSushiCorner(parentPng, { report, templateId }) {
  const [{ data, info }, reconstruction] = await Promise.all([
    sharp(parentPng).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(join(SOURCE_DIR, "sushi-corner-outpaint.png"))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ]);
  const { width, height } = info;
  const output = Buffer.from(data);

  // The generated square was registered to a 650px crop of the original
  // 1.5x3 mockup. Both source mockups use the same sushi illustration; only
  // the crop's vertical origin differs.
  const patchSize = 650;
  const patchLeft = 850;
  const patchTop = templateId === "rect-1x3" ? 430 : 550;
  const alignedScaleX = 1.1590139761567115;
  const alignedScaleY = 1.2330894394777716;
  const alignedOffsetX = -54.71412562765181;
  const alignedOffsetY = -56.91085093189031;
  const faceRadius = report.paintedRadius * report.scale;
  const faceScaleX = width / report.paintedRect.width;
  const faceScaleY = report.faceH / report.paintedRect.height;

  const sampleReconstruction = (localX, localY, channel) => {
    // Map registered 650px patch coordinates into the generated 1024px image.
    const alignedX = (localX - alignedOffsetX) / alignedScaleX;
    const alignedY = (localY - alignedOffsetY) / alignedScaleY;
    const sourceX = Math.max(
      0,
      Math.min(
        reconstruction.info.width - 1,
        (alignedX / patchSize) * reconstruction.info.width,
      ),
    );
    const sourceY = Math.max(
      0,
      Math.min(
        reconstruction.info.height - 1,
        (alignedY / patchSize) * reconstruction.info.height,
      ),
    );
    const x0 = Math.floor(sourceX);
    const y0 = Math.floor(sourceY);
    const x1 = Math.min(reconstruction.info.width - 1, x0 + 1);
    const y1 = Math.min(reconstruction.info.height - 1, y0 + 1);
    const fx = sourceX - x0;
    const fy = sourceY - y0;
    const top =
      reconstruction.data[
        (y0 * reconstruction.info.width + x0) * 3 + channel
      ] *
        (1 - fx) +
      reconstruction.data[
        (y0 * reconstruction.info.width + x1) * 3 + channel
      ] *
        fx;
    const bottom =
      reconstruction.data[
        (y1 * reconstruction.info.width + x0) * 3 + channel
      ] *
        (1 - fx) +
      reconstruction.data[
        (y1 * reconstruction.info.width + x1) * 3 + channel
      ] *
        fx;
    return Math.round(top * (1 - fy) + bottom * fy);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceX = report.paintedRect.left + x / faceScaleX;
      const sourceY =
        report.paintedRect.top + (y - report.offsetY) / faceScaleY;
      const localX = sourceX - patchLeft;
      const localY = sourceY - patchTop;
      if (
        localX < 230 ||
        localX >= patchSize ||
        localY < 330 ||
        localY >= patchSize
      ) {
        continue;
      }

      const distance = signedDistanceRoundedRect(
        x,
        y - report.offsetY,
        width,
        report.faceH,
        faceRadius,
      );
      // Blend through the painted edge, but no farther than eight pixels
      // inward. The die trim is another 8–11px inward from this edge.
      const opacity = Math.max(0, Math.min(1, (distance + 8) / 12));
      if (!opacity) continue;

      const target = (y * width + x) * 3;
      for (let channel = 0; channel < 3; channel++) {
        const completed = sampleReconstruction(localX, localY, channel);
        output[target + channel] = Math.round(
          data[target + channel] * (1 - opacity) + completed * opacity,
        );
      }
    }
  }

  // The reconstructed patch's chopsticks are very close to the originals but
  // differ by a few pixels at the seam. Continue the original straight rods
  // along their measured axis, repeatedly sampling a short distance up-left
  // from real artwork. This preserves their exact angle and width.
  const sampleOriginal = (x, y, channel) => {
    const clampedX = Math.max(0, Math.min(width - 1, x));
    const clampedY = Math.max(0, Math.min(height - 1, y));
    const x0 = Math.floor(clampedX);
    const y0 = Math.floor(clampedY);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const fx = clampedX - x0;
    const fy = clampedY - y0;
    const top =
      data[(y0 * width + x0) * 3 + channel] * (1 - fx) +
      data[(y0 * width + x1) * 3 + channel] * fx;
    const bottom =
      data[(y1 * width + x0) * 3 + channel] * (1 - fx) +
      data[(y1 * width + x1) * 3 + channel] * fx;
    return Math.round(top * (1 - fy) + bottom * fy);
  };
  const chopstickSlope = 0.515;
  const chopstickIntercept = 377;
  const stepX = 24;
  const stepY = stepX * chopstickSlope;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceX = report.paintedRect.left + x / faceScaleX;
      const sourceY =
        report.paintedRect.top + (y - report.offsetY) / faceScaleY;
      const localX = sourceX - patchLeft;
      const localY = sourceY - patchTop;
      const fromCentre = Math.abs(
        localY - (localX * chopstickSlope + chopstickIntercept),
      );
      if (localX < 130 || localX >= patchSize || fromCentre >= 24) continue;

      const distance = signedDistanceRoundedRect(
        x,
        y - report.offsetY,
        width,
        report.faceH,
        faceRadius,
      );
      if (distance <= -6) continue;

      let sampleLocalX = localX;
      let sampleLocalY = localY;
      let sampleParentX = x;
      let sampleParentY = y;
      let sampleDistance = distance;
      while (sampleDistance > -8 && sampleLocalX > 0) {
        sampleLocalX -= stepX;
        sampleLocalY -= stepY;
        const sampleSourceX = patchLeft + sampleLocalX;
        const sampleSourceY = patchTop + sampleLocalY;
        sampleParentX =
          (sampleSourceX - report.paintedRect.left) * faceScaleX;
        sampleParentY =
          (sampleSourceY - report.paintedRect.top) * faceScaleY +
          report.offsetY;
        sampleDistance = signedDistanceRoundedRect(
          sampleParentX,
          sampleParentY - report.offsetY,
          width,
          report.faceH,
          faceRadius,
        );
      }

      const edgeOpacity = Math.max(0, Math.min(1, (distance + 6) / 10));
      const bandOpacity = Math.max(0, Math.min(1, (24 - fromCentre) / 6));
      const opacity = edgeOpacity * bandOpacity;
      if (!opacity) continue;

      const target = (y * width + x) * 3;
      for (let channel = 0; channel < 3; channel++) {
        const continued = sampleOriginal(
          sampleParentX,
          sampleParentY,
          channel,
        );
        output[target + channel] = Math.round(
          output[target + channel] * (1 - opacity) + continued * opacity,
        );
      }
    }
  }

  return sharp(output, {
    raw: { width, height, channels: 3 },
  })
    .png()
    .toBuffer();
}

/**
 * The original 1.5x3 Mexican mockup places its foreground group noticeably
 * higher than the 1x3 version. Isolate the connected hat/taco artwork from the
 * orange field, restore the vacated field from a clean area on the same rows,
 * then move the group down 100px so the tacos meet the lower border.
 */
async function moveMexicanForegroundDown(parentPng) {
  const { data, info } = await sharp(parentPng)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const pixels = width * height;
  const roi = { left: 0, top: 90, right: 390, bottom: 710 };
  const initial = new Uint8Array(pixels);

  // Estimate each row's orange field from its clean centre/right section.
  const rowBackground = [];
  for (let y = roi.top; y < roi.bottom; y++) {
    const channels = [[], [], []];
    for (let x = 430; x < 1350; x += 11) {
      const index = (y * width + x) * 3;
      for (let channel = 0; channel < 3; channel++) {
        channels[channel].push(data[index + channel]);
      }
    }
    rowBackground[y] = channels.map((values) => {
      values.sort((a, b) => a - b);
      return values[Math.floor(values.length / 2)];
    });
  }

  for (let y = roi.top; y < roi.bottom; y++) {
    for (let x = roi.left; x < roi.right; x++) {
      const index = (y * width + x) * 3;
      const background = rowBackground[y];
      const distance = Math.hypot(
        data[index] - background[0],
        data[index + 1] - background[1],
        data[index + 2] - background[2],
      );
      if (distance > 58) initial[y * width + x] = 1;
    }
  }

  // Reject isolated distress speckles while retaining tassels and food details.
  const mask = new Uint8Array(pixels);
  const seen = new Uint8Array(pixels);
  const stack = [];
  for (let y = roi.top; y < roi.bottom; y++) {
    for (let x = roi.left; x < roi.right; x++) {
      const seed = y * width + x;
      if (!initial[seed] || seen[seed]) continue;
      const component = [];
      stack.push(seed);
      seen[seed] = 1;
      while (stack.length) {
        const point = stack.pop();
        component.push(point);
        const pointX = point % width;
        const pointY = Math.floor(point / width);
        for (const neighbour of [
          point - 1,
          point + 1,
          point - width,
          point + width,
        ]) {
          const nx = neighbour % width;
          const ny = Math.floor(neighbour / width);
          if (
            nx < roi.left ||
            nx >= roi.right ||
            ny < roi.top ||
            ny >= roi.bottom ||
            seen[neighbour] ||
            !initial[neighbour]
          ) {
            continue;
          }
          // Prevent a row-wrapping left/right neighbour.
          if (Math.abs(nx - pointX) + Math.abs(ny - pointY) !== 1) continue;
          seen[neighbour] = 1;
          stack.push(neighbour);
        }
      }
      if (component.length >= 3) {
        for (const point of component) mask[point] = 1;
      }
    }
  }

  // The source sombrero is clipped at the left edge, leaving a narrow,
  // disconnected anti-aliased fragment that colour-keying cannot close.
  for (let y = 95; y < 180; y++) {
    for (let x = 0; x < 9; x++) mask[y * width + x] = 1;
  }

  const morph = (source, radius, dilate) => {
    const result = new Uint8Array(pixels);
    for (let y = roi.top; y < roi.bottom; y++) {
      for (let x = roi.left; x < roi.right; x++) {
        let value = dilate ? 0 : 1;
        outer: for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy > radius * radius) continue;
            const sampleX = x + dx;
            const sampleY = y + dy;
            const sample =
              sampleX >= roi.left &&
              sampleX < roi.right &&
              sampleY >= roi.top &&
              sampleY < roi.bottom
                ? source[sampleY * width + sampleX]
                : 0;
            if (dilate && sample) {
              value = 1;
              break outer;
            }
            if (!dilate && !sample) {
              value = 0;
              break outer;
            }
          }
        }
        result[y * width + x] = value;
      }
    }
    return result;
  };

  // Close small colour-key gaps, then fill all enclosed holes in the group.
  let core = morph(morph(mask, 3, true), 3, false);
  // Erosion treats pixels beyond the canvas as background, so restore the
  // clipped sombrero fragment after closing to remove it at full opacity.
  for (let y = 95; y < 180; y++) {
    for (let x = 0; x < 9; x++) core[y * width + x] = 1;
  }
  const exterior = new Uint8Array(pixels);
  const flood = [];
  const enqueue = (x, y) => {
    const point = y * width + x;
    if (!core[point] && !exterior[point]) {
      exterior[point] = 1;
      flood.push(point);
    }
  };
  for (let x = roi.left; x < roi.right; x++) {
    enqueue(x, roi.top);
    enqueue(x, roi.bottom - 1);
  }
  for (let y = roi.top; y < roi.bottom; y++) {
    enqueue(roi.left, y);
    enqueue(roi.right - 1, y);
  }
  while (flood.length) {
    const point = flood.pop();
    const pointX = point % width;
    const pointY = Math.floor(point / width);
    for (const [nx, ny] of [
      [pointX - 1, pointY],
      [pointX + 1, pointY],
      [pointX, pointY - 1],
      [pointX, pointY + 1],
    ]) {
      if (
        nx >= roi.left &&
        nx < roi.right &&
        ny >= roi.top &&
        ny < roi.bottom
      ) {
        enqueue(nx, ny);
      }
    }
  }
  for (let y = roi.top; y < roi.bottom; y++) {
    for (let x = roi.left; x < roi.right; x++) {
      const point = y * width + x;
      if (!core[point] && !exterior[point]) core[point] = 1;
    }
  }

  // Two soft outer pixels preserve the source anti-aliasing without a halo.
  const feather1 = morph(core, 1, true);
  const feather2 = morph(core, 2, true);
  const alpha = new Uint8Array(pixels);
  for (let point = 0; point < pixels; point++) {
    alpha[point] = core[point]
      ? 255
      : feather1[point]
        ? 170
        : feather2[point]
          ? 70
          : 0;
  }

  const output = Buffer.from(data);
  const blend = (target, source, opacity) => {
    const inverse = 255 - opacity;
    for (let channel = 0; channel < 3; channel++) {
      output[target + channel] = Math.round(
        (output[target + channel] * inverse + data[source + channel] * opacity) /
          255,
      );
    }
  };

  // First remove the old group using a clean part of the same textured rows.
  for (let y = roi.top; y < roi.bottom; y++) {
    for (let x = roi.left; x < roi.right; x++) {
      const opacity = alpha[y * width + x];
      if (!opacity) continue;
      const target = (y * width + x) * 3;
      const source = (y * width + Math.min(width - 1, x + 500)) * 3;
      blend(target, source, opacity);
    }
  }

  // Then composite the untouched original foreground at its lower position.
  const offsetY = 100;
  for (let y = roi.top; y < roi.bottom && y + offsetY < height; y++) {
    for (let x = roi.left; x < roi.right; x++) {
      const opacity = alpha[y * width + x];
      if (!opacity) continue;
      const target = ((y + offsetY) * width + x) * 3;
      const source = (y * width + x) * 3;
      blend(target, source, opacity);
    }
  }

  return sharp(output, {
    raw: { width, height, channels: 3 },
  })
    .png()
    .toBuffer();
}

// Rebuild from the original mockup crop so each theme keeps only its own food.
await runBleedJobs([
  {
    stem: "Restaurant-Specific-Badges-BBQ-(1.5x3)",
    templateId: "rect-1_5x3",
    sourceName: "Restaurant-Specific-Badges-BBQ-(1.5x3)-main-preview.jpg",
    crop: { left: 79, top: 416, width: 1341, height: 675 },
  },
  {
    stem: "Restaurant-Specific-Badges-BBQ-(1x3)",
    templateId: "rect-1x3",
    sourceName: "Restaurant-Specific-Badges-BBQ-(1x3)-main-preview.jpg",
    crop: { left: 86, top: 528, width: 1329, height: 451 },
  },
  {
    stem: "Restaurant-Specific-Badges-Burger-(1.5x3)",
    templateId: "rect-1_5x3",
    sourceName: "Restaurant-Specific-Badges-Burger-(1.5x3)-main-preview.jpg",
    crop: { left: 79, top: 416, width: 1341, height: 675 },
  },
  {
    stem: "Restaurant-Specific-Badges-Burger-(1x3)",
    templateId: "rect-1x3",
    sourceName: "Restaurant-Specific-Badges-Burger-(1x3)-main-preview.jpg",
    crop: { left: 86, top: 528, width: 1329, height: 451 },
  },
  {
    stem: "Restaurant-Specific-Badges-Mexican-(1.5x3)",
    templateId: "rect-1_5x3",
    sourceName: "Restaurant-Specific-Badges-Mexican-(1.5x3)-main-preview.jpg",
    crop: { left: 79, top: 416, width: 1341, height: 675 },
    postprocessParent: moveMexicanForegroundDown,
  },
  {
    stem: "Restaurant-Specific-Badges-Mexican-(1x3)",
    templateId: "rect-1x3",
    sourceName: "Restaurant-Specific-Badges-Mexican-(1x3)-main-preview.jpg",
    crop: { left: 86, top: 528, width: 1329, height: 451 },
  },
  {
    stem: "Restaurant-Specific-Badges-Pizza-(1.5x3)",
    templateId: "rect-1_5x3",
    sourceName: "Restaurant-Specific-Badges-Pizza-(1.5x3)-main-preview.jpg",
    crop: { left: 79, top: 416, width: 1341, height: 675 },
  },
  {
    stem: "Restaurant-Specific-Badges-Pizza-(1x3)",
    templateId: "rect-1x3",
    sourceName: "Restaurant-Specific-Badges-Pizza-(1x3)-main-preview.jpg",
    crop: { left: 86, top: 528, width: 1329, height: 451 },
  },
  {
    stem: "Restaurant-Specific-Sushi-(1.5x3)",
    templateId: "rect-1_5x3",
    sourceName: "Restaurant-Specific-Sushi-(1.5x3)-main-preview.jpg",
    crop: { left: 79, top: 416, width: 1341, height: 675 },
    postprocessParent: completeSushiCorner,
  },
  {
    stem: "Restaurant-Specific-Sushi-(1x3)",
    templateId: "rect-1x3",
    sourceName: "Restaurant-Specific-Sushi-(1x3)-main-preview.jpg",
    crop: { left: 86, top: 528, width: 1329, height: 451 },
    postprocessParent: completeSushiCorner,
  },
]);
