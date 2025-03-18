import { CompanyData } from './types';
import { config } from './config/env';

// Listen for streaming responses
chrome.runtime.onConnect.addListener((port) => {
  console.log('Connection established with port name:', port.name);
  if (port.name === 'streaming-response') {
    port.onMessage.addListener((request) => {
      console.log('Received message:', request.type);
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
    
    console.log('Making API request to Perplexity...');
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
      console.error('API response not OK:', response.status, errorText);
      port.postMessage({ type: 'ERROR', error: `Failed to fetch company data: ${response.status} ${errorText}` });
      return;
    }
    
    console.log('API response received successfully');

    // Read the stream
    const reader = response.body?.getReader();
    if (!reader) {
      port.postMessage({ type: 'ERROR', error: 'Stream reader not available' });
      return;
    }

    // This will store the entire accumulated content for parsing
    let accumulatedContent = '';

    
    // This is for displaying progress during streaming
    const companyData: Partial<CompanyData> = {
      notableInvestors: [],
      sources: []
    };
    
    // Process the stream
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('Stream complete, processing final data');
        // Final processing of complete data
        const completeParsedData = parseCompleteContent(accumulatedContent);
        
        // Send the complete result
        if (completeParsedData && Object.keys(completeParsedData).length > 0) {
          console.log('Sending COMPLETE message with complete parsed data:', completeParsedData);
          port.postMessage({ 
            type: 'COMPLETE', 
            data: completeParsedData as CompanyData 
          });
        } else {
          console.log('Complete parsing failed, falling back to accumulated data:', companyData);
          // Fallback to the accumulated partial data if we couldn't parse complete data
          port.postMessage({ 
            type: 'COMPLETE', 
            data: companyData as CompanyData 
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
              
              // Process the new content to extract any data - for streaming display only
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

// This function parses the complete content after streaming is done
// to ensure we have the most accurate data
function parseCompleteContent(content: string): Partial<CompanyData> | null {
  console.log('Parsing complete content with length:', content.length);
  try {
    // Initialize data object
    const data: Partial<CompanyData> = {};
    
    // Process each line to extract data
    const lines = content.split('\n').filter(line => line.trim() !== '');
    console.log(`Found ${lines.length} non-empty lines in complete content`);
    
    // Extract company name
    const companyNameLine = lines.find(line => line.startsWith('COMPANY_NAME:'));
    if (companyNameLine) {
      data.name = companyNameLine.slice('COMPANY_NAME:'.length).trim();
    }
    
    // Extract total funding
    const totalFundingLine = lines.find(line => line.startsWith('TOTAL_FUNDING:'));
    if (totalFundingLine) {
      data.totalFunding = totalFundingLine.slice('TOTAL_FUNDING:'.length).trim();
    }
    
    // Extract recent round data
    const recentRound: { amount: string; date: string; type: string } = { 
      amount: '', 
      date: '', 
      type: '' 
    };
    
    const recentRoundAmountLine = lines.find(line => line.startsWith('RECENT_ROUND_AMOUNT:'));
    if (recentRoundAmountLine) {
      recentRound.amount = recentRoundAmountLine.slice('RECENT_ROUND_AMOUNT:'.length).trim();
    }
    
    const recentRoundDateLine = lines.find(line => line.startsWith('RECENT_ROUND_DATE:'));
    if (recentRoundDateLine) {
      recentRound.date = recentRoundDateLine.slice('RECENT_ROUND_DATE:'.length).trim();
    }
    
    const recentRoundTypeLine = lines.find(line => line.startsWith('RECENT_ROUND_TYPE:'));
    if (recentRoundTypeLine) {
      recentRound.type = recentRoundTypeLine.slice('RECENT_ROUND_TYPE:'.length).trim();
    }
    
    data.recentRound = recentRound;
    
    // Extract notable investors
    const notableInvestorsLine = lines.find(line => line.startsWith('NOTABLE_INVESTORS:'));
    if (notableInvestorsLine) {
      const investorsText = notableInvestorsLine.slice('NOTABLE_INVESTORS:'.length).trim();
      data.notableInvestors = investorsText
        .split(/,\s*|\s+and\s+/)
        .map(investor => investor.trim())
        .filter(investor => investor !== '');
    } else {
      data.notableInvestors = [];
    }
    
    // Extract sources
    const sourcesLine = lines.find(line => line.startsWith('SOURCES:'));
    if (sourcesLine) {
      const sourcesText = sourcesLine.slice('SOURCES:'.length).trim();
      data.sources = sourcesText
        .split(/,\s*/)
        .map(source => source.trim())
        .filter(source => source !== '');
    } else {
      data.sources = [];
    }
    
    console.log('Complete parsed data:', data);
    return data;
  } catch (error) {
    console.error('Error parsing complete content:', error);
    return null;
  }
}

// Process the line-based content to extract structured data for streaming updates
function processLineBasedContent(content: string, companyData: Partial<CompanyData>, port: chrome.runtime.Port) {
  // Process full lines only
  const lines = content.split('\n').filter(line => line.trim() !== '');
  let dataUpdated = false;
  
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
        // Simple split by commas and 'and'
        const newInvestors = investorsText
          .split(/,\s*|\s+and\s+/)
          .map(investor => investor.trim())
          .filter(investor => investor !== '');
        
        // Only update if we have new investors
        if (newInvestors.length > 0) {
          // Just replace the entire array - no deduplication
          companyData.notableInvestors = newInvestors;
          dataUpdated = true;
        }
      }
    }
    else if (line.startsWith('SOURCES:')) {
      const sourcesText = line.slice('SOURCES:'.length).trim();
      
      if (sourcesText) {
        // Simple split by commas
        const newSources = sourcesText
          .split(/,\s*/)
          .map(source => source.trim())
          .filter(source => source !== '');
        
        // Only update if we have new sources
        if (newSources.length > 0) {
          // Just replace the entire array - no deduplication
          companyData.sources = newSources;
          dataUpdated = true;
        }
      }
    }
  }
  
  // If we've updated the data, send it to the popup
  if (dataUpdated) {
    console.log('Sending PARTIAL update with data:', JSON.stringify(companyData, null, 2));
    port.postMessage({ 
      type: 'PARTIAL', 
      data: companyData 
    });
  }
}

function extractCompanyName(domain: string): string {
  return domain.replace('www.', '').split('.')[0];
}