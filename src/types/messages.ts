import { CompanyData } from "./company";

export interface ChromeMessage {
    type: 'FETCH_COMPANY_DATA';
    domain: string;
  }
  
  export interface ChromeMessageResponse {
    data?: CompanyData;
    error?: string;
  }