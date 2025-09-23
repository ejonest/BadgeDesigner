import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "Deployment Test" },
    { name: "description", content: "Testing Vercel deployment" },
  ];
};

export default function DeploymentTest() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          ✅ Deployment Test Successful!
        </h1>
        <p className="text-gray-600 mb-4">
          This page confirms that Vercel deployment is working correctly.
        </p>
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          <strong>Status:</strong> All routes are working properly
        </div>
        <div className="mt-4 text-sm text-gray-500">
          <p>Timestamp: {new Date().toISOString()}</p>
          <p>Environment: {process.env.NODE_ENV || 'development'}</p>
        </div>
      </div>
    </div>
  );
} 