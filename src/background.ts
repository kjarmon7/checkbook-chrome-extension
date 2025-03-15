import { CompanyData, StreamingState } from './types';
import { config } from './config/env';

// Store active connections
let ports: Map<string, chrome.runtime.Port> = new Map();

// Message listener for one-time requests
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'FETCH_COMPANY_DATA') {
    fetchCompanyDataStreaming(request.domain, request.connectionId)
      .then(data => sendResponse({ data }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  return false;
});

// Connection listener for streaming connections
chrome.runtime.onConnect.addListener((port) => {
  console.log(`Connection established with: ${port.name}`);
  
  if (port.name.startsWith('company-data-stream:')) {
    const connectionId = port.name.split(':')[1];
    ports.set(connectionId, port);
    
    // Clean up when port disconnects
    port.onDisconnect.addListener(() => {
      console.log(`Connection closed: ${port.name}`);
      ports.delete(connectionId);
    });
  }
});

// Send streaming updates to connected client
function sendStreamUpdate(connectionId: string, state: StreamingState) {
  const port = ports.get(connectionId);
  if (port) {
    port.postMessage({ type: 'STREAM_UPDATE', state });
  } else {
    console.warn(`Port not found for connectionId: ${connectionId}`);
  }
}

async function fetchCompanyDataStreaming(domain: string, connectionId: string): Promise<CompanyData> {
  console.log(`Fetching company data for domain: ${domain}, connectionId: ${connectionId}`);
  
  try {
    // Update state to indicate streaming is starting
    sendStreamUpdate(connectionId, {
      status: 'loading',
      message: 'Connecting to API...',
      progress: 0,
      data: null
    });

    const companyName = extractCompanyName(domain);
    console.log('Extracted company name:', companyName);
    
    sendStreamUpdate(connectionId, {
      status: 'loading',
      message: `Fetching data for ${companyName}...`,
      progress: 10,
      data: null
    });

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
          content: "You are a helpful assistant that provides the MOST CURRENT company funding information. Always prioritize the most recent data sources. Never return outdated information."
        }, {
          role: "user",
          content: `Please provide the following information about ${companyName} in JSON format:
            - Total funding amount
            - Most recent funding round (amount, date, and type)
            - Notable investors
            - Sources of information
            
            EXTREMELY IMPORTANT: Your response must ONLY contain the JSON object and absolutely nothing else - no markdown formatting (like \`\`\`json), no explanations, no additional text. Return ONLY a raw JSON object with these exact keys:
            {
              "companyName": string,
              "totalFunding": string,
              "recentRoundAmount": string,
              "recentRoundDate": string,
              "recentRoundType": string,
              "notableInvestors": string[],
              "sources": string[]
            }`
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API response not ok:', response.status, errorText);
      sendStreamUpdate(connectionId, {
        status: 'error',
        message: `API error: ${response.status} - ${errorText}`,
        progress: 0,
        data: null
      });
      throw new Error(`Failed to fetch company data: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      sendStreamUpdate(connectionId, {
        status: 'error',
        message: 'Response body is null',
        progress: 0,
        data: null
      });
      throw new Error('Response body is null');
    }

    // Start streaming process
    sendStreamUpdate(connectionId, {
      status: 'streaming',
      message: 'Receiving data...',
      progress: 20,
      data: null
    });

    const reader = response.body.getReader();
    let responseContent = '';
    let accumulatedJSON = '';
    let contentProgress = 0;
    let partialData: Partial<CompanyData> = {
      name: companyName,
      totalFunding: '',
      recentRound: {
        amount: '',
        date: '',
        type: ''
      },
      notableInvestors: [],
      sources: []
    };
    
    try {
      // Process the stream
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          console.log('Stream reading completed');
          break;
        }

        // Convert the chunk to a string
        const chunk = new TextDecoder().decode(value);
        contentProgress += chunk.length;
        
        console.log('Received chunk of length:', chunk.length);
        
        // Store the raw response for debugging
        responseContent += chunk;
        
        // Process each data line in the chunk
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6).trim();
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices && parsed.choices[0]?.delta?.content) {
                // Add the content to our accumulated JSON
                const content = parsed.choices[0].delta.content;
                accumulatedJSON += content;

                // Try to extract partial JSON as we accumulate more content
                try {
                  // Look for complete JSON objects
                  const jsonMatch = accumulatedJSON.match(/{[^]*}/);
                  
                  if (jsonMatch) {
                    // Try parsing it
                    try {
                      const partialParsed = JSON.parse(jsonMatch[0]);
  
                      // Update partial data with what we have
                      if (partialParsed.companyName) partialData.name = partialParsed.companyName;
                      if (partialParsed.totalFunding) partialData.totalFunding = partialParsed.totalFunding;
                      if (partialParsed.recentRoundAmount && partialData.recentRound) partialData.recentRound.amount = partialParsed.recentRoundAmount;
                      if (partialParsed.recentRoundDate && partialData.recentRound) partialData.recentRound.date = partialParsed.recentRoundDate;
                      if (partialParsed.recentRoundType && partialData.recentRound) partialData.recentRound.type = partialParsed.recentRoundType;
                      if (partialParsed.notableInvestors) partialData.notableInvestors = partialParsed.notableInvestors;
                      if (partialParsed.sources) partialData.sources = partialParsed.sources;

                      // Calculate progress (this is approximate)
                      const progress = 20 + Math.min(70, contentProgress / 1000);
                      
                      sendStreamUpdate(connectionId, {
                        status: 'streaming',
                        message: 'Receiving company data...',
                        progress: progress,
                        data: partialData as CompanyData
                      });
                    } catch (err) {
                      // This is normal - we're dealing with incomplete JSON
                    }
                  }
                } catch (jsonErr) {
                  // Ignore errors during partial parsing
                }
              }
            } catch (err) {
              console.warn('Error parsing data line:', err);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error reading stream:', error);
      sendStreamUpdate(connectionId, {
        status: 'error',
        message: `Stream error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        progress: 0,
        data: null
      });
      throw error;
    } finally {
      reader.releaseLock();
    }

    sendStreamUpdate(connectionId, {
      status: 'processing',
      message: 'Processing company data...',
      progress: 90,
      data: partialData as CompanyData
    });

    console.log('Full streamed content:', responseContent);
    console.log('Accumulated JSON:', accumulatedJSON);

    // Try to parse accumulated JSON
    let finalData: CompanyData;

    try {
      // Try to parse the accumulated JSON directly
      const parsedContent = JSON.parse(accumulatedJSON);

      finalData = {
        name: parsedContent.companyName || companyName,
        totalFunding: parsedContent.totalFunding || 'Unknown',
        recentRound: {
          amount: parsedContent.recentRoundAmount || 'Unknown',
          date: parsedContent.recentRoundDate || 'Unknown',
          type: parsedContent.recentRoundType || 'Unknown'
        },
        notableInvestors: parsedContent.notableInvestors || ['Unknown'],
        sources: parsedContent.sources || ['Unknown']
      };
    } catch (error) {
      console.error('Failed to parse accumulated JSON, falling back to regex extraction:', error);

      // If direct parsing fails, try to extract JSON with regex
      const jsonMatch = accumulatedJSON.match(/{[^]*}/);

      if (jsonMatch) {
        try {
          const extractedJson = jsonMatch[0];
          const parsedJson = JSON.parse(extractedJson);

          finalData = {
            name: parsedJson.companyName || companyName,
            totalFunding: parsedJson.totalFunding || 'Unknown',
            recentRound: {
              amount: parsedJson.recentRoundAmount || 'Unknown',
              date: parsedJson.recentRoundDate || 'Unknown',
              type: parsedJson.recentRoundType || 'Unknown'
            },
            notableInvestors: parsedJson.notableInvestors || ['Unknown'],
            sources: parsedJson.sources || ['Unknown']
          };
        } catch (regexError) {
          console.error('Failed to parse with regex extraction, using partial data:', regexError);
          finalData = partialData as CompanyData;
        }
      } else {
        // As a last resort, use the partial data we've collected
        finalData = partialData as CompanyData;
      }
    }

    sendStreamUpdate(connectionId, {
      status: 'complete',
      message: 'Company data retrieved successfully',
      progress: 100,
      data: finalData
    });

    return finalData;
  } catch (error) {
    console.error('Error in fetchCompanyData:', error);
    sendStreamUpdate(connectionId, {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      progress: 0,
      data: null
    });
    throw new Error(error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

function extractCompanyName(domain: string): string {
  // Improve company name extraction
  let name = domain.replace(/^www\./, '').split('.')[0];
  
  // Convert names like "company-name" to "Company Name"
  if (name.includes('-')) {
    name = name.split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  } else {
    // Capitalize the first letter
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }
  
  return name;
}