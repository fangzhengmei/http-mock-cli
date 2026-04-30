import { MockConfig, MockRoute, MockResponse } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export class ConfigLoader {
  private config: MockConfig | null = null;
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  load(): MockConfig {
    const configDir = path.dirname(this.configPath);
    const ext = path.extname(this.configPath);

    if (ext === '.ts') {
      const tsNode = require('ts-node');
      tsNode.register();
      const configModule = require(path.resolve(this.configPath));
      this.config = configModule.default || configModule;
    } else if (ext === '.js') {
      const configModule = require(path.resolve(this.configPath));
      this.config = configModule.default || configModule;
    } else if (ext === '.json') {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(content);
    } else {
      throw new Error(`不支持的配置文件格式: ${ext}`);
    }

    this.validateConfig(this.config);
    return this.config;
  }

  private validateConfig(config: MockConfig): void {
    if (!config) {
      throw new Error('配置文件不能为空');
    }

    if (!config.routes || !Array.isArray(config.routes)) {
      throw new Error('配置文件必须包含 routes 数组');
    }

    config.routes.forEach((route, index) => {
      this.validateRoute(route, index);
    });
  }

  private validateRoute(route: MockRoute, index: number): void {
    const requiredFields = ['method', 'path', 'response'];
    const missingFields = requiredFields.filter(field => !(field in route));

    if (missingFields.length > 0) {
      throw new Error(`路由 ${index} 缺少必要字段: ${missingFields.join(', ')}`);
    }

    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
    if (!validMethods.includes(route.method)) {
      throw new Error(`路由 ${index} 的 method 无效: ${route.method}，有效方法: ${validMethods.join(', ')}`);
    }

    if (typeof route.path !== 'string' || route.path === '') {
      throw new Error(`路由 ${index} 的 path 必须是非空字符串`);
    }

    this.validateResponse(route.response, index);
  }

  private validateResponse(response: MockRoute['response'], routeIndex: number): void {
    if (typeof response === 'function') {
      return;
    }

    if (typeof response !== 'object' || response === null) {
      throw new Error(`路由 ${routeIndex} 的 response 必须是对象或函数`);
    }

    if (typeof response.status !== 'number') {
      throw new Error(`路由 ${routeIndex} 的 response.status 必须是数字`);
    }
  }

  getConfig(): MockConfig | null {
    return this.config;
  }

  getConfigPath(): string {
    return this.configPath;
  }
}
