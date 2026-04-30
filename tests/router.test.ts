import { Router } from '../src/core/router';
import { MockRoute } from '../src/types';

describe('Router', () => {
  let router: Router;

  const testRoutes: MockRoute[] = [
    {
      method: 'GET',
      path: '/users',
      response: { status: 200, body: { users: [] } },
    },
    {
      method: 'GET',
      path: '/users/:id',
      response: { status: 200, body: { user: {} } },
    },
    {
      method: 'POST',
      path: '/users',
      response: { status: 201, body: { created: true } },
    },
    {
      method: 'PUT',
      path: '/users/:id',
      response: { status: 200, body: { updated: true } },
    },
    {
      method: 'DELETE',
      path: '/users/:id',
      response: { status: 204 },
    },
    {
      method: 'GET',
      path: '/api/v1/:resource',
      response: { status: 200 },
    },
  ];

  beforeEach(() => {
    router = new Router();
  });

  describe('constructor', () => {
    it('should create an empty router when no routes provided', () => {
      const emptyRouter = new Router();
      expect(emptyRouter.getAllRoutes()).toEqual([]);
    });

    it('should initialize with provided routes', () => {
      const routerWithRoutes = new Router(testRoutes);
      expect(routerWithRoutes.getAllRoutes()).toEqual(testRoutes);
    });
  });

  describe('addRoute', () => {
    it('should add a single route', () => {
      router.addRoute(testRoutes[0]);
      expect(router.getAllRoutes()).toHaveLength(1);
      expect(router.getAllRoutes()[0]).toEqual(testRoutes[0]);
    });

    it('should add multiple routes', () => {
      testRoutes.forEach(route => router.addRoute(route));
      expect(router.getAllRoutes()).toHaveLength(testRoutes.length);
    });
  });

  describe('setRoutes', () => {
    it('should replace all existing routes', () => {
      router.addRoute(testRoutes[0]);
      router.setRoutes([testRoutes[1], testRoutes[2]]);
      expect(router.getAllRoutes()).toEqual([testRoutes[1], testRoutes[2]]);
    });

    it('should set empty routes', () => {
      router.addRoute(testRoutes[0]);
      router.setRoutes([]);
      expect(router.getAllRoutes()).toEqual([]);
    });
  });

  describe('match', () => {
    beforeEach(() => {
      testRoutes.forEach(route => router.addRoute(route));
    });

    it('should match exact GET route', () => {
      const result = router.match('GET', '/users');
      expect(result).not.toBeNull();
      expect(result?.route).toEqual(testRoutes[0]);
      expect(result?.params).toEqual({});
    });

    it('should match GET route with path parameter', () => {
      const result = router.match('GET', '/users/123');
      expect(result).not.toBeNull();
      expect(result?.route).toEqual(testRoutes[1]);
      expect(result?.params).toEqual({ id: '123' });
    });

    it('should match POST route', () => {
      const result = router.match('POST', '/users');
      expect(result).not.toBeNull();
      expect(result?.route).toEqual(testRoutes[2]);
    });

    it('should match PUT route with path parameter', () => {
      const result = router.match('PUT', '/users/456');
      expect(result).not.toBeNull();
      expect(result?.route).toEqual(testRoutes[3]);
      expect(result?.params).toEqual({ id: '456' });
    });

    it('should match DELETE route with path parameter', () => {
      const result = router.match('DELETE', '/users/789');
      expect(result).not.toBeNull();
      expect(result?.route).toEqual(testRoutes[4]);
    });

    it('should match nested path parameters', () => {
      const result = router.match('GET', '/api/v1/posts');
      expect(result).not.toBeNull();
      expect(result?.params).toEqual({ resource: 'posts' });
    });

    it('should return null for non-existent route', () => {
      const result = router.match('GET', '/non-existent');
      expect(result).toBeNull();
    });

    it('should return null for wrong method', () => {
      const result = router.match('PATCH', '/users');
      expect(result).toBeNull();
    });

    it('should be case-insensitive for method', () => {
      const result1 = router.match('get', '/users');
      const result2 = router.match('Get', '/users');
      const result3 = router.match('GET', '/users');

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result3).not.toBeNull();
    });
  });

  describe('getAllRoutes', () => {
    it('should return a copy of routes', () => {
      router.addRoute(testRoutes[0]);
      const routes = router.getAllRoutes();
      routes.push(testRoutes[1]);

      expect(router.getAllRoutes()).toHaveLength(1);
    });
  });
});
