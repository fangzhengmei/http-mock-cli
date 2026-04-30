import * as chokidar from 'chokidar';
import * as path from 'path';

export interface ConfigWatcherOptions {
  onChange?: (configPath: string) => void;
  onError?: (error: Error) => void;
  debounceMs?: number;
}

export class ConfigWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private configPath: string;
  private options: ConfigWatcherOptions;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(configPath: string, options: ConfigWatcherOptions = {}) {
    this.configPath = configPath;
    this.options = {
      debounceMs: 100,
      ...options,
    };
  }

  start(): void {
    const configDir = path.dirname(this.configPath);
    const configBasename = path.basename(this.configPath);

    this.watcher = chokidar.watch(this.configPath, {
      ignoreInitial: true,
      persistent: true,
      usePolling: false,
    });

    this.watcher.on('change', (changedPath) => {
      this.handleChange(changedPath);
    });

    this.watcher.on('error', (error) => {
      if (this.options.onError) {
        this.options.onError(error);
      } else {
        console.error('配置文件监听错误:', error);
      }
    });

    console.log(`开始监听配置文件: ${this.configPath}`);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log(`停止监听配置文件: ${this.configPath}`);
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private handleChange(changedPath: string): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      console.log(`配置文件已更改: ${changedPath}`);
      if (this.options.onChange) {
        this.options.onChange(changedPath);
      }
    }, this.options.debounceMs);
  }

  isWatching(): boolean {
    return this.watcher !== null;
  }
}
