import "../global.css";
import React, { useState, useEffect } from "react";
import { Receipt } from "../../components/Receipt";
import { CompanyData } from "../../types/company";
import "../../types/chrome";
import { getChromeAPI } from "../../mocks/chrome";

export const Popup: React.FC = () => {
  const [receiptData, setReceiptData] = useState<Partial<CompanyData>>({});
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState<boolean>(false);

  useEffect(() => {
    const chromeAPI = getChromeAPI();
    const messageListener = (message: {type: string, data: any}) => {
      if (message.type === 'COMPANY_DATA_UPDATE') {
        const data = message.data;
        
        if ('error' in data) {
          setError(data.error);
          return;
        }
        
        if ('complete' in data) {
          setIsComplete(true);
          return;
        }
                
        if ('name' in data) {
          setReceiptData(prev => ({ ...prev, name: data.name }));
        }
        
        if ('totalFunding' in data) {
          setReceiptData(prev => ({ ...prev, totalFunding: data.totalFunding }));
        }
        
        if ('recentRound' in data) {
          setReceiptData(prev => ({
            ...prev,
            recentRound: data.recentRound
          }));
        }
        
        if ('notableInvestors' in data) {
          setReceiptData(prev => ({ ...prev, notableInvestors: data.notableInvestors }));
        }
        
        if ('sources' in data) {
          setReceiptData(prev => ({ ...prev, sources: data.sources }));
        }
      }
    };

    // Add listener for real chrome messages
    chromeAPI.runtime.onMessage.addListener(messageListener);

    // Add listener for mock messages in development
    if (typeof chrome === 'undefined') {
      const mockMessageListener = (e: CustomEvent) => messageListener(e.detail);
      window.addEventListener('mockChromeMessage', mockMessageListener as EventListener);
      return () => window.removeEventListener('mockChromeMessage', mockMessageListener as EventListener);
    }

    const getCurrentTab = async () => {
      try {
        const [tab] = await chromeAPI.tabs.query({ active: true, currentWindow: true });
        
        if (!tab.url) {
          throw new Error('No URL found');
        }
        
        const url = new URL(tab.url);
        const domain = url.hostname;
        
        chromeAPI.runtime.sendMessage(
          { type: 'FETCH_COMPANY_DATA', domain },
          () => {
            if (chromeAPI.runtime.lastError) {
              setError(chromeAPI.runtime.lastError.message || 'Chrome runtime error');
              return;
            }
          }
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      }
    };

    getCurrentTab();

  }, []);

  if (error) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="text-red-500 text-center">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white w-[400px] min-h-[500px] overflow-y-auto">
      <Receipt 
        data={receiptData} 
        loading={!isComplete} 
        animationSpeed={1000}
      />
    </div>
  );
};