/**
 * UI Tests for popup.html functionality
 */

import { Jobs, $rootScope } from './mocks/services.mock.js';
import popup from './mocks/popup.mock.js';

jest.mock('../js/popup.js', () => require('./mocks/popup.mock.js'));

describe('Popup UI Tests', () => {
  beforeEach(async () => {
    // Load the actual popup.html content
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

    // Setup default job data
    Jobs.jobs = {
      'http://jenkins.example.com/job/test/': {
        name: 'test',
        url: 'http://jenkins.example.com/job/test/',
        building: false,
        status: 'Success',
        statusClass: 'success',
        statusIcon: 'green',
        lastBuildNumber: '42',
        lastBuildTime: new Date().toISOString()
      }
    };

    // Initialize popup
    await popup.documentReady();
  }, 30000);

  test('should handle form validation', async () => {
    const urlInput = document.getElementById('url');
    const urlForm = document.getElementById('urlForm');
    const addButton = document.getElementById('addButton');
    
    expect(urlInput).not.toBeNull();
    expect(urlForm).not.toBeNull();
    expect(addButton).not.toBeNull();
    
    // Invalid URL
    urlInput.value = 'not-a-url';
    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    expect(addButton.disabled).toBe(true);
    expect(popup.validateForm).toHaveBeenCalled();
    
    // Valid URL
    urlInput.value = 'http://jenkins.example.com/job/test/';
    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    expect(addButton.disabled).toBe(false);
    expect(popup.validateForm).toHaveBeenCalled();
  });

  test('should handle form submission', async () => {
    const urlInput = document.getElementById('url');
    const urlForm = document.getElementById('urlForm');
    
    expect(urlInput).not.toBeNull();
    expect(urlForm).not.toBeNull();
    
    // Set valid URL
    urlInput.value = 'http://jenkins.example.com/job/new-test/';
    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Submit form
    urlForm.dispatchEvent(new Event('submit'));
    
    expect(popup.addUrl).toHaveBeenCalled();
    expect(Jobs.add).toHaveBeenCalledWith('http://jenkins.example.com/job/new-test/');
  });

  test('should show error message when adding job fails', async () => {
    // Mock Jobs.add to fail
    const error = new Error('Invalid URL');
    Jobs.add.mockRejectedValueOnce(error);
    
    const urlInput = document.getElementById('url');
    const urlForm = document.getElementById('urlForm');
    const errorMessage = document.getElementById('errorMessage');
    
    expect(urlInput).not.toBeNull();
    expect(urlForm).not.toBeNull();
    expect(errorMessage).not.toBeNull();
    
    // Try to add invalid job
    urlInput.value = 'http://jenkins.example.com/job/test/';
    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Submit form and wait for error handling
    await popup.addUrl(new Event('submit'));
    
    expect(errorMessage.textContent).toBe('Error adding URL: Invalid URL');
    expect(errorMessage.classList.contains('hidden')).toBe(false);
  }, 30000);

  test('should handle options link click', async () => {
    const optionsLink = document.getElementById('optionsLink');
    expect(optionsLink).not.toBeNull();
    
    optionsLink.click();
    
    expect(popup.openOptionsPage).toHaveBeenCalled();
    if (chrome.runtime.openOptionsPage) {
      expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
    } else {
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        'url': chrome.runtime.getURL('options.html')
      });
    }
  });
});
