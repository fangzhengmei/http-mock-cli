import * as supertest from 'supertest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { MockServer, ConfigUpdateResult } from '../src/core/server';
import { MockConfig } from '../src/types';

describe('Configuration Hot Reload Stability', () => {
  let server: MockServer;
  let tempDir: string;

  const initialConfig: MockConfig = {
    port: 0,
    routes: [
      {
        method: 'GET',
        path: '/api/users',
        response: {
          status: 200,
          body: { users: [{ id: 1, name: 'Initial User' }] },
        },
      },
      {
        method: 'GET',
        path: '/api/status',
        response: {
          status: 200,
          body: { status: 'initial' },
        },
      },
    ],
    defaultResponse: {
      status: 404,
      body: { error: 'Initial 404' },
    },
  };

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-hot-reload-'));
    server = new MockServer(initialConfig);
    await server.start();
  });

  afterEach(async () => {
    if (server.isRunning()) {
      await server.stop();
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir, { recursive: true });
    }
  });

  describe('Successful Hot Update Scenarios', () => {
    it('should update routes and keep serving new routes', async () => {
      expect(server.getConfigVersion()).toBe(1);

      await supertest(server.getApp())
        .get('/api/users')
        .expect(200)
        .expect((res) => {
          expect(res.body.users[0].name).toBe('Initial User');
        });

      const updatedConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/users',
            response: {
              status: 200,
              body: { users: [{ id: 1, name: 'Updated User' }] },
            },
          },
          {
            method: 'GET',
            path: '/api/posts',
            response: {
              status: 200,
              body: { posts: [{ id: 1, title: 'New Post' }] },
            },
          },
        ],
      };

      const result = server.updateConfig(updatedConfig);

      expect(result.success).toBe(true);
      expect(server.getConfigVersion()).toBe(2);
      expect(server.hasPreviousConfig()).toBe(true);

      await supertest(server.getApp())
        .get('/api/users')
        .expect(200)
        .expect((res) => {
          expect(res.body.users[0].name).toBe('Updated User');
        });

      await supertest(server.getApp())
        .get('/api/posts')
        .expect(200)
        .expect((res) => {
          expect(res.body.posts).toBeDefined();
        });

      await supertest(server.getApp())
        .get('/api/status')
        .expect(404);
    });

    it('should update default response', async () => {
      const customDefaultConfig: MockConfig = {
        port: 0,
        routes: initialConfig.routes,
        defaultResponse: {
          status: 404,
          body: { custom: true, message: 'Custom Not Found' },
        },
      };

      server.updateConfig(customDefaultConfig);

      const response = await supertest(server.getApp())
        .get('/api/non-existent')
        .expect(404);

      expect(response.body.custom).toBe(true);
      expect(response.body.message).toBe('Custom Not Found');
    });

    it('should support multiple consecutive updates', async () => {
      expect(server.getConfigVersion()).toBe(1);

      const configV2: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/v2', response: { status: 200, body: { v: 2 } } },
        ],
      };

      const configV3: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/v3', response: { status: 200, body: { v: 3 } } },
        ],
      };

      const configV4: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/v4', response: { status: 200, body: { v: 4 } } },
        ],
      };

      server.updateConfig(configV2);
      expect(server.getConfigVersion()).toBe(2);

      server.updateConfig(configV3);
      expect(server.getConfigVersion()).toBe(3);

      server.updateConfig(configV4);
      expect(server.getConfigVersion()).toBe(4);

      await supertest(server.getApp())
        .get('/v4')
        .expect(200)
        .expect((res) => expect(res.body.v).toBe(4));

      await supertest(server.getApp())
        .get('/v2')
        .expect(404);
    });

    it('should return correct ConfigUpdateResult on success', () => {
      const newConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: {} } },
        ],
      };

      const result = server.updateConfig(newConfig);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    });

    it('should deep copy config to prevent external modifications', () => {
      const externalConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/external', response: { status: 200, body: {} } },
        ],
      };

      server.updateConfig(externalConfig);

      externalConfig.routes = [];

      const currentConfig = server.getCurrentConfig();
      expect(currentConfig.routes).toHaveLength(1);
    });
  });

  describe('Failed Update Scenarios - Should Keep Current Config', () => {
    it('should reject config with invalid method and keep serving current routes', async () => {
      await supertest(server.getApp())
        .get('/api/users')
        .expect(200);

      const invalidConfig = {
        port: 0,
        routes: [
          {
            // @ts-ignore: Intentional invalid method for testing
            method: 'INVALID_HTTP_METHOD',
            path: '/api/bad',
            response: { status: 200, body: {} },
          },
        ],
      } as MockConfig;

      const result = server.updateConfig(invalidConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error instanceof Error).toBe(true);
      expect(server.getConfigVersion()).toBe(1);
      expect(server.hasPreviousConfig()).toBe(false);

      await supertest(server.getApp())
        .get('/api/users')
        .expect(200)
        .expect((res) => {
          expect(res.body.users[0].name).toBe('Initial User');
        });

      await supertest(server.getApp())
        .get('/api/status')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('initial');
        });
    });

    it('should reject config with missing response.status', async () => {
      const invalidConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/bad',
            // @ts-ignore: Intentional invalid response for testing
            response: { body: 'no status code' },
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

    it('should reject config with null config', () => {
      // @ts-ignore: Intentional null config for testing
      const result = server.updateConfig(null);

      expect(result.success).toBe(false);
      expect(server.getConfigVersion()).toBe(1);
    });

    it('should reject config with missing routes array', () => {
      const invalidConfig = {
        port: 0,
      } as MockConfig;

      const result = server.updateConfig(invalidConfig);

      expect(result.success).toBe(false);
      expect(server.getConfigVersion()).toBe(1);
    });

    it('should reject config with invalid defaultResponse', () => {
      const invalidConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: {} } },
        ],
        // @ts-ignore: Intentional invalid defaultResponse for testing
        defaultResponse: 'invalid',
      };

      const result = server.updateConfig(invalidConfig);

      expect(result.success).toBe(false);
      expect(server.getConfigVersion()).toBe(1);
    });

    it('should reject config with invalid defaultResponse.status', () => {
      const invalidConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: {} } },
        ],
        // @ts-ignore: Intentional invalid status for testing
        defaultResponse: { status: 'not a number' },
      };

      const result = server.updateConfig(invalidConfig);

      expect(result.success).toBe(false);
      expect(server.getConfigVersion()).toBe(1);
    });

    it('should return correct ConfigUpdateResult on failure', () => {
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
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    });
  });

  describe('Rollback Functionality', () => {
    it('should rollback to previous config after successful update', async () => {
      const newConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/new',
            response: { status: 200, body: { new: true } },
          },
        ],
        defaultResponse: {
          status: 404,
          body: { new404: true },
        },
      };

      server.updateConfig(newConfig);
      expect(server.getConfigVersion()).toBe(2);
      expect(server.hasPreviousConfig()).toBe(true);

      await supertest(server.getApp())
        .get('/api/new')
        .expect(200);

      await supertest(server.getApp())
        .get('/api/users')
        .expect(404)
        .expect((res) => expect(res.body.new404).toBe(true));

      const rollbackResult = server.rollbackToPreviousConfig();

      expect(rollbackResult.success).toBe(true);
      expect(server.getConfigVersion()).toBe(1);
      expect(server.hasPreviousConfig()).toBe(false);

      await supertest(server.getApp())
        .get('/api/users')
        .expect(200);

      await supertest(server.getApp())
        .get('/api/new')
        .expect(404)
        .expect((res) => expect(res.body.error).toBe('Initial 404'));
    });

    it('should fail rollback when no previous config', () => {
      expect(server.hasPreviousConfig()).toBe(false);

      const result = server.rollbackToPreviousConfig();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.message).toContain('没有可回滚');
    });

    it('should restore all config properties on rollback', async () => {
      const originalConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/original',
            response: { status: 200, body: { original: true } },
          },
        ],
        defaultResponse: {
          status: 404,
          body: { original404: true },
        },
      };

      const testServer = new MockServer(originalConfig);
      await testServer.start();

      const updatedConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/updated',
            response: { status: 200, body: { updated: true } },
          },
        ],
        defaultResponse: {
          status: 404,
          body: { updated404: true },
        },
      };

      testServer.updateConfig(updatedConfig);

      await supertest(testServer.getApp())
        .get('/api/updated')
        .expect(200);

      testServer.rollbackToPreviousConfig();

      await supertest(testServer.getApp())
        .get('/api/original')
        .expect(200)
        .expect((res) => expect(res.body.original).toBe(true));

      await supertest(testServer.getApp())
        .get('/api/non-existent')
        .expect(404)
        .expect((res) => expect(res.body.original404).toBe(true));

      await testServer.stop();
    });
  });

  describe('Config Version Tracking', () => {
    it('should start at version 1', () => {
      expect(server.getConfigVersion()).toBe(1);
    });

    it('should increment version on successful update', () => {
      const config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/v2', response: { status: 200, body: {} } },
        ],
      };

      server.updateConfig(config);
      expect(server.getConfigVersion()).toBe(2);

      server.updateConfig(config);
      expect(server.getConfigVersion()).toBe(3);
    });

    it('should not increment version on failed update', () => {
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
      expect(server.getConfigVersion()).toBe(1);
    });

    it('should decrement version on rollback', () => {
      const config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/v2', response: { status: 200, body: {} } },
        ],
      };

      server.updateConfig(config);
      expect(server.getConfigVersion()).toBe(2);

      server.rollbackToPreviousConfig();
      expect(server.getConfigVersion()).toBe(1);
    });
  });

  describe('Continuous Service During Updates', () => {
    it('should serve requests while validating new config', async () => {
      const requests = [];

      for (let i = 0; i < 5; i++) {
        requests.push(
          supertest(server.getApp())
            .get('/api/users')
            .expect(200)
        );
      }

      const invalidConfig = {
        port: 0,
        routes: [
          {
            // @ts-ignore: Intentional invalid method for testing
            method: 'INVALID',
            path: '/bad',
            response: { status: 200, body: {} },
          },
        ],
      } as MockConfig;

      const updatePromise = new Promise<ConfigUpdateResult>((resolve) => {
        setTimeout(() => {
          const result = server.updateConfig(invalidConfig);
          resolve(result);
        }, 10);
      });

      const allResults = await Promise.all([
        ...requests,
        updatePromise,
        supertest(server.getApp()).get('/api/users').expect(200),
      ]);

      const updateResult = allResults[5] as ConfigUpdateResult;
      expect(updateResult.success).toBe(false);
      expect(server.getConfigVersion()).toBe(1);

      for (let i = 0; i < 5; i++) {
        const response = allResults[i] as any;
        expect(response.body.users).toBeDefined();
      }
    });

    it('should not have any downtime during successful update', async () => {
      let requestCount = 0;
      const sendRequests = async (count: number): Promise<any[]> => {
        const promises = [];
        for (let i = 0; i < count; i++) {
          requestCount++;
          promises.push(
            supertest(server.getApp())
              .get('/api/users')
              .expect((res) => {
                if (res.status !== 200 && res.status !== 404) {
                  throw new Error(`Unexpected status: ${res.status}`);
                }
              })
          );
        }
        return Promise.all(promises);
      };

      const beforeRequests = sendRequests(10);

      const newConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/users',
            response: { status: 200, body: { users: [{ id: 999, name: 'Updated' }] } },
          },
        ],
      };

      const updatePromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          server.updateConfig(newConfig);
          resolve();
        }, 5);
      });

      const duringRequests = sendRequests(10);

      await Promise.all([beforeRequests, updatePromise, duringRequests]);

      const afterRequests = await sendRequests(10);

      const finalResponse = await supertest(server.getApp())
        .get('/api/users')
        .expect(200);

      expect(finalResponse.body.users[0].id).toBe(999);
      expect(server.getConfigVersion()).toBe(2);
    });

    it('should keep serving old config when new config validation fails', async () => {
      const beforeResponse = await supertest(server.getApp())
        .get('/api/users')
        .expect(200);

      expect(beforeResponse.body.users[0].name).toBe('Initial User');

      const invalidConfig = {
        port: 0,
        routes: [
          {
            // @ts-ignore: Intentional invalid method for testing
            method: 'WRONG',
            path: '/bad',
            response: { status: 200, body: {} },
          },
        ],
      } as MockConfig;

      server.updateConfig(invalidConfig);

      const afterResponse = await supertest(server.getApp())
        .get('/api/users')
        .expect(200);

      expect(afterResponse.body.users[0].name).toBe('Initial User');

      const statusResponse = await supertest(server.getApp())
        .get('/api/status')
        .expect(200);

      expect(statusResponse.body.status).toBe('initial');
    });
  });

  describe('Config Getters', () => {
    it('should return current config via getCurrentConfig', () => {
      const currentConfig = server.getCurrentConfig();
      expect(currentConfig.routes).toHaveLength(initialConfig.routes.length);
    });

    it('should return null for getPreviousConfig initially', () => {
      expect(server.getPreviousConfig()).toBeNull();
    });

    it('should return previous config after successful update', () => {
      const newConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/new', response: { status: 200, body: {} } },
        ],
      };

      server.updateConfig(newConfig);

      const previousConfig = server.getPreviousConfig();
      expect(previousConfig).not.toBeNull();
      expect(previousConfig?.routes).toHaveLength(initialConfig.routes.length);
    });

    it('should return deep copy from getCurrentConfig', () => {
      const currentConfig = server.getCurrentConfig();
      currentConfig.routes = [];

      const stillCurrent = server.getCurrentConfig();
      expect(stillCurrent.routes).toHaveLength(initialConfig.routes.length);
    });

    it('should return deep copy from getPreviousConfig', () => {
      const newConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/new', response: { status: 200, body: {} } },
        ],
      };

      server.updateConfig(newConfig);

      const previousConfig = server.getPreviousConfig();
      if (previousConfig) {
        previousConfig.routes = [];
      }

      const stillPrevious = server.getPreviousConfig();
      expect(stillPrevious?.routes).toHaveLength(initialConfig.routes.length);
    });
  });
});
