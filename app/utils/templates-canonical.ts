// Canonical template loader - no runtime parsing, just clean data
import compiledTemplatesData from '../data/templates.compiled.json';
import type { Template } from '../types/badge-canonical';

type CompiledTemplatesData = {
  version: number;
  compiledAt: string;
  templates: Template[];
};

const compiledData = compiledTemplatesData as CompiledTemplatesData;

// Simple template lookup - no async, no parsing, no complexity
export function loadTemplates(): Template[] {
  return compiledData.templates;
}

export function loadTemplateById(id: string): Template | null {
  return compiledData.templates.find(t => t.id === id) || null;
}

export function getTemplateDesignBox(template: Template) {
  // Calculate designBox from template dimensions
  // All templates are normalized to [0, 0, widthPx, heightPx]
  const widthPx = Math.round(template.widthIn * 96);
  const heightPx = Math.round(template.heightIn * 96);
  
  return {
    x: 0,
    y: 0,
    width: widthPx,
    height: heightPx
  };
}

// Export the compiled data for debugging
export function getCompiledData() {
  return compiledData;
}
