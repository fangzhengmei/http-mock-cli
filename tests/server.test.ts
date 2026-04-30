import * as supertest from 'supertest';
import { MockServer } from '../src/core/server';
import { MockConfig, MockRoute } from '../src/types';

describe('MockServer', () => {
  let server: MockServer;

  const testConfig: MockConfig = {
    port: 0,
    routes: [
      {
        method: 'GET',
        path: '/api/users',
        response: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: { users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] },
        },
      },
      {
        method: 'GET',
        path: '/api/users/:id',
        response: {
          status: 200,
          body: { id: '{{params.id}}', name: 'User {{params.id}}' },
        },
      },
      {
        method: 'POST',
        path: '/api/users',
        response: {
          status: 201,
          body: { created: true, id: '{{timestamp}}' },
        },
      },
      {
        method: 'GET',
        path: '/api/search',
        response: {
          status: 200,
          body: { query: '{{query.q}}', page: '{{query.page}}' },
        },
      },
      {
        method: 'PUT',
        path: '/api/users/:id',
        response: {
          status: 200,
          body: {
            id: '{{params.id}}',
            title: '{{body.title}}',
            content: '{{body.content}}',
          },
        },
      },
      {
        method: 'GET',
        path: '/api/delay',
        response: {
          status: 200,
          body: { delayed: true },
          delay: 100,
        },
      },
      {
        method: 'GET',
        path: '/api/function',
        response: (params, query, body) => ({
          status: 200,
          body: {
            params,
            query,
            body,
            dynamic: true,
          },
        }),
      },
      {
        method: 'GET',
        path: '/api/async-function',
        response: async (params, query, body) => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return {
            status: 200,
            body: {
              async: true,
              params,
            },
          };
        },
      },
    ],
    defaultResponse: {
      status: 404,
      body: { error: 'Not Found', message: 'Route not found' },
    },
  };

  beforeEach(async () => {
    server = new MockServer(testConfig);
  });

  afterEach(async () => {
    if (server.isRunning()) {
      await server.stop();
    }
  });

  describe('start and stop', () => {
    it('should start the server', async () => {
      expect(server.isRunning()).toBe(false);
      const port = await server.start();
      expect(port).toBeGreaterThan(0);
      expect(server.isRunning()).toBe(true);
    });

    it('should stop the server', async () => {
      await server.start();
      expect(server.isRunning()).toBe(true);
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('should not throw when stopping a non-running server', async () => {
      await expect(server.stop()).resolves.not.toThrow();
    });

    it('should return the same port when starting again', async () => {
      const port1 = await server.start();
      const port2 = await server.start();
      expect(port1).toBe(port2);
    });
  });

  describe('GET requests', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should return 200 for GET /api/users', async () => {
      const response = await supertest(server.getApp())
        .get('/api/users')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual({
        users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      });
    });

    it('should return 200 with path parameters for GET /api/users/:id', async () => {
      const response = await supertest(server.getApp())
        .get('/api/users/42')
        .expect(200);

      expect(response.body).toEqual({
        id: '42',
        name: 'User 42',
      });
    });

    it('should handle query parameters for GET /api/search', async () => {
      const response = await supertest(server.getApp())
        .get('/api/search')
        .query({ q: 'test', page: '2' })
        .expect(200);

      expect(response.body).toEqual({
        query: 'test',
        page: '2',
      });
    });

    it('should return 404 for non-existent route', async () => {
      const response = await supertest(server.getApp())
        .get('/api/non-existent')
        .expect(404);

      expect(response.body).toEqual({
        error: 'Not Found',
        message: 'Route not found',
      });
    });
  });

  describe('POST requests', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should return 201 for POST /api/users', async () => {
      const beforeTimestamp = Date.now();
      const response = await supertest(server.getApp())
        .post('/api/users')
        .send({ name: 'Charlie' })
        .expect(201);

      expect(response.body.created).toBe(true);
      const responseTimestamp = parseInt(response.body.id, 10);
      expect(responseTimestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(responseTimestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('PUT requests with body', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should handle request body in templates', async () => {
      const response = await supertest(server.getApp())
        .put('/api/users/123')
        .send({ title: 'Updated Title', content: 'Updated Content' })
        .expect(200);

      expect(response.body).toEqual({
        id: '123',
        title: 'Updated Title',
        content: 'Updated Content',
      });
    });
  });

  describe('response delay', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should apply delay to response', async () => {
      const startTime = Date.now();
      const response = await supertest(server.getApp())
        .get('/api/delay')
        .expect(200);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(response.body).toEqual({ delayed: true });
    });
  });

  describe('function responses', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should handle synchronous function responses', async () => {
      const response = await supertest(server.getApp())
        .get('/api/function')
        .query({ test: 'value' })
        .send({ bodyData: 'test' })
        .expect(200);

      expect(response.body.dynamic).toBe(true);
      expect(response.body.params).toEqual({});
      expect(response.body.query).toEqual({ test: 'value' });
      expect(response.body.body).toEqual({ bodyData: 'test' });
    });

    it('should handle asynchronous function responses', async () => {
      const response = await supertest(server.getApp())
        .get('/api/async-function')
        .expect(200);

      expect(response.body.async).toBe(true);
    });
  });

  describe('CORS', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should return CORS headers', async () => {
      const response = await supertest(server.getApp())
        .get('/api/users');

      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toBeDefined();
      expect(response.headers['access-control-allow-headers']).toBeDefined();
    });

    it('should handle OPTIONS preflight requests', async () => {
      await supertest(server.getApp())
        .options('/api/users')
        .expect(200);
    });
  });

  describe('updateConfig', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should update routes and default response', async () => {
      const newConfig: MockConfig = {
        routes: [
          {
            method: 'GET',
            path: '/new-route',
            response: { status: 200, body: { new: true } },
          },
        ],
        defaultResponse: {
          status: 404,
          body: { custom404: true },
        },
      };

      server.updateConfig(newConfig);

      await supertest(server.getApp())
        .get('/new-route')
        .expect(200)
        .expect((res) => expect(res.body).toEqual({ new: true }));

      await supertest(server.getApp())
        .get('/api/users')
        .expect(404)
        .expect((res) => expect(res.body).toEqual({ custom404: true }));
    });
  });

  describe('getters', () => {
    it('should return the Express app', () => {
      expect(server.getApp()).toBeDefined();
    });

    it('should return the port', () => {
      expect(server.getPort()).toBe(0);
    });

    it('should return all routes', () => {
      const routes = server.getRoutes();
      expect(routes).toHaveLength(testConfig.routes.length);
    });
  });
});
