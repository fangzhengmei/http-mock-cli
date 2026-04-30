import * as supertest from 'supertest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { MockServer, ConfigUpdateResult } from '../src/core/server';
import { ConfigLoader } from '../src/core/config';
import { MockConfig } from '../src/types';

describe('Hot Reload Robustness', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-robustness-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir, { recursive: true });
    }
  });

  const createConfigFile = (name: string, config: MockConfig): string => {
    const configPath = path.join(tempDir, name);
    const content = `module.exports = ${JSON.stringify(config, null, 2)};`;
    fs.writeFileSync(configPath, content);
    return configPath;
  };

  const createTsConfigFile = (name: string, config: MockConfig): string => {
    const configPath = path.join(tempDir, name);
    const content = `import { MockConfig } from '../src/types';

const config: MockConfig = ${JSON.stringify(config, null, 2)};

export default config;
`;
    fs.writeFileSync(configPath, content);
    return configPath;
  };

  describe('Config Validation in MockServer', () => {
    it('should reject null config in updateConfig', () => {
      const initialConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: { ok: true } } },
        ],
      };

      const server = new MockServer(initialConfig);

      // @ts-ignore: Intentional null for testing
      const result = server.updateConfig(null);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.message).toContain('配置');
      expect(server.getConfigVersion()).toBe(1);
    });

    it('should reject config without routes array', () => {
      const initialConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: { ok: true } } },
        ],
      };

      const server = new MockServer(initialConfig);

      const invalidConfig = {
        port: 0,
      } as MockConfig;

      const result = server.updateConfig(invalidConfig);

      expect(result.success).toBe(false);
      expect(server.getConfigVersion()).toBe(1);
    });

    it('should reject config with invalid HTTP method', () => {
      const initialConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: { ok: true } } },
        ],
      };

      const server = new MockServer(initialConfig);

      const invalidConfig: MockConfig = {
        port: 0,
        routes: [
          {
            // @ts-ignore: Intentional invalid method for testing
            method: 'INVALID',
            path: '/bad',
            response: { status: 200, body: {} },
          },
        ],
      };

      const result = server.updateConfig(invalidConfig);

      expect(result.success).toBe(false);
      expect(server.getConfigVersion()).toBe(1);
    });

    it('should reject config with missing response.status', () => {
      const initialConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: { ok: true } } },
        ],
      };

      const server = new MockServer(initialConfig);

      const invalidConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/bad',
            // @ts-ignore: Intentional missing status for testing
            response: { body: 'no status' },
          },
        ],
      };

      const result = server.updateConfig(invalidConfig);

      expect(result.success).toBe(false);
      expect(server.getConfigVersion()).toBe(1);
    });

    it('should reject config with invalid defaultResponse', () => {
      const initialConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: { ok: true } } },
        ],
      };

      const server = new MockServer(initialConfig);

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
      const initialConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: { ok: true } } },
        ],
      };

      const server = new MockServer(initialConfig);

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
  });

  describe('Service Continuity During Bad Configs', () => {
    it('should keep serving old config after rejecting bad config', async () => {
      const initialConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/users',
            response: { status: 200, body: { users: [{ id: 1, name: 'Original' }] } },
          },
        ],
        defaultResponse: {
          status: 404,
          body: { original404: true },
        },
      };

      const server = new MockServer(initialConfig);
      await server.start();

      await supertest(server.getApp())
        .get('/api/users')
        .expect(200)
        .expect((res) => expect(res.body.users[0].name).toBe('Original'));

      const badConfig: MockConfig = {
        port: 0,
        routes: [
          {
            // @ts-ignore: Intentional invalid method for testing
            method: 'BAD_METHOD',
            path: '/api/bad',
            response: { status: 200, body: {} },
          },
        ],
      };

      const result = server.updateConfig(badConfig);

      expect(result.success).toBe(false);
      expect(server.getConfigVersion()).toBe(1);

      await supertest(server.getApp())
        .get('/api/users')
        .expect(200)
        .expect((res) => expect(res.body.users[0].name).toBe('Original'));

      await supertest(server.getApp())
        .get('/api/non-existent')
        .expect(404)
        .expect((res) => expect(res.body.original404).toBe(true));

      await server.stop();
    });

    it('should keep serving after multiple consecutive bad configs', async () => {
      const initialConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/status',
            response: { status: 200, body: { status: 'healthy' } },
          },
        ],
      };

      const server = new MockServer(initialConfig);
      await server.start();

      await supertest(server.getApp())
        .get('/api/status')
        .expect(200)
        .expect((res) => expect(res.body.status).toBe('healthy'));

      const badConfigs: MockConfig[] = [
        {
          port: 0,
          routes: [
            {
              // @ts-ignore: Intentional invalid method
              method: 'BAD1',
              path: '/test',
              response: { status: 200, body: {} },
            },
          ],
        },
        {
          port: 0,
          routes: [
            {
              method: 'GET',
              path: '/test',
              // @ts-ignore: Intentional missing status
              response: { body: {} },
            },
          ],
        },
        {
          port: 0,
          // @ts-ignore: Intentional null routes
          routes: null,
        },
        {
          port: 0,
          routes: [],
          defaultResponse: {
            // @ts-ignore: Intentional invalid status
            status: 'string',
          },
        },
      ];

      for (let i = 0; i < badConfigs.length; i++) {
        const result = server.updateConfig(badConfigs[i]);
        expect(result.success).toBe(false);
        expect(server.getConfigVersion()).toBe(1);

        await supertest(server.getApp())
          .get('/api/status')
          .expect(200)
          .expect((res) => expect(res.body.status).toBe('healthy'));
      }

      await server.stop();
    });

    it('should successfully apply good config after multiple bad configs', async () => {
      const initialConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/initial',
            response: { status: 200, body: { initial: true } },
          },
        ],
      };

      const server = new MockServer(initialConfig);
      await server.start();

      await supertest(server.getApp())
        .get('/api/initial')
        .expect(200);

      const badConfig: MockConfig = {
        port: 0,
        routes: [
          {
            // @ts-ignore: Intentional invalid method
            method: 'BAD',
            path: '/test',
            response: { status: 200, body: {} },
          },
        ],
      };

      for (let i = 0; i < 3; i++) {
        const result = server.updateConfig(badConfig);
        expect(result.success).toBe(false);
        expect(server.getConfigVersion()).toBe(1);
      }

      await supertest(server.getApp())
        .get('/api/initial')
        .expect(200);

      const goodConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/new',
            response: { status: 200, body: { new: true, version: 2 } },
          },
        ],
      };

      const result = server.updateConfig(goodConfig);

      expect(result.success).toBe(true);
      expect(server.getConfigVersion()).toBe(2);

      await supertest(server.getApp())
        .get('/api/new')
        .expect(200)
        .expect((res) => {
          expect(res.body.new).toBe(true);
          expect(res.body.version).toBe(2);
        });

      await supertest(server.getApp())
        .get('/api/initial')
        .expect(404);

      await server.stop();
    });
  });

  describe('Rollback Functionality', () => {
    it('should rollback to previous config after successful update', async () => {
      const initialConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/v1',
            response: { status: 200, body: { version: 1 } },
          },
        ],
      };

      const server = new MockServer(initialConfig);
      await server.start();

      await supertest(server.getApp())
        .get('/api/v1')
        .expect(200);

      const v2Config: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/v2',
            response: { status: 200, body: { version: 2 } },
          },
        ],
      };

      server.updateConfig(v2Config);

      expect(server.getConfigVersion()).toBe(2);
      expect(server.hasPreviousConfig()).toBe(true);

      await supertest(server.getApp())
        .get('/api/v2')
        .expect(200);

      await supertest(server.getApp())
        .get('/api/v1')
        .expect(404);

      const rollbackResult = server.rollbackToPreviousConfig();

      expect(rollbackResult.success).toBe(true);
      expect(server.getConfigVersion()).toBe(1);
      expect(server.hasPreviousConfig()).toBe(false);

      await supertest(server.getApp())
        .get('/api/v1')
        .expect(200);

      await supertest(server.getApp())
        .get('/api/v2')
        .expect(404);

      await server.stop();
    });

    it('should fail rollback when no previous config', () => {
      const initialConfig: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: {} } },
        ],
      };

      const server = new MockServer(initialConfig);

      expect(server.hasPreviousConfig()).toBe(false);

      const result = server.rollbackToPreviousConfig();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.message).toContain('回滚');
    });

    it('should restore defaultResponse on rollback', async () => {
      const v1Config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: {} } },
        ],
        defaultResponse: {
          status: 404,
          body: { v1: true, message: 'V1 Not Found' },
        },
      };

      const server = new MockServer(v1Config);
      await server.start();

      await supertest(server.getApp())
        .get('/non-existent')
        .expect(404)
        .expect((res) => expect(res.body.v1).toBe(true));

      const v2Config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: {} } },
        ],
        defaultResponse: {
          status: 404,
          body: { v2: true, message: 'V2 Not Found' },
        },
      };

      server.updateConfig(v2Config);

      await supertest(server.getApp())
        .get('/non-existent')
        .expect(404)
        .expect((res) => expect(res.body.v2).toBe(true));

      server.rollbackToPreviousConfig();

      await supertest(server.getApp())
        .get('/non-existent')
        .expect(404)
        .expect((res) => expect(res.body.v1).toBe(true));

      await server.stop();
    });
  });

  describe('Config Version Tracking', () => {
    it('should start at version 1', () => {
      const config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: {} } },
        ],
      };

      const server = new MockServer(config);
      expect(server.getConfigVersion()).toBe(1);
    });

    it('should increment version on successful update', () => {
      const config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: {} } },
        ],
      };

      const server = new MockServer(config);

      expect(server.getConfigVersion()).toBe(1);

      const v2Config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/v2', response: { status: 200, body: {} } },
        ],
      };

      server.updateConfig(v2Config);
      expect(server.getConfigVersion()).toBe(2);

      const v3Config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/v3', response: { status: 200, body: {} } },
        ],
      };

      server.updateConfig(v3Config);
      expect(server.getConfigVersion()).toBe(3);
    });

    it('should not increment version on failed update', () => {
      const config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: {} } },
        ],
      };

      const server = new MockServer(config);

      expect(server.getConfigVersion()).toBe(1);

      const badConfig: MockConfig = {
        port: 0,
        routes: [
          {
            // @ts-ignore: Intentional invalid method
            method: 'BAD',
            path: '/test',
            response: { status: 200, body: {} },
          },
        ],
      };

      server.updateConfig(badConfig);
      expect(server.getConfigVersion()).toBe(1);

      server.updateConfig(badConfig);
      expect(server.getConfigVersion()).toBe(1);
    });

    it('should decrement version on rollback', () => {
      const config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: {} } },
        ],
      };

      const server = new MockServer(config);

      const v2Config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/v2', response: { status: 200, body: {} } },
        ],
      };

      server.updateConfig(v2Config);
      expect(server.getConfigVersion()).toBe(2);

      server.rollbackToPreviousConfig();
      expect(server.getConfigVersion()).toBe(1);
    });
  });

  describe('ConfigUpdateResult Interface', () => {
    it('should return correct result structure on success', () => {
      const config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: {} } },
        ],
      };

      const server = new MockServer(config);

      const v2Config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/v2', response: { status: 200, body: {} } },
        ],
      };

      const result = server.updateConfig(v2Config);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    });

    it('should return correct result structure on failure', () => {
      const config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: {} } },
        ],
      };

      const server = new MockServer(config);

      const badConfig: MockConfig = {
        port: 0,
        routes: [
          {
            // @ts-ignore: Intentional invalid method
            method: 'BAD',
            path: '/test',
            response: { status: 200, body: {} },
          },
        ],
      };

      const result = server.updateConfig(badConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error instanceof Error).toBe(true);
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    });
  });

  describe('Deep Copy Protection', () => {
    it('should not allow external modification of current config', () => {
      const config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/test', response: { status: 200, body: {} } },
        ],
      };

      const server = new MockServer(config);

      const externalConfig = server.getCurrentConfig();
      externalConfig.routes = [];

      const stillCurrent = server.getCurrentConfig();
      expect(stillCurrent.routes).toHaveLength(1);
    });

    it('should not allow external modification of previous config', () => {
      const v1Config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/v1', response: { status: 200, body: {} } },
        ],
      };

      const server = new MockServer(v1Config);

      const v2Config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/v2', response: { status: 200, body: {} } },
        ],
      };

      server.updateConfig(v2Config);

      const previousConfig = server.getPreviousConfig();
      if (previousConfig) {
        previousConfig.routes = [];

        const stillPrevious = server.getPreviousConfig();
        expect(stillPrevious?.routes).toHaveLength(1);
      }
    });

    it('should not modify original config object when updating', () => {
      const originalRoutes = [
        { method: 'GET', path: '/test', response: { status: 200, body: { original: true } } },
      ];

      const config: MockConfig = {
        port: 0,
        routes: originalRoutes,
      };

      const server = new MockServer(config);

      const v2Config: MockConfig = {
        port: 0,
        routes: [
          { method: 'GET', path: '/v2', response: { status: 200, body: { v2: true } } },
        ],
      };

      server.updateConfig(v2Config);

      expect(originalRoutes).toHaveLength(1);
      expect(originalRoutes[0].path).toBe('/test');
    });
  });
});
