// Content script to detect keyboard shortcuts on Jenkins build pages
(function() {
    console.log('Jenkins Notifier content script starting initialization...');

    // Default shortcut configuration
    let shortcutConfig = {
        key: 'j',
        shiftKey: true,
        ctrlKey: false,
        altKey: false
    };

    // Function to format shortcut text
    function formatShortcut(config) {
        const parts = [];
        if (config.ctrlKey) parts.push('Ctrl');
        if (config.altKey) parts.push('Alt');
        if (config.shiftKey) parts.push('Shift');
        parts.push(config.key.toUpperCase());
        return parts.join(' + ');
    }

    // Load shortcut configuration
    chrome.storage.local.get({options: {
        addJobShortcut: shortcutConfig
    }}, function(objects) {
        shortcutConfig = objects.options.addJobShortcut;
        console.log('Loaded shortcut configuration:', shortcutConfig);
        // Show indicator with current shortcut
        createIndicator();
    });

    // Listen for shortcut configuration changes
    chrome.storage.onChanged.addListener(function(changes, namespace) {
        if (namespace === 'local' && changes.options?.newValue?.addJobShortcut) {
            shortcutConfig = changes.options.newValue.addJobShortcut;
            console.log('Shortcut configuration updated:', shortcutConfig);
            // Update indicator with new shortcut
            createIndicator();
        }
    });

    // Function to check if current page is a valid Jenkins job
    function validateJenkinsPage() {
        const url = window.location.href;
        
        // Check if it's a job page
        if (!url.includes('/job/')) {
            return {
                isValid: false,
                error: 'Not a Jenkins job page'
            };
        }

        // Check if it's a build page (has build number)
        const buildNumberMatch = url.match(/\/job\/.*\/(\d+)\/?$/);
        if (buildNumberMatch) {
            return {
                isValid: false,
                error: 'Please add the job page, not a specific build page'
            };
        }

        // Check if it's a job configuration page
        if (url.includes('/configure')) {
            return {
                isValid: false,
                error: 'Please add the job page, not its configuration page'
            };
        }

        return {
            isValid: true
        };
    }

    // Function to create and show the indicator
    function createIndicator() {
        // Remove any existing indicators
        const existingIndicators = document.querySelectorAll('.jenkins-notifier-indicator');
        existingIndicators.forEach(indicator => indicator.remove());

        const indicator = document.createElement('div');
        indicator.className = 'jenkins-notifier-indicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            font-size: 13px;
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            cursor: pointer;
            transition: opacity 0.5s;
        `;
        indicator.textContent = `Jenkins Notifier Active (${formatShortcut(shortcutConfig)})`;
        
        // Add click handler to test the extension
        indicator.addEventListener('click', () => {
            console.log('Indicator clicked - testing notification system');
            showNotification('Notification system test');
        });

        // Ensure body exists before appending
        if (document.body) {
            document.body.appendChild(indicator);
            console.log('Indicator added to page');
        } else {
            // If body doesn't exist yet, wait for it
            document.addEventListener('DOMContentLoaded', () => {
                document.body.appendChild(indicator);
                console.log('Indicator added to page after DOMContentLoaded');
            });
        }

        // Remove indicator after 10 seconds
        setTimeout(() => {
            indicator.style.opacity = '0';
            setTimeout(() => indicator.remove(), 500);
        }, 10000);
    }

    // Function to show notifications
    function showNotification(message, isError = false) {
        console.log('Showing notification:', message, isError);
        
        // Remove any existing notifications
        const existingNotifications = document.querySelectorAll('.jenkins-notifier-message');
        existingNotifications.forEach(notification => notification.remove());

        const notification = document.createElement('div');
        notification.className = 'jenkins-notifier-message';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${isError ? '#f44336' : '#4CAF50'};
            color: white;
            padding: 15px;
            border-radius: 5px;
            z-index: 2147483647;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            max-width: 400px;
            word-wrap: break-word;
            cursor: pointer;
            transition: opacity 0.5s;
        `;
        notification.textContent = message;
        
        // Add click handler to dismiss notification
        notification.addEventListener('click', () => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 500);
        });

        // Ensure body exists before appending
        if (document.body) {
            document.body.appendChild(notification);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                document.body.appendChild(notification);
            });
        }
        
        // Remove notification after 5 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 500);
        }, 5000);
    }

    // Function to handle keyboard shortcuts
    function handleKeyPress(event) {
        console.log('Key pressed:', event.key, 'Modifiers:', {
            shift: event.shiftKey,
            ctrl: event.ctrlKey,
            alt: event.altKey
        });
        
        // Check if the pressed keys match the configured shortcut
        if (event.key.toLowerCase() === shortcutConfig.key &&
            event.shiftKey === shortcutConfig.shiftKey &&
            event.ctrlKey === shortcutConfig.ctrlKey &&
            event.altKey === shortcutConfig.altKey) {
            
            console.log('Configured shortcut detected');
            event.preventDefault(); // Prevent any default browser behavior
            event.stopPropagation(); // Stop event bubbling
            
            // Validate the current page
            const validation = validateJenkinsPage();
            if (!validation.isValid) {
                console.log('Page validation failed:', validation.error);
                showNotification(validation.error, true);
                return;
            }
            
            console.log('Sending message to add build page:', window.location.href);
            chrome.runtime.sendMessage({
                action: 'addBuildPage',
                url: window.location.href,
                title: document.title
            }, response => {
                if (chrome.runtime.lastError) {
                    console.error('Error sending message:', chrome.runtime.lastError);
                    showNotification('Failed to communicate with extension', true);
                } else {
                    console.log('Message sent successfully, response:', response);
                }
            });
        }
    }

    // Initialize the extension
    function initialize() {
        console.log('Initializing Jenkins Notifier...');
        
        // Add keyboard event listeners
        window.addEventListener('keydown', handleKeyPress, true);
        document.addEventListener('keydown', handleKeyPress, true);
        
        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('Received message in content script:', message);
            
            if (message.type === 'buildPageAdded') {
                showNotification(`Jenkins build page added to monitoring! (${formatShortcut(shortcutConfig)} to add more)`);
            } else if (message.type === 'buildPageAddError') {
                showNotification(message.error, true);
            }
        });
        
        console.log('Jenkins Notifier initialized successfully');
    }

    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
