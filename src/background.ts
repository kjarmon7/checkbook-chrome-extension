import { ChromeMessage, CompanyData, PerplexityResponse } from './types';
import { config } from './config/env';

// Listen for connection from popup
chrome.runtime.onConnect.addListener((port: chrome.runtime.Port ) => {
  console.log('Connection received with name:', port.name);

  if (port.name === 'company-data-stream') {
    console.log('Setting up message listener for streaming connection');
    
    // Listen for messages from this port
    port.onMessage.addListener((message: ChromeMessage) => {
      console.log('Received message on port:', message);
      if (message.type === 'FETCH_COMPANY_DATA') {
        console.log('Starting fetchCompanyDataStreaming...');
        fetchCompanyDataStreaming(message.domain, port);
      }
    });
      
    // Remove the port when disconnected
    port.onDisconnect.addListener(() => {
      console.log('Port disconnected for tab');
    });
  }
});

  // Also keep the old message handler for backward compatibility
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'FETCH_COMPANY_DATA') {
    fetchCompanyData(request.domain)
      .then(data => sendResponse({ data }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

async function fetchCompanyDataStreaming(domain: string, port: chrome.runtime.Port): Promise<void> {
  console.log('Streaming company data for domain:', domain);
  try {
    const companyName = extractCompanyName(domain);
    console.log('Extracted company name:', companyName);
    
    // Notify the client that streaming has started
    port.postMessage({ type: 'STREAM_START', message: 'Fetching company data...' });
    console.log('Send STREAM_START message');

    console.log('Making API request...');
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
          content: "You are a helpful assistant that provides company funding information. Please respond with structured information about funding rounds, investors, and sources. Format your response as a JSON object."
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
        }],
        stream: true  // Enable streaming
      })
    });

    console.log('API response received, status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('API response not ok:', response.status, errorText);
      port.postMessage({ 
        type: 'STREAM_ERROR', 
        error: `Failed to fetch company data: ${response.status} ${errorText}` 
      });
      return;
    }

    // Process the stream
    const reader = response.body?.getReader();
    if (!reader) {
      console.error('Could not create stream reader');
      port.postMessage({ 
        type: 'STREAM_ERROR', 
        error: 'Stream reader could not be created' 
      });
      return;
    }

    console.log('Stream reader created, starting to reach chunks...');
    // To accumulate the JSON response
    let accumulatedJSON = '';
    
    // Process the stream
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('Stream reading completed');
        break;
      }

      // Convert the chunk to text
      const chunk = new TextDecoder().decode(value);
      console.log('Received chunk of length:', chunk.length);
      console.log('Chunk sample:', chunk.substring(0, 100));
      
      // Send the raw chunk to the client
      port.postMessage({ 
        type: 'STREAM_CHUNK', 
        chunk 
      });

      // Process each line (Perplexity sends "data: {json}" lines)
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          // Skip the "data: " prefix
          const data = line.substring(6);
          
          // Skip "[DONE]" marker
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            // Extract the content, if available
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              accumulatedJSON += content;
              
              // Attempt to parse the accumulated JSON as we receive it
              try {
                // Check if we have a complete JSON object by looking for opening and closing braces
                if (accumulatedJSON.trim().startsWith('{') && accumulatedJSON.trim().endsWith('}')) {
                  const parsedObject = JSON.parse(accumulatedJSON);
                  
                  // If we have a parseable object, validate it
                  if (validatePartialPerplexityResponse(parsedObject)) {
                    // Send progressive updates to the client
                    port.postMessage({ 
                      type: 'STREAM_UPDATE', 
                      data: transformToCompanyData(parsedObject)
                    });
                  }
                }
              } catch (parseError) {
                // It's normal that we can't parse until we have the complete JSON
                // Just continue accumulating
              }
            }
          } catch (e) {
            console.error('Error parsing JSON chunk:', e);
          }
        }
      }
    }

    // Final processing once stream is complete
    try {
      // Clean up the accumulated JSON (remove any markdown formatting if present)
      let finalJSON = accumulatedJSON;
      if (finalJSON.includes('```json')) {
        const match = finalJSON.match(/```json\n([\s\S]+)\n```/);
        if (match && match[1]) {
          finalJSON = match[1].trim();
        }
      }
      
      // Try to find a valid JSON object
      if (!finalJSON.startsWith('{')) {
        const match = finalJSON.match(/{[\s\S]+}/);
        if (match) {
          finalJSON = match[0];
        }
      }
      
      const parsedContent = JSON.parse(finalJSON);
      
      if (!validatePerplexityResponse(parsedContent)) {
        throw new Error('Invalid or incomplete data received');
      }
      
      const companyData = transformToCompanyData(parsedContent);
      
      // Send the final complete data
      port.postMessage({ 
        type: 'STREAM_COMPLETE', 
        data: companyData 
      });
      
    } catch (error) {
      console.error('Error processing final JSON:', error);
      port.postMessage({ 
        type: 'STREAM_ERROR', 
        error: error instanceof Error ? error.message : 'Failed to process response' 
      });
    }
    
  } catch (error) {
    console.error('Error in fetchCompanyDataStreaming:', error);
    port.postMessage({ 
      type: 'STREAM_ERROR', 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}

// Original non-streaming function preserved for backward compatibility
async function fetchCompanyData(domain: string): Promise<CompanyData> {
  console.log('Fetching company data for domain:', domain);
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
          content: "You are a helpful assistant that provides company funding information. Please respond with structured information about funding rounds, investors, and sources. Format your response as a JSON object."
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

    console.log('API request sent, awaiting response...');
    if (!response.ok) {
        const errorText = await response.text();
        console.log('API response not ok:', response.status, errorText)
        throw new Error(`Failed to fetch company data: ${response.status} ${errorText}`);
    }

    const perplexityResponse = await response.json();
    console.log('Raw API Response:', perplexityResponse);

    if (!perplexityResponse.choices?.[0]?.message?.content) {
        console.error('Unexpected API response structure:', perplexityResponse);
        throw new Error ('Unexpected API response structure');
    }
    
    const responseContent = perplexityResponse.choices[0].message.content;
    console.log('Response content:', responseContent);

    // The Perplexity response will be in perplexityResponse.choices[0].message.content
    // This contains a string that should be valid JSON
    let parsedContent: PerplexityResponse | null = null;
    let parseSuccess = false;

    try {
      parsedContent = JSON.parse(responseContent);
      parseSuccess = true;
      console.log('Direct parsing suceeded!');
    } catch (error) {
      console.error('Failed to parse response directly:', error);
      console.log('Attempting to extract JSON from markdown or text...');

      //Try to extract JSON between code block markers
      let jsonMatch = responseContent.match(/```json\n([\s\S]+)\n```/);

      if (jsonMatch && jsonMatch[1]) {
        // Found JSON in code block
        const extractedJson = jsonMatch[1].trim();
        console.log('Extracted JSON from code block:', extractedJson);  

        try {
          parsedContent = JSON.parse(extractedJson);
          parseSuccess = true;
          console.log('Successfully parsed extracted JSON from code block'); 
        } catch (extractError) {
          console.error('Failed to parse JSON from code block:', extractError);
        }
      }
          
      if (!parseSuccess) {
        // Try to find anything that looks like a JSON object with curly braces
        jsonMatch = responseContent.match(/{([\s\S]+)}/);
        if (jsonMatch) { 
          try { 
            console.log('Attempting to parse JSON with just braces:', jsonMatch[0]);
            parsedContent = JSON.parse(jsonMatch[0]);
            parseSuccess = true;
            console.log('Successfully parsed JSON with braces extraction');
          } catch (lastError) {
            console.error('All parsing attempts failed:', lastError);
            throw new Error('Invalid response format from API - exhausted all parsing options');
          }
        } else {
          throw new Error('Invalid response format from API - no valid JSON structure found');
        }
      }
    }

    if (!parseSuccess || !parsedContent) {
      throw new Error('Failed to parse response from API');
    }

    // Log validation results
    const validationResult = validatePerplexityResponse(parsedContent);
    console.log('Validation result:', validationResult);
    if (!validationResult) {
      console.error('Failed validation. Missing or invalid fields:', {
        hasCompanyName: typeof parsedContent.companyName === 'string',
        hasTotalFunding: typeof parsedContent.totalFunding === 'string',
        hasRecentRoundAmount: typeof parsedContent.recentRoundAmount === 'string',
        hasRecentRoundDate: typeof parsedContent.recentRoundDate === 'string',
        hasRecentRoundType: typeof parsedContent.recentRoundType === 'string',
        hasNotableInvestors: Array.isArray(parsedContent.notableInvestors),
        hasSources: Array.isArray(parsedContent.sources)
      });
      throw new Error('Invalid or incomplete data received');
    }

    return transformToCompanyData(parsedContent);
  } catch (error) {
    console.error('Error in fetchCompanyData:', error);
    throw new Error(error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

// Helper to transform API response to CompanyData
function transformToCompanyData(parsedContent: PerplexityResponse): CompanyData {
  return {
    name: parsedContent.companyName,
    totalFunding: parsedContent.totalFunding,
    recentRound: {
      amount: parsedContent.recentRoundAmount,
      date: parsedContent.recentRoundDate,
      type: parsedContent.recentRoundType
    },
    notableInvestors: parsedContent.notableInvestors || [],
    sources: parsedContent.sources || []
  };
}

function validatePerplexityResponse(response: any): response is PerplexityResponse {
  return (
    typeof response === 'object' &&
    typeof response.companyName === 'string' &&
    typeof response.totalFunding === 'string' &&
    typeof response.recentRoundAmount === 'string' &&
    typeof response.recentRoundDate === 'string' &&
    typeof response.recentRoundType === 'string' &&
    Array.isArray(response.notableInvestors) &&
    Array.isArray(response.sources)
  );
}

// For streaming, we need to validate partial responses
function validatePartialPerplexityResponse(response: any): boolean {
  return (
    typeof response === 'object' &&
    (!('companyName' in response) || typeof response.companyName === 'string') &&
    (!('totalFunding' in response) || typeof response.totalFunding === 'string') &&
    (!('recentRoundAmount' in response) || typeof response.recentRoundAmount === 'string') &&
    (!('recentRoundDate' in response) || typeof response.recentRoundDate === 'string') &&
    (!('recentRoundType' in response) || typeof response.recentRoundType === 'string') &&
    (!('notableInvestors' in response) || Array.isArray(response.notableInvestors)) &&
    (!('sources' in response) || Array.isArray(response.sources))
  );
}

function extractCompanyName(domain: string): string {
  return domain.replace('www.', '').split('.')[0];
}

