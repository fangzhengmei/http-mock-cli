import { MockRoute, MockResponse } from '../types';
import { match, PathMatch } from 'path-to-regexp';

interface MatchResult {
  route: MockRoute;
  params: Record<string, string>;
}

export class Router {
  private routes: MockRoute[];

  constructor(routes: MockRoute[] = []) {
    this.routes = routes;
  }

  addRoute(route: MockRoute): void {
    this.routes.push(route);
  }

  setRoutes(routes: MockRoute[]): void {
    this.routes = routes;
  }

  match(method: string, path: string): MatchResult | null {
    const upperMethod = method.toUpperCase();

    for (const route of this.routes) {
      if (route.method.toUpperCase() !== upperMethod) {
        continue;
      }

      const matcher = match<Record<string, string>>(route.path, { decode: decodeURIComponent });
      const result = matcher(path);

      if (result) {
        return {
          route,
          params: result.params,
        };
      }
    }

    return null;
  }

  getAllRoutes(): MockRoute[] {
    return [...this.routes];
  }
}
