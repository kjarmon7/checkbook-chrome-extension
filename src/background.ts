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
            
            Format the response as a JSON object with these exact keys:
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
        console.log('API response not ok:', response.status, errorText)
        throw new Error('Failed to fetch company data: ${response.status} ${errorText}' );
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
    let parsedContent: PerplexityResponse;
    try {
      parsedContent = JSON.parse(responseContent);
      console.log('Parsed content:', parsedContent);
    } catch (error) {
      console.error('Failed to parse Perplexity response:', error);
      console.error('Raw content that failed to parse:', responseContent);
      throw new Error('Invalid response format from API');
    }

    // Log validation results
    const validationResult = validatePerplexityResponse(parsedContent);
    console.log('Validation result:', validationResult);
    if (!validationResult) {
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

