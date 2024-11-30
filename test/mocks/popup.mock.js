// Mock popup functionality
export const validateForm = jest.fn().mockImplementation(() => {
  const urlForm = document.getElementById('urlForm');
  const urlInput = document.getElementById('url');
  const addButton = document.getElementById('addButton');
  const errorMessage = document.getElementById('errorMessage');

  const isFormInvalid = !urlForm.checkValidity();
  const isUrlInvalid = urlInput.validity.typeMismatch;

  addButton.disabled = isFormInvalid;
  urlForm.classList.toggle('has-error', isFormInvalid && urlInput.value);
  errorMessage.classList.toggle('hidden', !isUrlInvalid);
  errorMessage.textContent = urlInput.validationMessage;
});

export const addUrl = jest.fn().mockImplementation(async (event) => {
  event.preventDefault();
  const urlInput = document.getElementById('url');
  const errorMessage = document.getElementById('errorMessage');

  const url = urlInput.value;
  if (!url) return;

  try {
    await Jobs.add(url);
    urlInput.value = '';
    validateForm();
    await Jobs.updateStatus(url);
  } catch (error) {
    errorMessage.textContent = 'Error adding URL: ' + error.message;
    errorMessage.classList.remove('hidden');
  }
});

export const openOptionsPage = jest.fn().mockImplementation(() => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    chrome.tabs.create({'url': chrome.runtime.getURL('options.html')});
  }
});

export const keepServiceWorkerAlive = jest.fn();

// Mock initialization
export const documentReady = jest.fn().mockImplementation(async () => {
  const urlForm = document.getElementById('urlForm');
  const urlInput = document.getElementById('url');
  const optionsLink = document.getElementById('optionsLink');

  urlForm.addEventListener('submit', addUrl);
  urlForm.addEventListener('input', validateForm);
  optionsLink.addEventListener('click', openOptionsPage);

  validateForm();
});

// Import Jobs for addUrl implementation
import { Jobs } from './services.mock.js';

// Export for use in tests
export default {
  documentReady,
  validateForm,
  addUrl,
  openOptionsPage,
  keepServiceWorkerAlive
};
