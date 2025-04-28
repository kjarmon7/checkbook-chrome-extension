import "../global.css";
import { useState, useEffect } from "react";
import { Receipt } from "../../components/Receipt";
import { CompanyData } from "../../types/company";
import "../../types/chrome";
import { getChromeAPI } from "../../mocks/chrome";
import { getStorageKeyForDomain, isDataStale } from "../../utils/storage";

export const Popup = () => {
  const [receiptData, setReceiptData] = useState<Partial<CompanyData>>({});
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [isCachedData, setIsCachedData] = useState<boolean>(false);


  useEffect(() => {
    console.log('Initializing Popup component');
    const chromeAPI = getChromeAPI();
    
    const getCurrentTab = async () => {
      try {
        const [tab] = await chromeAPI.tabs.query({ active: true, currentWindow: true });
        
        if (!tab?.url) {
          throw new Error('No URL found');
        }
        
        const url = new URL(tab.url);
        const domain = url.hostname;
        const storageKey = getStorageKeyForDomain(domain);
        
        chromeAPI.storage.local.get([storageKey], async (result) => {
          const cachedData = result[storageKey];
          
          if (cachedData && !isDataStale(cachedData.lastUpdated)) {
            console.log('Using cached data:', cachedData);
            setReceiptData(cachedData);
            setIsComplete(true);
            setIsCachedData(true);
            return;
          }
          
          setIsCachedData(false);
          chromeAPI.runtime.sendMessage(
            { type: 'FETCH_COMPANY_DATA', domain },
            () => {
              if (chromeAPI.runtime.lastError) {
                console.error('Chrome runtime error:', chromeAPI.runtime.lastError);
                setError(chromeAPI.runtime.lastError.message || 'Chrome runtime error');
              }
            }
          );
        });
      } catch (err) {
        console.error('Error in getCurrentTab:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      }
    };

    getCurrentTab();

    const messageListener = (message: {type: string, data: any}) => {
      console.log('Received message:', message);
      if (message.type === 'COMPANY_DATA_UPDATE') {
        const data = message.data;
        
        if ('error' in data) {
          setError(data.error);
          return;
        }
        
        // Update the UI with the new data immediately
        setReceiptData(prev => {
          const newData = { ...prev };
          
          if ('name' in data) {
            newData.name = data.name;
          }
          
          if ('totalFunding' in data) {
            newData.totalFunding = data.totalFunding;
          }
          
          if ('recentRound' in data) {
            newData.recentRound = data.recentRound;
          }
          
          if ('notableInvestors' in data) {
            newData.notableInvestors = data.notableInvestors;
          }
          
          if ('sources' in data) {
            newData.sources = data.sources;
          }
          
          console.log('Updating receipt data to:', newData);
          return newData;
        });
        
        // Set complete after updating the data
        if ('complete' in data) {
          setIsComplete(true);
        }
      }
    };

    try {
      chromeAPI.runtime.onMessage.addListener(messageListener);
      console.log('Added message listener');

      return () => {
        chromeAPI.runtime.onMessage.removeListener(messageListener);
        console.log('Removed message listener');
      };
    } catch (err) {
      console.error('Error setting up message listener:', err);
    }
  }, []);

  const handleSearch = async () => {
    // Reset states
    setReceiptData({});
    setIsComplete(false);
    setIsCachedData(false);
    
    const chromeAPI = getChromeAPI();
    const [tab] = await chromeAPI.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const url = new URL(tab.url);
      const domain = url.hostname;
      console.log('Forcing update for domain:', domain);
      chromeAPI.runtime.sendMessage(
        { 
          type: 'FETCH_COMPANY_DATA', 
          domain,
          forceUpdate: true
        },
        () => {
          if (chromeAPI.runtime.lastError) {
            setError(chromeAPI.runtime.lastError.message || 'Chrome runtime error');
          }
        }
      );
    }
  };

  if (error) {
    return (
      <div className="bg-white w-[400px] min-h-[500px] overflow-y-scroll scrollbar-none">
        <div className="text-red-500 text-center p-4">
          Error: {error}
        </div>
        <Receipt 
          data={receiptData} 
          loading={!isComplete} 
          animationSpeed={1000}
          skipAnimation={isCachedData}
          onSearch={handleSearch}
        />
      </div>
    );
  }

  return (
    <div className="bg-white w-[400px] min-h-[500px] overflow-y-scroll scrollbar-none">
      <Receipt 
        data={receiptData} 
        loading={!isComplete} 
        animationSpeed={1000}
        skipAnimation={isCachedData}
        onSearch={handleSearch}
      />
    </div>
  );
};