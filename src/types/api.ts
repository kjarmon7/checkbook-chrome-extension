export interface PerplexityResponse {
    companyName: string;
    totalFunding: string;
    recentRoundAmount: string;
    recentRoundDate: string;
    recentRoundType: string;
    notableInvestors: string[];
    sources: string[];
  }
  
  export interface APIError {
    message: string;
    status?: number;
  }