# Functions Affected by SVG Template Fill Fix

## Summary
These functions were modified to fix SVG template preview fill issues for second-generation templates, ensuring consistent transparent preview rendering across all badge templates.

---

## File: `app/utils/templates.ts`

### Function 1: `extractElement`
**Lines:** 132-164

**Purpose:** Extracts a specific SVG element by ID from the full SVG string.

**Key Changes:**
- Now uses `DOMParser` for robust element extraction
- Always returns the actual element (`outerHTML`), never parent `<g>` tags
- Handles both lowercase and uppercase ID variants
- Added console logging for debugging

```132:164:app/utils/templates.ts
function extractElement(svg: string, id: "inner" | "outline"): string | undefined {
  // Use DOMParser for robust element extraction
  if (typeof window !== "undefined" && "DOMParser" in window) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, "image/svg+xml");
    
    // Try both lowercase and uppercase versions
    const el =
      (doc.getElementById(id) as SVGGraphicsElement | null) ||
      (doc.getElementById(id.charAt(0).toUpperCase() + id.slice(1)) as SVGGraphicsElement | null) ||
      null;
    
    if (el) {
      // Always return the actual element, never parent <g> tags
      // This ensures consistent downstream treatment
      const result = el.outerHTML;
      console.log(`[extractElement] (${id}):`, result);
      return result;
    }
    return undefined;
  }
  
  // SSR fallback: regex for whole element tag with id (case insensitive)
  const rx = new RegExp(`<(?:path|ellipse)[^>]*\\bid=["']${id}["'][\\s\\S]*?>`, "i");
  const m = svg.match(rx);
  if (m) return m[0];
  
  // Try uppercase version
  const upperId = id.charAt(0).toUpperCase() + id.slice(1);
  const rxUpper = new RegExp(`<(?:path|ellipse)[^>]*\\bid=["']${upperId}["'][\\s\\S]*?>`, "i");
  const mUpper = svg.match(rxUpper);
  return mUpper?.[0];
}
```

---

### Function 2: `resolveCssFill`
**Lines:** 34-88

**Purpose:** Resolves CSS class-based fill values and applies them as inline attributes to SVG elements.

**Key Changes:**
- Strips CDATA markers from `<style>` sections
- Uses DOM parsing to apply resolved fills to matching elements
- Handles multiple class names on elements
- Added console logging for debugging

```34:88:app/utils/templates.ts
function resolveCssFill(svg: string, element: string): string {
  // Find class on element
  const classMatch = element.match(/class\s*=\s*["']([^"']+)["']/i);
  if (!classMatch) {
    console.log(`[resolveCssFill] No class found in element`);
    return element;
  }
  
  const classNames = classMatch[1].split(/\s+/);
  let resolvedFill: string | null = null;
  
  if (svg) {
    const styleMatch = svg.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (styleMatch) {
      // Remove CDATA markers if present
      let css = styleMatch[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '');
      
      for (const className of classNames) {
        // Escape special regex characters in className
        const escapedClassName = className.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
        const classStyleRegex = new RegExp(`\\.${escapedClassName}\\s*\\{[^}]*fill\\s*:\\s*([^;\\}]+)`, 'i');
        const cssMatch = css.match(classStyleRegex);
        if (cssMatch) {
          resolvedFill = cssMatch[1].trim().replace(/^["']|["']$/g, '');
          console.log(`[resolveCssFill] Resolved fill for class ${className}: ${resolvedFill}`);
          break;
        }
      }
    }
  }
  
  if (resolvedFill) {
    // Use DOM parsing to apply fill attribute to all matching elements
    if (typeof window !== "undefined" && "DOMParser" in window) {
      const parser = new DOMParser();
      // Wrap element in a temporary container for parsing
      const wrapped = `<svg xmlns="http://www.w3.org/2000/svg">${element}</svg>`;
      const doc = parser.parseFromString(wrapped, "image/svg+xml");
      
      // Find all elements with the matching classes and set fill attribute
      const selector = classNames.map(cn => `[class*="${cn}"]`).join(', ');
      doc.querySelectorAll(selector).forEach((el) => {
        el.setAttribute("fill", resolvedFill!);
      });
      
      // Extract the inner element back out
      const svgEl = doc.documentElement;
      const output = svgEl.innerHTML;
      console.log(`[resolveCssFill] Output:`, output);
      return output;
    }
  }
  
  return element;
}
```

---

### Function 3: `sanitizeInnerForClip`
**Lines:** 90-109

**Purpose:** Sanitizes the inner element for use in clipPath, ensuring it has a non-none fill for clipping.

**Key Changes:**
- Now calls `resolveCssFill` with SVG content to resolve CSS fills first
- Ensures a non-none fill exists for clipping (clipPaths require filled shapes)

```90:109:app/utils/templates.ts
function sanitizeInnerForClip(el: string, id: string, svg?: string): string {
  // If SVG is provided, resolve CSS classes first
  if (svg) {
    el = resolveCssFill(svg, el);
  }
  
  // strip stroke attrs that can cause odd clip behavior
  el = el.replace(/\s+stroke(?:-width)?="[^"]*"/gi, "");
  // ensure a non-none fill exists
  if (/fill\s*=\s*["']none["']/i.test(el)) {
    el = el.replace(/fill\s*=\s*["']none["']/i, 'fill="#000"');
  } else if (!/fill\s*=/.test(el)) {
    el = el.replace(/^(<\w+)/, '$1 fill="#000"');
  }
  // warn if <path> seems open (no 'Z')
  if (/^<path\b/i.test(el) && !/Z["'\s/>]/i.test(el)) {
    console.warn(`[templates] inner path for ${id} may be open (no 'Z').`);
  }
  return el;
}
```

---

### Function 4: `loadOne` (calls affected functions)
**Lines:** 166-221

**Purpose:** Loads a single template configuration and extracts inner/outline elements.

**Key Changes:**
- Now passes SVG content to `sanitizeInnerForClip` so it can resolve CSS classes

```199:206:app/utils/templates.ts
  const innerEl = extractElement(svg, "inner");
  if (!innerEl)
    throw new Error(`[templates] ${c.svgFile} missing element with id="inner" (closed path/ellipse)`);

  const outlineEl = extractElement(svg, "outline");

  // Pass svg to sanitizeInnerForClip so it can resolve CSS classes
  const innerElSanitized = sanitizeInnerForClip(innerEl, c.id, svg);
```

---

## File: `app/utils/renderSvg.ts`

### Function 5: `prepareElementForOutline`
**Lines:** 97-132

**Purpose:** Prepares SVG elements for outline display by removing existing fill/stroke attributes and applying display attributes.

**Key Changes:**
- Uses DOM parsing to robustly remove and set attributes on all relevant SVG shape elements
- Handles nested structures and multiple element types
- Added console logging for debugging

```97:132:app/utils/renderSvg.ts
/**
 * Remove fill/stroke attributes from all descendant SVG shapes
 * and apply correct display attributes.
 * Uses DOM parsing for robust attribute manipulation.
 */
function prepareElementForOutline(element: string, fill: string, stroke: string, strokeWidth: string): string {
  if (typeof window !== "undefined" && "DOMParser" in window) {
    const parser = new DOMParser();
    // Wrap element in a temporary container for parsing
    const wrapped = `<svg xmlns="http://www.w3.org/2000/svg">${element}</svg>`;
    const doc = parser.parseFromString(wrapped, "image/svg+xml");
    
    // Find all relevant SVG shape elements and update their attributes
    // This handles both direct elements and nested structures
    doc.querySelectorAll("[id='Inner'], [id='inner'], path, rect, ellipse, circle, polygon, polyline").forEach((el) => {
      el.removeAttribute("fill");
      el.removeAttribute("stroke");
      el.removeAttribute("stroke-width");
      el.setAttribute("fill", fill);
      el.setAttribute("stroke", stroke);
      el.setAttribute("stroke-width", strokeWidth);
    });
    
    // Extract the inner element back out
    const svgEl = doc.documentElement;
    const output = svgEl.innerHTML;
    console.log('[prepareElementForOutline] Output:', output);
    return output;
  }
  
  // Fallback for SSR: use regex (less robust but works)
  let cleaned = element.replace(/\s+fill\s*=\s*["'][^"']*["']/gi, '');
  cleaned = cleaned.replace(/\s+stroke\s*=\s*["']*["']/gi, '');
  cleaned = cleaned.replace(/\s+stroke-width\s*=\s*["'][^"']*["']/gi, '');
  return cleaned.replace(/\/?>$/, ` fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
}
```

---

### Function 6: `renderBadgeToSvgString` (calls `prepareElementForOutline`)
**Lines:** 134-217

**Purpose:** Renders a badge to SVG string for preview display.

**Key Changes:**
- Uses `prepareElementForOutline` for both `outlineElement` and `innerElement` when rendering outlines

```174:185:app/utils/renderSvg.ts
  const outline = (() => {
    if (!opts.showOutline) return "";
    
    if (template.outlineElement) {
      // Use dedicated outline element if available
      return prepareElementForOutline(template.outlineElement, "none", "#222", "1.25");
    } else {
      // Fallback: use inner element with stroke
      // Remove fill that was added for clipping, then add display attributes
      return prepareElementForOutline(template.innerElement, "none", "#222", "1.25");
    }
  })();
```

```210:214:app/utils/renderSvg.ts
    <!-- Outline always on top -->
    ${template.outlineElement ? 
      prepareElementForOutline(template.outlineElement, "none", "#111", "1.25") :
      prepareElementForOutline(template.innerElement, "none", "#111", "1.25")
    }
```

---

### Function 7: `renderBadgeToSvgStringWithFonts` (calls `prepareElementForOutline`)
**Lines:** 220-357

**Purpose:** Renders a badge to SVG string with embedded fonts for consistent export rendering.

**Key Changes:**
- Uses `prepareElementForOutline` for both `outlineElement` and `innerElement` when rendering outlines (same as `renderBadgeToSvgString`)

```313:322:app/utils/renderSvg.ts
  const outline = (() => {
    if (!opts.showOutline) return "";
    
    if (template.outlineElement) {
      return prepareElementForOutline(template.outlineElement, "none", "#222", "1.25");
    } else {
      // Remove fill that was added for clipping, then add display attributes
      return prepareElementForOutline(template.innerElement, "none", "#222", "1.25");
    }
  })();
```

```350:354:app/utils/renderSvg.ts
    <!-- Outline always on top -->
    ${template.outlineElement ? 
      prepareElementForOutline(template.outlineElement, "none", "#111", "1.25") :
      prepareElementForOutline(template.innerElement, "none", "#111", "1.25")
    }
```

---

## SVG Files Modified

The following SVG template files were standardized to have only the `id="Inner"` path with explicit `fill="none"`:

- `public/templates/designer-1x3.svg`
- `public/templates/fancy-1_5x3.svg`
- `public/templates/oval-1_5x3.svg`
- `public/templates/square-1x3.svg`
- `public/templates/square-1_5x3.svg`

**Changes made to each:**
1. Removed all `<path>` elements except the one with `id="Inner"`
2. Added explicit `fill="none"` attribute to the `id="Inner"` path

---

## Testing Notes

- **Working templates:** `house-1.5x3.svg`, `round-1x3.svg`, `round-1.5x3.svg` (these were not modified)
- **Fixed templates:** All 5 second-generation templates listed above
- **Expected behavior:** Inner element should appear transparent in preview, with only the outline visible

---

## Related Commits

- Commit: `fix(templates): standardize second-gen badge SVGs for correct transparent preview`
- Branch: `November-2025-Phase-II`

