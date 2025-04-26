import { CompanyData } from './types';
import { isDataStale, manageStorageQuota, getStorageKeyForDomain } from './utils/storage';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request);
  if (request.type === 'FETCH_COMPANY_DATA') {
    console.log('Processing FETCH_COMPANY_DATA request for domain:', request.domain);
    sendResponse({ status: 'fetching' });
    fetchCompanyDataStreaming(request.domain, sender.tab?.id, request.forceUpdate);
    return true; // Keep the message channel open for async response
  }
  return false;
});

function sendUpdate(
  data: Partial<CompanyData> | { error: string } | { complete: boolean },
  domain: string,
  forceUpdate?: boolean
) {
  console.log('Sending update to popup:', data);
  chrome.runtime.sendMessage({ type: 'COMPANY_DATA_UPDATE', data, domain });
  
  // If this is a data update (not an error or complete message), update our storage
  if (!('error' in data) && !('complete' in data)) {
    const storageKey = getStorageKeyForDomain(domain);
    
    chrome.storage.local.get([storageKey], async (result) => {
      const currentData = result[storageKey] || {};
      
      // Only use cache if we're not forcing update AND we have complete, non-stale data
      if (!forceUpdate && 
          currentData.lastUpdated && 
          !isDataStale(currentData.lastUpdated) &&
          isDataComplete(currentData)) {  // New check for data completeness
        console.log('Using complete, non-stale cached data');
        return;
      }

      // Manage storage quota before saving
      await manageStorageQuota();

      const updatedData = {
        ...currentData,
        ...data as Partial<CompanyData>,
        domain,
        lastAccessed: new Date().toISOString(),
        lastUpdated: new Date().toISOString()  // Always update the timestamp when forcing
      };
      
      // Save the merged data
      chrome.storage.local.set({ 
        [storageKey]: updatedData 
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving data:', chrome.runtime.lastError);
          return;
        }
        console.log('Updated data saved to storage:', updatedData);
      });
    });
  }
  
  // When complete message is received
  if ('complete' in data) {
    const storageKey = getStorageKeyForDomain(domain);
    chrome.storage.local.get([storageKey], async (result) => {
      if (!result[storageKey]) {
        console.warn('No company data found to save on completion');
        return;
      }
      
      // Manage storage quota before final save
      await manageStorageQuota();

      const finalData = {
        ...result[storageKey],  // Get existing data
        domain,
        name: result[storageKey].name,
        totalFunding: result[storageKey].totalFunding,
        notableInvestors: result[storageKey].notableInvestors || [],
        recentRound: result[storageKey].recentRound,
        sources: result[storageKey].sources || [],
        lastUpdated: new Date().toISOString(),
        lastAccessed: new Date().toISOString()
      };
      
      chrome.storage.local.set({ 
        [storageKey]: finalData 
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving final data:', chrome.runtime.lastError);
          return;
        }
        console.log('Final data saved to storage:', finalData);
      });
    });
  }
}

async function fetchCompanyDataStreaming(domain: string, _tabId?: number, forceUpdate?: boolean): Promise<void> {
  console.log('Fetching company data for domain:', domain);
  try {
    const companyName = extractCompanyName(domain);
    console.log('Extracted company name:', companyName);
    
    sendUpdate({ name: companyName }, domain, forceUpdate);
    
    console.log('Sending request to proxy server...');
    try {
      const proxyUrl = 'https://funding-proxy.vercel.app/api/proxy';
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: "sonar",
          stream: true,
          messages: [{
            role: "system",
            content: "You are a precise data extraction assistant that only provides verified company funding information. Always respond in the exact format requested, with no additional text or explanations. Ensure all data is accurate and complete before including it."
          }, {
            role: "user",
            content: `Extract and provide verified funding information for ${companyName} using this exact format:

            COMPANY_NAME: [full legal company name - do not abbreviate, must be complete]
            TOTAL_FUNDING: [exact total funding amount with currency symbol, e.g. $100M, $1.2B]
            RECENT_ROUND_AMOUNT: [exact amount of most recent funding round with currency symbol]
            RECENT_ROUND_DATE: [date in MM/YYYY format]
            RECENT_ROUND_TYPE: [exact round type: Seed, Series A, Series B, etc.]
            NOTABLE_INVESTORS: [list exactly 5 most prominent investors, separated by semicolons]
            SOURCES: [list exactly 3 most authoritative sources with complete URLs]

            Critical Requirements:
            1. Only include information you are completely certain about
            2. Leave any uncertain fields completely blank
            3. For NOTABLE_INVESTORS, only include institutional investors or well-known angels
            4. For SOURCES, only use URLs from Crunchbase, TechCrunch, company press releases, or SEC filings
            5. Use semicolons (;) as separators for NOTABLE_INVESTORS and SOURCES
            6. Do not include any explanatory text or notes
            7. Verify all information is from within the last 2 years
            8. Company name must be the complete legal name, not abbreviated
            9. Total funding must include currency symbol and unit (M, B, K)
            10. All URLs must be complete and valid`
          }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        sendUpdate({ error: `Failed to fetch company data: ${response.status} ${errorText}` }, domain);
        return;
      }

      if (!response.body) {
        sendUpdate({ error: 'Response body is null' }, domain);
        return;
      }

      const reader = response.body.getReader(); // Reader is used to read the response body that's streamed in chunks as binary data
      const decoder = new TextDecoder(); // Decoder is used to convert the binary data to readable text
      
      let buffer = "";
      let currentLine = ""; // Add this to accumulate chunks into complete lines
      let processedLines = new Set<string>();
      let companyData: Partial<CompanyData> = {
        name: companyName,
        notableInvestors: [],
        sources: []
      };
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // Process any remaining complete lines in buffer
            if (currentLine.trim()) {
              processStreamLine(currentLine.trim(), companyData, processedLines, domain, forceUpdate);
            }
            break;
          }
          
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete lines
          let lineEnd;
          while ((lineEnd = buffer.indexOf('\n')) !== -1) {
            const line = buffer.substring(0, lineEnd).trim();
            buffer = buffer.substring(lineEnd + 1);
            
            if (line.startsWith('data:')) {
              const jsonData = line.substring(5).trim();
              
              if (jsonData === '[DONE]') {
                continue;
              }
              
              try {
                const parsedData = JSON.parse(jsonData);
                const content = parsedData.choices?.[0]?.delta?.content;
                
                if (content) {
                  console.log('Received content chunk:', content);
                  
                  // Accumulate content into currentLine
                  currentLine += content;
                  
                  // If we have a complete line (ends with newline or contains newline characters)
                  if (content.includes('\n') || content.endsWith('\n')) {
                    // Split accumulated content into lines
                    const lines = currentLine.split('\n');
                    
                    // Process all complete lines except the last one (which might be incomplete)
                    for (let i = 0; i < lines.length - 1; i++) {
                      const completeLine = lines[i].trim();
                      if (completeLine) {
                        console.log('Processing complete line:', completeLine);
                        processStreamLine(completeLine, companyData, processedLines, domain, forceUpdate);
                      }
                    }
                    
                    // Keep the last line in currentLine if it's not empty
                    currentLine = lines[lines.length - 1];
                  }
                }
              } catch (e) {
                console.error('Error parsing stream JSON:', e);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error reading stream:', error);
        sendUpdate({ error: `Error reading stream: ${error instanceof Error ? error.message : String(error)}` }, domain);
      } finally {
        // First ensure the final companyData is saved
        if (Object.keys(companyData).length > 0) {
            await new Promise<void>((resolve) => {
                sendUpdate(companyData, domain, forceUpdate);
                setTimeout(resolve, 100); // Give a small delay to ensure data is saved
            });
        }
        // Then send the completion message
        sendUpdate({ complete: true } as any, domain, forceUpdate);
      }
    } catch (fetchError) {
      sendUpdate({ error: `Fetch operation failed: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}` }, domain);
    }
  } catch (error) {
    sendUpdate({ error: error instanceof Error ? error.message : 'Unknown error occurred' }, domain);
  }
}

// New helper function to process individual lines
function processStreamLine(
  line: string, 
  companyData: Partial<CompanyData>, 
  processedLines: Set<string>,
  domain: string,
  forceUpdate?: boolean
): void {
  // Skip if we've already processed this exact line
  if (processedLines.has(line)) {
    return;
  }

  // Only process lines that contain a field delimiter
  if (!line.includes(':')) {
    return;
  }

  const colonIndex = line.indexOf(':');
  const field = line.substring(0, colonIndex).trim().toUpperCase();
  const value = line.substring(colonIndex + 1).trim();

  // Skip invalid or placeholder values
  if (!value || value.includes('[') && value.includes(']')) {
    return;
  }

  // Skip if we've already processed this field:value combination
  const fieldValueKey = `${field}:${value}`;
  if (processedLines.has(fieldValueKey)) {
    return;
  }

  processedLines.add(fieldValueKey);
  
  // Replace validateAndLogData with simple logging
  console.log(`Processing ${field}:`, value);

  let shouldUpdate = false;
  const update: Partial<CompanyData> = {};

  switch (field) {
    case 'COMPANY_NAME':
      if (value && value.length > 2) {
        const cleanedName = value
          .replace(/\([^)]*\)/g, '')
          .split(',')[0]
          .replace(/\s+/g, ' ')
          .trim()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        if (cleanedName !== companyData.name) {
          companyData.name = cleanedName;
          update.name = cleanedName;
          shouldUpdate = true;
        }
      }
      break;

    case 'TOTAL_FUNDING':
      if (value) {
        const fundingRegex = /^\$[\d.]+[MBK]$/;
        if (fundingRegex.test(value) && value !== companyData.totalFunding) {
          companyData.totalFunding = value;
          update.totalFunding = value;
          shouldUpdate = true;
        }
      }
      break;

    case 'RECENT_ROUND_AMOUNT':
      if (value && (!companyData.recentRound?.amount || companyData.recentRound.amount !== value)) {
        companyData.recentRound = { 
          ...companyData.recentRound || {},
          amount: value
        };
        update.recentRound = companyData.recentRound;
        shouldUpdate = true;
      }
      break;

    case 'RECENT_ROUND_DATE':
      if (value && (!companyData.recentRound?.date || companyData.recentRound.date !== value)) {
        companyData.recentRound = { 
          ...companyData.recentRound || {},
          date: value
        };
        update.recentRound = companyData.recentRound;
        shouldUpdate = true;
      }
      break;

    case 'RECENT_ROUND_TYPE':
      if (value && (!companyData.recentRound?.type || companyData.recentRound.type !== value)) {
        companyData.recentRound = { 
          ...companyData.recentRound || {},
          type: value
        };
        update.recentRound = companyData.recentRound;
        shouldUpdate = true;
      }
      break;

    case 'NOTABLE_INVESTORS':
      if (value && !value.includes('[')) {
        const investors = value.split(';')
          .map((inv) => inv.trim())
          .filter((inv) => inv && !inv.includes('[') && inv.length > 2);
        
        if (investors.length > 0) {
          const uniqueInvestors = [...new Set(investors)].slice(0, 5);
          
          // Improved comparison to check if the arrays are actually different
          const hasChanged = 
            uniqueInvestors.length !== companyData.notableInvestors?.length ||
            !uniqueInvestors.every(inv => companyData.notableInvestors?.includes(inv)) ||
            !companyData.notableInvestors?.every(inv => uniqueInvestors.includes(inv));
          
          if (hasChanged) {
            companyData.notableInvestors = uniqueInvestors;
            update.notableInvestors = uniqueInvestors;
            shouldUpdate = true;
          }
        }
      }
      break;
      
    case 'SOURCES':
      if (value && !value.includes('[')) {
        const sources = value.split(';')
          .map((src) => src.trim())
          .filter((src) => {
            try {
              new URL(src);
              return true;
            } catch {
              return false;
            }
          });
        
        if (sources.length > 0) {
          const uniqueSources = [...new Set(sources)].slice(0, 3);
          
          // Improved comparison to check if the arrays are actually different
          const hasChanged = 
            uniqueSources.length !== companyData.sources?.length ||
            !uniqueSources.every(src => companyData.sources?.includes(src)) ||
            !companyData.sources?.every(src => uniqueSources.includes(src));
          
          if (hasChanged) {
            companyData.sources = uniqueSources;
            update.sources = uniqueSources;
            shouldUpdate = true;
          }
        }
      }
      break;
  }

  // Only send update if we have new information
  if (shouldUpdate) {
    sendUpdate(update, domain, forceUpdate);
  }
}

function extractCompanyName(domain: string): string {
  return domain.replace('www.', '').split('.')[0];
}

// Helper function to check if data is complete
function isDataComplete(data: Partial<CompanyData>): boolean {
  return Boolean(
    data.name &&
    data.totalFunding &&
    Array.isArray(data.notableInvestors) && data.notableInvestors.length > 0 &&
    Array.isArray(data.sources) && data.sources.length > 0 &&
    data.recentRound
  );
}