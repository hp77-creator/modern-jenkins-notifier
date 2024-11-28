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

import * as Services from './services.js';

console.log('Background script starting...');

// Function to inject content script into active tab
async function injectContentScript(tabId) {
    try {
        console.log('Attempting to inject content script into tab:', tabId);
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['js/content.js']
        });
        console.log('Content script injected successfully');
    } catch (error) {
        console.error('Failed to inject content script:', error);
    }
}

// Listen for tab updates to inject content script
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('/job/')) {
        console.log('Jenkins job page detected, injecting content script');
        injectContentScript(tabId);
    }
});

// Listen for tab activation to inject content script
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && tab.url.includes('/job/')) {
        console.log('Jenkins job page activated, injecting content script');
        injectContentScript(tab.id);
    }
});

Services.init().catch(error => {
    console.error('Error initializing services:', error);
});

const { $rootScope, Jobs, $q, buildWatcher, buildNotifier, jenkins } = Services;

async function requestNotificationPermission() {
    const hasPermission = await chrome.permissions.contains({
        permissions: ['notifications']
    });
    
    if (!hasPermission) {
        await chrome.permissions.request({
            permissions: ['notifications']
        });
    }
}

$rootScope.$on('Jobs::jobs.initialized', () => {
    console.log('Jobs initialized event received');
    Jobs.updateAllStatus().then($q.all).then(buildWatcher);
});

$rootScope.$on('Jobs::jobs.changed', (event, jobs) => {
    console.log('Jobs changed event received:', jobs);
    const counts = {
        Success: 0,
        Failure: 0,
        Unstable: 0,
        Building: 0
    };

    Services._.forEach(jobs, (data) => {
        if (data.jobs) {
            Services._.forEach(data.jobs, (viewJob) => {
                if (viewJob.building) {
                    counts.Building++;
                } else {
                    counts[viewJob.status] = (counts[viewJob.status] || 0) + 1;
                }
            });
        } else {
            if (data.building) {
                counts.Building++;
            } else {
                counts[data.status] = (counts[data.status] || 0) + 1;
            }
        }
    });

    console.log('Job counts:', counts);

    // Create a more concise badge text
    let badgeText = '';
    let tooltipText = [];

    // Add counts to tooltip and determine badge text
    if (counts.Failure > 0) {
        tooltipText.push(`${counts.Failure} Failed`);
        badgeText = counts.Failure.toString();
    }
    if (counts.Unstable > 0) {
        tooltipText.push(`${counts.Unstable} Unstable`);
        if (!badgeText) badgeText = counts.Unstable.toString();
    }
    if (counts.Building > 0) {
        tooltipText.push(`${counts.Building} Building`);
        if (!badgeText) badgeText = counts.Building.toString();
    }
    if (counts.Success > 0) {
        tooltipText.push(`${counts.Success} Successful`);
        if (!badgeText) badgeText = counts.Success.toString();
    }

    // Set badge color based on priority
    let color;
    if (counts.Failure > 0) {
        color = '#c9302c'; // Red
    } else if (counts.Unstable > 0) {
        color = '#f0ad4e'; // Yellow
    } else if (counts.Building > 0) {
        color = '#337ab7'; // Blue
    } else if (counts.Success > 0) {
        color = '#5cb85c'; // Green
    } else {
        color = '#777777'; // Grey for no jobs
    }

    // Update badge and tooltip
    chrome.action.setBadgeText({ text: badgeText || '' });
    chrome.action.setBadgeBackgroundColor({ color: color });
    chrome.action.setTitle({ title: tooltipText.join(' | ') || 'No jobs' });
});

async function updateJobs() {
    try {
        console.log('Updating all jobs...');
        const statusPromises = await Jobs.updateAllStatus();
        const results = await Promise.all(statusPromises);
        buildNotifier(statusPromises);
        console.log('Jobs update completed');
    } catch (error) {
        console.error('Error updating jobs:', error);
    }
}

// Initial setup
chrome.runtime.onInstalled.addListener(async () => {
    console.log('Extension installed/updated');
    await requestNotificationPermission();
    await updateJobs();
    
    // Inject content script into any existing Jenkins job tabs
    const tabs = await chrome.tabs.query({url: '*://*/*/job/*'});
    for (const tab of tabs) {
        console.log('Injecting content script into existing tab:', tab.id);
        injectContentScript(tab.id);
    }
});

// Set up alarm for periodic updates
chrome.alarms.create('update-jobs', {
    periodInMinutes: 1
});

// Listen for alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'update-jobs') {
        await updateJobs();
    }
});

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId.startsWith('jenkins-')) {
        const url = notificationId.substring(8);
        chrome.tabs.create({ url });
    }
});

// Function to get the base URL for the last job in the path
function getLastJobBaseUrl(url) {
    // Split the URL by '/job/'
    const parts = url.split('/job/');
    if (parts.length < 2) return null;

    // Find the last non-empty job name
    let lastJobIndex = parts.length - 1;
    while (lastJobIndex > 0) {
        if (parts[lastJobIndex] && parts[lastJobIndex].trim() !== '') {
            break;
        }
        lastJobIndex--;
    }

    // Reconstruct the URL up to the last job
    const baseUrl = parts.slice(0, lastJobIndex + 1).join('/job/');
    console.log('URL parts:', parts);
    console.log('Last job index:', lastJobIndex);
    console.log('Base URL:', baseUrl);
    
    return baseUrl;
}

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Received message in background:', message);
    
    if (message.type === 'keepAlive') {
        sendResponse({ status: 'alive' });
        return true;
    }
    
    if (message.action === 'addBuildPage') {
        (async () => {
            try {
                console.log('Processing addBuildPage request for URL:', message.url);
                
                // Get the base URL for the last job in the path
                const baseUrl = getLastJobBaseUrl(message.url);
                console.log('Extracted base URL:', baseUrl);
                
                if (!baseUrl) {
                    throw new Error('Invalid Jenkins job URL format');
                }

                // Add trailing slash if needed
                const normalizedUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
                console.log('Normalized URL:', normalizedUrl);
                
                // Try to get job status first
                try {
                    console.log('Checking job status...');
                    await jenkins(normalizedUrl);
                    console.log('Job status check successful');
                } catch (error) {
                    console.error('Job status check failed:', error);
                    throw new Error('Could not verify Jenkins job status. Please check if this is a valid job URL.');
                }

                // If status check passed, add the job
                console.log('Adding job to monitoring...');
                await Jobs.add(normalizedUrl);
                console.log('Job added successfully');
                
                // Update the job status immediately
                console.log('Updating job status...');
                await Jobs.updateStatus(normalizedUrl);
                console.log('Job status updated');
                
                // Notify content script of success
                console.log('Sending success message to content script');
                await chrome.tabs.sendMessage(sender.tab.id, {
                    type: 'buildPageAdded'
                });
                
                // Create a notification
                const notificationId = 'jenkins-add-' + Date.now();
                await chrome.notifications.create(notificationId, {
                    type: 'basic',
                    iconUrl: chrome.runtime.getURL('img/icon48.png'),
                    title: 'Jenkins Build Added',
                    message: 'The build page has been added to monitoring.',
                    priority: 0
                });
                
                console.log('Job addition process completed successfully');
                
            } catch (error) {
                console.error('Error adding build page:', error);
                // Notify content script of failure
                try {
                    await chrome.tabs.sendMessage(sender.tab.id, {
                        type: 'buildPageAddError',
                        error: error.message
                    });
                } catch (sendError) {
                    console.error('Error sending error message to content script:', sendError);
                }
            }
        })();
        
        // Return true to indicate we'll send a response asynchronously
        return true;
    }
});

console.log('Background script initialized');
