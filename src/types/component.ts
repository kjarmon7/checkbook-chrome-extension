import { RecentRoundData } from "../../src/types/company";

export interface CompanyNameProps {
    name: string;
  }
  
  export interface TotalFundingProps {
    amount: string;
  }
  
  export interface RecentRoundProps {
    data: RecentRoundData;
  }
  
  export interface NotableInvestorsProps {
    investors: string[];
  }
  
  export interface SourcesProps {
    sources: string[];
  }