import { MockServer } from '../src/core/server';
import { MockConfig } from '../src/types';
import { HotReloadState } from '../src/types';

describe('Hot Reload Observability', () => {
  const initialConfig: MockConfig = {
    port: 0,
    routes: [
      {
        method: 'GET',
        path: '/api/users',
        response: { status: 200, body: { users: [{ id: 1, name: 'Initial' }] } },
      },
    ],
  };

  describe('Initial State', () => {
    it('should have correct initial state after construction', () => {
      const server = new MockServer(initialConfig);

      const state = server.getHotReloadState();

      expect(state.currentVersion).toBe(1);
      expect(state.status).toBe('initial');
      expect(state.consecutiveFailures).toBe(0);
      expect(state.totalSuccesses).toBe(1);
      expect(state.totalFailures).toBe(0);
      expect(state.recentEvents.length).toBeGreaterThan(0);

      expect(state.lastSuccess).not.toBeNull();
      expect(state.lastSuccess?.version).toBe(1);
      expect(state.lastSuccess?.timestamp).toBeGreaterThan(0);

      expect(state.lastFailure).toBeNull();
    });

    it('should have correct initial values from getter methods', () => {
      const server = new MockServer(initialConfig);

      expect(server.getConfigVersion()).toBe(1);
      expect(server.getHotReloadState().status).toBe('initial');
      expect(server.getConsecutiveFailures()).toBe(0);
      expect(server.getTotalSuccesses()).toBe(1);
      expect(server.getTotalFailures()).toBe(0);

      const lastSuccess = server.getLastSuccess();
      expect(lastSuccess).not.toBeNull();
      expect(lastSuccess?.version).toBe(1);

      expect(server.getLastFailure()).toBeNull();

      const recentEvents = server.getRecentEvents();
      expect(recentEvents.length).toBeGreaterThan(0);
      expect(recentEvents[0].success).toBe(true);
      expect(recentEvents[0].version).toBe(1);
    });
  });

  describe('Success Stage - State Changes', () => {
    it('should update state correctly on successful update', () => {
      const server = new MockServer(initialConfig);

      const initialState = server.getHotReloadState();
      expect(initialState.currentVersion).toBe(1);
      expect(initialState.totalSuccesses).toBe(1);

      const successConfig: MockConfig = {
        port: 0,
        routes: [
          {
            method: 'GET',
            path: '/api/posts',
            response: { status: 200, body: { posts: [] } },
          },
        ],
      };

      const result = server.updateConfig(successConfig);

      expect(result.success).toBe(true);

      const updatedState = server.getHotReloadState();

      expect(updatedState.currentVersion).toBe(2);
      expect(updatedState.status).toBe('success');
      expect(updatedState.consecutiveFailures).toBe(0);
      expect(updatedState.totalSuccesses).toBe(2);
      expect(updatedState.totalFailures).toBe(0);

      expect(updatedState.lastSuccess?.version).toBe(2);
      expect(updatedState.lastSuccess?.timestamp).toBeGreaterThanOrEqual(initialState.lastSuccess!.timestamp);

      expect(updatedState.lastFailure).toBeNull();

      const recentEvents = server.getRecentEvents();
      expect(recentEvents.length).toBe(2);
      expect(recentEvents[1].success).toBe(true);
      expect(recentEvents[1].version).toBe(2);
    });

    it('should increment totalSuccesses on multiple successful updates', () => {
      const server = new MockServer(initialConfig);

      expect(server.getTotalSuccesses()).toBe(1);

      const configs: MockConfig[] = [
        {
          port: 0,
          routes: [{ method: 'GET', path: '/v2', response: { status: 200, body: { v: 2 } } }],
        },
        {
          port: 0,
          routes: [{ method: 'GET', path: '/v3', response: { status: 200, body: { v: 3 } } }],
        },
        {
          port: 0,
          routes: [{ method: 'GET', path: '/v4', response: { status: 200, body: { v: 4 } } }],
        },
      ];

      configs.forEach((config, index) => {
        server.updateConfig(config);
        expect(server.getTotalSuccesses()).toBe(2 + index);
        expect(server.getConsecutiveFailures()).toBe(0);
        expect(server.getHotReloadState().status).toBe('success');
      });

      expect(server.getConfigVersion()).toBe(4);
      expect(server.getTotalSuccesses()).toBe(4);
      expect(server.getRecentEvents().length).toBe(4);
    });

    it('should keep lastSuccess updated after each success', () => {
      const server = new MockServer(initialConfig);

      const firstSuccess = server.getLastSuccess();
      expect(firstSuccess?.version).toBe(1);

      const v2Config: MockConfig = {
        port: 0,
        routes: [{ method: 'GET', path: '/v2', response: { status: 200, body: {} } }],
      };

      server.updateConfig(v2Config);

      const secondSuccess = server.getLastSuccess();
      expect(secondSuccess?.version).toBe(2);
      expect(secondSuccess?.timestamp).toBeGreaterThanOrEqual(firstSuccess!.timestamp);

      expect(server.getLastFailure()).toBeNull();
    });
  });

  describe('Failure Stage - State Changes', () => {
    it('should update state correctly on failed update', () => {
      const server = new MockServer(initialConfig);

      const initialState = server.getHotReloadState();
      expect(initialState.currentVersion).toBe(1);
      expect(initialState.totalFailures).toBe(0);
      expect(initialState.consecutiveFailures).toBe(0);
      expect(initialState.status).toBe('initial');

      const badConfig: MockConfig = {
        port: 0,
        routes: [
          {
            // @ts-ignore: Intentional invalid method for testing
            method: 'INVALID_METHOD',
            path: '/api/bad',
            response: { status: 200, body: {} },
          },
        ],
      };

      const result = server.updateConfig(badConfig);

      expect(result.success).toBe(false);

      const failedState = server.getHotReloadState();

      expect(failedState.currentVersion).toBe(1);
      expect(failedState.status).toBe('error');
      expect(failedState.consecutiveFailures).toBe(1);
      expect(failedState.totalFailures).toBe(1);
      expect(failedState.totalSuccesses).toBe(1);

      expect(failedState.lastSuccess?.version).toBe(1);

      expect(failedState.lastFailure).not.toBeNull();
      expect(failedState.lastFailure?.version).toBe(1);
      expect(failedState.lastFailure?.errorMessage).toContain('method');

      const recentEvents = server.getRecentEvents();
      expect(recentEvents.length).toBe(2);
      expect(recentEvents[1].success).toBe(false);
      expect(recentEvents[1].version).toBe(1);
      expect(recentEvents[1].errorMessage).toBeDefined();
    });

    it('should increment consecutiveFailures on multiple failed updates', () => {
      const server = new MockServer(initialConfig);

      expect(server.getConsecutiveFailures()).toBe(0);
      expect(server.getTotalFailures()).toBe(0);

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
              // @ts-ignore: Intentional invalid method
              method: 'BAD2',
              path: '/test',
              response: { status: 200, body: {} },
            },
          ],
        },
        {
          port: 0,
          routes: [
            {
              // @ts-ignore: Intentional invalid method
              method: 'BAD3',
              path: '/test',
              response: { status: 200, body: {} },
            },
          ],
        },
      ];

      badConfigs.forEach((config, index) => {
        server.updateConfig(config);
        expect(server.getConsecutiveFailures()).toBe(index + 1);
        expect(server.getTotalFailures()).toBe(index + 1);
        expect(server.getHotReloadState().status).toBe('error');
      });

      expect(server.getConfigVersion()).toBe(1);
      expect(server.getTotalSuccesses()).toBe(1);
      expect(server.getRecentEvents().length).toBe(4);

      const recentEvents = server.getRecentEvents();
      for (let i = 1; i <= 3; i++) {
        expect(recentEvents[i].success).toBe(false);
      }
    });

    it('should keep lastFailure updated after each failure', () => {
      const server = new MockServer(initialConfig);

      expect(server.getLastFailure()).toBeNull();

      const badConfig1: MockConfig = {
        port: 0,
        routes: [
          {
            // @ts-ignore: Intentional invalid method
            method: 'BAD1',
            path: '/test',
            response: { status: 200, body: {} },
          },
        ],
      };

      server.updateConfig(badConfig1);

      const firstFailure = server.getLastFailure();
      expect(firstFailure).not.toBeNull();
      expect(firstFailure?.version).toBe(1);
      expect(firstFailure?.errorMessage).toContain('BAD1');

      const badConfig2: MockConfig = {
        port: 0,
        routes: [
          {
            // @ts-ignore: Intentional invalid method
            method: 'BAD2',
            path: '/test',
            response: { status: 200, body: {} },
          },
        ],
      };

      server.updateConfig(badConfig2);

      const secondFailure = server.getLastFailure();
      expect(secondFailure?.version).toBe(1);
      expect(secondFailure?.errorMessage).toContain('BAD2');
      expect(secondFailure?.timestamp).toBeGreaterThanOrEqual(firstFailure!.timestamp);

      expect(server.getLastSuccess()?.version).toBe(1);
    });

    it('should not change currentVersion on failed update', () => {
      const server = new MockServer(initialConfig);

      const goodConfig: MockConfig = {
        port: 0,
        routes: [{ method: 'GET', path: '/v2', response: { status: 200, body: {} } }],
      };

      server.updateConfig(goodConfig);
      expect(server.getConfigVersion()).toBe(2);

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

      expect(server.getConfigVersion()).toBe(2);
      expect(server.getConsecutiveFailures()).toBe(1);
    });
  });

  describe('Recovery Stage - State Changes', () => {
    it('should reset consecutiveFailures and update status to success on recovery', () => {
      const server = new MockServer(initialConfig);

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
      server.updateConfig(badConfig);
      server.updateConfig(badConfig);

      expect(server.getConsecutiveFailures()).toBe(3);
      expect(server.getHotReloadState().status).toBe('error');

      const goodConfig: MockConfig = {
        port: 0,
        routes: [{ method: 'GET', path: '/recovered', response: { status: 200, body: { recovered: true } } }],
      };

      const result = server.updateConfig(goodConfig);

      expect(result.success).toBe(true);

      const recoveredState = server.getHotReloadState();

      expect(recoveredState.status).toBe('success');
      expect(recoveredState.consecutiveFailures).toBe(0);
      expect(recoveredState.currentVersion).toBe(2);
      expect(recoveredState.totalSuccesses).toBe(2);
      expect(recoveredState.totalFailures).toBe(3);

      expect(recoveredState.lastSuccess?.version).toBe(2);

      expect(recoveredState.lastFailure).not.toBeNull();
      expect(recoveredState.lastFailure?.version).toBe(1);

      const recentEvents = server.getRecentEvents();
      expect(recentEvents.length).toBe(5);
      expect(recentEvents[4].success).toBe(true);
      expect(recentEvents[4].version).toBe(2);
    });

    it('should correctly reflect the full failure-recovery cycle in recentEvents', () => {
      const server = new MockServer(initialConfig);

      const events: { success: boolean; version: number }[] = [];

      const goodConfig1: MockConfig = {
        port: 0,
        routes: [{ method: 'GET', path: '/v2', response: { status: 200, body: {} } }],
      };
      server.updateConfig(goodConfig1);
      events.push({ success: true, version: 2 });

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
      events.push({ success: false, version: 2 });

      server.updateConfig(badConfig);
      events.push({ success: false, version: 2 });

      const goodConfig2: MockConfig = {
        port: 0,
        routes: [{ method: 'GET', path: '/v3', response: { status: 200, body: {} } }],
      };
      server.updateConfig(goodConfig2);
      events.push({ success: true, version: 3 });

      const recentEvents = server.getRecentEvents();

      expect(recentEvents.length).toBe(5);

      expect(recentEvents[0].success).toBe(true);
      expect(recentEvents[0].version).toBe(1);

      for (let i = 0; i < events.length; i++) {
        expect(recentEvents[i + 1].success).toBe(events[i].success);
        expect(recentEvents[i + 1].version).toBe(events[i].version);
      }

      const state = server.getHotReloadState();
      expect(state.status).toBe('success');
      expect(state.consecutiveFailures).toBe(0);
      expect(state.totalSuccesses).toBe(3);
      expect(state.totalFailures).toBe(2);
    });

    it('should maintain correct total counters through multiple cycles', () => {
      const server = new MockServer(initialConfig);

      let expectedSuccesses = 1;
      let expectedFailures = 0;

      const goodConfig: MockConfig = {
        port: 0,
        routes: [{ method: 'GET', path: '/good', response: { status: 200, body: {} } }],
      };

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

      server.updateConfig(goodConfig);
      expectedSuccesses++;
      expect(server.getTotalSuccesses()).toBe(expectedSuccesses);

      server.updateConfig(badConfig);
      expectedFailures++;
      expect(server.getTotalFailures()).toBe(expectedFailures);

      server.updateConfig(badConfig);
      expectedFailures++;
      expect(server.getTotalFailures()).toBe(expectedFailures);

      server.updateConfig(goodConfig);
      expectedSuccesses++;
      expect(server.getTotalSuccesses()).toBe(expectedSuccesses);

      server.updateConfig(badConfig);
      expectedFailures++;
      expect(server.getTotalFailures()).toBe(expectedFailures);

      server.updateConfig(goodConfig);
      expectedSuccesses++;
      expect(server.getTotalSuccesses()).toBe(expectedSuccesses);

      const finalState = server.getHotReloadState();
      expect(finalState.totalSuccesses).toBe(expectedSuccesses);
      expect(finalState.totalFailures).toBe(expectedFailures);
      expect(finalState.status).toBe('success');
      expect(finalState.consecutiveFailures).toBe(0);
    });
  });

  describe('HotReloadState Object Integrity', () => {
    it('should return a deep copy of the state', () => {
      const server = new MockServer(initialConfig);

      const state1 = server.getHotReloadState();
      state1.currentVersion = 999;
      state1.consecutiveFailures = 999;

      const state2 = server.getHotReloadState();
      expect(state2.currentVersion).toBe(1);
      expect(state2.consecutiveFailures).toBe(0);
    });

    it('should return a deep copy of recentEvents', () => {
      const server = new MockServer(initialConfig);

      const events1 = server.getRecentEvents();
      events1.push({ timestamp: Date.now(), version: 999, success: true });

      const events2 = server.getRecentEvents();
      expect(events2.length).toBe(1);
    });

    it('should return a deep copy of lastSuccess and lastFailure', () => {
      const server = new MockServer(initialConfig);

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

      const lastSuccess1 = server.getLastSuccess();
      const lastFailure1 = server.getLastFailure();

      if (lastSuccess1) {
        lastSuccess1.version = 999;
      }
      if (lastFailure1) {
        lastFailure1.version = 999;
      }

      const lastSuccess2 = server.getLastSuccess();
      const lastFailure2 = server.getLastFailure();

      expect(lastSuccess2?.version).toBe(1);
      expect(lastFailure2?.version).toBe(1);
    });
  });

  describe('Recent Events History', () => {
    it('should keep only MAX_RECENT_EVENTS events', () => {
      const server = new MockServer(initialConfig);

      const goodConfig: MockConfig = {
        port: 0,
        routes: [{ method: 'GET', path: '/test', response: { status: 200, body: {} } }],
      };

      for (let i = 0; i < 15; i++) {
        server.updateConfig(goodConfig);
      }

      const recentEvents = server.getRecentEvents();
      expect(recentEvents.length).toBeLessThanOrEqual(10);
    });

    it('should keep the most recent events', () => {
      const server = new MockServer(initialConfig);

      const goodConfig: MockConfig = {
        port: 0,
        routes: [{ method: 'GET', path: '/test', response: { status: 200, body: {} } }],
      };

      for (let i = 0; i < 5; i++) {
        server.updateConfig(goodConfig);
      }

      const recentEvents = server.getRecentEvents();

      expect(recentEvents.length).toBe(6);
      expect(recentEvents[0].version).toBe(1);
      expect(recentEvents[5].version).toBe(6);
    });
  });

  describe('State Transitions Summary', () => {
    it('should correctly transition through initial -> success -> error -> success states', () => {
      const server = new MockServer(initialConfig);

      expect(server.getHotReloadState().status).toBe('initial');
      expect(server.getConsecutiveFailures()).toBe(0);

      const v2Config: MockConfig = {
        port: 0,
        routes: [{ method: 'GET', path: '/v2', response: { status: 200, body: {} } }],
      };
      server.updateConfig(v2Config);

      expect(server.getHotReloadState().status).toBe('success');
      expect(server.getConfigVersion()).toBe(2);

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
      server.updateConfig(badConfig);

      expect(server.getHotReloadState().status).toBe('error');
      expect(server.getConsecutiveFailures()).toBe(2);
      expect(server.getConfigVersion()).toBe(2);

      const v3Config: MockConfig = {
        port: 0,
        routes: [{ method: 'GET', path: '/v3', response: { status: 200, body: {} } }],
      };
      server.updateConfig(v3Config);

      expect(server.getHotReloadState().status).toBe('success');
      expect(server.getConsecutiveFailures()).toBe(0);
      expect(server.getConfigVersion()).toBe(3);

      const finalState = server.getHotReloadState();
      expect(finalState.totalSuccesses).toBe(3);
      expect(finalState.totalFailures).toBe(2);
      expect(finalState.lastSuccess?.version).toBe(3);
      expect(finalState.lastFailure?.version).toBe(2);
    });
  });

  describe('High Frequency Continuous Changes - State Consistency', () => {
    const goodConfigFactory = (index: number): MockConfig => ({
      port: 0,
      routes: [
        {
          method: 'GET',
          path: `/api/route-${index}`,
          response: { status: 200, body: { index } },
        },
      ],
    });

    const badConfigFactory = (index: number): MockConfig => ({
      port: 0,
      routes: [
        {
          // @ts-ignore: Intentional invalid method for testing
          method: `BAD-${index}`,
          path: `/test`,
          response: { status: 200, body: {} },
        },
      ],
    });

    it('should maintain consistent state during rapid successive successful updates', () => {
      const server = new MockServer(initialConfig);
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const result = server.updateConfig(goodConfigFactory(i));
        expect(result.success).toBe(true);

        const state = server.getHotReloadState();

        expect(state.currentVersion).toBe(2 + i);
        expect(state.status).toBe('success');
        expect(state.consecutiveFailures).toBe(0);
        expect(state.totalSuccesses).toBe(2 + i);
        expect(state.totalFailures).toBe(0);
        expect(state.lastSuccess?.version).toBe(2 + i);
        expect(state.lastFailure).toBeNull();

        const events = server.getRecentEvents();
        const lastEvent = events[events.length - 1];
        expect(lastEvent.success).toBe(true);
        expect(lastEvent.version).toBe(2 + i);
      }

      const finalState = server.getHotReloadState();
      expect(finalState.currentVersion).toBe(1 + iterations);
      expect(finalState.totalSuccesses).toBe(1 + iterations);
    });

    it('should maintain consistent state during rapid successive failed updates', () => {
      const server = new MockServer(initialConfig);
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const result = server.updateConfig(badConfigFactory(i));
        expect(result.success).toBe(false);

        const state = server.getHotReloadState();

        expect(state.currentVersion).toBe(1);
        expect(state.status).toBe('error');
        expect(state.consecutiveFailures).toBe(i + 1);
        expect(state.totalSuccesses).toBe(1);
        expect(state.totalFailures).toBe(i + 1);
        expect(state.lastSuccess?.version).toBe(1);
        expect(state.lastFailure?.version).toBe(1);
        expect(state.lastFailure?.errorMessage).toContain(`BAD-${i}`);

        const events = server.getRecentEvents();
        const lastEvent = events[events.length - 1];
        expect(lastEvent.success).toBe(false);
        expect(lastEvent.version).toBe(1);
        expect(lastEvent.errorMessage).toContain(`BAD-${i}`);
      }

      const finalState = server.getHotReloadState();
      expect(finalState.currentVersion).toBe(1);
      expect(finalState.consecutiveFailures).toBe(iterations);
      expect(finalState.totalFailures).toBe(iterations);
    });

    it('should maintain consistent state during alternating success-failure updates', () => {
      const server = new MockServer(initialConfig);
      const cycles = 10;
      let expectedVersion = 1;
      let expectedSuccesses = 1;
      let expectedFailures = 0;
      let expectedConsecutiveFailures = 0;

      for (let cycle = 0; cycle < cycles; cycle++) {
        const goodResult = server.updateConfig(goodConfigFactory(cycle));
        expect(goodResult.success).toBe(true);
        expectedVersion++;
        expectedSuccesses++;
        expectedConsecutiveFailures = 0;

        let state = server.getHotReloadState();
        expect(state.currentVersion).toBe(expectedVersion);
        expect(state.status).toBe('success');
        expect(state.consecutiveFailures).toBe(0);
        expect(state.totalSuccesses).toBe(expectedSuccesses);
        expect(state.totalFailures).toBe(expectedFailures);

        const badResult = server.updateConfig(badConfigFactory(cycle));
        expect(badResult.success).toBe(false);
        expectedFailures++;
        expectedConsecutiveFailures++;

        state = server.getHotReloadState();
        expect(state.currentVersion).toBe(expectedVersion);
        expect(state.status).toBe('error');
        expect(state.consecutiveFailures).toBe(expectedConsecutiveFailures);
        expect(state.totalSuccesses).toBe(expectedSuccesses);
        expect(state.totalFailures).toBe(expectedFailures);
      }

      const finalState = server.getHotReloadState();
      expect(finalState.currentVersion).toBe(1 + cycles);
      expect(finalState.totalSuccesses).toBe(1 + cycles);
      expect(finalState.totalFailures).toBe(cycles);
      expect(finalState.status).toBe('error');
      expect(finalState.consecutiveFailures).toBe(1);
      expect(finalState.lastSuccess?.version).toBe(1 + cycles);
      expect(finalState.lastFailure?.version).toBe(1 + cycles);
    });

    it('should maintain consistent state during rapid mixed updates (recovery scenarios)', () => {
      const server = new MockServer(initialConfig);
      let expectedVersion = 1;
      let expectedSuccesses = 1;
      let expectedFailures = 0;

      const badConfig1 = badConfigFactory(1);
      server.updateConfig(badConfig1);
      server.updateConfig(badConfig1);
      expectedFailures += 2;

      let state = server.getHotReloadState();
      expect(state.status).toBe('error');
      expect(state.consecutiveFailures).toBe(2);
      expect(state.totalFailures).toBe(2);
      expect(state.currentVersion).toBe(1);

      const goodConfig1 = goodConfigFactory(1);
      server.updateConfig(goodConfig1);
      expectedVersion++;
      expectedSuccesses++;

      state = server.getHotReloadState();
      expect(state.status).toBe('success');
      expect(state.consecutiveFailures).toBe(0);
      expect(state.currentVersion).toBe(2);
      expect(state.totalSuccesses).toBe(2);
      expect(state.totalFailures).toBe(2);
      expect(state.lastFailure?.errorMessage).toContain('BAD-1');

      const badConfig2 = badConfigFactory(2);
      server.updateConfig(badConfig2);
      server.updateConfig(badConfig2);
      server.updateConfig(badConfig2);
      expectedFailures += 3;

      state = server.getHotReloadState();
      expect(state.status).toBe('error');
      expect(state.consecutiveFailures).toBe(3);
      expect(state.totalFailures).toBe(5);
      expect(state.currentVersion).toBe(2);
      expect(state.lastSuccess?.version).toBe(2);

      const goodConfig2 = goodConfigFactory(2);
      server.updateConfig(goodConfig2);
      expectedVersion++;
      expectedSuccesses++;

      state = server.getHotReloadState();
      expect(state.status).toBe('success');
      expect(state.consecutiveFailures).toBe(0);
      expect(state.currentVersion).toBe(3);
      expect(state.totalSuccesses).toBe(3);
      expect(state.totalFailures).toBe(5);
      expect(state.lastFailure?.errorMessage).toContain('BAD-2');
    });

    it('should have consistent timestamps across related state fields', () => {
      const server = new MockServer(initialConfig);
      const initialState = server.getHotReloadState();
      const initialSuccessTime = initialState.lastSuccess?.timestamp;

      expect(initialSuccessTime).toBeGreaterThan(0);
      expect(initialState.recentEvents[0].timestamp).toBe(initialSuccessTime);

      const goodConfig = goodConfigFactory(1);
      const beforeUpdate = Date.now();
      server.updateConfig(goodConfig);
      const afterUpdate = Date.now();

      const state = server.getHotReloadState();
      const successTime = state.lastSuccess?.timestamp;

      expect(successTime).toBeGreaterThanOrEqual(beforeUpdate);
      expect(successTime).toBeLessThanOrEqual(afterUpdate);

      const events = state.recentEvents;
      const lastEvent = events[events.length - 1];
      expect(lastEvent.timestamp).toBe(successTime);

      const badConfig = badConfigFactory(1);
      const beforeFailure = Date.now();
      server.updateConfig(badConfig);
      const afterFailure = Date.now();

      const failedState = server.getHotReloadState();
      const failureTime = failedState.lastFailure?.timestamp;

      expect(failureTime).toBeGreaterThanOrEqual(beforeFailure);
      expect(failureTime).toBeLessThanOrEqual(afterFailure);
      expect(failedState.lastSuccess?.timestamp).toBe(successTime);

      const failedEvents = failedState.recentEvents;
      const lastFailedEvent = failedEvents[failedEvents.length - 1];
      expect(lastFailedEvent.timestamp).toBe(failureTime);
      expect(lastFailedEvent.success).toBe(false);
    });

    it('should maintain state consistency when events exceed MAX_RECENT_EVENTS', () => {
      const server = new MockServer(initialConfig);
      const goodConfig = goodConfigFactory(1);

      for (let i = 0; i < 20; i++) {
        server.updateConfig(goodConfig);
      }

      const events = server.getRecentEvents();
      expect(events.length).toBeLessThanOrEqual(10);

      const state = server.getHotReloadState();
      expect(state.totalSuccesses).toBe(21);
      expect(state.currentVersion).toBe(21);
      expect(state.lastSuccess?.version).toBe(21);

      const lastEvent = events[events.length - 1];
      expect(lastEvent.version).toBe(21);
      expect(lastEvent.success).toBe(true);
    });

    it('should return consistent snapshots from getHotReloadState()', () => {
      const server = new MockServer(initialConfig);

      const state1 = server.getHotReloadState();
      const state2 = server.getHotReloadState();

      expect(state1).not.toBe(state2);
      expect(state1.currentVersion).toBe(state2.currentVersion);
      expect(state1.status).toBe(state2.status);
      expect(state1.totalSuccesses).toBe(state2.totalSuccesses);
      expect(state1.lastSuccess?.version).toBe(state2.lastSuccess?.version);

      const goodConfig = goodConfigFactory(1);
      server.updateConfig(goodConfig);

      const state3 = server.getHotReloadState();
      expect(state3.currentVersion).toBe(2);
      expect(state3.status).toBe('success');
      expect(state3.totalSuccesses).toBe(2);
    });
  });

  describe('State Field Semantics - Documentation Examples', () => {
    it('should demonstrate how to check current status', () => {
      const server = new MockServer(initialConfig);

      const status = server.getHotReloadState().status;
      expect(status).toBe('initial');
      expect(['initial', 'success', 'error']).toContain(status);

      const goodConfig = goodConfigFactory(1);
      server.updateConfig(goodConfig);

      const successStatus = server.getHotReloadState().status;
      expect(successStatus).toBe('success');

      const badConfig = badConfigFactory(1);
      server.updateConfig(badConfig);

      const errorStatus = server.getHotReloadState().status;
      expect(errorStatus).toBe('error');
    });

    it('should demonstrate how to check for configuration health', () => {
      const server = new MockServer(initialConfig);
      const badConfig = badConfigFactory(1);

      server.updateConfig(badConfig);
      server.updateConfig(badConfig);
      server.updateConfig(badConfig);

      const state = server.getHotReloadState();

      const isHealthy = state.status !== 'error';
      const hasConsecutiveFailures = state.consecutiveFailures > 0;
      const consecutiveFailureCount = state.consecutiveFailures;

      expect(isHealthy).toBe(false);
      expect(hasConsecutiveFailures).toBe(true);
      expect(consecutiveFailureCount).toBe(3);

      const goodConfig = goodConfigFactory(1);
      server.updateConfig(goodConfig);

      const recoveredState = server.getHotReloadState();
      expect(recoveredState.status).toBe('success');
      expect(recoveredState.consecutiveFailures).toBe(0);
    });

    it('should demonstrate how to get last failure details', () => {
      const server = new MockServer(initialConfig);
      const badConfig = badConfigFactory(999);

      server.updateConfig(badConfig);

      const lastFailure = server.getLastFailure();

      expect(lastFailure).not.toBeNull();
      expect(lastFailure?.version).toBe(1);
      expect(lastFailure?.errorMessage).toContain('BAD-999');
      expect(lastFailure?.timestamp).toBeGreaterThan(0);

      const goodConfig = goodConfigFactory(1);
      server.updateConfig(goodConfig);

      const lastFailureAfterRecovery = server.getLastFailure();
      expect(lastFailureAfterRecovery).not.toBeNull();
      expect(lastFailureAfterRecovery?.errorMessage).toContain('BAD-999');

      const lastSuccess = server.getLastSuccess();
      expect(lastSuccess?.version).toBe(2);
    });

    it('should demonstrate how to access event history', () => {
      const server = new MockServer(initialConfig);

      server.updateConfig(goodConfigFactory(1));
      server.updateConfig(badConfigFactory(1));
      server.updateConfig(badConfigFactory(2));
      server.updateConfig(goodConfigFactory(2));

      const events = server.getRecentEvents();

      expect(events.length).toBe(5);

      expect(events[0].success).toBe(true);
      expect(events[0].version).toBe(1);

      expect(events[1].success).toBe(true);
      expect(events[1].version).toBe(2);

      expect(events[2].success).toBe(false);
      expect(events[2].version).toBe(2);

      expect(events[3].success).toBe(false);
      expect(events[3].version).toBe(2);

      expect(events[4].success).toBe(true);
      expect(events[4].version).toBe(3);

      const failedEvents = events.filter(e => !e.success);
      expect(failedEvents.length).toBe(2);

      const successEvents = events.filter(e => e.success);
      expect(successEvents.length).toBe(3);
    });

    it('should demonstrate how to use total counters for monitoring', () => {
      const server = new MockServer(initialConfig);

      const totalSuccessesBefore = server.getTotalSuccesses();
      const totalFailuresBefore = server.getTotalFailures();

      expect(totalSuccessesBefore).toBe(1);
      expect(totalFailuresBefore).toBe(0);

      server.updateConfig(goodConfigFactory(1));
      server.updateConfig(badConfigFactory(1));
      server.updateConfig(goodConfigFactory(2));
      server.updateConfig(badConfigFactory(2));
      server.updateConfig(badConfigFactory(3));

      const totalSuccesses = server.getTotalSuccesses();
      const totalFailures = server.getTotalFailures();

      expect(totalSuccesses).toBe(3);
      expect(totalFailures).toBe(3);

      const failureRate = totalFailures / (totalSuccesses + totalFailures);
      expect(failureRate).toBe(0.5);
    });
  });
});

function goodConfigFactory(index: number): MockConfig {
  return {
    port: 0,
    routes: [
      {
        method: 'GET',
        path: `/api/route-${index}`,
        response: { status: 200, body: { index } },
      },
    ],
  };
}

function badConfigFactory(index: number): MockConfig {
  return {
    port: 0,
    routes: [
      {
        // @ts-ignore: Intentional invalid method for testing
        method: `BAD-${index}`,
        path: `/test`,
        response: { status: 200, body: {} },
      },
    ],
  };
}
