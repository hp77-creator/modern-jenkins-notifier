/**
 * Yet Another Jenkins Notifier
 * Copyright (C) 2016 Guillaume Girou
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { init, _, Jobs, $rootScope, buildNotifier } from './services.js';

function keepServiceWorkerAlive() {
  chrome.runtime.sendMessage({ type: 'keepAlive' });
  setTimeout(keepServiceWorkerAlive, 15000);
}

async function documentReady() {
  try {
    await init();
    keepServiceWorkerAlive();

    const optionsLink = document.getElementById('optionsLink');
    const urlForm = document.getElementById('urlForm');
    const urlInput = document.getElementById('url');
    const addButton = document.getElementById('addButton');
    const errorMessage = document.getElementById('errorMessage');
    const jobList = document.getElementById('jobList');
    const jobItemTemplate = document.getElementById('jobItemTemplate');
    const jobSubItemTemplate = document.getElementById('jobSubItemTemplate');

    optionsLink.addEventListener('click', openOptionsPage);
    urlForm.addEventListener('submit', addUrl);
    urlForm.addEventListener('input', validateForm);

    validateForm();
    placeholderRotate();

    if (Jobs.jobs && Object.keys(Jobs.jobs).length > 0) {
      renderJobs(Jobs.jobs);
    }

    $rootScope.$on('Jobs::jobs.initialized', function (_, jobs) {
      if (jobs && Object.keys(jobs).length > 0) {
        renderJobs(jobs);
      }
      Jobs.updateAllStatus().then(buildNotifier);
    });
    
    $rootScope.$on('Jobs::jobs.changed', function (_, jobs) {
      if (jobs && Object.keys(jobs).length > 0) {
        renderJobs(jobs);
      }
    });

    function openOptionsPage() {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        chrome.tabs.create({'url': chrome.runtime.getURL('options.html')});
      }
    }

    function addUrl(event) {
      event.preventDefault();

      const url = urlInput.value;
      if (!url) return;

      Jobs.add(url)
        .then(() => {
          urlInput.value = '';
          validateForm();
          return Jobs.updateStatus(url);
        })
        .catch(error => {
          errorMessage.innerText = 'Error adding URL: ' + error.message;
          errorMessage.classList.remove('hidden');
        });
    }

    function validateForm() {
      const isFormInvalid = !urlForm.checkValidity();
      const isUrlInvalid = urlInput.validity.typeMismatch;

      addButton.disabled = isFormInvalid;
      urlForm.classList.toggle('has-error', isFormInvalid && urlInput.value);
      errorMessage.classList.toggle('hidden', !isUrlInvalid);
      errorMessage.innerText = urlInput.validationMessage;
    }

    function placeholderRotate() {
      const placeholderUrls = [
        'http://jenkins/ for all jobs',
        'http://jenkins/job/my_job/ for one job',
        'http://jenkins/job/my_view/ for view jobs'
      ];

      let i = 0;
      urlInput.placeholder = placeholderUrls[0];
      window.setInterval(function () {
        urlInput.placeholder = placeholderUrls[++i % placeholderUrls.length];
      }, 5000);
    }

    function removeUrlClick(event) {
      const url = event.currentTarget.dataset.url;
      Jobs.remove(url);
    }

    function renderJobs(jobs) {
      if (!jobs || Object.keys(jobs).length === 0) return;
      renderRepeat(jobList, jobItemTemplate, jobs, renderJobOrView);
    }

    function renderJobOrView(node, url, job) {
      renderJob(node, url, job);

      const closeButton = node.querySelector('button.close');
      closeButton.dataset.url = url;
      closeButton.addEventListener('click', removeUrlClick);

      const subJobs = node.querySelector('[data-id="jobs"]');
      subJobs.classList.toggle('hidden', !job.jobs);
      if (job.jobs) {
        renderRepeat(subJobs, jobSubItemTemplate, job.jobs, renderJob);
      }
    }

    const DURATION_TIME = [
      {short: "y", long: "year", breakdown: 320 * 24 * 60 * 60, divisor: 365 * 24 * 60 * 60},
      {short: "mo.", long: "month", breakdown: 26 * 24 * 60 * 60, divisor: 30 * 24 * 60 * 60},
      {short: "d", long: "day", breakdown: 22 * 60 * 60, divisor: 24 * 60 * 60},
      {short: "h", long: "hour", breakdown: 45 * 60, divisor: 60 * 60},
      {short: "m", long: "minute", breakdown: 45, divisor: 60},
      {short: "s", long: "second", breakdown: 0, divisor: 1}
    ];

    function fromNow(date) {
      if (!date) {
        return {
          short: "",
          long: "",
          fullDate: ""
        };
      }

      date = new Date(date);
      const diff = Math.floor((new Date().getTime() - date.getTime()) / 1000);

      for (let i = 0; i < DURATION_TIME.length; i++) {
        const unit = DURATION_TIME[i];
        if (diff >= unit.breakdown) {
          const nb = Math.round(diff / unit.divisor);
          return {
            short: `${nb}${unit.short}`,
            long: `${nb} ${unit.long}${nb >= 2 ? "s ago" : " ago"}`,
            fullDate: date.toLocaleString()
          };
        }
      }
    }

    function renderJob(node, url, job) {
      if (!job) return;

      node.classList.toggle('building', job.building);

      _.forEach(node.querySelectorAll('[data-jobfield]'), function (el) {
        el.innerText = job[el.dataset.jobfield] || '';
      });

      _.forEach(node.querySelectorAll('[data-lastbuildtime]'), function (el) {
        const texts = fromNow(job.lastBuildTime);
        el.innerText = texts.short;
        el.title = texts.fullDate;
      });

      _.forEach(node.querySelectorAll('[data-jobstatusclass]'), function (el) {
        el.className = el.className.replace(/ alert-.*$/, '').replace(/ ?$/, ' alert-' + (job.statusClass || ''));
      });

      _.forEach(node.querySelectorAll('[data-joberror]'), function (el) {
        el.classList.toggle('hidden', !job.error);
        el.setAttribute('title', job.error ? 'Error: ' + job.error : '');
      });

      _.forEach(node.querySelectorAll('a[data-joburl]'), function (el) {
        el.href = job.url || '#';
      });
    }

    function renderRepeat(container, template, obj, render) {
      if (!container || !template || !obj || !render) return;

      const keys = Object.keys(obj || {});

      for (let i = 0; i < keys.length; i++) {
        if (i < container.children.length) {
          render(container.children[i], keys[i], obj[keys[i]]);
        } else {
          const newNode = document.importNode(template.content, true);
          container.appendChild(newNode);
          render(container.lastElementChild, keys[i], obj[keys[i]]);
        }
      }

      while (container.children.length > keys.length) {
        container.lastElementChild.remove();
      }
    }

  } catch (error) {
    document.body.innerHTML = `<div class="alert alert-danger">Error initializing: ${error.message}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', documentReady);
