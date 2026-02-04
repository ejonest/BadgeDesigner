import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Client } from '@gadget-client/allqualitybadges';

export const loader: LoaderFunction = async ({ request }) => {

  try {
    // Get environment variables
    const GADGET_API_URL = process.env.GADGET_API_URL || 'https://all-quality-badge-designer.gadget.app';
    const GADGET_API_KEY = process.env.GADGET_API_KEY;

    const healthCheck: any = {
      timestamp: new Date().toISOString(),
      environment: {
        GADGET_API_URL,
        GADGET_API_KEY: GADGET_API_KEY ? 'SET' : 'NOT SET',
        GADGET_API_KEY_LENGTH: GADGET_API_KEY ? GADGET_API_KEY.length : 0,
        allGadgetEnvVars: Object.keys(process.env).filter(key => key.includes('GADGET'))
      },
      clientTest: null,
      apiTest: null
    };

    // Test client creation
    if (GADGET_API_KEY) {
      try {
        const getEnvironmentFromUrl = (url: string): string => {
          if (url.includes('--development')) return 'development';
          if (url.includes('--staging')) return 'staging';
          if (url.includes('--production') || (url.includes('all-quality-badge-designer.gadget.app') && !url.includes('--'))) return 'production';
          return 'development';
        };

        const environment = getEnvironmentFromUrl(GADGET_API_URL);
        const gadgetClient = new Client({
          environment: environment,
          authenticationMode: { apiKey: GADGET_API_KEY },
        });

        healthCheck.clientTest = {
          success: true,
          environment,
          clientCreated: true
        };

        // Test API call
        try {
          const result = await gadgetClient.badgeDesign.findMany({
            first: 1
          });
          
          healthCheck.apiTest = {
            success: true,
            recordCount: result.length,
            canRead: true
          };
        } catch (apiError) {
          healthCheck.apiTest = {
            success: false,
            error: apiError instanceof Error ? apiError.message : 'Unknown API error',
            canRead: false
          };
        }

      } catch (clientError) {
        healthCheck.clientTest = {
          success: false,
          error: clientError instanceof Error ? clientError.message : 'Unknown client error',
          clientCreated: false
        };
      }
    } else {
      healthCheck.clientTest = {
        success: false,
        error: 'No API key configured',
        clientCreated: false
      };
    }

    return json(healthCheck);

  } catch (error) {
    console.error('Health check error:', error);
    return json({ 
      error: "Health check failed",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}; 