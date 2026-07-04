// Application configuration

export interface AppConfig {
  ai?: {
    model?: string;
  };
}

let config: AppConfig = {};

// Load the app config from the server. Called once at startup before rendering;
// bounded so a hanging request can never block the app from booting.
export async function loadConfig(): Promise<void> {
  try {
    const response = await fetch('/config.json', { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      config = await response.json();
    }
  } catch {
    // No server config available - AI features stay disabled
  }
}

export function getConfig(): AppConfig {
  return config;
}
