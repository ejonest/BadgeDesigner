import React, { useState, useEffect } from 'react';
import { Badge } from '../types/badge';
import { computeBadgeLayout } from '../utils/layoutEngine';
import { PreviewRenderer } from '../utils/renderers/previewRenderer';
import { BadgeSvgRenderer } from '../../src/components/BadgeSvgRenderer';

interface LayoutEngineTestProps {
  badge: Badge;
}

export const LayoutEngineTest: React.FC<LayoutEngineTestProps> = ({ badge }) => {
  const [layout, setLayout] = useState<any>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    computeLayout();
  }, [badge]);

  const computeLayout = () => {
    try {
      const computedLayout = computeBadgeLayout(badge);
      setLayout(computedLayout);
      console.log('Computed layout:', computedLayout);
    } catch (err) {
      setError(`Layout computation error: ${err}`);
    }
  };

  const runComparison = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await PreviewRenderer.compareRendering(badge);
      setComparison(result);
      console.log('Comparison result:', result);
    } catch (err) {
      setError(`Comparison error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const renderLayoutInfo = () => {
    if (!layout) return null;

    return (
      <div className="bg-gray-50 p-4 rounded-lg mb-4">
        <h3 className="text-lg font-semibold mb-2">Layout Engine Output</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <strong>Layout Hash:</strong> {layout.layoutHash}
          </div>
          <div>
            <strong>Total Height:</strong> {layout.totalHeight}px
          </div>
          <div>
            <strong>Badge Dimensions:</strong> {layout.badgeWidth} × {layout.badgeHeight}px
          </div>
          <div>
            <strong>Background:</strong> {layout.backgroundColor}
          </div>
        </div>
        
        <div className="mt-4">
          <strong>Text Lines:</strong>
          <div className="mt-2 space-y-2">
            {layout.lines.map((line: any, index: number) => (
              <div key={index} className="bg-white p-2 rounded border text-xs">
                <div><strong>Text:</strong> "{line.text}"</div>
                <div><strong>Font:</strong> {line.fontFamily} {line.bold ? 'Bold' : 'Regular'}</div>
                <div><strong>Size:</strong> {line.fontSize}px</div>
                <div><strong>Position:</strong> ({line.x}, {line.y})</div>
                <div><strong>Dimensions:</strong> {line.width} × {line.height}px</div>
                <div><strong>Alignment:</strong> {line.alignment}</div>
                <div><strong>Color:</strong> {line.color}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderComparison = () => {
    if (!comparison) return null;

    return (
      <div className="bg-blue-50 p-4 rounded-lg mb-4">
        <h3 className="text-lg font-semibold mb-2">Rendering Comparison</h3>
        
        {comparison.differences.length > 0 ? (
          <div className="bg-yellow-100 p-3 rounded mb-4">
            <strong>Differences Found:</strong>
            <ul className="list-disc list-inside mt-1">
              {comparison.differences.map((diff: string, index: number) => (
                <li key={index}>{diff}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="bg-green-100 p-3 rounded mb-4">
            <strong>✓ No differences detected</strong>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="font-semibold mb-2">Layout Engine Render</h4>
            <canvas 
              ref={(canvas) => {
                if (canvas && comparison.layoutEngine) {
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    canvas.width = comparison.layoutEngine.width;
                    canvas.height = comparison.layoutEngine.height;
                    ctx.drawImage(comparison.layoutEngine, 0, 0);
                  }
                }
              }}
              className="border border-gray-300 rounded"
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>
          <div>
            <h4 className="font-semibold mb-2">Legacy Render</h4>
            <canvas 
              ref={(canvas) => {
                if (canvas && comparison.legacy) {
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    canvas.width = comparison.legacy.width;
                    canvas.height = comparison.legacy.height;
                    ctx.drawImage(comparison.legacy, 0, 0);
                  }
                }
              }}
              className="border border-gray-300 rounded"
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Layout Engine Test</h2>
      
      {/* Current Badge Preview */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Current Badge Preview</h3>
        <BadgeSvgRenderer badge={badge} />
      </div>

      {/* Layout Information */}
      {renderLayoutInfo()}

      {/* Comparison Controls */}
      <div className="mb-6">
        <button
          onClick={runComparison}
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-4 py-2 rounded"
        >
          {loading ? 'Running Comparison...' : 'Compare Rendering Methods'}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Comparison Results */}
      {renderComparison()}

      {/* Debug Information */}
      <div className="bg-gray-100 p-4 rounded">
        <h3 className="text-lg font-semibold mb-2">Debug Information</h3>
        <div className="text-sm">
          <div><strong>Badge Lines:</strong> {badge.lines.length}</div>
          <div><strong>Background Color:</strong> {badge.backgroundColor}</div>
          <div><strong>Backing:</strong> {badge.backing}</div>
          <div className="mt-2">
            <strong>Line Details:</strong>
            {badge.lines.map((line, index) => (
              <div key={index} className="ml-4 mt-1">
                Line {index + 1}: "{line.text}" - {line.fontFamily} {line.size}px
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
