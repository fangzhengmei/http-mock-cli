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
