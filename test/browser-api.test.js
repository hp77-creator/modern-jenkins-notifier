/**
 * Browser API Tests
 */

import { Jobs, Storage, Notification, init, $rootScope } from '../js/services.js';
import { documentReady } from '../js/popup.js';

describe('Browser API Tests', () => {
  let mockSetInterval;
  let mockClearInterval;
  let intervals;
  let cleanup;

  beforeEach(() => {
    jest.clearAllMocks();
    Jobs.jobs = {};
    cleanup = null;
    
    // Reset $rootScope options
    $rootScope.options = {
      refreshTime: 60,
      notification: 'all'
    };

    // Mock Jobs.updateAllStatus
    Jobs.updateAllStatus = jest.fn().mockResolvedValue([]);

    // Setup interval tracking
    intervals = new Set();
    mockSetInterval = jest.fn((fn, delay) => {
      const id = Symbol('interval');
      intervals.add(id);
      return id;
    });
    mockClearInterval = jest.fn(id => {
      intervals.delete(id);
    });

    // Replace global interval functions
    global.setInterval = mockSetInterval;
    global.clearInterval = mockClearInterval;

    // Mock chrome.runtime.getURL
    chrome.runtime.getURL = jest.fn(path => `chrome-extension://mock-id/${path}`);
  });

  afterEach(() => {
    // Clean up any active intervals
    if (cleanup) {
      cleanup();
    }

    // Restore global interval functions
    global.setInterval = setInterval;
    global.clearInterval = clearInterval;
  });

  describe('Background Service Worker', () => {
    test('should handle notification disable/enable correctly', async () => {
      // Initialize services with notifications enabled
      cleanup = await init();

      // Should have created an interval for checking job updates
      expect(mockSetInterval).toHaveBeenCalledWith(
        expect.any(Function),
        60000 // Default 60 seconds
      );
      expect(intervals.size).toBe(1);
      const initialIntervalId = Array.from(intervals)[0];

      // Get the interval callback
      const intervalCallback = mockSetInterval.mock.calls[0][0];
      
      // Call the interval callback to verify it updates jobs
      await intervalCallback();
      expect(Jobs.updateAllStatus).toHaveBeenCalled();

      // Disable notifications
      $rootScope.options.notification = 'none';
      $rootScope.$broadcast('Options::options.changed', $rootScope.options);

      // Should have cleared the interval and stopped checking for updates
      expect(mockClearInterval).toHaveBeenCalledWith(initialIntervalId);
      expect(intervals.size).toBe(0);

      // Re-enable notifications
      $rootScope.options.notification = 'all';
      $rootScope.$broadcast('Options::options.changed', $rootScope.options);

      // Should create new interval and resume checking for updates
      expect(mockSetInterval).toHaveBeenCalledWith(
        expect.any(Function),
        60000 // Default 60 seconds
      );
      expect(intervals.size).toBe(1);
      expect(Array.from(intervals)[0]).not.toBe(initialIntervalId);

      // Verify new interval still updates jobs
      const newIntervalCallback = mockSetInterval.mock.calls[1][0];
      await newIntervalCallback();
      expect(Jobs.updateAllStatus).toHaveBeenCalledTimes(2);
    });
  });

  describe('Options Page', () => {
    test('should handle options page navigation', async () => {
      // Set up DOM with actual popup HTML
      document.body.innerHTML = `
        <body class="container-fluid">
          <header>
            <h1 class="h4">
              Yet Another Jenkins Notifier
              <small><a id="optionsLink" href="#"><span class="glyphicon glyphicon-cog"></span></a></small>
            </h1>
          </header>
          <main>
            <div id="jobList" class="list-group"></div>
            <p class="help-block">No jobs. Please enter a url below to listen for job builds.</p>
          </main>
          <footer>
            <form id="urlForm" name="urlForm">
              <div class="input-group">
                <label class="input-group-addon" for="url">Url</label>
                <input type="url" class="form-control" id="url" name="url"
                       pattern="https?://.+"
                       placeholder="http://jenkins/"
                       autofocus tabindex="1" required>
                <span class="input-group-btn">
                    <button id="addButton" type="submit" class="btn btn-primary">
                      <span class="glyphicon glyphicon-plus"></span>
                    </button>
                  </span>
              </div>
              <div id="errorMessage" class="help-block"></div>
            </form>
          </footer>
        </body>
      `;

      // Initialize popup
      await documentReady();

      // Get options link
      const optionsLink = document.getElementById('optionsLink');
      expect(optionsLink).not.toBeNull();

      // Test modern API
      chrome.runtime.openOptionsPage = jest.fn();
      optionsLink.click();
      expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();

      // Test fallback
      chrome.runtime.openOptionsPage = undefined;
      optionsLink.click();
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        'url': 'chrome-extension://mock-id/options.html'
      });
    });
  }, 60000); // Increase timeout for options test

  describe('Cross-browser Compatibility', () => {
    test('should handle Firefox manifest', () => {
      const firefoxManifest = require('../manifest_firefox.json');
      expect(firefoxManifest.browser_specific_settings).toBeDefined();
      expect(firefoxManifest.browser_specific_settings.gecko).toBeDefined();
      expect(firefoxManifest.browser_specific_settings.gecko.id).toBeDefined();
    });

    test('should handle Chrome manifest', () => {
      const chromeManifest = require('../manifest.json');
      expect(chromeManifest.manifest_version).toBe(3);
      expect(chromeManifest.permissions).toContain('notifications');
      expect(chromeManifest.permissions).toContain('storage');
    });
  });
});
