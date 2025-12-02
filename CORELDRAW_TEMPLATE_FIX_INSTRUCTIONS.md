# CorelDRAW Instructions - Fixing 2nd Gen Badge Templates

## Problem
These templates are missing the `id="Outline"` path:
- `designer-1x3.svg`
- `fancy-1_5x3.svg`
- `oval-1_5x3.svg`
- `square-1x3.svg`
- `square-1_5x3.svg`

They only have `id="Inner"`, but need both `id="Outline"` (edge) and `id="Inner"` (inset clipping area).

---

## Step-by-Step Instructions for CorelDRAW

### Step 1: Open the SVG File
1. Open CorelDRAW
2. **File → Open** → Select the template SVG file (e.g., `designer-1x3.svg`)
3. The file should open with the current `id="Inner"` path visible

### Step 2: Identify the Current Inner Path
1. Open the **Object Manager** dock window:
   - **Window → Dockers → Object Manager** (or press `Alt + D`)
2. Find the path with `id="Inner"` in the layer structure
3. This path currently represents the **edge** of the badge

### Step 3: Create the Outline Path (Physical Edge)
1. **Select the Inner path** (click on it in the Object Manager or on the page)
2. **Edit → Duplicate** (or press `Ctrl + D`) to create a copy
3. In the **Object Manager**, rename this duplicate:
   - Right-click the duplicate → **Rename**
   - Change the name to: `Outline`
   - **Important:** CorelDRAW will use this name as the `id` attribute in the exported SVG

### Step 4: Create the New Inset Inner Path (Clipping Area)
1. **Select the Outline path** (the one you just created)
2. Go to **Effects → Contour** (or press `Ctrl + F9`)
3. In the Contour docker:
   - **Contour Type:** Select "Inside" (the middle icon)
   - **Offset:** Enter a negative value (e.g., `-2.0` or `-3.0` pixels)
     - For 1×3" badges: use `-2.0` to `-3.0` pixels
     - For 1.5×3" badges: use `-2.5` to `-3.5` pixels
   - **Steps:** Set to `1`
   - Click **Apply**
4. **Break the contour apart:**
   - **Arrange → Break Contour Group Apart** (or press `Ctrl + K`)
   - This separates the outer and inner paths
5. **Delete the outer path** (the original Outline), keeping only the **inner inset path**
6. **Rename the inset path:**
   - In Object Manager, right-click the inset path → **Rename**
   - Change to: `Inner`
   - **Delete the old Inner path** (the one that was the edge)

### Step 5: Verify Layer Structure
In Object Manager, you should now see:
```
Layer_x0020_1
  └─ Outline  (the edge path)
  └─ Inner    (the inset clipping path)
```

### Step 6: Position Paths at Origin
1. Select both paths (hold `Shift` and click both in Object Manager)
2. **Arrange → Align and Distribute → Align to Page**
3. Make sure both paths are aligned to `(0, 0)` relative to the artboard

### Step 7: Clean Up Paths
1. Select each path individually
2. **Arrange → Convert to Curves** (if not already curves)
3. **Arrange → Simplify** to reduce unnecessary nodes (optional, but recommended)

### Step 8: Export as SVG
1. **File → Export** (or press `Ctrl + E`)
2. Choose location and filename (keep the same name, e.g., `designer-1x3.svg`)
3. In the **SVG Export** dialog:
   - **Styling:** Select "Internal CSS"
   - **Font:** Select "Convert to Outlines" (if any text exists)
   - **Images:** Select "Embed"
   - **Decimal places:** Set to `3`
   - **Responsive:** **Unchecked** ❌
   - **Use Artboards:** **Checked** ✅
4. Click **OK**

### Step 9: Verify the Export
1. Open the exported SVG file in a text editor
2. Search for `id="Outline"` - should find one path
3. Search for `id="Inner"` - should find one path (different from Outline)
4. Both should be present in the file

---

## Alternative Method: Using Offset Path (If Contour Doesn't Work)

If the Contour method doesn't give the desired result:

1. **Select the Outline path**
2. **Arrange → Convert to Curves** (if needed)
3. **Arrange → Offset Path** (or look for "Create Boundary" tool)
   - Set offset to negative value (e.g., `-2.0` pixels)
   - This creates an inset path
4. **Break apart** if needed (`Ctrl + K`)
5. **Rename** the inset path to `Inner`

---

## Quick Reference: Offset Values by Template Size

| Template Size | Recommended Inset |
|---------------|-------------------|
| 1×3" (1in tall) | -2.0 to -3.0 pixels |
| 1.5×3" (1.5in tall) | -2.5 to -3.5 pixels |

---

## Troubleshooting

### Problem: Paths don't have the correct IDs after export
**Solution:** Make sure you renamed them in Object Manager BEFORE exporting. CorelDRAW uses the object name as the SVG `id`.

### Problem: Contour creates multiple steps
**Solution:** Set "Steps" to `1` in the Contour docker, then break apart and delete extra paths.

### Problem: Inset path is too small or too large
**Solution:** Adjust the offset value. Smaller negative values = less inset. Larger negative values = more inset.

### Problem: Paths are not aligned
**Solution:** Use **Arrange → Align and Distribute → Align to Page** to center both paths at origin.

---

## Files to Fix

Apply these steps to:
- ✅ `designer-1x3.svg`
- ✅ `fancy-1_5x3.svg`
- ✅ `oval-1_5x3.svg`
- ✅ `square-1x3.svg`
- ✅ `square-1_5x3.svg`

---

## Expected Final Structure

After fixing, each SVG should have:
```xml
<path id="Outline" ... />  <!-- Physical edge of badge -->
<path id="Inner" ... />    <!-- Inset clipping area (2-3px inside edge) -->
```

Both paths should be in the same layer and properly named in Object Manager.




