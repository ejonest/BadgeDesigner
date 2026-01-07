import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BadgeImage } from '../types/badge';

interface ImagePositioningProps {
  image: string;
  type: 'background' | 'logo';
  onSave: (positionedImage: BadgeImage | string) => void;
  onCancel: () => void;
  badgeBackground?: string;
  badgeLogo?: BadgeImage;
  badgeBackgroundImage?: BadgeImage;
}

export const ImagePositioning: React.FC<ImagePositioningProps> = ({ 
  image, 
  type, 
  onSave, 
  onCancel, 
  badgeBackground,
  badgeLogo,
  badgeBackgroundImage
}) => {
  console.log('ImagePositioning props:', { image, type, badgeBackground, badgeLogo, badgeBackgroundImage });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(0.4); // Start with a reasonable size
  const [hasInitialized, setHasInitialized] = useState(false); // Track if we've set initial position
  
  console.log('ImagePositioning state:', { position: JSON.stringify(position), scale, hasInitialized });
  

  
  const [isDragging, setIsDragging] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });

  // Get background image style for the positioning canvas
  const getBackgroundImageStyle = () => {
    if (badgeBackground && badgeBackground.startsWith('url(')) {
      return {
        backgroundImage: badgeBackground,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      };
    } else if (badgeBackgroundImage) {
      // If we have a positioned background image, render it properly
      return {
        background: 'transparent' // Let the positioned image show through
      };
    }
    return {
      background: badgeBackground || '#f9fafb'
    };
  };

  // Center the image initially when scale changes, but preserve existing position when repositioning
  useEffect(() => {
    console.log('ImagePositioning useEffect triggered:', { type, image, badgeLogo, badgeBackgroundImage });
    const canvasWidth = 900;
    const canvasHeight = 300;
    
    // Create a temporary image to get its natural dimensions
    const img = new Image();
    img.onload = () => {
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      console.log('Image loaded:', { naturalWidth, naturalHeight, type });
      
      // Calculate the scaled dimensions
      const scaledWidth = naturalWidth * scale;
      const scaledHeight = naturalHeight * scale;
      
      // Check if we're repositioning an existing image
      if (type === 'logo' && badgeLogo && image === badgeLogo.src) {
        // Repositioning existing logo - use saved position
        if (!hasInitialized) {
          setPosition({
            x: (badgeLogo.x * 3),
            y: (badgeLogo.y * 3)
          });
          setScale(badgeLogo.scale * 3);
          setHasInitialized(true);
        }
      } else if (type === 'background' && badgeBackgroundImage && image === badgeBackgroundImage.src) {
        // Repositioning existing background - use saved position
        if (!hasInitialized) {
          setPosition({
            x: (badgeBackgroundImage.x * 3),
            y: (badgeBackgroundImage.y * 3)
          });
          setScale(badgeBackgroundImage.scale * 3);
          setHasInitialized(true);
        }
      } else {
        // New image - center it in the canvas
        const centerX = Math.max(0, (canvasWidth - scaledWidth) / 2);
        const centerY = Math.max(0, (canvasHeight - scaledHeight) / 2);
        
        console.log('Setting new image position:', { centerX, centerY, scaledWidth, scaledHeight });
        console.log('About to call setPosition with:', { x: centerX, y: centerY });
        setPosition({
          x: centerX,
          y: centerY
        });
        console.log('setPosition called, now setting hasInitialized');
        setHasInitialized(true);
        console.log('hasInitialized set to true');
      }
    };
    img.src = image;
  }, [image, type, badgeLogo, badgeBackgroundImage]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    
    // Store the starting positions
    dragStartRef.current = {
      x: position.x,
      y: position.y,
      startX: e.clientX,
      startY: e.clientY
    };
  }, [position.x, position.y]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    
    // Calculate the difference from start position
    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;
    
    // Update position based on delta - no constraints at all
    setPosition({
      x: dragStartRef.current.x + deltaX,
      y: dragStartRef.current.y + deltaY
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleSave = () => {
    // Convert scaled coordinates back to actual badge dimensions (300x100)
    // Since we're using transformOrigin: 'top left', we need to convert to top-left coordinates
    const canvasWidth = 900;
    const canvasHeight = 300;
    
    // Create a temporary image to get its natural dimensions
    const img = new Image();
    img.onload = () => {
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      const scaledWidth = naturalWidth * scale;
      const scaledHeight = naturalHeight * scale;
      
      // Convert from top-left to top-left coordinates for the main preview
      const topLeftX = position.x / 3;
      const topLeftY = position.y / 3;
      
      onSave({
        src: image,
        x: topLeftX,
        y: topLeftY,
        scale: scale / 3 // Divide by 3 to convert from positioning canvas scale to badge scale
      });
    };
    img.src = image;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-6xl w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">
          Position {type === 'background' ? 'Background' : 'Logo'} Image
        </h3>
        
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Scale: {scale.toFixed(2)}x
          </label>
          <input
            type="range"
            min="0.05"
            max="3"
            step="0.02"
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="text-xs text-gray-500 mt-1">
            Range: 0.05x to 3x (smooth 0.02x steps)
          </div>
        </div>

        {/* Positioning Canvas - Exact badge dimensions scaled up 3x (300x100 → 900x300) */}
        <div 
          ref={canvasRef}
          className="relative mx-auto border-2 border-gray-300"
          style={{ 
            width: 900, 
            height: 300,
            ...getBackgroundImageStyle()
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Badge outline - acts as cropping window with overflow hidden */}
          <div className="absolute border-4 border-blue-500 bg-transparent overflow-hidden" style={{
            left: 0,
            top: 0,
            width: 900,
            height: 300,
            zIndex: 10
          }}>
            {/* Render existing background image if positioning logo */}
            {type === 'logo' && badgeBackgroundImage && (
              <div
                className="absolute"
                style={{
                  left: (badgeBackgroundImage.x * 3),
                  top: (badgeBackgroundImage.y * 3),
                  transform: `scale(${badgeBackgroundImage.scale * 3})`,
                  transformOrigin: 'top left',
                  zIndex: 1
                }}
              >
                <img
                  src={badgeBackgroundImage.src}
                  alt="Background"
                  style={{
                    maxWidth: 'none',
                    maxHeight: 'none',
                    objectFit: 'contain',
                    pointerEvents: 'none'
                  }}
                />
              </div>
            )}
            {/* Background image layer - positioned inside the cropping window */}
            {console.log('Rendering draggable image:', { 
              position: JSON.stringify(position), 
              scale, 
              image: image.substring(0, 50) + '...', 
              type, 
              hasInitialized,
              renderedPosition: `left: ${position.x}px, top: ${position.y}px, scale: ${scale}`
            })}
            <div
              className="absolute cursor-move select-none"
              style={{
                left: position.x,
                top: position.y,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                zIndex: 20 // Logo should be above background
              }}
              onMouseDown={handleMouseDown}
            >
              <img
                src={image}
                alt={type}
                style={{
                  maxWidth: 'none',
                  maxHeight: 'none',
                  objectFit: 'contain',
                  pointerEvents: 'none'
                }}
                onLoad={() => console.log('Draggable image loaded successfully')}
                onError={(e) => console.error('Draggable image failed to load:', e)}
              />
            </div>
            
            {/* Show existing logo inside the cropping window if positioning background */}
            {type === 'background' && badgeLogo && (
              <div
                className="absolute"
                style={{
                  left: (badgeLogo.x * 3),
                  top: (badgeLogo.y * 3),
                  transform: `scale(${badgeLogo.scale * 3})`,
                  transformOrigin: 'top left'
                }}
              >
                <img
                  src={badgeLogo.src}
                  alt="Existing logo"
                  style={{
                    maxWidth: 'none',
                    maxHeight: 'none',
                    objectFit: 'contain',
                    pointerEvents: 'none'
                  }}
                />
              </div>
            )}
            
            {/* Add a subtle inner shadow to show the cropping effect */}
            <div className="absolute inset-0 border-2 border-white border-opacity-50 pointer-events-none"></div>
          </div>
          
          {/* Instructions */}
          <div className="absolute bottom-1 left-1 text-xs text-gray-500">
            Blue outline = cropping stencil • Image moves behind border • See exact fit
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Save Position
          </button>
        </div>
      </div>
    </div>
  );
};
