import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ConfigWatcher } from '../src/core/watcher';

describe('ConfigWatcher', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-watcher-'));
    configPath = path.join(tempDir, 'mock.config.json');
    fs.writeFileSync(configPath, JSON.stringify({ routes: [] }, null, 2));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.readdirSync(tempDir).forEach(file => {
        fs.unlinkSync(path.join(tempDir, file));
      });
      fs.rmdirSync(tempDir);
    }
  });

  describe('constructor', () => {
    it('should create a ConfigWatcher instance', () => {
      const watcher = new ConfigWatcher(configPath);
      expect(watcher).toBeDefined();
    });

    it('should accept custom options', () => {
      const onChange = jest.fn();
      const onError = jest.fn();
      const watcher = new ConfigWatcher(configPath, {
        onChange,
        onError,
        debounceMs: 200,
      });
      expect(watcher).toBeDefined();
    });
  });

  describe('start and stop', () => {
    let watcher: ConfigWatcher;

    afterEach(async () => {
      if (watcher && watcher.isWatching()) {
        watcher.stop();
      }
    });

    it('should start watching', () => {
      watcher = new ConfigWatcher(configPath);
      expect(watcher.isWatching()).toBe(false);
      watcher.start();
      expect(watcher.isWatching()).toBe(true);
    });

    it('should stop watching', () => {
      watcher = new ConfigWatcher(configPath);
      watcher.start();
      expect(watcher.isWatching()).toBe(true);
      watcher.stop();
      expect(watcher.isWatching()).toBe(false);
    });

    it('should not throw when stopping a non-watching watcher', () => {
      watcher = new ConfigWatcher(configPath);
      expect(() => watcher.stop()).not.toThrow();
    });
  });

  describe('isWatching', () => {
    let watcher: ConfigWatcher;

    afterEach(async () => {
      if (watcher && watcher.isWatching()) {
        watcher.stop();
      }
    });

    it('should return false before starting', () => {
      watcher = new ConfigWatcher(configPath);
      expect(watcher.isWatching()).toBe(false);
    });

    it('should return true after starting', () => {
      watcher = new ConfigWatcher(configPath);
      watcher.start();
      expect(watcher.isWatching()).toBe(true);
    });

    it('should return false after stopping', () => {
      watcher = new ConfigWatcher(configPath);
      watcher.start();
      watcher.stop();
      expect(watcher.isWatching()).toBe(false);
    });
  });
});
