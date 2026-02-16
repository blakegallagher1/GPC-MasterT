/** Supported deployment environments. */
export type Environment = "development" | "staging" | "production";

/** Shape of application configuration. */
export interface AppConfig {
  /** Current environment. */
  env: Environment;
  /** Port for HTTP servers to listen on. */
  port: number;
  /** Application log level. */
  logLevel: "debug" | "info" | "warn" | "error";
  /** Base URL of the API surface. */
  apiBaseUrl: string;
}

const DEFAULTS: Record<Environment, AppConfig> = {
  development: {
    env: "development",
    port: 3000,
    logLevel: "debug",
    apiBaseUrl: "http://localhost:3000",
  },
  staging: {
    env: "staging",
    port: 8080,
    logLevel: "info",
    apiBaseUrl: "https://staging.gpc.example.com",
  },
  production: {
    env: "production",
    port: 8080,
    logLevel: "warn",
    apiBaseUrl: "https://gpc.example.com",
  },
};

function isEnvironment(value: string): value is Environment {
  return value === "development" || value === "staging" || value === "production";
}

/**
 * Load configuration for the given (or detected) environment.
 *
 * Resolution order:
 *  1. Explicit `overrides` argument.
 *  2. `NODE_ENV` environment variable.
 *  3. Falls back to `"development"`.
 */
export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const envRaw = overrides.env ?? process.env.NODE_ENV ?? "development";
  const env: Environment = isEnvironment(envRaw) ? envRaw : "development";

  const base = { ...DEFAULTS[env] };

  if (process.env.PORT) {
    const parsed = Number(process.env.PORT);
    if (!Number.isNaN(parsed) && parsed > 0) {
      base.port = parsed;
    }
  }
  if (process.env.LOG_LEVEL) {
    const lvl = process.env.LOG_LEVEL as AppConfig["logLevel"];
    if (["debug", "info", "warn", "error"].includes(lvl)) {
      base.logLevel = lvl;
    }
  }
  if (process.env.API_BASE_URL) {
    base.apiBaseUrl = process.env.API_BASE_URL;
  }

  return { ...base, ...overrides, env };
}
