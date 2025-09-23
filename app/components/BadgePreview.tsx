import React from 'react';
import { Badge, BadgeLine } from '../types/badge';
import { BADGE_CONSTANTS } from '../constants/badge';

interface BadgePreviewProps {
  badge: Badge;
  className?: string;
  isMultiple?: boolean;
}

export const BadgePreview: React.FC<BadgePreviewProps> = ({ 
  badge, 
  className = '', 
  isMultiple = false 
}) => {
  return (
    <div 
      className={`relative flex items-center justify-center rounded-lg border-2 w-full ${
        isMultiple ? 'badge-preview-multiple' : 'badge-preview'
      } ${className}`}
      style={{
        width: BADGE_CONSTANTS.BADGE_WIDTH,
        height: BADGE_CONSTANTS.BADGE_HEIGHT,
        background: badge.backgroundColor,
        borderColor: '#888',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}
    >
      <div
        className="w-full h-full flex flex-col justify-center items-center px-4"
        style={{ 
          textAlign: badge.lines[0]?.alignment || 'center',
          gap: '0.25rem'
        }}
      >
        {badge.lines.map((line: BadgeLine, idx: number) => (
          <span
            key={idx}
            className="whitespace-nowrap"
            style={{
              fontSize: line.size,
              color: line.color,
              fontWeight: line.bold ? 'bold' : 'normal',
              fontStyle: line.italic ? 'italic' : 'normal',
              textDecoration: line.underline ? 'underline' : 'none',
              fontFamily: line.fontFamily,
              lineHeight: BADGE_CONSTANTS.LINE_HEIGHT_MULTIPLIER,
              textShadow: '0 1px 2px rgba(0,0,0,0.1)',
              width: '100%',
              textAlign: line.alignment || 'center'
            }}
          >
            {line.text}
          </span>
        ))}
      </div>
    </div>
  );
}; 