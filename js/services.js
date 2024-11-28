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

// Utility functions
export const _ = {
  forEach: function (obj, iterator) {
    if (obj) {
      if (obj.forEach) {
        obj.forEach(iterator);
      } else if ('length' in obj && obj.length > 0) {
        for (var i = 0; i < obj.length; i++) {
          iterator(obj[i], i);
        }
      } else {
        for (var key in obj) {
          if (obj.hasOwnProperty(key)) {
            iterator(obj[key], key);
          }
        }
      }
    }
    return obj;
  },
  clone: function (obj) {
    return JSON.parse(JSON.stringify(obj));
  }
};

// Promise-like implementation
export const $q = {
  defer: function () {
    var defer = {};
    defer.promise = new Promise(function (resolve, reject) {
      defer.resolve = resolve;
      defer.reject = reject;
    });
    return defer;
  },
  when: function (value) {
    return Promise.resolve(value);
  },
  all: function (iterable) {
    return Promise.all(iterable);
  }
};

// Event system
const eventListeners = new Map();

export const $rootScope = {
  $broadcast: function (name, detail) {
    const listeners = eventListeners.get(name) || [];
    listeners.forEach(callback => {
      try {
        callback(null, detail);
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    });
  },
  $on: function (name, callback) {
    if (!eventListeners.has(name)) {
      eventListeners.set(name, []);
    }
    eventListeners.get(name).push(callback);
  }
};

// Storage Service
function StorageService($q) {
  const storage = chrome.storage.local;

  function promisedCallback(deferred) {
    return function (data) {
      if (chrome.runtime.lastError) {
        deferred.reject(chrome.runtime.lastError);
      } else {
        deferred.resolve(data);
      }
    };
  }

  return {
    onChanged: chrome.storage.onChanged,
    get: function (keys) {
      var deferred = $q.defer();
      storage.get(keys, promisedCallback(deferred));
      return deferred.promise;
    },
    set: function (objects) {
      var deferred = $q.defer();
      storage.set(objects, promisedCallback(deferred));
      return deferred.promise;
    }
  };
}

// Notification Service
function NotificationService($q) {
  return {
    create: function (notificationId, options) {
      return new Promise((resolve, reject) => {
        try {
          chrome.notifications.create(notificationId, {
            ...options,
            silent: false,
            priority: 2
          }, (id) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(id);
            }
          });
        } catch (error) {
          reject(error);
        }
      });
    }
  };
}

// Create service instances
export const Storage = StorageService($q);
export const Notification = NotificationService($q);

// Job Data Service
function defaultJobDataService() {
  return function (url, status) {
    var jobNameRegExp = /.*\/job\/([^/]+)(\/.*|$)/;
    return {
      name: decodeURI(url.replace(jobNameRegExp, '$1')),
      url: decodeURI(url),
      building: false,
      status: status || '',
      statusClass: undefined,
      statusIcon: undefined,
      lastBuildNumber: undefined,
      error: undefined,
      jobs: undefined
    };
  };
}

// Jenkins Service
function jenkinsService(defaultJobData) {
  var buildingRegExp = /_anime$/;
  var colorToClass = {
    blue: 'success', yellow: 'warning', red: 'danger'
  };
  var colorToIcon = {
    blue: 'green', yellow: 'yellow', red: 'red'
  };
  var status = {
    blue: 'Success',
    yellow: 'Unstable',
    red: 'Failure',
    aborted: 'Aborted',
    notbuilt: 'Not built',
    disabled: 'Disabled'
  };
  var fetchOptions = {
    credentials: 'include'
  };

  function jobMapping(url, data) {
    var basicColor = (data.color || '').replace(buildingRegExp, '');
    var lastBuild = data.lastCompletedBuild || {};
    return {
      name: data.displayName || data.name || data.nodeName || 'All jobs',
      url: decodeURI(data.url || url),
      building: buildingRegExp.test(data.color),
      status: status[basicColor] || basicColor,
      statusClass: colorToClass[basicColor] || '',
      statusIcon: colorToIcon[basicColor] || 'grey',
      lastBuildNumber: lastBuild.number || '',
      lastBuildTime: '',
      jobs: data.jobs && data.jobs.reduce(function (jobs, data) {
        var job = jobMapping(null, data);
        jobs[subJobKey(job.url)] = job;
        return jobs;
      }, {})
    };
  }

  function subJobKey(url) {
    return url.replace(/^.+?\/job\/(.+)\/$/, "$1").replace(/\/job\//g, "/");
  }

  function parseXML(xmlText) {
    // Check if we're in a service worker context
    if (typeof DOMParser === 'undefined') {
      // Simple regex-based parser for service worker context
      const projects = [];
      const regex = /<Project[^>]*webUrl="([^"]*)"[^>]*lastBuildLabel="([^"]*)"[^>]*lastBuildTime="([^"]*)"[^>]*>/g;
      let match;
      
      while ((match = regex.exec(xmlText)) !== null) {
        projects.push({
          attributes: {
            webUrl: { value: match[1] },
            lastBuildLabel: { value: match[2] },
            lastBuildTime: { value: match[3] }
          }
        });
      }
      
      return projects;
    } else {
      // Browser context with DOMParser available
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      return Array.from(doc.getElementsByTagName('Project'));
    }
  }

  return function (url) {
    url = url.charAt(url.length - 1) === '/' ? url : url + '/';

    return fetch(url + 'api/json/', fetchOptions).then(function (res) {
      return res.ok ? res.json() : Promise.reject(res);
    }).then(function (data) {
      var job = jobMapping(url, data);

      if (data.jobs) {
        return fetch(url + 'cc.xml', fetchOptions).then(function (res) {
          return res.ok ? res.text() : Promise.reject(res);
        }).then(function (text) {
          var projects = parseXML(text);

          _.forEach(projects, function (project) {
            var url = decodeURI(project.attributes['webUrl'].value);
            var name = subJobKey(url);
            var lastBuildNumber = project.attributes['lastBuildLabel'].value;
            var lastBuildTime = new Date(project.attributes['lastBuildTime'].value).toISOString();

            var subJob = job.jobs[name];
            if (subJob && !subJob.lastBuildNumber) {
              subJob.name = name;
              subJob.lastBuildNumber = lastBuildNumber;
              subJob.lastBuildTime = lastBuildTime;
            }
          });

          return job;
        });
      } else {
        return job;
      }
    });
  };
}

// Jobs Service
function JobsService($q, Storage, jenkins, defaultJobData) {
  var Jobs = {
    jobs: {},
    add: function (url, data) {
      var result = {};
      result.oldValue = Jobs.jobs[url];
      result.newValue = Jobs.jobs[url] = data || Jobs.jobs[url] || defaultJobData(url);
      return Storage.set({jobs: Jobs.jobs}).then(function () {
        return result;
      });
    },
    remove: function (url) {
      delete Jobs.jobs[url];
      return Storage.set({jobs: Jobs.jobs});
    },
    setUrls: function (urls) {
      var newJobs = {};
      urls.forEach(function (url) {
        newJobs[url] = Jobs.jobs[url] || defaultJobData(url);
      });
      Jobs.jobs = newJobs;

      return Storage.set({jobs: Jobs.jobs}).then(function () {
        return Jobs.jobs;
      });
    },
    updateStatus: function (url) {
      return jenkins(url).catch(function (res) {
        // On error, keep existing data or create default one
        var data = _.clone(Jobs.jobs[url]) || defaultJobData(url);
        data.error = (res instanceof Error ? res.message : res.statusText) || 'Unreachable';
        return data;
      }).then(function (data) {
        return Jobs.add(url, data);
      });
    },
    updateAllStatus: function () {
      var promises = [];
      _.forEach(Jobs.jobs, function (_, url) {
        promises.push(Jobs.updateStatus(url));
      });
      return $q.when(promises);
    }
  };

  return Jobs;
}

// Build Watcher Service
function buildWatcherService($rootScope, Jobs, buildNotifier) {
  let currentInterval = null;

  function runUpdateAndNotify(options) {
    if (options.notification === 'none') {
      return null;
    }

    return setInterval(function () {
      Jobs.updateAllStatus().then(buildNotifier);
    }, options.refreshTime * 1000);
  }

  return function () {
    currentInterval = runUpdateAndNotify($rootScope.options);

    $rootScope.$on('Options::options.changed', function (_, options) {
      if (currentInterval) {
        clearInterval(currentInterval);
      }
      currentInterval = runUpdateAndNotify(options);
    });
  };
}

// Build Notifier Service
function buildNotifierService($rootScope, Notification) {
  async function jobNotifier(newValue, oldValue) {
    oldValue = oldValue || {};
    if (oldValue.lastBuildNumber == newValue.lastBuildNumber) {
      return;
    }

    // Ignore new job, not built yet
    if (newValue.status === 'Not built') {
      return;
    }

    var title = 'Build ' + newValue.status + '!';
    if ($rootScope.options.notification === 'unstable' && newValue.status === 'Success' && newValue.lastBuildNumber > 1) {
      if (oldValue.status === 'Success') {
        return;
      } else {
        title = 'Build back to stable!';
      }
    }

    var buildUrl = newValue.url + newValue.lastBuildNumber;
    
    try {
      const notificationId = 'jenkins-' + buildUrl;
      const iconPath = 'img/icon48.png';
      
      const options = {
        type: 'basic',
        title: title + ' - ' + newValue.name,
        message: buildUrl,
        iconUrl: chrome.runtime.getURL(iconPath),
        requireInteraction: true
      };
      
      await Notification.create(notificationId, options);
    } catch (error) {
      console.error('Failed to create notification:', error, error.stack);
    }
  }

  return function (promises) {
    if (!Array.isArray(promises)) {
      promises = [promises];
    }
    
    promises.forEach(function (promise) {
      if (promise && typeof promise.then === 'function') {
        promise.then(function (data) {
          // Disable notification for pending promises
          if ($rootScope.options.notification === 'none') {
            return;
          }

          var oldValue = data.oldValue;
          var newValue = data.newValue;

          if (newValue.jobs) {
            _.forEach(newValue.jobs, function (job, url) {
              jobNotifier(job, oldValue && oldValue.jobs && oldValue.jobs[url]);
            });
          } else {
            jobNotifier(newValue, oldValue);
          }
        }).catch(function(error) {
          console.error('Error processing notification:', error);
        });
      } else {
        console.warn('Invalid promise object:', promise);
      }
    });
  };
}

// Initialize options and jobs
function initOptions($rootScope, Storage) {
  $rootScope.options = {
    refreshTime: 60,
    notification: 'all'
  };

  // Add storage change listener during initialization
  Storage.onChanged.addListener(function (objects) {
    if (objects.options) {
      $rootScope.options = objects.options.newValue;
      $rootScope.$broadcast('Options::options.changed', $rootScope.options);
    }
  });

  return Storage.get({options: $rootScope.options}).then(function (objects) {
    $rootScope.options = objects.options;
    $rootScope.$broadcast('Options::options.changed', $rootScope.options);
  });
}

function initJobs(Jobs, Storage, $rootScope) {
  Jobs.jobs = {};

  // Add storage change listener during initialization
  Storage.onChanged.addListener(function (objects) {
    if (objects.jobs) {
      Jobs.jobs = objects.jobs.newValue;
      $rootScope.$broadcast('Jobs::jobs.changed', Jobs.jobs);
    }
  });

  return Storage.get({jobs: Jobs.jobs}).then(function (objects) {
    Jobs.jobs = objects.jobs;
    $rootScope.$broadcast('Jobs::jobs.initialized', Jobs.jobs);
    $rootScope.$broadcast('Jobs::jobs.changed', Jobs.jobs);
  });
}

// Create service instances
export const defaultJobData = defaultJobDataService();
export const jenkins = jenkinsService(defaultJobData);
export const Jobs = JobsService($q, Storage, jenkins, defaultJobData);
export const buildNotifier = buildNotifierService($rootScope, Notification);
export const buildWatcher = buildWatcherService($rootScope, Jobs, buildNotifier);

// Export initialization function
export function init() {
  return Promise.all([
    initOptions($rootScope, Storage),
    initJobs(Jobs, Storage, $rootScope)
  ]).then(() => {
    buildWatcher();
  }).catch(error => {
    console.error('Error initializing services:', error);
    throw error;
  });
}
