import "../global.css";
import { useState, useEffect } from "react";
import { CompanyName } from "../../components/CompanyName";
import { TotalFunding } from "../../components/TotalFunding";
import { RecentRound } from "../../components/RecentRound";
import { NotableInvestors } from "../../components/NotableInvestors";
import { Sources } from "../../components/Sources";
import { CompanyData, StreamingState } from "../../types";
import { LoadingIndicator } from "../../components/LoadingIndicator";

export const Popup: React.FC = () => {
  const [streamingState, setStreamingState] = useState<StreamingState>({
    status: 'idle',
    message: 'Ready to fetch data',
    progress: 0,
    data: null
  });
  const [connectionId, setConnectionId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Generate a unique connection ID for this popup instance
    const newConnectionId = `popup-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    setConnectionId(newConnectionId);

    // Connect to the background script
    const port = chrome.runtime.connect({ name: `company-data-stream:${newConnectionId}` });
    
    // Listen for stream updates
    port.onMessage.addListener((message) => {
      if (message.type === 'STREAM_UPDATE') {
        console.log('Stream update received:', message);
        setStreamingState(message.state);
        
        // Update error state if there's an error
        if (message.state.status === 'error') {
          setError(message.state.message);
        } else {
          setError(null);
        }
      }
    });
    
    // Clean up connection when component unmounts
    return () => {
      port.disconnect();
    };
  }, []);

  useEffect(() => {
    // Only fetch data if we have a valid connection ID
    if (connectionId) {
      const getCurrentTab = async () => {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab.url) throw new Error('No URL found');
          
          const url = new URL(tab.url);
          const domain = url.hostname;

          // Send message to background script to start fetching
          chrome.runtime.sendMessage(
            { 
              type: 'FETCH_COMPANY_DATA', 
              domain,
              connectionId 
            },
            (response) => {
              if (response?.error) {
                setError(response.error);
              }
            }
          );
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unknown error occurred');
        }
      };

      getCurrentTab();
    }
  }, [connectionId]);

  // Determine what to render based on streaming state
  const renderContent = () => {
    const { status, message, progress, data } = streamingState;
    
    if (error) {
      return <div className="p-4 text-red-500">Error: {error}</div>;
    }

    if (status === 'idle' || status === 'loading' || status === 'streaming') {
      return (
        <div className="flex flex-col items-center justify-center p-6 gap-4">
          <LoadingIndicator progress={progress} />
          <div className="text-sm text-center">{message}</div>
          {data && renderPartialData(data)}
        </div>
      );
    }
    
    if (status === 'complete' && data) {
      return renderCompanyData(data);
    }
    
    return <div className="p-4">Waiting for data...</div>;
  };

  // Render partial data during streaming
  const renderPartialData = (data: CompanyData) => {
    return (
      <div className="w-full mt-4 animate-pulse">
        {data.name && <CompanyName name={data.name} />}
        
        {data.totalFunding && (
          <div className="mt-4">
            <TotalFunding amount={data.totalFunding} />
          </div>
        )}
        
        {data.recentRound.type && (
          <div className="mt-4">
            <RecentRound data={data.recentRound} />
          </div>
        )}
        
        {data.notableInvestors.length > 0 && (
          <div className="mt-4">
            <NotableInvestors investors={data.notableInvestors} />
          </div>
        )}
        
        {data.sources.length > 0 && (
          <div className="mt-4">
            <Sources sources={data.sources} />
          </div>
        )}
      </div>
    );
  };

  // Render complete company data
  const renderCompanyData = (data: CompanyData) => {
    return (
      <div className="flex flex-col gap-6 p-6">
        <CompanyName name={data.name} />
        <TotalFunding amount={data.totalFunding} />
        <RecentRound data={data.recentRound} />
        <NotableInvestors investors={data.notableInvestors} />
        <Sources sources={data.sources} />
      </div>
    );
  };

  return (
    <div className="bg-white w-[400px] h-[500px] overflow-y-auto">
      {renderContent()}
    </div>
  );
};