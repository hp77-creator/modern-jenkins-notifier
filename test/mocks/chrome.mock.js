// Mock chrome API for testing
export const chrome = {
  runtime: {
    lastError: null,
    getURL: (path) => `chrome-extension://mock-id/${path}`,
    onMessage: {
      addListener: jest.fn()
    },
    sendMessage: jest.fn(),
    openOptionsPage: jest.fn()
  },
  storage: {
    local: {
      get: jest.fn((keys, callback) => {
        callback({
          jobs: {},
          options: {
            refreshTime: 60,
            notification: 'all'
          }
        });
      }),
      set: jest.fn((data, callback) => {
        if (callback) callback();
      }),
      onChanged: {
        addListener: jest.fn()
      }
    },
    onChanged: {
      addListener: jest.fn()
    }
  },
  notifications: {
    create: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    },
    onClosed: {
      addListener: jest.fn()
    }
  },
  tabs: {
    create: jest.fn(),
    query: jest.fn(),
    sendMessage: jest.fn()
  }
};

// Export for use in tests
export default chrome;
