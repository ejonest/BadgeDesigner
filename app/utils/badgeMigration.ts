// Badge Migration Utility for Stage 3 Refactor
import type { Badge, BadgeLine } from '../types/badge';
import type { LoadedTemplate } from './templates';

export const migrateBadgeToTemplate = (
  badge: Badge,
  oldTemplate: LoadedTemplate,
  newTemplate: LoadedTemplate
): Badge => {
  // Check if migration is needed
  if (oldTemplate.id === newTemplate.id) {
    return badge; // No migration needed
  }
  
  console.log(`[Migration] Migrating badge from ${oldTemplate.id} to ${newTemplate.id}`);
  
  // Calculate migration factors
  const oldDesignBox = oldTemplate.designBox;
  const newDesignBox = newTemplate.designBox;
  
  const scaleX = newDesignBox.width / oldDesignBox.width;
  const scaleY = newDesignBox.height / oldDesignBox.height;
  
  console.log(`[Migration] Scale factors: X=${scaleX.toFixed(3)}, Y=${scaleY.toFixed(3)}`);
  
  // Migrate line positions
  const migratedLines = badge.lines.map((line, index) => {
    // If using normalized coordinates, they should remain valid
    // But we may need to adjust for different design box ratios
    let newXNorm = line.xNorm;
    let newYNorm = line.yNorm;
    let newSizeNorm = line.sizeNorm;
    
    // Only adjust if aspect ratios are significantly different
    const aspectRatioChange = Math.abs(scaleX - scaleY);
    if (aspectRatioChange > 0.1) {
      // Adjust for aspect ratio changes
      newXNorm = Math.max(0, Math.min(1, line.xNorm));
      newYNorm = Math.max(0, Math.min(1, line.yNorm));
      
      console.log(`[Migration] Line ${index + 1}: Aspect ratio change detected, keeping normalized coords`);
    }
    
    // Adjust font size based on template height changes
    const heightRatio = newDesignBox.height / oldDesignBox.height;
    if (Math.abs(heightRatio - 1) > 0.1) {
      newSizeNorm = Math.max(0.05, Math.min(0.5, line.sizeNorm * heightRatio));
      console.log(`[Migration] Line ${index + 1}: Font size adjusted by ${heightRatio.toFixed(3)}`);
    }
    
    return {
      ...line,
      xNorm: newXNorm,
      yNorm: newYNorm,
      sizeNorm: newSizeNorm
    };
  });
  
  return {
    ...badge,
    templateId: newTemplate.id,
    lines: migratedLines
  };
};

export const checkTemplateCompatibility = (
  badge: Badge,
  template: LoadedTemplate
): { compatible: boolean; warnings: string[] } => {
  const warnings: string[] = [];
  
  // Check if any lines are out of bounds
  badge.lines.forEach((line, index) => {
    if (line.xNorm < 0 || line.xNorm > 1) {
      warnings.push(`Line ${index + 1} X position is out of bounds (${line.xNorm.toFixed(3)})`);
    }
    if (line.yNorm < 0 || line.yNorm > 1) {
      warnings.push(`Line ${index + 1} Y position is out of bounds (${line.yNorm.toFixed(3)})`);
    }
    if (line.sizeNorm < 0.05 || line.sizeNorm > 0.5) {
      warnings.push(`Line ${index + 1} font size is outside recommended range (${line.sizeNorm.toFixed(3)})`);
    }
  });
  
  // Check template-specific constraints
  if (template.id === 'house-1_5x3' && badge.lines.length > 3) {
    warnings.push('House template works best with 3 or fewer text lines');
  }
  
  if (template.id === 'oval-1_5x3' && badge.lines.some(line => line.align === 'left' || line.align === 'right')) {
    warnings.push('Oval template works best with center-aligned text');
  }
  
  return {
    compatible: warnings.length === 0,
    warnings
  };
};

export const suggestTemplateOptimizations = (
  badge: Badge,
  template: LoadedTemplate
): string[] => {
  const suggestions: string[] = [];
  
  // Suggest optimizations based on template type
  if (template.id === 'house-1_5x3') {
    if (badge.lines.length > 2) {
      suggestions.push('Consider reducing text lines for better fit in house shape');
    }
  }
  
  if (template.id === 'oval-1_5x3') {
    const hasNonCenterAlign = badge.lines.some(line => line.align !== 'center');
    if (hasNonCenterAlign) {
      suggestions.push('Center alignment recommended for oval templates');
    }
  }
  
  // Check for very small or large font sizes
  badge.lines.forEach((line, index) => {
    if (line.sizeNorm < 0.08) {
      suggestions.push(`Line ${index + 1} font size may be too small for readability`);
    }
    if (line.sizeNorm > 0.3) {
      suggestions.push(`Line ${index + 1} font size may be too large for template`);
    }
  });
  
  return suggestions;
};

/**
 * Migrates legacy badges to ensure they have all required properties
 */
export const migrateLegacyBadge = (badge: any): Badge => {
  const migratedBadge: Badge = {
    id: badge.id || `badge-${Date.now()}`,
    templateId: badge.templateId || 'rect-1x3',
    lines: badge.lines || [],
    backgroundColor: badge.backgroundColor || '#FFFFFF', // CRITICAL: Ensure backgroundColor exists
    backing: badge.backing || 'pin',
    ...badge
  };

  // Validate and migrate lines
  migratedBadge.lines = migratedBadge.lines.map((line, index) => ({
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
    ...line
  }));

  console.log(`[MIGRATION] Migrated badge with backgroundColor: ${migratedBadge.backgroundColor}`);
  return migratedBadge;
};

/**
 * Migrates an array of badges, ensuring all have proper backgroundColor
 */
export const migrateBadgeArray = (badges: any[]): Badge[] => {
  return badges.map((badge, index) => {
    const migrated = migrateLegacyBadge(badge);
    console.log(`[MIGRATION] Badge ${index + 1} migrated with backgroundColor: ${migrated.backgroundColor}`);
    return migrated;
  });
};
