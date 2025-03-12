import { CompanyData } from "./company";

export interface ChromeMessage {
    type: 'FETCH_COMPANY_DATA';
    domain: string;
  }
  
  export interface ChromeMessageResponse {
    data?: CompanyData;
    error?: string;
  }

  export type StreamMessageType = 
  | 'STREAM_START'
  | 'STREAM_CHUNK'
  | 'STREAM_UPDATE'
  | 'STREAM_COMPLETE'
  | 'STREAM_ERROR';

  export interface StreamMessage {
    type: StreamMessageType;
    message?: string;
    chunk?: string;
    data?: Partial<CompanyData>;
    error?: string; 
  }

  export interface ChromeMessage {
    type: 'FETCH_COMPANY_DATA';
    domain: string;
  }