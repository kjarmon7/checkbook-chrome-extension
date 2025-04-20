// Constants
export const STORAGE_CONSTANTS = {
  MAX_AGE_HOURS: 168,
  MAX_ENTRIES: 100,
  QUOTA_WARNING_THRESHOLD: 0.9, // 90% of quota
  STORAGE_KEY_PREFIX: 'companyData_'
} as const;

// Add helper function to generate domain-specific storage key
export function getStorageKeyForDomain(domain: string): string {
  return `${STORAGE_CONSTANTS.STORAGE_KEY_PREFIX}${domain}`;
}

// Cache Management
export function isDataStale(lastUpdated: string): boolean {
  const lastUpdate = new Date(lastUpdated);
  const now = new Date();
  const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
  return hoursSinceUpdate > STORAGE_CONSTANTS.MAX_AGE_HOURS;
}

// Storage Management
export async function manageStorageQuota(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
      chrome.storage.local.get(null, (items) => {
        // Check if we're near quota
        if (bytesInUse > chrome.storage.local.QUOTA_BYTES * STORAGE_CONSTANTS.QUOTA_WARNING_THRESHOLD) {
          console.warn(`Storage usage: ${bytesInUse} bytes of ${chrome.storage.local.QUOTA_BYTES} bytes`);
          
          const FAR_FUTURE_DATE = new Date();
          FAR_FUTURE_DATE.setDate(FAR_FUTURE_DATE.getDate() + 7); // 7 days (1 week) ahead

          // Get all company data entries
          const companies = Object.entries(items)
            .filter(([key]) => key.startsWith(STORAGE_CONSTANTS.STORAGE_KEY_PREFIX))
            .map(([key, value]) => ({
              key,
              lastUpdated: value.lastUpdated || FAR_FUTURE_DATE.toISOString(),
              lastAccessed: value.lastAccessed || FAR_FUTURE_DATE.toISOString()
            }))
            .sort((a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime());

          // Remove oldest entries if we have too many
          if (companies.length > STORAGE_CONSTANTS.MAX_ENTRIES) {
            const toRemove = companies
              .slice(STORAGE_CONSTANTS.MAX_ENTRIES)
              .map(entry => entry.key);

            chrome.storage.local.remove(toRemove, () => {
              console.log(`Removed ${toRemove.length} old entries from storage`);
              resolve();
            });
          } else {
            resolve();
          }
        } else {
          resolve();
        }
      });
    });
  });
}
