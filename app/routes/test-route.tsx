export default function TestRoute() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: 'green' }}>🎉 Test Route Working!</h1>
      <p>This confirms Remix routing is working correctly.</p>
      <p><strong>Route:</strong> /test-route</p>
      <p><strong>Time:</strong> {new Date().toISOString()}</p>
    </div>
  );
} 