import { CompanyData, PerplexityResponse } from './types';
import { config } from './config/env';

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'FETCH_COMPANY_DATA') {
    fetchCompanyData(request.domain)
      .then(data => sendResponse({ data }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

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

    return {
      name: parsedContent.companyName,
      totalFunding: parsedContent.totalFunding,
      recentRound: {
        amount: parsedContent.recentRoundAmount,
        date: parsedContent.recentRoundDate,
        type: parsedContent.recentRoundType
      },
      notableInvestors: parsedContent.notableInvestors,
      sources: parsedContent.sources
    };
  } catch (error) {
    console.error('Error in fetchCompanyData:', error);
    throw new Error(error instanceof Error ? error.message : 'Unknown error occurred');
  }
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

function extractCompanyName(domain: string): string {
  return domain.replace('www.', '').split('.')[0];
}

