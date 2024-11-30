// Import testing libraries
import '@testing-library/jest-dom';
import { chrome } from './mocks/chrome.mock';
import { resetMocks } from './mocks/services.mock';

// Set up global chrome API mock
global.chrome = chrome;

// Mock fetch API
global.fetch = jest.fn();

// Mock setInterval/clearInterval
const intervals = new Set();
global.setInterval = jest.fn((fn, delay) => {
  const id = Symbol();
  intervals.add(id);
  return id;
});
global.clearInterval = jest.fn(id => {
  intervals.delete(id);
});

// Mock DOMParser for XML parsing tests
global.DOMParser = class {
  parseFromString(str, type) {
    return {
      getElementsByTagName: (tag) => {
        if (tag === 'Project') {
          return [{
            attributes: {
              webUrl: { value: 'http://jenkins.example.com/job/test-job/' },
              lastBuildLabel: { value: '42' },
              lastBuildTime: { value: '2023-06-14T10:00:00Z' }
            }
          }];
        }
        return [];
      }
    };
  }
};

// Mock template content
Object.defineProperty(HTMLTemplateElement.prototype, 'content', {
  get() {
    const fragment = document.createDocumentFragment();
    const div = document.createElement('div');
    div.innerHTML = this.innerHTML;
    while (div.firstChild) {
      fragment.appendChild(div.firstChild);
    }
    return fragment;
  }
});

// Mock importNode
Document.prototype.importNode = function(node, deep) {
  if (node instanceof DocumentFragment) {
    const fragment = document.createDocumentFragment();
    const div = document.createElement('div');
    div.innerHTML = node.firstChild.outerHTML;
    while (div.firstChild) {
      fragment.appendChild(div.firstChild);
    }
    return fragment;
  }
  return node.cloneNode(deep);
};

// Add custom matchers
expect.extend({
  toBeVisible(received) {
    const element = received;
    const pass = window.getComputedStyle(element).display !== 'none';
    return {
      pass,
      message: () => `expected element to ${pass ? 'not ' : ''}be visible`
    };
  },
  toHaveClass(received, className) {
    const element = received;
    const pass = element.classList.contains(className);
    return {
      pass,
      message: () => `expected element to ${pass ? 'not ' : ''}have class "${className}"`
    };
  }
});

// Clear mocks and reset DOM between tests
beforeEach(() => {
  document.body.innerHTML = '';
  resetMocks();
  jest.clearAllMocks();
  intervals.clear();
  
  // Reset chrome storage mock
  chrome.storage.local.get.mockImplementation((keys, callback) => {
    callback({
      jobs: {},
      options: {
        refreshTime: 60,
        notification: 'all'
      }
    });
  });

  // Mock chrome.runtime.openOptionsPage
  chrome.runtime.openOptionsPage = jest.fn(callback => {
    if (callback) callback();
  });
});

// Console error and warning suppression for cleaner test output
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args) => {
    if (args[0]?.includes('Warning:')) return;
    originalError.call(console, ...args);
  };
  console.warn = (...args) => {
    if (args[0]?.includes('Warning:')) return;
    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// Helper function to wait for DOM updates and promises to resolve
global.flushPromises = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  jest.runAllTimers();
  await new Promise(resolve => setTimeout(resolve, 0));
};

// Enable fake timers
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// Mock window.setInterval
window.setInterval = global.setInterval;
window.clearInterval = global.clearInterval;
