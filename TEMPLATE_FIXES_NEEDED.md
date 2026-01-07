# Template SVG Files - Fixes Needed

## Problem
2nd generation templates are missing the `id="Outline"` path. They only have `id="Inner"`, which violates the standard template format.

## Standard Format (from Designer Instructions)
All templates MUST have:
1. **`id="Outline"`** - Outer edge of the badge (physical product edge)
2. **`id="Inner"`** - Inset path for clipping area (typically 2px inset from outline)

## Templates That Need Fixing

### Missing Outline Path:
- ✅ `round-1x3.svg` - HAS both Outline and Inner (CORRECT)
- ✅ `round-1.5x3.svg` - HAS both Outline and Inner (CORRECT)  
- ✅ `house-1.5x3.svg` - HAS both Outline and Inner (CORRECT)
- ❌ `designer-1x3.svg` - MISSING Outline (only has Inner)
- ❌ `fancy-1_5x3.svg` - MISSING Outline (only has Inner)
- ❌ `oval-1_5x3.svg` - MISSING Outline (only has Inner)
- ❌ `square-1x3.svg` - MISSING Outline (only has Inner)
- ❌ `square-1_5x3.svg` - MISSING Outline (only has Inner)

## Fix Instructions for Designer

For each 2nd gen template that's missing the Outline:

1. **Open the SVG in Illustrator**
2. **Identify the current `id="Inner"` path** - this is currently the edge
3. **Create the Outline path:**
   - Duplicate the Inner path
   - Rename it to `id="Outline"` in the Layers panel
   - This represents the physical edge of the badge
4. **Create a new inset Inner path:**
   - Select the Outline path
   - Use `Object → Path → Offset Path` with a **negative offset** (e.g., -2px or -3px)
   - This creates an inset path for the clipping area
   - Rename it to `id="Inner"` in the Layers panel
   - Remove the old Inner path
5. **Export as SVG** following the standard instructions:
   - Styling: Internal CSS
   - Font: Convert to Outlines
   - Images: Embed
   - Decimal places: 3
   - Responsive: Unchecked
   - Use Artboards: ✅ checked

## Expected Result

After fixing, each template should have:
```xml
<path id="Outline" ... />  <!-- Physical edge -->
<path id="Inner" ... />    <!-- Inset clipping area -->
```

## Files to Update
- `public/templates/designer-1x3.svg`
- `public/templates/fancy-1_5x3.svg`
- `public/templates/oval-1_5x3.svg`
- `public/templates/square-1x3.svg`
- `public/templates/square-1_5x3.svg`




