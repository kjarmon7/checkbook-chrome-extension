import { CompanyData } from "./company";

export interface StreamingRequest {
  type: 'FETCH_COMPANY_DATA';
  domain: string;
}

export type StreamingResponse = 
  | { type: 'CHUNK'; content: string }
  | { type: 'PARTIAL'; data: Partial<CompanyData> }
  | { type: 'COMPLETE'; data: CompanyData }
  | { type: 'ERROR'; error: string };