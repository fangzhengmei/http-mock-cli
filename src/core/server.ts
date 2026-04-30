import * as express from 'express';
import { Server as HttpServer } from 'http';
import { MockConfig, MockResponse, MockRoute } from '../types';
import { Router } from './router';
import { TemplateEngine } from './template';

export interface MockServerOptions {
  port?: number;
  watchConfig?: boolean;
}

export interface ConfigUpdateResult {
  success: boolean;
  error?: Error;
  message: string;
}

export class MockServer {
  private app: express.Application;
  private server: HttpServer | null = null;
  private port: number;
  private router: Router;
  private defaultResponse: MockResponse;
  private config: MockConfig;
  private previousConfig: MockConfig | null = null;
  private configVersion: number = 1;

  constructor(config: MockConfig) {
    this.validateConfig(config);
    this.config = this.deepCloneConfig(config);
    this.previousConfig = null;
    this.port = config.port || 3000;
    this.router = new Router(this.config.routes);
    this.defaultResponse = this.config.defaultResponse || {
      status: 404,
      body: { error: 'Not Found' },
    };

    this.app = this.createExpressApp();
  }

  private validateConfig(config: MockConfig): void {
    if (!config) {
      throw new Error('配置不能为空');
    }

    if (!config.routes || !Array.isArray(config.routes)) {
      throw new Error('配置必须包含 routes 数组');
    }

    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

    config.routes.forEach((route, index) => {
      const requiredFields = ['method', 'path', 'response'];
      const missingFields = requiredFields.filter(field => !(field in route));

      if (missingFields.length > 0) {
        throw new Error(`路由 ${index} 缺少必要字段: ${missingFields.join(', ')}`);
      }

      if (!validMethods.includes(route.method.toUpperCase())) {
        throw new Error(`路由 ${index} 的 method 无效: ${route.method}，有效方法: ${validMethods.join(', ')}`);
      }

      if (typeof route.path !== 'string' || route.path === '') {
        throw new Error(`路由 ${index} 的 path 必须是非空字符串`);
      }

      const response = route.response;
      if (typeof response !== 'function') {
        if (typeof response !== 'object' || response === null) {
          throw new Error(`路由 ${index} 的 response 必须是对象或函数`);
        }

        if (typeof response.status !== 'number') {
          throw new Error(`路由 ${index} 的 response.status 必须是数字`);
        }
      }
    });

    if (config.defaultResponse !== undefined) {
      if (typeof config.defaultResponse !== 'object' || config.defaultResponse === null) {
        throw new Error('defaultResponse 必须是对象');
      }
      if (typeof config.defaultResponse.status !== 'number') {
        throw new Error('defaultResponse.status 必须是数字');
      }
    }
  }

  private deepCloneConfig(config: MockConfig): MockConfig {
    const cloned: MockConfig = {
      port: config.port,
      routes: [],
      defaultResponse: config.defaultResponse
        ? JSON.parse(JSON.stringify(config.defaultResponse))
        : undefined,
    };

    config.routes.forEach(route => {
      if (typeof route.response === 'function') {
        cloned.routes.push({
          ...route,
          response: route.response,
        });
      } else {
        cloned.routes.push({
          ...route,
          response: JSON.parse(JSON.stringify(route.response)),
        });
      }
    });

    return cloned;
  }

  private createExpressApp(): express.Application {
    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }

      next();
    });

    app.all('*', async (req, res) => {
      await this.handleRequest(req, res);
    });

    return app;
  }

  private async handleRequest(req: express.Request, res: express.Response): Promise<void> {
    const method = req.method;
    const path = req.path;

    const matchResult = this.router.match(method, path);

    if (!matchResult) {
      await this.sendResponse(res, this.defaultResponse);
      return;
    }

    const { route, params } = matchResult;
    const query = req.query as Record<string, string>;
    const body = req.body;

    let mockResponse: MockResponse;

    if (typeof route.response === 'function') {
      try {
        mockResponse = await Promise.resolve(route.response(params, query, body));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`路由处理函数执行失败 (${route.method} ${route.path}):`, errorMessage);
        await this.sendResponse(res, {
          status: 500,
          body: {
            error: 'Internal Server Error',
            message: `路由处理函数执行失败: ${errorMessage}`,
            configVersion: this.configVersion,
          },
        });
        return;
      }
    } else {
      try {
        mockResponse = TemplateEngine.render(route.response, { params, query, body });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`模板渲染失败 (${route.method} ${route.path}):`, errorMessage);
        await this.sendResponse(res, {
          status: 500,
          body: {
            error: 'Internal Server Error',
            message: `模板渲染失败: ${errorMessage}`,
            configVersion: this.configVersion,
          },
        });
        return;
      }
    }

    if (mockResponse.delay && mockResponse.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, mockResponse.delay));
    }

    await this.sendResponse(res, mockResponse);
  }

  private async sendResponse(res: express.Response, response: MockResponse): Promise<void> {
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.header(key, value);
      }
    }

    res.status(response.status);

    if (response.body !== undefined) {
      const body = response.body;
      if (typeof body === 'string') {
        res.send(body);
      } else {
        res.json(body);
      }
    } else {
      res.end();
    }
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        console.log('服务器已在运行');
        resolve(this.port);
        return;
      }

      this.server = this.app.listen(this.port, () => {
        const address = this.server?.address();
        const actualPort = typeof address === 'object' && address !== null ? address.port : this.port;
        this.port = actualPort;

        console.log(`Mock 服务器已启动，端口: ${actualPort}`);
        console.log(`当前配置版本: v${this.configVersion}`);
        console.log(`可用路由:`);
        this.router.getAllRoutes().forEach(route => {
          console.log(`  ${route.method} ${route.path}`);
        });
        resolve(actualPort);
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        console.log('服务器未运行');
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          reject(error);
        } else {
          this.server = null;
          console.log('Mock 服务器已停止');
          resolve();
        }
      });
    });
  }

  updateConfig(newConfig: MockConfig): ConfigUpdateResult {
    const oldVersion = this.configVersion;
    const newVersion = this.configVersion + 1;

    console.log(`\n[配置更新] 开始验证新配置...`);
    console.log(`[配置更新] 当前版本: v${oldVersion}`);

    try {
      this.validateConfig(newConfig);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[配置更新失败] 配置验证失败: ${errorMessage}`);
      console.error(`[配置更新失败] 保持使用当前版本 v${oldVersion}`);

      return {
        success: false,
        error: new Error(`配置验证失败: ${errorMessage}`),
        message: `配置验证失败，保持使用当前版本 v${oldVersion}。错误: ${errorMessage}`,
      };
    }

    console.log(`[配置更新] 新配置验证通过`);
    console.log(`[配置更新] 保存上一版配置 v${oldVersion} 作为回滚点`);

    const previousConfig = this.deepCloneConfig(this.config);
    const clonedNewConfig = this.deepCloneConfig(newConfig);

    try {
      console.log(`[配置更新] 应用新配置...`);

      this.previousConfig = previousConfig;
      this.config = clonedNewConfig;

      if (newConfig.port !== undefined) {
        this.port = newConfig.port;
      }

      this.router.setRoutes(this.config.routes);

      if (this.config.defaultResponse) {
        this.defaultResponse = this.config.defaultResponse;
      }

      this.configVersion = newVersion;

      console.log(`[配置更新成功] 版本已更新到 v${newVersion}`);
      console.log(`[配置更新] 上一版 v${oldVersion} 已保存，可用于回滚`);
      console.log(`[配置更新] 可用路由:`);
      this.router.getAllRoutes().forEach(route => {
        console.log(`  ${route.method} ${route.path}`);
      });

      return {
        success: true,
        message: `配置更新成功，版本 v${oldVersion} -> v${newVersion}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[配置更新失败] 应用新配置时出错: ${errorMessage}`);
      console.error(`[配置更新失败] 正在回滚到上一版 v${oldVersion}...`);

      try {
        this.config = previousConfig;
        this.router.setRoutes(this.config.routes);
        if (this.config.defaultResponse) {
          this.defaultResponse = this.config.defaultResponse;
        }
        console.log(`[配置更新] 成功回滚到版本 v${oldVersion}`);
      } catch (rollbackError) {
        const rollbackErrorMessage = rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError);
        console.error(`[配置更新严重错误] 回滚失败: ${rollbackErrorMessage}`);
        console.error(`[配置更新严重错误] 服务器可能处于不一致状态`);

        return {
          success: false,
          error: new Error(`更新失败且回滚也失败: ${errorMessage}, 回滚错误: ${rollbackErrorMessage}`),
          message: `严重错误: 更新失败且回滚也失败。更新错误: ${errorMessage}, 回滚错误: ${rollbackErrorMessage}`,
        };
      }

      return {
        success: false,
        error: new Error(`应用配置失败: ${errorMessage}`),
        message: `应用配置失败，已回滚到版本 v${oldVersion}。错误: ${errorMessage}`,
      };
    }
  }

  rollbackToPreviousConfig(): ConfigUpdateResult {
    if (!this.previousConfig) {
      const message = '没有可回滚的上一版配置';
      console.log(`[配置回滚] ${message}`);
      return {
        success: false,
        error: new Error(message),
        message,
      };
    }

    const currentVersion = this.configVersion;
    const previousVersion = this.configVersion - 1;

    console.log(`\n[配置回滚] 开始回滚...`);
    console.log(`[配置回滚] 当前版本: v${currentVersion}`);
    console.log(`[配置回滚] 目标版本: v${previousVersion}`);

    try {
      const configToRollback = this.deepCloneConfig(this.previousConfig);

      this.config = configToRollback;
      this.router.setRoutes(this.config.routes);

      if (this.config.defaultResponse) {
        this.defaultResponse = this.config.defaultResponse;
      }

      this.configVersion = previousVersion;
      this.previousConfig = null;

      console.log(`[配置回滚成功] 已回滚到版本 v${previousVersion}`);
      console.log(`[配置回滚] 可用路由:`);
      this.router.getAllRoutes().forEach(route => {
        console.log(`  ${route.method} ${route.path}`);
      });

      return {
        success: true,
        message: `成功回滚到版本 v${previousVersion}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[配置回滚失败] ${errorMessage}`);

      return {
        success: false,
        error: new Error(`回滚失败: ${errorMessage}`),
        message: `回滚失败: ${errorMessage}`,
      };
    }
  }

  hasPreviousConfig(): boolean {
    return this.previousConfig !== null;
  }

  getConfigVersion(): number {
    return this.configVersion;
  }

  getCurrentConfig(): MockConfig {
    return this.deepCloneConfig(this.config);
  }

  getPreviousConfig(): MockConfig | null {
    if (!this.previousConfig) {
      return null;
    }
    return this.deepCloneConfig(this.previousConfig);
  }

  getApp(): express.Application {
    return this.app;
  }

  getPort(): number {
    return this.port;
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  getRoutes(): MockRoute[] {
    return this.router.getAllRoutes();
  }
}
