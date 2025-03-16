import { CompanyData } from './types';
import { config } from './config/env';

// Listen for streaming responses
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'streaming-response') {
    port.onMessage.addListener((request) => {
      if (request.type === 'FETCH_COMPANY_DATA') {
        streamCompanyData(request.domain, port);
      }
    });
  }
});

async function streamCompanyData(domain: string, port: chrome.runtime.Port) {
  console.log('Streaming company data for domain:', domain);
  try {
    const companyName = extractCompanyName(domain);
    console.log('Extracted company name:', companyName);
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [{
          role: "system",
          content: "You are a helpful assistant that provides company funding information. Please respond with structured information about funding rounds, investors, and sources."
        }, {
          role: "user",
          content: `Please provide the following information about ${companyName}:

Please use this exact format, with one field per line with FIELD_NAME: value format:

COMPANY_NAME: [company name]
TOTAL_FUNDING: [most up-to-date total funding amount as of ${new Date().toISOString().split('T')[0]}]
RECENT_ROUND_AMOUNT: [amount of most recent funding round]
RECENT_ROUND_DATE: [date of most recent funding round]
RECENT_ROUND_TYPE: [type of most recent funding round, e.g. Series A, Seed, etc.]
NOTABLE_INVESTORS: [investor 1], [investor 2], [investor 3], etc.
SOURCES: [full URL 1], [full URL 2], etc.

EXTREMELY IMPORTANT: 
1. Ensure all information is the most recent and up-to-date data available.
2. For sources, provide complete URLs that can be clicked by users.
3. Follow the exact format specified above with each field on its own line.
4. Do not add any additional explanation or text.
5. For NOTABLE_INVESTORS, list only 5-10 of the most significant investors without duplicates.
6. For SOURCES, provide only 3-5 of the most relevant and authoritative sources without duplicates.`
        }],
        stream: true // Enable streaming
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('API response not ok:', response.status, errorText);
      port.postMessage({ type: 'ERROR', error: `Failed to fetch company data: ${response.status} ${errorText}` });
      return;
    }

    // Read the stream
    const reader = response.body?.getReader();
    if (!reader) {
      port.postMessage({ type: 'ERROR', error: 'Stream reader not available' });
      return;
    }

    let accumulatedContent = '';
    const companyData: Partial<CompanyData> = {
      notableInvestors: [],
      sources: []
    };
    
    // Process the stream
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('Stream complete');
        
        // Final processing to ensure deduplication
        if (companyData.notableInvestors && companyData.notableInvestors.length > 0) {
          companyData.notableInvestors = deduplicateArray(companyData.notableInvestors);
        }
        
        if (companyData.sources && companyData.sources.length > 0) {
          companyData.sources = deduplicateArray(companyData.sources);
        }
        
        // Send the complete result
        if (Object.keys(companyData).length > 0) {
          port.postMessage({ 
            type: 'COMPLETE', 
            data: companyData as CompanyData 
          });
        } else {
          port.postMessage({ 
            type: 'ERROR', 
            error: 'No data was extracted from the response' 
          });
        }
        break;
      }
      
      // Convert the chunk to text
      const chunk = new TextDecoder().decode(value);
      
      // Parse the chunk - Perplexity sends 'data: ' prefixed JSON objects
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(5); // Remove 'data: ' prefix
          
          if (data === '[DONE]') {
            continue; // We'll handle completion when done is true
          }
          
          try {
            // Extract the content from the Perplexity stream chunk
            const parsedChunk = JSON.parse(data);
            const deltaContent = parsedChunk.choices?.[0]?.delta?.content || '';
            
            if (deltaContent) {
              // Add the new content to our accumulated content
              accumulatedContent += deltaContent;
              
              // Send the raw content for immediate display
              port.postMessage({ 
                type: 'CHUNK', 
                content: accumulatedContent 
              });
              
              // Process the new content to extract any data
              processLineBasedContent(accumulatedContent, companyData, port);
            }
          } catch (error) {
            // Silently handle JSON parsing errors - normal in streaming
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in streamCompanyData:', error);
    port.postMessage({ 
      type: 'ERROR', 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}

// Helper function to deduplicate arrays with exact string matching
function deduplicateArray(arr: string[]): string[] {
  // Convert to lowercase for case-insensitive comparison
  const seen = new Set<string>();
  const result: string[] = [];
  
  for (const item of arr) {
    // Clean the item - trim whitespace, normalize case
    const cleanItem = item.trim();
    
    // Skip empty items
    if (!cleanItem) continue;
    
    // Case insensitive deduplication
    const lowerItem = cleanItem.toLowerCase();
    
    if (!seen.has(lowerItem)) {
      seen.add(lowerItem);
      result.push(cleanItem); // Add original case version
    }
  }
  
  return result;
}

// Process the line-based content to extract structured data
function processLineBasedContent(content: string, companyData: Partial<CompanyData>, port: chrome.runtime.Port) {
  // Process full lines only
  const lines = content.split('\n').filter(line => line.trim() !== '');
  let dataUpdated = false;
  
  // Use a flag to track if we need to deduplicate at the end
  let shouldDeduplicateInvestors = false;
  let shouldDeduplicateSources = false;
  
  for (const line of lines) {
    // Try to extract data from each line
    if (line.startsWith('COMPANY_NAME:')) {
      const name = line.slice('COMPANY_NAME:'.length).trim();
      if (name && name !== companyData.name) {
        companyData.name = name;
        dataUpdated = true;
      }
    }
    else if (line.startsWith('TOTAL_FUNDING:')) {
      const totalFunding = line.slice('TOTAL_FUNDING:'.length).trim();
      if (totalFunding && totalFunding !== companyData.totalFunding) {
        companyData.totalFunding = totalFunding;
        dataUpdated = true;
      }
    }
    else if (line.startsWith('RECENT_ROUND_AMOUNT:')) {
      const amount = line.slice('RECENT_ROUND_AMOUNT:'.length).trim();
      if (!companyData.recentRound) companyData.recentRound = { amount: '', date: '', type: '' };
      if (amount && amount !== companyData.recentRound.amount) {
        companyData.recentRound.amount = amount;
        dataUpdated = true;
      }
    }
    else if (line.startsWith('RECENT_ROUND_DATE:')) {
      const date = line.slice('RECENT_ROUND_DATE:'.length).trim();
      if (!companyData.recentRound) companyData.recentRound = { amount: '', date: '', type: '' };
      if (date && date !== companyData.recentRound.date) {
        companyData.recentRound.date = date;
        dataUpdated = true;
      }
    }
    else if (line.startsWith('RECENT_ROUND_TYPE:')) {
      const type = line.slice('RECENT_ROUND_TYPE:'.length).trim();
      if (!companyData.recentRound) companyData.recentRound = { amount: '', date: '', type: '' };
      if (type && type !== companyData.recentRound.type) {
        companyData.recentRound.type = type;
        dataUpdated = true;
      }
    }
    else if (line.startsWith('NOTABLE_INVESTORS:')) {
      const investorsText = line.slice('NOTABLE_INVESTORS:'.length).trim();
      if (investorsText) {
        // Split by commas, but handle cases with Oxford commas and 'and'
        const newInvestors = investorsText
          .split(/,\s*|\s+and\s+/)
          .map(investor => investor.trim())
          .filter(investor => investor !== '');
        
        // Only update if we have new investors
        if (newInvestors.length > 0) {
          // Keep track of what we've already seen
          if (!companyData.notableInvestors) {
            companyData.notableInvestors = [];
          }
          
          // Add only genuinely new investors
          const existingLower = new Set(companyData.notableInvestors.map(i => i.toLowerCase()));
          const actuallyNewInvestors = newInvestors.filter(
            inv => !existingLower.has(inv.toLowerCase())
          );
          
          if (actuallyNewInvestors.length > 0) {
            companyData.notableInvestors = [...companyData.notableInvestors, ...actuallyNewInvestors];
            shouldDeduplicateInvestors = true;
            dataUpdated = true;
          }
        }
      }
    }
    else if (line.startsWith('SOURCES:')) {
      const sourcesText = line.slice('SOURCES:'.length).trim();
      if (sourcesText) {
        // Split by commas
        const newSources = sourcesText
          .split(/,\s*/)
          .map(source => source.trim())
          .filter(source => source !== '' && source.includes('://'));
        
        // Only update if we have new sources
        if (newSources.length > 0) {
          // Keep track of what we've already seen
          if (!companyData.sources) {
            companyData.sources = [];
          }
          
          // Add only genuinely new sources
          const existingLower = new Set(companyData.sources.map(s => s.toLowerCase()));
          const actuallyNewSources = newSources.filter(
            src => !existingLower.has(src.toLowerCase())
          );
          
          if (actuallyNewSources.length > 0) {
            companyData.sources = [...companyData.sources, ...actuallyNewSources];
            shouldDeduplicateSources = true;
            dataUpdated = true;
          }
        }
      }
    }
  }
  
  // Deduplicate arrays before sending update
  if (shouldDeduplicateInvestors && companyData.notableInvestors) {
    companyData.notableInvestors = deduplicateArray(companyData.notableInvestors);
  }
  
  if (shouldDeduplicateSources && companyData.sources) {
    companyData.sources = deduplicateArray(companyData.sources);
  }
  
  // If we've updated the data, send it to the popup
  if (dataUpdated) {
    port.postMessage({ 
      type: 'PARTIAL', 
      data: companyData 
    });
  }
}

function extractCompanyName(domain: string): string {
  return domain.replace('www.', '').split('.')[0];
}