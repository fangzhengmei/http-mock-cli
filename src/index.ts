import { MockConfig } from './types';
import { ConfigLoader } from './core/config';
import { MockServer, ConfigUpdateResult } from './core/server';
import { ConfigWatcher } from './core/watcher';

export interface MockServerCLIOptions {
  configPath: string;
  port?: number;
  watch?: boolean;
  maxRetries?: number;
  retryIntervalMs?: number;
}

export interface ReloadResult {
  success: boolean;
  error?: Error;
  message: string;
  configVersion?: number;
  retryCount?: number;
}

export class MockServerCLI {
  private configLoader: ConfigLoader;
  private server: MockServer | null = null;
  private watcher: ConfigWatcher | null = null;
  private port?: number;
  private watch: boolean;
  private initialConfigLoaded: boolean = false;
  private isReloading: boolean = false;
  private maxRetries: number;
  private retryIntervalMs: number;

  constructor(options: MockServerCLIOptions) {
    this.configLoader = new ConfigLoader(options.configPath);
    this.port = options.port;
    this.watch = options.watch ?? true;
    this.maxRetries = options.maxRetries ?? 5;
    this.retryIntervalMs = options.retryIntervalMs ?? 300;
  }

  async start(): Promise<void> {
    console.log('='.repeat(60));
    console.log('HTTP Mock Server 启动中...');
    console.log(`配置文件: ${this.configLoader.getConfigPath()}`);
    console.log('='.repeat(60));

    let config: MockConfig;

    try {
      console.log('\n[启动] 正在加载初始配置...');
      config = this.configLoader.load();
      this.initialConfigLoaded = true;
      console.log('[启动] 初始配置加载成功');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('\n[启动失败] 初始配置加载失败:');
      console.error(`  错误: ${errorMessage}`);
      console.error('\n[提示] 请检查配置文件是否存在且格式正确');
      console.error('[提示] 支持的配置格式: .js, .ts, .json');
      console.error('[提示] 配置必须包含有效的 routes 数组');
      process.exit(1);
    }

    if (this.port !== undefined) {
      console.log(`[启动] 使用指定端口: ${this.port}`);
      config.port = this.port;
    }

    try {
      console.log('\n[启动] 正在创建服务器实例...');
      this.server = new MockServer(config);
      console.log('[启动] 服务器实例创建成功');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('\n[启动失败] 创建服务器实例失败:');
      console.error(`  错误: ${errorMessage}`);
      process.exit(1);
    }

    try {
      await this.server.start();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('\n[启动失败] 启动服务器失败:');
      console.error(`  错误: ${errorMessage}`);
      process.exit(1);
    }

    if (this.watch) {
      console.log('\n[配置监听] 正在启动配置文件监听...');
      this.watcher = new ConfigWatcher(this.configLoader.getConfigPath(), {
        onChange: (configPath) => {
          this.reloadConfig();
        },
        onError: (error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('\n[配置监听错误] 文件监听出现错误:');
          console.error(`  错误: ${errorMessage}`);
          console.error('[配置监听] 服务器将继续使用当前配置运行');
        },
        debounceMs: 200,
      });
      this.watcher.start();
      console.log('[配置监听] 已启动，配置文件修改后将自动热加载');
    } else {
      console.log('\n[配置监听] 未启用（使用 --no-watch 参数）');
    }

    console.log('\n' + '='.repeat(60));
    console.log('HTTP Mock Server 已成功启动！');
    console.log(`访问地址: http://localhost:${this.server.getPort()}`);
    console.log(`配置版本: v${this.server.getConfigVersion()}`);
    if (this.watch) {
      console.log('配置监听: 已启用');
    }
    console.log('='.repeat(60));
    console.log('\n提示:');
    console.log('  - 修改配置文件后会自动热加载');
    console.log('  - 如果新配置无效，将保持当前可用配置');
    console.log('  - 按 Ctrl+C 停止服务器');

    process.on('SIGINT', async () => {
      console.log('\n\n[关闭] 正在关闭服务器...');
      await this.stop();
      console.log('[关闭] 服务器已安全关闭');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n\n[关闭] 正在关闭服务器...');
      await this.stop();
      console.log('[关闭] 服务器已安全关闭');
      process.exit(0);
    });
  }

  async reloadConfig(): Promise<ReloadResult> {
    if (this.isReloading) {
      const message = '[配置热加载] 正在处理上一次的重载请求，忽略本次请求';
      console.log(message);
      return {
        success: false,
        message,
      };
    }

    this.isReloading = true;
    const currentVersion = this.server?.getConfigVersion();

    console.log('\n' + '='.repeat(60));
    console.log('[配置热加载] 检测到配置文件变化，开始热加载...');
    console.log(`[配置热加载] 当前配置版本: v${currentVersion}`);
    console.log(`[配置热加载] 最大重试次数: ${this.maxRetries}`);
    console.log(`[配置热加载] 重试间隔: ${this.retryIntervalMs}ms`);
    console.log('='.repeat(60));

    let lastError: Error | null = null;
    let lastErrorMessage = '';

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const isFirstAttempt = attempt === 0;
      const attemptNumber = isFirstAttempt ? 1 : attempt + 1;

      if (!isFirstAttempt) {
        console.log(`\n[配置热加载] 重试 ${attemptNumber}/${this.maxRetries + 1}...`);
        console.log(`[配置热加载] 等待 ${this.retryIntervalMs}ms 后重试...`);
        await this.sleep(this.retryIntervalMs);
      }

      console.log(`\n[配置热加载] 尝试 ${attemptNumber}/${this.maxRetries + 1}`);

      try {
        console.log('[配置热加载] 步骤 1/4: 正在解析新配置...');
        const newConfig = this.configLoader.load();
        console.log('[配置热加载] 步骤 1/4: 新配置解析成功');

        if (this.port !== undefined) {
          newConfig.port = this.port;
        }

        if (!this.server) {
          const message = '[配置热加载] 服务器未运行，无法更新配置';
          console.error(message);
          this.isReloading = false;
          return {
            success: false,
            error: new Error(message),
            message,
            retryCount: attempt,
          };
        }

        console.log('[配置热加载] 步骤 2/4: 正在验证新配置...');
        console.log('[配置热加载] 步骤 2/4: 验证将在 updateConfig 中进行');

        console.log('[配置热加载] 步骤 3/4: 正在应用新配置...');
        const updateResult: ConfigUpdateResult = this.server.updateConfig(newConfig);

        console.log('[配置热加载] 步骤 4/4: 检查更新结果...');

        if (updateResult.success) {
          const newVersion = this.server.getConfigVersion();
          console.log('\n' + '='.repeat(60));
          console.log('[配置热加载成功] ✅');
          console.log(`[配置热加载] 尝试次数: ${attemptNumber}/${this.maxRetries + 1}`);
          console.log(`[配置热加载] 版本: v${currentVersion} -> v${newVersion}`);
          console.log(`[配置热加载] 提示: ${updateResult.message}`);
          console.log('='.repeat(60));

          this.isReloading = false;
          return {
            success: true,
            message: updateResult.message,
            configVersion: newVersion,
            retryCount: attempt,
          };
        } else {
          lastError = updateResult.error || null;
          lastErrorMessage = updateResult.message;

          console.log(`[配置热加载] 本次尝试失败: ${updateResult.message}`);

          if (attempt < this.maxRetries) {
            console.log(`[配置热加载] 将在 ${this.retryIntervalMs}ms 后重试...`);
          } else {
            const remainingVersion = this.server.getConfigVersion();
            console.error('\n' + '='.repeat(60));
            console.error('[配置热加载最终失败] ❌');
            console.error(`[配置热加载] 总尝试次数: ${this.maxRetries + 1}`);
            console.error(`[配置热加载] 最后错误: ${lastErrorMessage}`);
            console.error('\n[配置热加载] 安全措施已生效:');
            console.error(`  - 服务器继续使用当前可用配置运行`);
            console.error(`  - 当前配置版本: v${remainingVersion}`);
            console.error('\n[配置热加载] 建议操作:');
            console.error('  1. 检查配置文件中的错误');
            console.error('  2. 修复错误后保存配置文件');
            console.error('  3. 配置文件修改后会自动重试热加载');
            console.error('='.repeat(60));

            this.isReloading = false;
            return {
              success: false,
              error: lastError || new Error(lastErrorMessage),
              message: lastErrorMessage,
              configVersion: remainingVersion,
              retryCount: this.maxRetries,
            };
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        lastError = error instanceof Error ? error : new Error(errorMessage);
        lastErrorMessage = errorMessage;

        console.log(`[配置热加载] 本次尝试异常: ${errorMessage}`);

        if (attempt < this.maxRetries) {
          console.log(`[配置热加载] 将在 ${this.retryIntervalMs}ms 后重试...`);
        } else {
          const remainingVersion = this.server?.getConfigVersion();

          console.error('\n' + '='.repeat(60));
          console.error('[配置热加载最终失败] ❌');
          console.error(`[配置热加载] 总尝试次数: ${this.maxRetries + 1}`);
          console.error(`[配置热加载] 错误类型: ${error instanceof SyntaxError ? '语法错误' : '运行时错误'}`);
          console.error(`[配置热加载] 最后错误: ${errorMessage}`);
          console.error('\n[配置热加载] 安全措施已生效:');
          console.error(`  - 配置加载过程中出现异常`);
          console.error(`  - 服务器将继续使用当前可用配置运行`);
          if (remainingVersion) {
            console.error(`  - 当前配置版本: v${remainingVersion}`);
          }
          console.error('\n[配置热加载] 建议操作:');
          console.error('  1. 检查配置文件的语法是否正确');
          console.error('  2. 确保所有必需的字段都已正确配置');
          console.error('  3. 修复错误后保存配置文件');
          console.error('='.repeat(60));

          this.isReloading = false;
          return {
            success: false,
            error: lastError,
            message: `配置热加载最终失败: ${errorMessage}`,
            configVersion: remainingVersion,
            retryCount: this.maxRetries,
          };
        }
      }
    }

    this.isReloading = false;
    return {
      success: false,
      error: new Error('未知错误'),
      message: '配置热加载失败，未知错误',
      retryCount: this.maxRetries,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async rollback(): Promise<ReloadResult> {
    if (!this.server) {
      const message = '[配置回滚] 服务器未运行，无法回滚';
      console.error(message);
      return {
        success: false,
        error: new Error(message),
        message,
      };
    }

    if (!this.server.hasPreviousConfig()) {
      const message = '[配置回滚] 没有可回滚的上一版配置';
      console.log(message);
      return {
        success: false,
        error: new Error(message),
        message,
      };
    }

    const currentVersion = this.server.getConfigVersion();
    console.log('\n' + '='.repeat(60));
    console.log('[配置回滚] 开始手动回滚...');
    console.log(`[配置回滚] 当前版本: v${currentVersion}`);
    console.log('='.repeat(60));

    const result = this.server.rollbackToPreviousConfig();

    if (result.success) {
      const newVersion = this.server.getConfigVersion();
      console.log('\n' + '='.repeat(60));
      console.log('[配置回滚成功] ✅');
      console.log(`[配置回滚] 版本: v${currentVersion} -> v${newVersion}`);
      console.log('='.repeat(60));

      return {
        success: true,
        message: result.message,
        configVersion: newVersion,
      };
    } else {
      console.error('\n' + '='.repeat(60));
      console.error('[配置回滚失败] ❌');
      console.error(`[配置回滚] 错误: ${result.message}`);
      console.error('='.repeat(60));

      return {
        success: false,
        error: result.error,
        message: result.message,
        configVersion: currentVersion,
      };
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

    this.isReloading = false;
  }

  getServer(): MockServer | null {
    return this.server;
  }

  isWatching(): boolean {
    return this.watcher?.isWatching() ?? false;
  }

  getCurrentConfigVersion(): number | null {
    return this.server?.getConfigVersion() ?? null;
  }

  hasPreviousConfig(): boolean {
    return this.server?.hasPreviousConfig() ?? false;
  }
}

export { MockConfig, MockRoute, MockResponse } from './types';
export { ConfigLoader } from './core/config';
export { MockServer, ConfigUpdateResult } from './core/server';
export { Router } from './core/router';
export { TemplateEngine, TemplateContext } from './core/template';
export { ConfigWatcher, ConfigWatcherOptions } from './core/watcher';

if (require.main === module) {
  const configPath = process.argv[2];

  if (!configPath) {
    console.log('用法: mock-server <config-file> [port] [--no-watch]');
    console.log('');
    console.log('参数说明:');
    console.log('  <config-file>  必需: 配置文件路径 (.js, .ts, .json)');
    console.log('  [port]         可选: 服务器端口 (默认: 3000)');
    console.log('  [--no-watch]   可选: 禁用配置文件热监听');
    console.log('');
    console.log('示例:');
    console.log('  mock-server ./mock.config.ts');
    console.log('  mock-server ./mock.config.ts 8080');
    console.log('  mock-server ./mock.config.json 3000 --no-watch');
    console.log('');
    console.log('配置文件格式要求:');
    console.log('  必须包含 routes 数组，每个路由需要:');
    console.log('    - method: HTTP 方法 (GET, POST, PUT, DELETE, 等)');
    console.log('    - path: 路由路径 (支持动态参数如 /users/:id)');
    console.log('    - response: 响应配置 (包含 status, 可选 body, headers, delay)');
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\n' + '='.repeat(60));
    console.error('[启动失败]');
    console.error(`  错误: ${errorMessage}`);
    console.error('='.repeat(60));
    process.exit(1);
  });
}
