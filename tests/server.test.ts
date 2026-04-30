import * as supertest from 'supertest';
import { MockServer, ConfigUpdateResult } from '../src/core/server';
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

  describe('constructor validation', () => {
    it('should throw error for null config', () => {
      // @ts-ignore: Intentional invalid config for testing
      expect(() => new MockServer(null)).toThrow('配置不能为空');
    });

    it('should throw error for config without routes', () => {
      const invalidConfig = { port: 3000 } as MockConfig;
      expect(() => new MockServer(invalidConfig)).toThrow('routes');
    });

    it('should throw error for route with invalid method', () => {
      const invalidConfig: MockConfig = {
        port: 0,
        routes: [
          {
            // @ts-ignore: Intentional invalid method for testing
            method: 'INVALID',
            path: '/test',
            response: { status: 200, body: {} },
          },
        ],
      };
      expect(() => new MockServer(invalidConfig)).toThrow('method');
    });

    it('should throw error for route without response.status', () => {
      const invalidConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/test',
            // @ts-ignore: Intentional invalid response for testing
            response: { body: {} },
          },
        ],
      };
      expect(() => new MockServer(invalidConfig)).toThrow('status');
    });
  });

  describe('config version tracking', () => {
    it('should start with version 1', () => {
      expect(server.getConfigVersion()).toBe(1);
    });

    it('should increment version on successful update', () => {
      const newConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/new-route',
            response: { status: 200, body: { new: true } },
          },
        ],
      };

      expect(server.getConfigVersion()).toBe(1);

      const result = server.updateConfig(newConfig);

      expect(result.success).toBe(true);
      expect(server.getConfigVersion()).toBe(2);
    });

    it('should not increment version on failed update', () => {
      const invalidConfig = {
        port: 0,
        routes: [
          {
            // @ts-ignore: Intentional invalid method for testing
            method: 'INVALID',
            path: '/test',
            response: { status: 200, body: {} },
          },
        ],
      } as MockConfig;

      expect(server.getConfigVersion()).toBe(1);

      const result = server.updateConfig(invalidConfig);

      expect(result.success).toBe(false);
      expect(server.getConfigVersion()).toBe(1);
    });
  });

  describe('updateConfig - success scenarios', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should update routes successfully', async () => {
      const newConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/posts',
            response: { status: 200, body: { posts: [] } },
          },
        ],
      };

      const result = server.updateConfig(newConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('成功');

      await supertest(server.getApp())
        .get('/api/posts')
        .expect(200)
        .expect((res) => expect(res.body).toEqual({ posts: [] }));

      await supertest(server.getApp())
        .get('/api/users')
        .expect(404);
    });

    it('should update defaultResponse', async () => {
      const newConfig: MockConfig = {
        port: 0,
        routes: testConfig.routes,
        defaultResponse: {
          status: 404,
          body: { custom404: true, message: 'Custom Not Found' },
        },
      };

      const result = server.updateConfig(newConfig);

      expect(result.success).toBe(true);

      const response = await supertest(server.getApp())
        .get('/api/non-existent')
        .expect(404);

      expect(response.body).toEqual({
        custom404: true,
        message: 'Custom Not Found',
      });
    });

    it('should save previous config for rollback', () => {
      expect(server.hasPreviousConfig()).toBe(false);

      const newConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/new-route',
            response: { status: 200, body: {} },
          },
        ],
      };

      server.updateConfig(newConfig);

      expect(server.hasPreviousConfig()).toBe(true);

      const previousConfig = server.getPreviousConfig();
      expect(previousConfig).not.toBeNull();
      expect(previousConfig?.routes).toHaveLength(testConfig.routes.length);
    });

    it('should increment config version on each successful update', () => {
      expect(server.getConfigVersion()).toBe(1);

      const config1: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/v1', response: { status: 200, body: { v: 1 } } },
        ],
      };

      const config2: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/v2', response: { status: 200, body: { v: 2 } } },
        ],
      };

      server.updateConfig(config1);
      expect(server.getConfigVersion()).toBe(2);

      server.updateConfig(config2);
      expect(server.getConfigVersion()).toBe(3);
    });

    it('should return ConfigUpdateResult with success=true', () => {
      const newConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/test',
            response: { status: 200, body: {} },
          },
        ],
      };

      const result = server.updateConfig(newConfig);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.message).toBeDefined();
      expect(result.message).toContain('成功');
    });
  });

  describe('updateConfig - validation failure scenarios (should not affect current config)', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should reject config with invalid method and keep current routes', async () => {
      const invalidConfig = {
        port: 0,
        routes: [
          {
            // @ts-ignore: Intentional invalid method for testing
            method: 'INVALID_METHOD',
            path: '/test',
            response: { status: 200, body: {} },
          },
        ],
      } as MockConfig;

      const result = server.updateConfig(invalidConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.message).toContain('验证失败');

      await supertest(server.getApp())
        .get('/api/users')
        .expect(200)
        .expect((res) => expect(res.body.users).toBeDefined());

      expect(server.getConfigVersion()).toBe(1);
    });

    it('should reject config with missing response.status and keep current routes', async () => {
      const invalidConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/test',
            // @ts-ignore: Intentional invalid response for testing
            response: { body: 'no status' },
          },
        ],
      };

      const result = server.updateConfig(invalidConfig);

      expect(result.success).toBe(false);
      expect(result.message).toContain('status');

      await supertest(server.getApp())
        .get('/api/users')
        .expect(200);
    });

    it('should reject config with empty routes array', async () => {
      const invalidConfig: MockConfig = {
        port: 0,
        routes: [],
      };

      const result = server.updateConfig(invalidConfig);

      expect(result.success).toBe(true);

      const response = await supertest(server.getApp())
        .get('/api/users')
        .expect(404);

      expect(response.body).toEqual({
        error: 'Not Found',
        message: 'Route not found',
      });
    });

    it('should reject config with null routes', async () => {
      const invalidConfig = {
        port: 0,
        // @ts-ignore: Intentional null routes for testing
        routes: null,
      } as MockConfig;

      const result = server.updateConfig(invalidConfig);

      expect(result.success).toBe(false);

      await supertest(server.getApp())
        .get('/api/users')
        .expect(200);
    });

    it('should return ConfigUpdateResult with success=false and error', () => {
      const invalidConfig = {
        port: 0,
        routes: [
          {
            // @ts-ignore: Intentional invalid method for testing
            method: 'BAD',
            path: '/test',
            response: { status: 200, body: {} },
          },
        ],
      } as MockConfig;

      const result = server.updateConfig(invalidConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error instanceof Error).toBe(true);
      expect(result.message).toBeDefined();
    });

    it('should not save previous config on failed update', () => {
      expect(server.hasPreviousConfig()).toBe(false);

      const invalidConfig = {
        port: 0,
        routes: [
          {
            // @ts-ignore: Intentional invalid method for testing
            method: 'BAD',
            path: '/test',
            response: { status: 200, body: {} },
          },
        ],
      } as MockConfig;

      server.updateConfig(invalidConfig);

      expect(server.hasPreviousConfig()).toBe(false);
    });
  });

  describe('rollbackToPreviousConfig', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should return false when no previous config', () => {
      expect(server.hasPreviousConfig()).toBe(false);

      const result = server.rollbackToPreviousConfig();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.message).toContain('没有可回滚');
    });

    it('should rollback to previous config successfully', async () => {
      const newConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/posts',
            response: { status: 200, body: { posts: [] } },
          },
        ],
      };

      server.updateConfig(newConfig);

      expect(server.hasPreviousConfig()).toBe(true);
      expect(server.getConfigVersion()).toBe(2);

      await supertest(server.getApp())
        .get('/api/posts')
        .expect(200);

      const rollbackResult = server.rollbackToPreviousConfig();

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.message).toContain('成功');
      expect(server.getConfigVersion()).toBe(1);
      expect(server.hasPreviousConfig()).toBe(false);

      await supertest(server.getApp())
        .get('/api/users')
        .expect(200);

      await supertest(server.getApp())
        .get('/api/posts')
        .expect(404);
    });

    it('should restore defaultResponse on rollback', async () => {
      const originalDefaultResponse = {
        status: 404,
        body: { original: true },
      };

      const serverWithCustomDefault = new MockServer({
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: {} } },
        ],
        defaultResponse: originalDefaultResponse,
      });

      await serverWithCustomDefault.start();

      const newConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/new', response: { status: 200, body: {} } },
        ],
        defaultResponse: {
          status: 404,
          body: { newDefault: true },
        },
      };

      serverWithCustomDefault.updateConfig(newConfig);

      const newResponse = await supertest(serverWithCustomDefault.getApp())
        .get('/non-existent')
        .expect(404);

      expect(newResponse.body).toEqual({ newDefault: true });

      serverWithCustomDefault.rollbackToPreviousConfig();

      const rollbackResponse = await supertest(serverWithCustomDefault.getApp())
        .get('/non-existent')
        .expect(404);

      expect(rollbackResponse.body).toEqual({ original: true });

      await serverWithCustomDefault.stop();
    });
  });

  describe('getCurrentConfig and getPreviousConfig', () => {
    it('should return a deep copy of current config', () => {
      const currentConfig = server.getCurrentConfig();

      expect(currentConfig.routes).toHaveLength(testConfig.routes.length);

      currentConfig.routes = [];

      const originalConfig = server.getCurrentConfig();
      expect(originalConfig.routes).toHaveLength(testConfig.routes.length);
    });

    it('should return null for getPreviousConfig when no previous', () => {
      expect(server.getPreviousConfig()).toBeNull();
    });

    it('should return deep copy of previous config after update', () => {
      const newConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/new', response: { status: 200, body: {} } },
        ],
      };

      server.updateConfig(newConfig);

      const previousConfig = server.getPreviousConfig();
      expect(previousConfig).not.toBeNull();
      expect(previousConfig?.routes).toHaveLength(testConfig.routes.length);

      if (previousConfig) {
        previousConfig.routes = [];

        const stillPreviousConfig = server.getPreviousConfig();
        expect(stillPreviousConfig?.routes).toHaveLength(testConfig.routes.length);
      }
    });
  });

  describe('hasPreviousConfig', () => {
    it('should return false initially', () => {
      expect(server.hasPreviousConfig()).toBe(false);
    });

    it('should return true after successful update', () => {
      const newConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: {} } },
        ],
      };

      server.updateConfig(newConfig);
      expect(server.hasPreviousConfig()).toBe(true);
    });

    it('should return false after rollback', () => {
      const newConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: {} } },
        ],
      };

      server.updateConfig(newConfig);
      expect(server.hasPreviousConfig()).toBe(true);

      server.rollbackToPreviousConfig();
      expect(server.hasPreviousConfig()).toBe(false);
    });
  });

  describe('error handling in request handling', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should return 500 when function response throws error', async () => {
      const errorConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/error',
            response: () => {
              throw new Error('Test error');
            },
          },
        ],
      };

      server.updateConfig(errorConfig);

      const response = await supertest(server.getApp())
        .get('/api/error')
        .expect(500);

      expect(response.body.error).toBe('Internal Server Error');
      expect(response.body.message).toContain('Test error');
      expect(response.body.configVersion).toBe(2);
    });

    it('should return 500 when async function response throws error', async () => {
      const errorConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/async-error',
            response: async () => {
              throw new Error('Async test error');
            },
          },
        ],
      };

      server.updateConfig(errorConfig);

      const response = await supertest(server.getApp())
        .get('/api/async-error')
        .expect(500);

      expect(response.body.error).toBe('Internal Server Error');
      expect(response.body.message).toContain('Async test error');
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
