export interface MockResponse {
  status: number;
  headers?: Record<string, string>;
  body?: any;
  delay?: number;
}

export interface MockRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  path: string;
  response: MockResponse | ((params: Record<string, string>, query: Record<string, string>, body: any) => MockResponse | Promise<MockResponse>);
  description?: string;
}

export interface MockConfig {
  port?: number;
  routes: MockRoute[];
  defaultResponse?: MockResponse;
}

export type HotReloadStatus = 'success' | 'error' | 'initial';

export interface HotReloadEvent {
  timestamp: number;
  version: number;
  success: boolean;
  errorMessage?: string;
  retryCount?: number;
}

export interface HotReloadState {
  currentVersion: number;
  status: HotReloadStatus;
  lastSuccess: {
    timestamp: number;
    version: number;
  } | null;
  lastFailure: {
    timestamp: number;
    version: number;
    errorMessage: string;
  } | null;
  consecutiveFailures: number;
  totalSuccesses: number;
  totalFailures: number;
  recentEvents: HotReloadEvent[];
}
