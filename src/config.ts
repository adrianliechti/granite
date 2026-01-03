// Application configuration

export interface AppConfig {
  ai?: {
    model?: string;
  };
}

// Default configuration
const defaultConfig: AppConfig = {
  ai: {
    model: 'gpt-4o',
  },
};

// Get the app config from window or use defaults
export function getConfig(): AppConfig {
  // Check if config is defined on window (can be set via index.html or env)
  if (typeof window !== 'undefined' && (window as unknown as { __APP_CONFIG__?: AppConfig }).__APP_CONFIG__) {
    return {
      ...defaultConfig,
      ...(window as unknown as { __APP_CONFIG__?: AppConfig }).__APP_CONFIG__,
    };
  }
  return defaultConfig;
}
