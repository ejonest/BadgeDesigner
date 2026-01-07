#!/usr/bin/env node

/**
 * Template Compilation Script
 * 
 * Reads SVG templates from public/templates/*.svg
 * Compiles them into clean JSON with normalized paths
 * Outputs: app/data/templates.compiled.json
 */

const fs = require('fs');
const path = require('path');
const { DOMParser } = require('xmldom');

const DPI = 96;
const toPx = (inches) => Math.round(inches * DPI);

// Template definitions - physical dimensions
const TEMPLATE_CONFIGS = {
  'rect-1x3': { widthIn: 3.0, heightIn: 1.0 },
  'rect-2x1': { widthIn: 2.0, heightIn: 1.0 },
  'oval-1x3': { widthIn: 3.0, heightIn: 1.0 },
  'house-1_5x3': { widthIn: 1.5, heightIn: 3.0 },
  // Add more templates as needed
};

function extractElement(svgContent, id) {
  const doc = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
  const element = doc.getElementById(id);
  if (!element) return null;
  
  // Get the outerHTML equivalent
  return element.toString();
}

function sanitizePath(elementHtml, id) {
  // Remove stroke attributes that can cause clip issues
  elementHtml = elementHtml.replace(/\s+stroke(?:-width)?="[^"]*"/gi, '');
  
  // Ensure a non-none fill exists for clipping
  if (/fill\s*=\s*["']none["']/i.test(elementHtml)) {
    elementHtml = elementHtml.replace(/fill\s*=\s*["']none["']/i, 'fill="#000"');
  } else if (!/fill\s*=/.test(elementHtml)) {
    elementHtml = elementHtml.replace(/^(<\w+)/, '$1 fill="#000"');
  }
  
  // Warn if path seems open (no 'Z')
  if (/^<path\b/i.test(elementHtml) && !/Z["'\s/>]/i.test(elementHtml)) {
    console.warn(`⚠️  Template ${id}: inner path may be open (no 'Z')`);
  }
  
  return elementHtml;
}

function compileTemplate(templateId, svgPath) {
  console.log(`📦 Compiling template: ${templateId}`);
  
  const config = TEMPLATE_CONFIGS[templateId];
  if (!config) {
    throw new Error(`No config found for template: ${templateId}`);
  }
  
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  
  // Extract elements
  const innerElement = extractElement(svgContent, 'inner');
  const outlineElement = extractElement(svgContent, 'outline');
  
  if (!innerElement) {
    throw new Error(`Template ${templateId}: Missing #inner element`);
  }
  
  // Sanitize paths
  const cleanInnerPath = sanitizePath(innerElement, templateId);
  const cleanOutlinePath = outlineElement ? sanitizePath(outlineElement, templateId) : undefined;
  
  return {
    id: templateId,
    name: config.name || templateId,
    widthIn: config.widthIn,
    heightIn: config.heightIn,
    safeInsetPx: 6, // Default safe inset
    innerPathSvg: cleanInnerPath,
    outlinePathSvg: cleanOutlinePath,
  };
}

function main() {
  console.log('🚀 Starting template compilation...');
  
  const templatesDir = path.join(__dirname, '../public/templates');
  const outputFile = path.join(__dirname, '../app/data/templates.compiled.json');
  
  // Ensure output directory exists
  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const templates = [];
  
  // Find all SVG files
  const svgFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.svg'));
  
  for (const svgFile of svgFiles) {
    const templateId = path.basename(svgFile, '.svg');
    const svgPath = path.join(templatesDir, svgFile);
    
    try {
      const compiled = compileTemplate(templateId, svgPath);
      templates.push(compiled);
      console.log(`✅ ${templateId}: ${compiled.widthIn}" × ${compiled.heightIn}"`);
    } catch (error) {
      console.error(`❌ Failed to compile ${templateId}:`, error.message);
      process.exit(1);
    }
  }
  
  // Write compiled templates
  const output = {
    version: 1,
    compiledAt: new Date().toISOString(),
    templates: templates
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  
  console.log(`✅ Compiled ${templates.length} templates to ${outputFile}`);
  console.log('🎯 Templates ready for runtime loading');
}

if (require.main === module) {
  main();
}

module.exports = { compileTemplate };
