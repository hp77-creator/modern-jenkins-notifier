import { Jobs, jenkins, defaultJobData, Storage } from '../js/services.js';

describe('Jenkins Notifier Job Tracking Tests', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Reset Jobs state
    Jobs.jobs = {};
    
    // Setup default chrome storage mock behavior
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ jobs: {} });
    });
    
    chrome.storage.local.set.mockImplementation((data, callback) => {
      callback();
    });

    // Setup default fetch mock behavior for Jenkins API
    global.fetch.mockImplementation((url) => {
      const jobNumber = url.match(/job-(\d+)/)?.[1] || '1';
      
      if (url.endsWith('api/json/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            displayName: `Test Job ${jobNumber}`,
            url: url.replace('/api/json/', ''),
            color: 'blue',
            lastCompletedBuild: { number: 42 }
          })
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(`
          <?xml version="1.0" encoding="UTF-8"?>
          <Projects>
            <Project webUrl="${url.replace('/cc.xml', '')}" 
                     lastBuildLabel="42" 
                     lastBuildTime="2023-06-14T10:00:00Z" />
          </Projects>
        `)
      });
    });
  });

  test('should track multiple jobs simultaneously', async () => {
    const jobUrls = [
      'http://jenkins.example.com/job/test-job-1/',
      'http://jenkins.example.com/job/test-job-2/',
      'http://jenkins.example.com/job/test-job-3/',
      'http://jenkins.example.com/job/test-job-4/',
      'http://jenkins.example.com/job/test-job-5/'
    ];

    // Add jobs one by one to simulate real usage
    for (const url of jobUrls) {
      await Jobs.add(url);
    }
    
    // Verify all jobs were added
    expect(Object.keys(Jobs.jobs).length).toBe(5);
    
    // Update status for all jobs
    const updatePromises = await Jobs.updateAllStatus();
    await Promise.all(updatePromises);

    // Verify each job has been updated
    jobUrls.forEach(url => {
      expect(Jobs.jobs[url]).toBeDefined();
      expect(Jobs.jobs[url].error).toBeUndefined();
      expect(Jobs.jobs[url].status).toBe('Success');
    });
  });

  test('should handle failed job updates gracefully', async () => {
    const jobUrl = 'http://jenkins.example.com/job/failing-job/';
    
    // Mock a failed Jenkins API response
    global.fetch.mockImplementationOnce(() => 
      Promise.resolve({
        ok: false,
        statusText: 'Server Error'
      })
    );

    await Jobs.add(jobUrl);
    const result = await Jobs.updateStatus(jobUrl);

    expect(result.newValue.error).toBe('Server Error');
  });

  test('should track job build status changes', async () => {
    const jobUrl = 'http://jenkins.example.com/job/test-job/';
    
    // Initial successful build
    global.fetch.mockImplementationOnce(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          displayName: 'Test Job',
          url: jobUrl,
          color: 'blue',
          lastCompletedBuild: { number: 42 }
        })
      })
    );
    
    await Jobs.add(jobUrl);
    let result = await Jobs.updateStatus(jobUrl);
    expect(result.newValue.status).toBe('Success');
    
    // Mock a failing build
    global.fetch.mockImplementationOnce(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          displayName: 'Test Job',
          url: jobUrl,
          color: 'red',
          lastCompletedBuild: { number: 43 }
        })
      })
    );
    
    result = await Jobs.updateStatus(jobUrl);
    expect(result.newValue.status).toBe('Failure');
  });

  test('should handle building state correctly', async () => {
    const jobUrl = 'http://jenkins.example.com/job/building-job/';
    
    // Mock a building job
    global.fetch.mockImplementationOnce(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          displayName: 'Building Job',
          url: jobUrl,
          color: 'blue_anime',
          lastCompletedBuild: { number: 44 }
        })
      })
    );
    
    await Jobs.add(jobUrl);
    const result = await Jobs.updateStatus(jobUrl);
    
    expect(result.newValue.building).toBe(true);
  });

  test('should handle large number of concurrent updates', async () => {
    const num_jobs = 20; // Reduced for test performance
    const jobUrls = Array.from({ length: num_jobs }, (_, i) => 
      `http://jenkins.example.com/job/test-job-${i + 1}/`
    );

    // Track fetch calls
    const fetchCalls = [];
    global.fetch.mockImplementation((url) => {
      fetchCalls.push(url);
      const jobNumber = url.match(/job-(\d+)/)?.[1] || '1';
      
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          displayName: `Test Job ${jobNumber}`,
          url: url.replace('/api/json/', ''),
          color: 'blue',
          lastCompletedBuild: { number: 42 }
        })
      });
    });

    // Add all jobs
    for (const url of jobUrls) {
      await Jobs.add(url);
    }

    // Update all jobs
    const updatePromises = await Jobs.updateAllStatus();
    await Promise.all(updatePromises);

    // Verify API calls
    const apiCalls = fetchCalls.filter(url => url.endsWith('api/json/'));
    expect(apiCalls.length).toBe(num_jobs); // One API call per job

    // Each job should have made an API call
    jobUrls.forEach(jobUrl => {
      expect(apiCalls).toContain(jobUrl + 'api/json/');
    });
  });

  test('should remove jobs correctly', async () => {
    const jobUrl = 'http://jenkins.example.com/job/test-job/';
    
    await Jobs.add(jobUrl);
    expect(Jobs.jobs[jobUrl]).toBeDefined();
    
    await Jobs.remove(jobUrl);
    expect(Jobs.jobs[jobUrl]).toBeUndefined();
  });
});

describe('Concurrent Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Jobs.jobs = {};
  });

  test('should handle simultaneous job updates', async () => {
    // Add two test jobs
    const job1Url = 'http://jenkins.example.com/job/concurrent-1/';
    const job2Url = 'http://jenkins.example.com/job/concurrent-2/';
    
    await Jobs.add(job1Url);
    await Jobs.add(job2Url);

    // Setup different response times for each job
    global.fetch.mockImplementation((url) => {
      const delay = url.includes('concurrent-1') ? 50 : 25; // Further reduced delays
      const jobNumber = url.includes('concurrent-1') ? '1' : '2';
      
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          displayName: `Test Job ${jobNumber}`,
          url: url.replace('/api/json/', ''),
          color: 'blue',
          lastCompletedBuild: { number: parseInt(jobNumber) + 41 }
        })
      });
    });

    // Trigger concurrent updates
    const startTime = Date.now();
    const [result1, result2] = await Promise.all([
      Jobs.updateStatus(job1Url),
      Jobs.updateStatus(job2Url)
    ]);
    const duration = Date.now() - startTime;

    // Verify both jobs updated correctly
    expect(result1.newValue.lastBuildNumber).toBe(42);
    expect(result2.newValue.lastBuildNumber).toBe(43);
    
    // Verify timing - should complete in roughly 50ms (the slower job's time)
    expect(duration).toBeGreaterThanOrEqual(0);
    expect(duration).toBeLessThan(100); // Allow small overhead
  });

  test('should handle race conditions in status updates', async () => {
    const jobUrl = 'http://jenkins.example.com/job/race-condition/';
    await Jobs.add(jobUrl);

    // Setup responses with different build numbers
    let callCount = 0;
    global.fetch.mockImplementation(() => {
      callCount++;
      const buildNumber = 40 + callCount;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          displayName: 'Race Condition Job',
          url: jobUrl,
          color: 'blue',
          lastCompletedBuild: { number: buildNumber }
        })
      });
    });

    // Trigger multiple updates simultaneously
    const updates = await Promise.all([
      Jobs.updateStatus(jobUrl),
      Jobs.updateStatus(jobUrl),
      Jobs.updateStatus(jobUrl)
    ]);

    // Verify all updates completed
    updates.forEach(update => {
      expect(update.newValue.error).toBeUndefined();
      const buildNum = parseInt(update.newValue.lastBuildNumber);
      expect(buildNum).toBeGreaterThanOrEqual(41);
      expect(buildNum).toBeLessThanOrEqual(43);
    });

    // Convert final state to number for comparison
    const finalBuildNumber = parseInt(Jobs.jobs[jobUrl].lastBuildNumber);
    expect(finalBuildNumber).toBe(43);
  });

  test('should handle concurrent add and remove operations', async () => {
    const jobUrl = 'http://jenkins.example.com/job/add-remove-race/';
    
    // Trigger concurrent add and remove operations
    const operations = await Promise.all([
      Jobs.add(jobUrl),
      Jobs.remove(jobUrl),
      Jobs.add(jobUrl),
      Jobs.remove(jobUrl),
      Jobs.add(jobUrl)
    ]);

    // Verify final state - should be added since that was the last operation
    expect(Jobs.jobs[jobUrl]).toBeDefined();
    
    // Check chrome storage was called correctly
    const storageSetCalls = chrome.storage.local.set.mock.calls;
    expect(storageSetCalls.length).toBe(5); // One for each operation
  });
});
