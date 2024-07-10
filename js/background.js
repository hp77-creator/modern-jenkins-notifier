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
// background.js
// background.js

// We need to import services.js before using it
self.importScripts('services.js');

Services.init();

const { $rootScope, Jobs, $q, buildWatcher, buildNotifier } = Services;

$rootScope.$on('Jobs::jobs.initialized', () => {
  Jobs.updateAllStatus().then($q.all).then(buildWatcher);
});

$rootScope.$on('Jobs::jobs.changed', (event, jobs) => {
  const counts = {};
  Services._.forEach(jobs, (data) => {
    if (data.jobs) {
      Services._.forEach(data.jobs, (viewJob) => {
        counts[viewJob.status] = (counts[viewJob.status] || 0) + 1;
      });
    } else {
      counts[data.status] = (counts[data.status] || 0) + 1;
    }
  });

  const count = counts.Failure || counts.Unstable || counts.Success || 0;
  const color = counts.Failure ? '#c9302c' : counts.Unstable ? '#f0ad4e' : '#5cb85c';

  chrome.action.setBadgeText({ text: count.toString() });
  chrome.action.setBadgeBackgroundColor({ color: color });
});

function updateJobs() {
  Jobs.updateAllStatus().then($q.all).then(buildNotifier);
}

// Initial check
updateJobs();

// Set up alarm for periodic checks
chrome.alarms.create('updateJobs', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'updateJobs') {
    updateJobs();
  }
});