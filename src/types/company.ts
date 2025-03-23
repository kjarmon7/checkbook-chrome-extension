export interface CompanyData {
    name: string;
    totalFunding: string;
    recentRound: RecentRoundData;
    notableInvestors: string[];
    sources: string[];
  }

  export interface RecentRoundData {
    amount?: string;
    date?: string;
    type?: string;
  }