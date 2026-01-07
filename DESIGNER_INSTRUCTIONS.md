# SVG Template Creation Instructions

## Overview
Create SVG files that define badge shapes for the design tool. Each SVG must contain exactly 2 elements with specific IDs.

## Required Structure

### 1. SVG viewBox Dimensions
Set the `viewBox` attribute to match badge dimensions at **96 DPI**:

- **3×1" badges** (width × height): `viewBox="0 0 288 96"`
  - Width: 3 inches × 96 = 288px
  - Height: 1 inch × 96 = 96px

- **3×1.5" badges**: `viewBox="0 0 288 144"`
  - Width: 3 inches × 96 = 288px
  - Height: 1.5 inches × 96 = 144px

### 2. Required Elements

Each SVG must have exactly 2 elements with these exact IDs:

#### `id="Inner"` (REQUIRED)
- **Purpose**: Defines the clipping area where text/colors appear
- **Must be**: A closed path (ends with `Z`)
- **Shape**: Should match the badge outline (rectangle, rounded rectangle, oval, etc.)
- **Simple is better**: Avoid complex decorative elements

#### `id="Outline"` (REQUIRED)
- **Purpose**: Visible border shown in preview
- **Can be**: Same shape as Inner, or a decorative border
- **Must be**: A closed path (ends with `Z`)

## File Format Template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 288 96">
  <path id="Outline" d="[your outline path]Z"/>
  <path id="Inner" d="[your inner path]Z"/>
</svg>
```

## Missing Templates Needed

Create these 4 new SVG files:

1. **3×1" Designer Badge**
   - File: `designer-1x3.svg` (or similar name)
   - `viewBox="0 0 288 96"`
   - Create Designer shape with `id="Inner"` and `id="Outline"`

2. **3×1" Oval Badge**
   - File: `oval-1x3.svg` (or similar name)
   - `viewBox="0 0 288 96"`
   - Create oval shape with `id="Inner"` and `id="Outline"`

3. **3×1" Square Corner Badge**
   - File: `square-1x3.svg` (or similar name)
   - `viewBox="0 0 288 96"`
   - Create square-cornered rectangle with `id="Inner"` and `id="Outline"`

4. **3×1.5" Square Corner Badge**
   - File: `square-1_5x3.svg` (or similar name)
   - `viewBox="0 0 288 144"`
   - Create square-cornered rectangle with `id="Inner"` and `id="Outline"`

## Critical Checklist

- [ ] `viewBox` matches badge dimensions exactly (288×96 for 3×1", 288×144 for 3×1.5")
- [ ] Element with `id="Inner"` exists (case-sensitive)
- [ ] Element with `id="Outline"` exists (case-sensitive)
- [ ] Both paths are closed (end with `Z`)
- [ ] Paths are simple shapes matching the badge outline
- [ ] File saved with descriptive name

## Notes

- **Keep shapes simple**: Complex decorative paths can cause clipping issues
- **Inner path = clipping area**: This is where content will be visible
- **Outline path = border**: This is what users see as the badge edge
- **Dimensions are critical**: The viewBox must match exactly or badges will render incorrectly

## Important Note on Existing Templates

The existing 4 templates (`rect-1x3.svg`, `rect-1x3_5.svg`, `oval-1x3_5.svg`, `house-outline-1x3_5.svg`) have been updated with correct viewBox dimensions, but the path coordinates inside may need to be rescaled to match. These templates should be recreated at the correct size to ensure perfect rendering.

## Example Reference

See existing templates in `public/templates/`:
- `rect-1x3.svg` - Rounded rectangle 3×1" (viewBox updated, paths may need rescaling)
- `oval-1x3_5.svg` - Oval 3×1.5" (viewBox updated, paths may need rescaling)
- `house-outline-1x3_5.svg` - House shape 3×1.5" (viewBox updated, paths may need rescaling)

Use these as reference for structure and format, but recreate paths at the correct size.

