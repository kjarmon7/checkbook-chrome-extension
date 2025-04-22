// First, let's properly type the Chrome API interface
interface ChromeAPI {
  runtime: {
    onMessage: {
      addListener: (callback: (message: any) => void) => void;
      removeListener: (callback: (message: any) => void) => void;
    };
    sendMessage: (message: any, callback?: () => void) => void;
    lastError: null | {message: string};
  };
  tabs: {
    query: (queryInfo: {active: boolean; currentWindow: boolean}) => Promise<{url?: string}[]>;
  };
  storage: {
    local: {
      get: (keys: string[], callback: (result: any) => void) => void;
      set: (items: object, callback?: () => void) => void;
    };
  };
}

// Mock implementation of Chrome Extension API for development environment
export const mockChrome: ChromeAPI = {
  runtime: {
    onMessage: {
      addListener: (callback: (message: any) => void) => {
        console.log('Mock: Setting up message listener');
        // Store the callback for later use
        window.addEventListener('mockChromeMessage', ((e: CustomEvent) => {
          callback(e.detail);
        }) as EventListener);

        // Simulate initial data after a delay
        setTimeout(() => {
          callback({
            type: 'COMPANY_DATA_UPDATE',
            data: {
              name: 'Mock Company Inc.',
              totalFunding: '$100M',
              recentRound: {
                amount: '$50M',
                date: '03/2024',
                type: 'Series B'
              },
              notableInvestors: [
                'Sequoia Capital',
                'Andreessen Horowitz',
                'Y Combinator'
              ],
              sources: [
                'https://mocknews.com/mockcompany-funding'
              ],
              complete: true
            }
          });
        }, 1000);
      },
      removeListener: (callback: (message: any) => void) => {
        console.log('Mock: Removing message listener');
        window.removeEventListener('mockChromeMessage', callback as EventListener);
      }
    },
    sendMessage: (message: any, callback?: () => void) => {
      console.log('Mock: Sending message', message);
      // Simulate successful message send
      if (callback) {
        setTimeout(callback, 100);
      }
    },
    lastError: null
  },
  tabs: {
    query: async () => [{
      url: 'https://mockcompany.com'  // Mock a company URL
    }]
  },
  storage: {
    local: {
      get: (keys: string[], callback: (result: any) => void) => {
        console.log('Mock: Getting from storage', keys);
        // Simulate no cached data
        callback({});
      },
      set: (items: object, callback?: () => void) => {
        console.log('Mock: Setting in storage', items);
        if (callback) callback();
      }
    }
  }
};

// Modified getChromeAPI function with better error handling
export const getChromeAPI = (): ChromeAPI => {
  console.log('Initializing Chrome API');
  
  // Check if we're in the Chrome extension environment
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    console.log('Using real Chrome API');
    return chrome as ChromeAPI;
  }
  
  console.log('Using mock Chrome API');
  return mockChrome;
}; 