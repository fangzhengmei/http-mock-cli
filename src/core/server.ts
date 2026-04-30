import * as express from 'express';
import { Server as HttpServer } from 'http';
import { MockConfig, MockResponse, MockRoute } from '../types';
import { Router } from './router';
import { TemplateEngine } from './template';

export interface MockServerOptions {
  port?: number;
  watchConfig?: boolean;
}

export class MockServer {
  private app: express.Application;
  private server: HttpServer | null = null;
  private port: number;
  private router: Router;
  private defaultResponse: MockResponse;
  private config: MockConfig;

  constructor(config: MockConfig) {
    this.config = config;
    this.port = config.port || 3000;
    this.router = new Router(config.routes);
    this.defaultResponse = config.defaultResponse || {
      status: 404,
      body: { error: 'Not Found' },
    };

    this.app = this.createExpressApp();
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
      mockResponse = await Promise.resolve(route.response(params, query, body));
    } else {
      mockResponse = TemplateEngine.render(route.response, { params, query, body });
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
        console.log(`Mock 服务器已启动，端口: ${this.port}`);
        console.log(`可用路由:`);
        this.router.getAllRoutes().forEach(route => {
          console.log(`  ${route.method} ${route.path}`);
        });
        resolve(this.port);
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

  updateConfig(config: MockConfig): void {
    this.config = config;
    this.router.setRoutes(config.routes);

    if (config.defaultResponse) {
      this.defaultResponse = config.defaultResponse;
    }

    console.log('配置已更新');
    console.log(`可用路由:`);
    this.router.getAllRoutes().forEach(route => {
      console.log(`  ${route.method} ${route.path}`);
    });
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
