// Mock implementation of services
export const $rootScope = {
  options: {
    refreshTime: 60,
    notification: 'all'
  },
  $broadcast: jest.fn(),
  $on: jest.fn((event, callback) => {
    $rootScope._listeners = $rootScope._listeners || {};
    $rootScope._listeners[event] = $rootScope._listeners[event] || [];
    $rootScope._listeners[event].push(callback);
  }),
  $emit: jest.fn((event, data) => {
    if ($rootScope._listeners && $rootScope._listeners[event]) {
      $rootScope._listeners[event].forEach(callback => callback(null, data));
    }
  })
};

// Create mock functions
const jobMocks = {
  add: jest.fn(),
  remove: jest.fn(),
  updateStatus: jest.fn(),
  updateAllStatus: jest.fn()
};

// Set default implementations
jobMocks.add.mockImplementation((url) => {
  Jobs.jobs[url] = {
    name: url.split('/').pop().replace(/\/$/, ''),
    url: url,
    building: false,
    status: 'Success',
    statusClass: 'success',
    statusIcon: 'green',
    lastBuildNumber: '42',
    lastBuildTime: new Date().toISOString()
  };
  $rootScope.$emit('Jobs::jobs.changed', Jobs.jobs);
  return Promise.resolve({ oldValue: null, newValue: Jobs.jobs[url] });
});

jobMocks.remove.mockImplementation((url) => {
  const oldValue = Jobs.jobs[url];
  delete Jobs.jobs[url];
  $rootScope.$emit('Jobs::jobs.changed', Jobs.jobs);
  return Promise.resolve({ oldValue, newValue: null });
});

jobMocks.updateStatus.mockImplementation((url) => {
  return Promise.resolve({
    oldValue: Jobs.jobs[url],
    newValue: Jobs.jobs[url]
  });
});

jobMocks.updateAllStatus.mockImplementation(() => {
  return Promise.resolve(
    Object.keys(Jobs.jobs).map(url => ({
      oldValue: Jobs.jobs[url],
      newValue: Jobs.jobs[url]
    }))
  );
});

export const Jobs = {
  jobs: {},
  ...jobMocks
};

export const Storage = {
  get: jest.fn().mockImplementation((keys) => {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  }),
  set: jest.fn().mockImplementation((data) => {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }),
  onChanged: {
    addListener: jest.fn()
  }
};

export const Notification = {
  create: jest.fn().mockImplementation((id, options) => {
    return new Promise((resolve, reject) => {
      chrome.notifications.create(id, {
        ...options,
        silent: false,
        priority: 2
      }, (notificationId) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(notificationId);
        }
      });
    });
  })
};

export const buildNotifier = jest.fn();

// Create buildWatcher service
export const buildWatcher = jest.fn(() => {
  // Create closure for interval state
  let currentInterval = null;

  // Return the watcher function
  return () => {
    // Define update function
    function runUpdateAndNotify(options) {
      // Return null when notifications are disabled
      if (options.notification === 'none') {
        return null;
      }

      // Create interval for job updates
      return setInterval(function () {
        Jobs.updateAllStatus().then(buildNotifier);
      }, options.refreshTime * 1000);
    }

    // Clear any existing interval
    if (currentInterval) {
      clearInterval(currentInterval);
      currentInterval = null;
    }

    // Start new interval
    currentInterval = runUpdateAndNotify($rootScope.options);

    // Handle options changes
    $rootScope.$on('Options::options.changed', function (_, options) {
      if (currentInterval) {
        clearInterval(currentInterval);
        currentInterval = null;
      }
      currentInterval = runUpdateAndNotify(options);
    });

    // Return cleanup function
    return () => {
      if (currentInterval) {
        clearInterval(currentInterval);
        currentInterval = null;
      }
    };
  };
});

// Initialize services
export const init = jest.fn().mockImplementation(async () => {
  // Call buildWatcher factory to get watcher function
  const watcher = buildWatcher();
  // Call watcher function to start watching
  return watcher();
});

export const _ = {
  forEach: (obj, callback) => {
    if (Array.isArray(obj)) {
      obj.forEach(callback);
    } else if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(key => callback(obj[key], key));
    }
  },
  clone: obj => JSON.parse(JSON.stringify(obj))
};

// Reset all mocks
export const resetMocks = () => {
  jest.clearAllMocks();
  Jobs.jobs = {};
  $rootScope._listeners = {};
  $rootScope.options = {
    refreshTime: 60,
    notification: 'all'
  };
};
