// Badge Validation Utility for Stage 2 Refactor
import type { Badge, BadgeLine } from '../types/badge';
import { migrateLegacyDesignerTemplateId } from './designerTemplateMigration';
import type { LoadedTemplate } from './templates';

export const validateBadgeTemplate = (
  badge: Badge, 
  templates: LoadedTemplate[]
): Badge => {
  const migrated = migrateLegacyDesignerTemplateId(badge);
  // Ensure templateId exists and is valid
  const validTemplate = templates.find(t => t.id === migrated.templateId);
  if (!validTemplate) {
    console.warn(`Invalid templateId ${migrated.templateId}, falling back to rect-1x3`);
    return {
      ...migrated,
      templateId: 'rect-1x3'
    };
  }
  
  // Validate line positions are within template bounds
  const validatedLines = migrated.lines.map(line => ({
    ...line,
    xNorm: Math.max(0, Math.min(1, line.xNorm)),
    yNorm: Math.max(0, Math.min(1, line.yNorm)),
    sizeNorm: Math.max(0.05, Math.min(0.5, line.sizeNorm))
  }));
  
  return {
    ...migrated,
    lines: validatedLines,
    // Ensure backgroundColor is preserved
    backgroundColor: migrated.backgroundColor || '#FFFFFF'
  };
};

export const validateBadgeData = (badge: Badge): Badge => {
  const migrated = migrateLegacyDesignerTemplateId(badge);
  // Ensure required fields exist
  const validatedBadge: Badge = {
    ...migrated,
    id: migrated.id || `badge-${Date.now()}`,
    templateId: migrated.templateId || 'rect-1x3',
    lines: migrated.lines || [],
    backgroundColor: migrated.backgroundColor || '#FFFFFF',
    backing: migrated.backing || 'magnetic',
  };

  // Validate each line has required fields
  const validatedLines = validatedBadge.lines.map((line, index) => ({
    ...line,
    id: line.id || `line-${index + 1}`,
    text: line.text || '',
    xNorm: typeof line.xNorm === 'number' ? line.xNorm : 0.5,
    yNorm: typeof line.yNorm === 'number' ? line.yNorm : 0.5,
    sizeNorm: typeof line.sizeNorm === 'number' ? line.sizeNorm : 0.15,
    color: line.color || '#000000',
    bold: typeof line.bold === 'boolean' ? line.bold : false,
    italic: typeof line.italic === 'boolean' ? line.italic : false,
    fontFamily: line.fontFamily || 'Arial',
    align: line.align || 'center',
  }));

  return {
    ...validatedBadge,
    lines: validatedLines
  };
};
