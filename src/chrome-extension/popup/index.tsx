import "../global.css";
import { useState, useEffect, useRef } from "react";
import { CompanyName } from "../../components/CompanyName";
import { TotalFunding } from "../../components/TotalFunding";
import { RecentRound } from "../../components/RecentRound";
import { NotableInvestors } from "../../components/NotableInvestors";
import { Sources } from "../../components/Sources";
import { CompanyData } from "../../types";
import { StreamMessage } from "../../types";

export const Popup: React.FC = () => {
  const [companyData, setCompanyData] = useState<Partial<CompanyData> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
  
  // Store port connection in a ref to maintain it across renders
  const portRef = useRef<chrome.runtime.Port | null>(null);

  // Clean up the port connection when component unmounts
  useEffect(() => {
    return () => {
      if (portRef.current) {
        portRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    const getCurrentTab = async () => {
      try {
        console.log('Getting current tab...');
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.url) throw new Error('No URL found');
        
        const url = new URL(tab.url);
        const domain = url.hostname;

        // Try streaming API first
        if (chrome.runtime && chrome.runtime.connect) {
          try {
            console.log('Establishing port connection...');
            // Create a connection to the background script
            const port = chrome.runtime.connect({ name: 'company-data-stream' });
            portRef.current = port;
            
            // Set up message handler
            port.onMessage.addListener((message: StreamMessage) => {
              console.log('Received message:', message);
              switch (message.type) {
                case 'STREAM_START':
                  setStreamingStatus('Streaming started...');
                  break;
                
                case 'STREAM_CHUNK':
                  // You can optionally show the raw chunks for debugging
                  // setStreamingStatus(prev => `${prev}\n${message.chunk}`);
                  break;
                
                case 'STREAM_UPDATE':
                  if (message.data) {
                    setCompanyData(prevData => ({
                      ...prevData,
                      ...message.data
                    }));
                    setStreamingStatus('Receiving data...');
                  }
                  break;
                
                case 'STREAM_COMPLETE':
                  if (message.data) {
                    setCompanyData(message.data);
                  }
                  setLoading(false);
                  setStreamingStatus(null);
                  break;
                
                case 'STREAM_ERROR':
                  setError(message.error || 'An error occurred during streaming');
                  setLoading(false);
                  setStreamingStatus(null);
                  break;
              }
            });
            
            // Request data through the port
            console.log('Sending FETCH_COMPANY_DATA message...');
            port.postMessage({ type: 'FETCH_COMPANY_DATA', domain });
            
            // Handle disconnect
            port.onDisconnect.addListener(() => {
              const error = chrome.runtime.lastError;
              if (error) {
                console.error('Port disconnected due to error:', error);
                setError('Connection to background script lost');
                setLoading(false);
                fallbackToNonStreaming(domain);
              }
            });
          } catch (err) {
            console.error('Streaming connection failed:', err);
            fallbackToNonStreaming(domain);
          }
        } else {
          // Streaming not supported, fall back to non-streaming
          fallbackToNonStreaming(domain);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        setLoading(false);
      }
    };

    // Fallback method using the old message passing
    const fallbackToNonStreaming = (domain: string) => {
      setStreamingStatus('Falling back to standard request...');
      
      // Send message to background script
      chrome.runtime.sendMessage(
        { type: 'FETCH_COMPANY_DATA', domain },
        (response) => {
          if (response.error) {
            setError(response.error);
          } else {
            setCompanyData(response.data);
          }
          setLoading(false);
          setStreamingStatus(null);
        }
      );
    };

    getCurrentTab();
  }, []);

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse">Loading company data...</div>
        {streamingStatus && (
          <div className="text-sm text-gray-500 mt-2">{streamingStatus}</div>
        )}
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-red-500">Error: {error}</div>;
  }

  if (!companyData) {
    return <div className="p-4">No company data found</div>;
  }

  // Check if we have complete data
  const isComplete = 
    companyData.name && 
    companyData.totalFunding && 
    companyData.recentRound && 
    companyData.notableInvestors && 
    companyData.sources;

  return (
    <div className="bg-white w-[400px] h-[500px] overflow-y-auto">
      <div className="flex flex-col gap-6 p-6">
        {companyData.name && <CompanyName name={companyData.name} />}
        
        {companyData.totalFunding && (
          <TotalFunding amount={companyData.totalFunding} />
        )}
        
        {companyData.recentRound && (
          <RecentRound data={companyData.recentRound} />
        )}
        
        {companyData.notableInvestors && (
          <NotableInvestors investors={companyData.notableInvestors} />
        )}
        
        {companyData.sources && (
          <Sources sources={companyData.sources} />
        )}
        
        {!isComplete && loading && (
          <div className="text-center text-sm text-gray-500">
            {streamingStatus || "Loading remaining data..."}
          </div>
        )}
      </div>
    </div>
  );
};

