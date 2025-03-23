export interface ChromeMessage {
  type: 'FETCH_COMPANY_DATA';
  domain: string;
}

export interface ChromeMessageResponse {
  status?: string;
  data?: any;
  error?: string;
}

