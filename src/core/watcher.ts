import * as chokidar from 'chokidar';
import * as path from 'path';
import * as fs from 'fs';

export interface ConfigWatcherOptions {
  onChange?: (configPath: string) => void;
  onError?: (error: Error) => void;
  debounceMs?: number;
  stabilityCheckMs?: number;
  maxStabilityWaitMs?: number;
}

export class ConfigWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private configPath: string;
  private options: ConfigWatcherOptions;
  private debounceTimer: NodeJS.Timeout | null = null;
  private stabilityTimer: NodeJS.Timeout | null = null;
  private lastChangeTime: number = 0;
  private isCheckingStability: boolean = false;
  private stabilityCheckStartTime: number = 0;

  constructor(configPath: string, options: ConfigWatcherOptions = {}) {
    this.configPath = configPath;
    this.options = {
      debounceMs: 150,
      stabilityCheckMs: 200,
      maxStabilityWaitMs: 5000,
      ...options,
    };
  }

  start(): void {
    this.watcher = chokidar.watch(this.configPath, {
      ignoreInitial: true,
      persistent: true,
      usePolling: false,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
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
    console.log(`  - 防抖延迟: ${this.options.debounceMs}ms`);
    console.log(`  - 稳定性检测: ${this.options.stabilityCheckMs}ms`);
    console.log(`  - 最大等待时间: ${this.options.maxStabilityWaitMs}ms`);
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

    if (this.stabilityTimer) {
      clearTimeout(this.stabilityTimer);
      this.stabilityTimer = null;
    }

    this.isCheckingStability = false;
  }

  private handleChange(changedPath: string): void {
    const now = Date.now();
    this.lastChangeTime = now;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      console.log(`\n[配置文件变化] 检测到文件变化: ${changedPath}`);
      console.log(`[配置文件变化] 开始检查文件稳定性...`);
      this.startStabilityCheck(changedPath);
    }, this.options.debounceMs);
  }

  private startStabilityCheck(changedPath: string): void {
    if (this.isCheckingStability) {
      console.log(`[稳定性检测] 已有稳定性检查进行中，重置计时器...`);
      if (this.stabilityTimer) {
        clearTimeout(this.stabilityTimer);
      }
    } else {
      this.isCheckingStability = true;
      this.stabilityCheckStartTime = Date.now();
    }

    this.checkFileStability(changedPath);
  }

  private checkFileStability(changedPath: string): void {
    const now = Date.now();
    const timeSinceLastChange = now - this.lastChangeTime;
    const timeSinceCheckStart = now - this.stabilityCheckStartTime;

    if (timeSinceLastChange >= this.options.stabilityCheckMs!) {
      console.log(`[稳定性检测] ✓ 文件已稳定 (距离上次变化: ${timeSinceLastChange}ms)`);

      if (this.canReadFile(changedPath)) {
        console.log(`[稳定性检测] ✓ 文件可读取，触发热加载...`);
        this.isCheckingStability = false;
        if (this.stabilityTimer) {
          clearTimeout(this.stabilityTimer);
          this.stabilityTimer = null;
        }
        this.triggerChange(changedPath);
      } else {
        console.log(`[稳定性检测] ✗ 文件暂时不可读取，继续等待...`);
        this.scheduleNextCheck(changedPath);
      }
    } else {
      console.log(`[稳定性检测] 文件仍在变化中，继续等待... (距离上次变化: ${timeSinceLastChange}ms)`);
      this.scheduleNextCheck(changedPath);
    }

    if (timeSinceCheckStart >= this.options.maxStabilityWaitMs!) {
      console.log(`[稳定性检测] ⚠️  已达到最大等待时间 (${this.options.maxStabilityWaitMs}ms)`);
      console.log(`[稳定性检测] 尝试最后一次读取...`);

      if (this.canReadFile(changedPath)) {
        console.log(`[稳定性检测] ✓ 最后一次读取成功，触发热加载`);
        this.isCheckingStability = false;
        this.triggerChange(changedPath);
      } else {
        console.log(`[稳定性检测] ✗ 最后一次读取失败，放弃本次热加载`);
        console.log(`[稳定性检测] 服务器将继续使用当前有效配置`);
        this.isCheckingStability = false;
        if (this.stabilityTimer) {
          clearTimeout(this.stabilityTimer);
          this.stabilityTimer = null;
        }
      }
    }
  }

  private scheduleNextCheck(changedPath: string): void {
    if (this.stabilityTimer) {
      clearTimeout(this.stabilityTimer);
    }

    this.stabilityTimer = setTimeout(() => {
      this.checkFileStability(changedPath);
    }, 50);
  }

  private canReadFile(filePath: string): boolean {
    try {
      const stats = fs.statSync(filePath);

      if (!stats.isFile()) {
        return false;
      }

      if (stats.size === 0) {
        console.log(`[文件检测] 文件大小为 0，可能正在写入中...`);
        return false;
      }

      const fd = fs.openSync(filePath, 'r');
      fs.closeSync(fd);

      return true;
    } catch (error) {
      console.log(`[文件检测] 无法读取文件: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private triggerChange(changedPath: string): void {
    if (this.options.onChange) {
      this.options.onChange(changedPath);
    }
  }

  isWatching(): boolean {
    return this.watcher !== null;
  }

  isCheckingStabilityStatus(): boolean {
    return this.isCheckingStability;
  }

  getLastChangeTime(): number {
    return this.lastChangeTime;
  }
}
