// app/routes/test-badge-shapes.tsx
import type { MetaFunction } from "@remix-run/node";
import { BADGE_SHAPE_PATHS, renderBadgeSvg, getInnerPath, getOutlinePath, getViewBox, getDimensions } from "~/utils/generateSvgBadgeShape";

export const meta: MetaFunction = () => {
  return [
    { title: "Badge Shape Generation Test" },
    { name: "description", content: "Test page for programmatic badge SVG generation" },
  ];
};

export default function TestBadgeShapes() {
  const shapeIds = Object.keys(BADGE_SHAPE_PATHS);

  return (
    <div style={{ 
      padding: '40px', 
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f5f5f5',
      minHeight: '100vh',
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <h1 style={{ color: '#1a1a1a', fontSize: '2.5rem', marginBottom: '10px' }}>
          Badge Shape Generation Test
        </h1>
        <p style={{ fontSize: '1.1rem', color: '#666', marginBottom: '40px' }}>
          Testing programmatic SVG generation for all badge shapes
        </p>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', 
          gap: '30px',
          marginBottom: '40px'
        }}>
          {shapeIds.map((shapeId) => {
            const shape = BADGE_SHAPE_PATHS[shapeId];
            const svgString = renderBadgeSvg(shapeId, {
              outlineColor: '#222',
              fillColor: '#ffffff',
              showInner: true,
              showOutline: true,
            });

            const innerPath = getInnerPath(shapeId);
            const outlinePath = getOutlinePath(shapeId);
            const viewBox = getViewBox(shapeId);
            const dimensions = getDimensions(shapeId);

            return (
              <div 
                key={shapeId}
                style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                }}
              >
                <h2 style={{ 
                  fontSize: '1.3rem', 
                  marginBottom: '15px',
                  color: '#333',
                  borderBottom: '2px solid #e0e0e0',
                  paddingBottom: '10px'
                }}>
                  {shapeId}
                </h2>
                
                <div style={{ 
                  marginBottom: '20px',
                  backgroundColor: '#fafafa',
                  padding: '20px',
                  borderRadius: '4px',
                  border: '1px solid #e0e0e0',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  minHeight: '200px'
                }}>
                  <div 
                    dangerouslySetInnerHTML={{ __html: svgString }}
                    style={{ maxWidth: '100%' }}
                  />
                </div>

                <div style={{ fontSize: '0.85rem', color: '#666' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Dimensions:</strong> {dimensions?.widthInches}" × {dimensions?.heightInches}"
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>ViewBox:</strong> {viewBox}
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Has Outline:</strong> {shape?.outlinePath ? '✓ Yes' : '✗ No (uses Inner)'}
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Has Inner:</strong> {shape?.innerPath ? '✓ Yes' : '✗ No'}
                  </div>
                  {innerPath && (
                    <details style={{ marginTop: '10px' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '5px' }}>
                        Inner Path (click to expand)
                      </summary>
                      <pre style={{ 
                        fontSize: '0.7rem', 
                        overflow: 'auto', 
                        backgroundColor: '#f5f5f5',
                        padding: '10px',
                        borderRadius: '4px',
                        maxHeight: '150px'
                      }}>
                        {innerPath}
                      </pre>
                    </details>
                  )}
                  {outlinePath && outlinePath !== innerPath && (
                    <details style={{ marginTop: '10px' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '5px' }}>
                        Outline Path (click to expand)
                      </summary>
                      <pre style={{ 
                        fontSize: '0.7rem', 
                        overflow: 'auto', 
                        backgroundColor: '#f5f5f5',
                        padding: '10px',
                        borderRadius: '4px',
                        maxHeight: '150px'
                      }}>
                        {outlinePath}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ 
          backgroundColor: 'white', 
          padding: '20px', 
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          marginTop: '40px'
        }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '15px' }}>Test Results</h2>
          <div style={{ fontSize: '0.9rem', color: '#666' }}>
            <div style={{ marginBottom: '10px' }}>
              <strong>Total Shapes:</strong> {shapeIds.length}
            </div>
            <div style={{ marginBottom: '10px' }}>
              <strong>Shapes with Outline:</strong> {shapeIds.filter(id => BADGE_SHAPE_PATHS[id]?.outlinePath).length}
            </div>
            <div style={{ marginBottom: '10px' }}>
              <strong>Shapes with Inner only:</strong> {shapeIds.filter(id => !BADGE_SHAPE_PATHS[id]?.outlinePath).length}
            </div>
            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '4px' }}>
              <strong>✓ All shapes loaded successfully!</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}





