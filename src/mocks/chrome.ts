// Mock implementation of Chrome Extension API for development environment
export const mockChrome = {
  runtime: {
    onMessage: {
      addListener: (callback: (message: any) => void) => {
        // Store the callback to handle mock messages
        window.addEventListener('mockChromeMessage', ((e: Event) => {
          const customEvent = e as CustomEvent;
          callback(customEvent.detail);
        }) as EventListener);
        console.log('Mock: Added message listener');
      }
    },
    sendMessage: (message: any, callback?: () => void) => {
      console.log('Mock: Sent message', message);
      // Simulate some mock data for development
      if (message.type === 'FETCH_COMPANY_DATA') {
        setTimeout(() => {
          const mockData = {
            type: 'COMPANY_DATA_UPDATE',
            data: {
              name: 'Mock Company',
              totalFunding: '$10M',
              recentRound: 'Series A',
              notableInvestors: ['Investor 1', 'Investor 2'],
              sources: ['mock-source.com']
            }
          };
          callback && callback();
          window.dispatchEvent(new CustomEvent('mockChromeMessage', { detail: mockData }));
        }, 1000);
      }
    },
    lastError: null
  },
  tabs: {
    query: async () => [{
      url: 'http://localhost:5173'
    }]
  }
};

// Helper function to get the appropriate Chrome API implementation
export const getChromeAPI = () => {
  return typeof chrome !== 'undefined' ? chrome : mockChrome;
}; 