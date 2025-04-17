import { CompanyData } from './types';
import { config } from './config/env';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request);
  if (request.type === 'FETCH_COMPANY_DATA') {
    console.log('Processing FETCH_COMPANY_DATA request for domain:', request.domain);
    sendResponse({ status: 'fetching' });
    fetchCompanyDataStreaming(request.domain, sender.tab?.id);
    return true; // Keep the message channel open for async response
  }
  return false;
});

function sendUpdate(data: Partial<CompanyData> | { error: string } | { complete: boolean }) {
  console.log('Sending update to popup:', data);
  chrome.runtime.sendMessage({ type: 'COMPANY_DATA_UPDATE', data });
}

function validateAndLogData(field: string, value: any) {
  console.log(`Processing ${field}:`, value);
  if (!value) {
    console.warn(`Empty value received for ${field}`);
    return false;
  }
  return true;
}

async function fetchCompanyDataStreaming(domain: string, _tabId?: number): Promise<void> {
  console.log('Fetching company data for domain:', domain);
  try {
    const companyName = extractCompanyName(domain);
    console.log('Extracted company name:', companyName);
    
    sendUpdate({ name: companyName });
    
    // Check if API key is available
    if (!config.PERPLEXITY_API_KEY) {
      console.error('No Perplexity API key found in configuration!');
      sendUpdate({ error: 'No API key available. Please add your Perplexity API key to .env file.' });
      return;
    }
    
    console.log('Sending request to Perplexity API...');
    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.PERPLEXITY_API_KEY}`,
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
        sendUpdate({ error: `Failed to fetch company data: ${response.status} ${errorText}` });
        return;
      }

      if (!response.body) {
        sendUpdate({ error: 'Response body is null' });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let companyData: Partial<CompanyData> = {
        name: companyName,
        notableInvestors: [],
        sources: []
      };
      
      // The buffer is used to store data from the stream that's still in binary format
      let buffer = "";
      // The accumulatedText is used to store data that's converted from the binary in the buffer to text
      let accumulatedText = "";
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }
          
          buffer += decoder.decode(value, { stream: true });
          
          // Process full lines
          while (buffer.includes('\n')) {
            const lineEnd = buffer.indexOf('\n');
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
                  accumulatedText += content;
                  
                  // Extract information from accumulated text
                  const lines = accumulatedText.split('\n');
                  for (const textLine of lines) {
                    if (textLine.includes(':')) {
                      const colonIndex = textLine.indexOf(':');
                      const field = textLine.substring(0, colonIndex).trim().toUpperCase();
                      const value = textLine.substring(colonIndex + 1).trim();
                      
                      if (!value || value.includes('[') && value.includes(']')) {
                        console.log(`Skipping invalid value for ${field}:`, value);
                        continue;
                      }
                      
                      if (!validateAndLogData(field, value)) continue;
                      
                      switch (field) {
                        case 'COMPANY_NAME':
                          if (value) {
                            // Validate and clean the company name
                            const cleanedName = value
                              // Remove any text within parentheses (including the parentheses)
                              .replace(/\([^)]*\)/g, '')
                              // Remove commas and any text after them
                              .split(',')[0]
                              // Replace multiple spaces with single space and trim
                              .replace(/\s+/g, ' ').trim()
                              // Capitalize first letter of each word
                              .split(' ')
                              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                              .join(' ');

                            // Only update if we have a valid company name (more than 2 characters)
                            if (cleanedName.length > 2 && cleanedName !== companyData.name) {
                              companyData.name = cleanedName;
                              sendUpdate({ name: cleanedName });
                            }
                          }
                          break;
                          
                        case 'TOTAL_FUNDING':
                          if (value) {
                            // Validate funding format (e.g., $100M, $1.2B, etc.)
                            const fundingRegex = /^\$[\d.]+[MBK]$/;
                            if (fundingRegex.test(value) && value !== companyData.totalFunding) {
                              companyData.totalFunding = value;
                              sendUpdate({ totalFunding: value });
                            } else {
                              console.log('Invalid funding format:', value);
                            }
                          }
                          break;
                          
                        case 'RECENT_ROUND_AMOUNT':
                          if (value) {
                            if (value !== companyData.recentRound?.amount) {
                              companyData.recentRound = { 
                                ...companyData.recentRound || {},
                                amount: value
                              };
                              sendUpdate({ recentRound: companyData.recentRound });
                            }
                          }
                          break;
                          
                        case 'RECENT_ROUND_DATE':
                          if (value) {
                            if (value !== companyData.recentRound?.date) {
                              companyData.recentRound = { 
                                ...companyData.recentRound || {},
                                date: value
                              };
                              sendUpdate({ recentRound: companyData.recentRound });
                            }
                          }
                          break;
                          
                        case 'RECENT_ROUND_TYPE':
                          if (value) {
                            if (value !== companyData.recentRound?.type) {
                              companyData.recentRound = { 
                                ...companyData.recentRound || {},
                                type: value
                              };
                              sendUpdate({ recentRound: companyData.recentRound });
                            }
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
                                sendUpdate({ notableInvestors: uniqueInvestors });
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
                                sendUpdate({ sources: uniqueSources });
                              }
                            }
                          }
                          break;
                      }
                    }
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
        sendUpdate({ error: `Error reading stream: ${error instanceof Error ? error.message : String(error)}` });
      } finally {
        sendUpdate(companyData);
        sendUpdate({ complete: true } as any);
      }
    } catch (fetchError) {
      sendUpdate({ error: `Fetch operation failed: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}` });
    }
  } catch (error) {
    sendUpdate({ error: error instanceof Error ? error.message : 'Unknown error occurred' });
  }
}

function extractCompanyName(domain: string): string {
  return domain.replace('www.', '').split('.')[0];
}