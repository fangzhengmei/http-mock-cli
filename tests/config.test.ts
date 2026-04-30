import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ConfigLoader } from '../src/core/config';
import { MockConfig } from '../src/types';

describe('ConfigLoader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-config-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.readdirSync(tempDir).forEach(file => {
        fs.unlinkSync(path.join(tempDir, file));
      });
      fs.rmdirSync(tempDir);
    }
  });

  const validConfig: MockConfig = {
    port: 3000,
    routes: [
      {
        method: 'GET',
        path: '/test',
        response: { status: 200, body: { message: 'test' } },
      },
    ],
    defaultResponse: { status: 404, body: { error: 'Not Found' } },
  };

  describe('JSON configuration', () => {
    it('should load valid JSON configuration', () => {
      const configPath = path.join(tempDir, 'mock.config.json');
      fs.writeFileSync(configPath, JSON.stringify(validConfig, null, 2));

      const loader = new ConfigLoader(configPath);
      const config = loader.load();

      expect(config.port).toBe(3000);
      expect(config.routes).toHaveLength(1);
      expect(config.routes[0].method).toBe('GET');
      expect(config.routes[0].path).toBe('/test');
    });

    it('should throw error for invalid JSON', () => {
      const configPath = path.join(tempDir, 'mock.config.json');
      fs.writeFileSync(configPath, '{ invalid json');

      const loader = new ConfigLoader(configPath);
      expect(() => loader.load()).toThrow();
    });

    it('should throw error when routes is missing', () => {
      const invalidConfig = { port: 3000 };
      const configPath = path.join(tempDir, 'mock.config.json');
      fs.writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2));

      const loader = new ConfigLoader(configPath);
      expect(() => loader.load()).toThrow('routes');
    });

    it('should throw error when route is missing method', () => {
      const invalidConfig = {
        port: 3000,
        routes: [
          {
            path: '/test',
            response: { status: 200, body: {} },
          },
        ],
      };
      const configPath = path.join(tempDir, 'mock.config.json');
      fs.writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2));

      const loader = new ConfigLoader(configPath);
      expect(() => loader.load()).toThrow('method');
    });

    it('should throw error for invalid HTTP method', () => {
      const invalidConfig = {
        port: 3000,
        routes: [
          {
            method: 'INVALID',
            path: '/test',
            response: { status: 200, body: {} },
          },
        ],
      };
      const configPath = path.join(tempDir, 'mock.config.json');
      fs.writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2));

      const loader = new ConfigLoader(configPath);
      expect(() => loader.load()).toThrow('method');
    });

    it('should throw error when route is missing response', () => {
      const invalidConfig = {
        port: 3000,
        routes: [
          {
            method: 'GET',
            path: '/test',
          },
        ],
      };
      const configPath = path.join(tempDir, 'mock.config.json');
      fs.writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2));

      const loader = new ConfigLoader(configPath);
      expect(() => loader.load()).toThrow('response');
    });

    it('should throw error when response.status is not a number', () => {
      const invalidConfig = {
        port: 3000,
        routes: [
          {
            method: 'GET',
            path: '/test',
            response: { status: '200', body: {} },
          },
        ],
      };
      const configPath = path.join(tempDir, 'mock.config.json');
      fs.writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2));

      const loader = new ConfigLoader(configPath);
      expect(() => loader.load()).toThrow('status');
    });
  });

  describe('getters', () => {
    it('should return the config path', () => {
      const configPath = path.join(tempDir, 'mock.config.json');
      fs.writeFileSync(configPath, JSON.stringify(validConfig, null, 2));

      const loader = new ConfigLoader(configPath);
      expect(loader.getConfigPath()).toBe(configPath);
    });

    it('should return null config before loading', () => {
      const configPath = path.join(tempDir, 'mock.config.json');
      fs.writeFileSync(configPath, JSON.stringify(validConfig, null, 2));

      const loader = new ConfigLoader(configPath);
      expect(loader.getConfig()).toBeNull();
    });

    it('should return loaded config after loading', () => {
      const configPath = path.join(tempDir, 'mock.config.json');
      fs.writeFileSync(configPath, JSON.stringify(validConfig, null, 2));

      const loader = new ConfigLoader(configPath);
      const loadedConfig = loader.load();
      const cachedConfig = loader.getConfig();

      expect(cachedConfig).toEqual(loadedConfig);
    });
  });

  describe('empty path validation', () => {
    it('should throw error when route path is empty', () => {
      const invalidConfig = {
        port: 3000,
        routes: [
          {
            method: 'GET',
            path: '',
            response: { status: 200, body: {} },
          },
        ],
      };
      const configPath = path.join(tempDir, 'mock.config.json');
      fs.writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2));

      const loader = new ConfigLoader(configPath);
      expect(() => loader.load()).toThrow('path');
    });
  });

  describe('multiple routes', () => {
    it('should load configuration with multiple routes', () => {
      const multiRouteConfig: MockConfig = {
        port: 3000,
        routes: [
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
            method: 'PATCH',
            path: '/users/:id',
            response: { status: 200, body: { patched: true } },
          },
          {
            method: 'HEAD',
            path: '/users/:id',
            response: { status: 200 },
          },
          {
            method: 'OPTIONS',
            path: '/users/:id',
            response: { status: 200 },
          },
        ],
      };

      const configPath = path.join(tempDir, 'mock.config.json');
      fs.writeFileSync(configPath, JSON.stringify(multiRouteConfig, null, 2));

      const loader = new ConfigLoader(configPath);
      const config = loader.load();

      expect(config.routes).toHaveLength(8);
    });
  });
});
