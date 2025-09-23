import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "Test Route" },
    { name: "description", content: "Test route for Remix" },
  ];
};

export default function Test() {
  return (
    <div style={{ 
      padding: '40px', 
      fontFamily: 'Arial, sans-serif',
      textAlign: 'center',
      backgroundColor: '#f0f0f0',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <h1 style={{ color: '#22c55e', fontSize: '2.5rem', marginBottom: '20px' }}>
        🎉 Test Route Working!
      </h1>
      <p style={{ fontSize: '1.2rem', marginBottom: '10px' }}>
        This confirms your Remix app routing is working correctly.
      </p>
      <p style={{ fontSize: '1rem', color: '#666' }}>
        <strong>Route:</strong> /test | <strong>Time:</strong> {new Date().toISOString()}
      </p>
    </div>
  );
} 