import { CompanyData } from './types';
import { config } from './config/env';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request);
  if (request.type === 'FETCH_COMPANY_DATA') {
    console.log('Processing FETCH_COMPANY_DATA request for domain:', request.domain);
    sendResponse({ status: 'fetching' });
    fetchCompanyDataStreaming(request.domain, sender.tab?.id);
    return false;
  }
  return false;
});

function sendUpdate(data: Partial<CompanyData> | { error: string } | { complete: boolean }) {
  console.log('Sending update to popup:', data);
  chrome.runtime.sendMessage({ type: 'COMPANY_DATA_UPDATE', data });
}

async function fetchCompanyDataStreaming(domain: string, _tabId?: number): Promise<void> {
  console.log('Fetching company data for domain:', domain);
  try {
    const companyName = extractCompanyName(domain);
    console.log('Extracted company name:', companyName);
    
    sendUpdate({ name: companyName });
    
    const controller = new AbortController();
    const signal = controller.signal;
    
    console.log('Creating API request for Perplexity...');
    console.log('API Key available:', !!config.PERPLEXITY_API_KEY);
    
    // Check if API key is available
    if (!config.PERPLEXITY_API_KEY) {
      console.error('No Perplexity API key found in configuration!');
      sendUpdate({ error: 'No API key available. Please add your Perplexity API key to .env file.' });
      return;
    }
    
    console.log('Preparing to send request to Perplexity API...');
    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify({
          model: "sonar",
          stream: true,
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
          }]
        })
      });

      console.log('API request sent, starting to process stream...');
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('API response not ok:', response.status, errorText);
        sendUpdate({ error: `Failed to fetch company data: ${response.status} ${errorText}` });
        return;
      }

      if (!response.body) {
        console.error('Response body is null');
        sendUpdate({ error: 'Response body is null' });
        return;
      }

      console.log('Getting reader from response body...');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      console.log('Setting up company data and buffer...');
      let companyData: Partial<CompanyData> = {
        name: companyName,
        notableInvestors: [],
        sources: []
      };
      
      let buffer = "";
      
      try {
        console.log('Starting stream reading loop...');
        let chunkCounter = 0;
        
        while (true) {
          console.log(`Reading chunk #${++chunkCounter}...`);
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('Stream reading complete (done=true)');
            break;
          }
          
          console.log(`Received chunk #${chunkCounter} with ${value?.length || 0} bytes`);
          buffer += decoder.decode(value, { stream: true });
          
          console.log(`Current buffer length: ${buffer.length} characters`);
          console.log(`Buffer preview: ${buffer.substring(0, Math.min(50, buffer.length))}...`);
          
          let processedLines = 0;
          while (buffer.includes('\n')) {
            const lineEnd = buffer.indexOf('\n');
            const line = buffer.substring(0, lineEnd).trim();
            buffer = buffer.substring(lineEnd + 1);
            processedLines++;
            
            if (line.startsWith('data:')) {
              console.log(`Processing data line: ${line.substring(0, Math.min(50, line.length))}...`);
              const jsonData = line.substring(5).trim();
              
              if (jsonData === '[DONE]') {
                console.log('Received [DONE] signal from stream');
                continue;
              }
              
              try {
                const parsedData = JSON.parse(jsonData);
                console.log('Successfully parsed JSON from stream');
                
                const content = parsedData.choices?.[0]?.delta?.content;
                
                if (content) {
                  console.log(`Received content: "${content}"`);
                  const lines = content.split('\n');
                  
                  for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;
                    
                    if (trimmedLine.includes(':')) {
                      const [field, ...valueParts] = trimmedLine.split(':');
                      const value = valueParts.join(':').trim();
                      
                      if (!value) continue;
                      
                      console.log(`Extracted field: ${field.trim()}, value: ${value}`);
                      
                      switch (field.trim().toUpperCase()) {
                        case 'COMPANY_NAME':
                          if (!companyData.name || companyData.name === companyName) {
                            companyData.name = value;
                            console.log('Updating company name:', value);
                            sendUpdate({ name: value });
                          }
                          break;
                          
                        case 'TOTAL_FUNDING':
                          companyData.totalFunding = value;
                          console.log('Updating total funding:', value);
                          sendUpdate({ totalFunding: value });
                          break;
                          
                        case 'RECENT_ROUND_AMOUNT':
                          companyData.recentRound = { 
                            ...companyData.recentRound || {},
                            amount: value
                          };
                          console.log('Updating recent round amount:', value);
                          sendUpdate({ 
                            recentRound: companyData.recentRound
                          });
                          break;
                          
                        case 'RECENT_ROUND_DATE':
                          companyData.recentRound = { 
                            ...companyData.recentRound || {},
                            date: value
                          };
                          console.log('Updating recent round date:', value);
                          sendUpdate({ 
                            recentRound: companyData.recentRound
                          });
                          break;
                          
                        case 'RECENT_ROUND_TYPE':
                          companyData.recentRound = { 
                            ...companyData.recentRound || {},
                            type: value
                          };
                          console.log('Updating recent round type:', value);
                          sendUpdate({ 
                            recentRound: companyData.recentRound
                          });
                          break;
                          
                        case 'NOTABLE_INVESTORS':
                          const investors = value.split(',')
                            .map((inv: string) => inv.trim())
                            .filter((inv: string) => inv && inv !== '[investor 1]' && inv !== '[investor 2]' && inv !== '[investor 3]' && !inv.includes('['));
                          
                          console.log('Parsed investors:', investors);
                          
                          if (investors.length > 0) {
                            const uniqueInvestors = [...new Set([
                              ...(companyData.notableInvestors || []),
                              ...investors
                            ])];
                            
                            companyData.notableInvestors = uniqueInvestors;
                            console.log('Updating notable investors:', uniqueInvestors);
                            sendUpdate({ notableInvestors: uniqueInvestors });
                          }
                          break;
                          
                        case 'SOURCES':
                          const sources = value.split(',')
                            .map((src: string) => src.trim())
                            .filter((src: string) => src && src !== '[full URL 1]' && src !== '[full URL 2]' && !src.includes('['));
                          
                          console.log('Parsed sources:', sources);
                          
                          if (sources.length > 0) {
                            const uniqueSources = [...new Set([
                              ...(companyData.sources || []),
                              ...sources
                            ])];
                            
                            companyData.sources = uniqueSources;
                            console.log('Updating sources:', uniqueSources);
                            sendUpdate({ sources: uniqueSources });
                          }
                          break;
                      }
                    }
                  }
                }
              } catch (e) {
                console.error('Error parsing stream JSON:', e);
                console.log('Problematic JSON data:', jsonData);
              }
            }
          }
          console.log(`Processed ${processedLines} lines from buffer`);
        }
      } catch (error) {
        console.error('Error reading stream:', error);
        sendUpdate({ error: `Error reading stream: ${error instanceof Error ? error.message : String(error)}` });
      } finally {
        console.log('Stream processing complete, sending final updates');
        console.log('Final company data:', companyData);
        sendUpdate(companyData);
        sendUpdate({ complete: true } as any);
        console.log('All updates sent, streaming process complete');
      }
    } catch (fetchError) {
      console.error('Fetch operation failed:', fetchError);
      sendUpdate({ error: `Fetch operation failed: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}` });
    }
  } catch (error) {
    console.error('Error in fetchCompanyDataStreaming:', error);
    sendUpdate({ error: error instanceof Error ? error.message : 'Unknown error occurred' });
  }
}

function extractCompanyName(domain: string): string {
  return domain.replace('www.', '').split('.')[0];
}