/**
 * Performance Tests
 * Tests performance characteristics of the extension
 */

import { Jobs, Storage, init, _, $rootScope } from '../js/services.js';

describe('Performance Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Jobs.jobs = {};
    jest.useFakeTimers();

    // Reset $rootScope options
    $rootScope.options = {
      refreshTime: 60,
      notification: 'all'
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Memory Usage', () => {
    test('should efficiently handle job data cloning', () => {
      const jobCount = 1000;
      const jobs = {};
      
      // Create test jobs
      for (let i = 0; i < jobCount; i++) {
        jobs[`http://jenkins.example.com/job/test-${i}/`] = {
          name: `test-${i}`,
          url: `http://jenkins.example.com/job/test-${i}/`,
          building: false,
          status: 'Success',
          statusClass: 'success',
          statusIcon: 'green',
          lastBuildNumber: '42',
          lastBuildTime: new Date().toISOString()
        };
      }

      // Measure memory before cloning
      const heapBefore = process.memoryUsage().heapUsed;
      
      // Clone jobs using utility function
      const clonedJobs = _.clone(jobs);
      
      // Measure memory after cloning
      const heapAfter = process.memoryUsage().heapUsed;
      
      // Memory impact should be roughly equal to original data
      const originalSize = JSON.stringify(jobs).length;
      const clonedSize = JSON.stringify(clonedJobs).length;
      expect(clonedSize).toBe(originalSize);
      
      // Memory increase should be proportional to data size
      const memoryIncrease = heapAfter - heapBefore;
      expect(memoryIncrease).toBeLessThan(originalSize * 3); // Allow for some overhead
    });
  });

  describe('Network Simulation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should handle varying network conditions', async () => {
      const jobUrl = 'http://jenkins.example.com/job/test-network/';
      await Jobs.add(jobUrl);

      // Test different network latencies (reduced values)
      const latencies = [100, 250, 500]; // More realistic latency values in milliseconds
      
      for (const latency of latencies) {
        // Mock fetch with specified latency
        global.fetch = jest.fn().mockImplementationOnce(() => 
          new Promise(resolve => {
            setTimeout(() => resolve({
              ok: true,
              json: () => Promise.resolve({
                displayName: 'Test Job',
                url: jobUrl,
                color: 'blue',
                lastCompletedBuild: { number: 42 }
              })
            }), latency);
            jest.advanceTimersByTime(latency);
          })
        );
        
        // Test job updates under different network conditions
        const startTime = Date.now();
        await Jobs.updateStatus(jobUrl);
        const duration = Date.now() - startTime;
        
        // Since we're using fake timers, duration should be close to latency
        expect(duration).toBeLessThanOrEqual(latency * 1.1); // Allow 10% overhead
      }
    }, 5000);

    test('should handle network timeouts gracefully', async () => {
      const jobUrl = 'http://jenkins.example.com/job/timeout-test/';
      await Jobs.add(jobUrl);

      const TIMEOUT = 1000; // 1 second timeout

      // Mock a network timeout
      global.fetch = jest.fn().mockImplementationOnce(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Network timeout')), TIMEOUT);
          jest.advanceTimersByTime(TIMEOUT);
        })
      );

      const startTime = Date.now();
      const result = await Jobs.updateStatus(jobUrl);
      const duration = Date.now() - startTime;

      expect(result.newValue.error).toBeDefined();
      expect(duration).toBeLessThanOrEqual(TIMEOUT * 1.1); // Allow 10% overhead
    }, 5000);

    test('should handle intermittent network failures', async () => {
      const jobUrl = 'http://jenkins.example.com/job/intermittent-test/';
      await Jobs.add(jobUrl);

      // Mock alternating success/failure responses
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 0) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            displayName: 'Test Job',
            url: jobUrl,
            color: 'blue',
            lastCompletedBuild: { number: 42 }
          })
        });
      });

      // Perform multiple updates
      const results = [];
      for (let i = 0; i < 4; i++) {
        results.push(await Jobs.updateStatus(jobUrl));
      }

      // Verify alternating success/failure pattern
      expect(results.map(r => r.newValue.error !== undefined)).toEqual([
        false, true, false, true
      ]);
    });
  });

  describe('Update Performance', () => {
    test('should efficiently handle concurrent job updates', async () => {
      const jobCount = 100;
      const jobs = {};
      
      // Create test jobs
      for (let i = 0; i < jobCount; i++) {
        jobs[`http://jenkins.example.com/job/test-${i}/`] = {
          name: `test-${i}`,
          url: `http://jenkins.example.com/job/test-${i}/`,
          building: false,
          status: 'Success',
          statusClass: 'success',
          statusIcon: 'green',
          lastBuildNumber: '42',
          lastBuildTime: new Date().toISOString()
        };
      }

      Jobs.jobs = jobs;

      // Mock successful API responses
      global.fetch = jest.fn().mockImplementation((url) => 
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            displayName: 'Test Job',
            url: url.replace('/api/json/', ''),
            color: 'blue',
            lastCompletedBuild: { number: 42 }
          })
        })
      );

      // Track API calls
      const startTime = Date.now();

      // Update all jobs
      const updatePromises = await Jobs.updateAllStatus();
      await Promise.all(updatePromises.map(p => p.catch(() => null))); // Handle any errors

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete all updates within reasonable time
      expect(duration).toBeLessThan(jobCount * 10); // Less than 10ms per job
      
      // Should make one API call per job
      expect(global.fetch).toHaveBeenCalledTimes(jobCount);
    });

    test('should handle network failures efficiently', async () => {
      const jobCount = 100;
      const jobs = {};
      
      // Create test jobs
      for (let i = 0; i < jobCount; i++) {
        jobs[`http://jenkins.example.com/job/test-${i}/`] = {
          name: `test-${i}`,
          url: `http://jenkins.example.com/job/test-${i}/`,
          building: false,
          status: 'Success'
        };
      }

      Jobs.jobs = jobs;

      // Mock network failures
      global.fetch = jest.fn().mockImplementation(() => Promise.reject(new Error('Network error')));

      const startTime = Date.now();
      const updatePromises = await Jobs.updateAllStatus();
      await Promise.all(updatePromises.map(p => p.catch(() => null)));
      const endTime = Date.now();

      // Should handle failures quickly
      expect(endTime - startTime).toBeLessThan(jobCount * 5); // Less than 5ms per job
      
      // Should preserve existing job data
      Object.values(Jobs.jobs).forEach(job => {
        expect(job.error).toBe('Network error');
        expect(job.status).toBe('Success'); // Original status preserved
      });
    });
  });

  describe('Storage Performance', () => {
    test('should handle large storage operations efficiently', async () => {
      const operationCount = 100;
      const largeData = {};
      
      // Create test data
      for (let i = 0; i < operationCount; i++) {
        largeData[`key-${i}`] = {
          name: `test-${i}`,
          data: 'x'.repeat(1000) // 1KB of data per entry
        };
      }

      // Mock storage callbacks
      chrome.storage.local.set.mockImplementation((data, callback) => callback());
      chrome.storage.local.get.mockImplementation((keys, callback) => callback(largeData));

      const startTime = Date.now();
      
      // Test write performance
      await Storage.set(largeData);
      
      // Test read performance
      const result = await Storage.get(Object.keys(largeData));
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Operations should complete quickly
      expect(duration).toBeLessThan(100); // Less than 100ms total
      expect(result).toEqual(largeData);
    });
  });

  describe('Event System Performance', () => {
    test('should handle multiple event listeners efficiently', () => {
      const listenerCount = 1000;
      const startTime = Date.now();
      const receivedEvents = [];
      
      // Add many listeners
      for (let i = 0; i < listenerCount; i++) {
        $rootScope.$on('test-event', (_, data) => {
          receivedEvents.push(data);
        });
      }
      
      // Broadcast event
      $rootScope.$broadcast('test-event', { data: 'test' });
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Event handling should be quick
      expect(duration).toBeLessThan(100); // Less than 100ms
      expect(receivedEvents.length).toBe(listenerCount);
      expect(receivedEvents[0]).toEqual({ data: 'test' });
    });
  });
});
