import { MockConfig } from './types';
import { ConfigLoader } from './core/config';
import { MockServer } from './core/server';
import { ConfigWatcher } from './core/watcher';

export interface MockServerCLI {
  configPath: string;
  port?: number;
  watch?: boolean;
}

export class MockServerCLI {
  private configLoader: ConfigLoader;
  private server: MockServer | null = null;
  private watcher: ConfigWatcher | null = null;
  private port?: number;
  private watch: boolean;

  constructor(options: MockServerCLI) {
    this.configLoader = new ConfigLoader(options.configPath);
    this.port = options.port;
    this.watch = options.watch ?? true;
  }

  async start(): Promise<void> {
    let config: MockConfig;

    try {
      config = this.configLoader.load();
    } catch (error) {
      console.error('加载配置文件失败:', error);
      process.exit(1);
    }

    if (this.port !== undefined) {
      config.port = this.port;
    }

    this.server = new MockServer(config);

    await this.server.start();

    if (this.watch) {
      this.watcher = new ConfigWatcher(this.configLoader.getConfigPath(), {
        onChange: (configPath) => {
          this.reloadConfig();
        },
        onError: (error) => {
          console.error('配置文件监听错误:', error);
        },
      });
      this.watcher.start();
    }

    process.on('SIGINT', async () => {
      console.log('\n正在关闭服务器...');
      await this.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n正在关闭服务器...');
      await this.stop();
      process.exit(0);
    });
  }

  private async reloadConfig(): Promise<void> {
    try {
      console.log('重新加载配置文件...');
      const config = this.configLoader.load();

      if (this.port !== undefined) {
        config.port = this.port;
      }

      if (this.server) {
        this.server.updateConfig(config);
      }

      console.log('配置文件重新加载成功');
    } catch (error) {
      console.error('重新加载配置文件失败:', error);
    }
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }

    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
  }

  getServer(): MockServer | null {
    return this.server;
  }
}

export { MockConfig, MockRoute, MockResponse } from './types';
export { ConfigLoader } from './core/config';
export { MockServer } from './core/server';
export { Router } from './core/router';
export { TemplateEngine, TemplateContext } from './core/template';
export { ConfigWatcher, ConfigWatcherOptions } from './core/watcher';

if (require.main === module) {
  const configPath = process.argv[2];

  if (!configPath) {
    console.log('用法: mock-server <config-file> [port] [--no-watch]');
    console.log('示例: mock-server ./mock.config.ts 3000');
    process.exit(1);
  }

  let port: number | undefined;
  let watch = true;

  for (let i = 3; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--no-watch') {
      watch = false;
    } else if (!isNaN(Number(arg))) {
      port = parseInt(arg, 10);
    }
  }

  const cli = new MockServerCLI({
    configPath,
    port,
    watch,
  });

  cli.start().catch((error) => {
    console.error('启动服务器失败:', error);
    process.exit(1);
  });
}
