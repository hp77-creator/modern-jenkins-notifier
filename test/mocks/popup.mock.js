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

// Mock job rendering functions
function renderJob(node, url, job) {
  if (!job) return;

  node.classList.toggle('building', job.building);

  const nameField = node.querySelector('[data-jobfield="name"]');
  if (nameField) nameField.textContent = job.name || '';

  const statusField = node.querySelector('[data-jobfield="status"]');
  if (statusField) statusField.textContent = job.status || '';

  const closeButton = node.querySelector('button.close');
  if (closeButton) closeButton.dataset.url = url;
}

function renderJobs(jobs) {
  if (!jobs || Object.keys(jobs).length === 0) return;

  const jobList = document.getElementById('jobList');
  const template = document.getElementById('jobItemTemplate');

  // Clear existing jobs
  while (jobList.firstChild) {
    if (jobList.firstChild.nodeName !== 'TEMPLATE') {
      jobList.firstChild.remove();
    }
  }

  // Add new jobs
  Object.entries(jobs).forEach(([url, job]) => {
    const newNode = document.importNode(template.content, true);
    const container = document.createElement('div');
    container.appendChild(newNode);
    renderJob(container.firstElementChild, url, job);
    
    // Add click handler for close button
    const closeButton = container.querySelector('button.close');
    closeButton.addEventListener('click', removeUrlClick);
    
    jobList.appendChild(container.firstElementChild);
  });
}

// Mock job removal handler
export const removeUrlClick = jest.fn().mockImplementation((event) => {
  const url = event.currentTarget.dataset.url;
  Jobs.remove(url);
});

// Mock initialization
export const documentReady = jest.fn().mockImplementation(async () => {
  const urlForm = document.getElementById('urlForm');
  const urlInput = document.getElementById('url');
  const optionsLink = document.getElementById('optionsLink');

  urlForm.addEventListener('submit', addUrl);
  urlForm.addEventListener('input', validateForm);
  optionsLink.addEventListener('click', openOptionsPage);

  validateForm();

  // Initial render of jobs
  if (Jobs.jobs && Object.keys(Jobs.jobs).length > 0) {
    renderJobs(Jobs.jobs);
  }

  // Listen for job changes
  $rootScope.$on('Jobs::jobs.changed', (_, jobs) => {
    if (jobs && Object.keys(jobs).length > 0) {
      renderJobs(jobs);
    }
  });
});

// Import Jobs and $rootScope for implementation
import { Jobs, $rootScope } from './services.mock.js';

// Export for use in tests
export default {
  documentReady,
  validateForm,
  addUrl,
  openOptionsPage,
  keepServiceWorkerAlive,
  removeUrlClick
};
