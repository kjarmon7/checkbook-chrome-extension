import "../global.css";
import { useState, useEffect } from "react";
import { CompanyName } from "../../components/CompanyName";
import { TotalFunding } from "../../components/TotalFunding";
import { RecentRound } from "../../components/RecentRound";
import { NotableInvestors } from "../../components/NotableInvestors";
import { Sources } from "../../components/Sources";
import { RecentRoundData } from "../../types";

export const Popup: React.FC = () => {
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [totalFunding, setTotalFunding] = useState<string | null>(null);
  const [recentRound, setRecentRound] = useState<RecentRoundData | null>(null);
  const [notableInvestors, setNotableInvestors] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addDebugLog = (message: string) => {
    console.log(message);
    setDebugLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    addDebugLog("Popup component mounted");

    const messageListener = (message: {type: string, data: any}) => {
      addDebugLog(`Received message of type: ${message.type}`);
      
      if (message.type === 'COMPANY_DATA_UPDATE') {
        addDebugLog(`Processing COMPANY_DATA_UPDATE message`);
        const data = message.data;
        
        if ('error' in data) {
          addDebugLog(`Received error: ${data.error}`);
          setError(data.error);
          setLoading(false);
          return;
        }
        
        if ('complete' in data) {
          addDebugLog(`Received completion signal`);
          setLoading(false);
          setIsComplete(true);
          return;
        }
        
        addDebugLog(`Received data update: ${JSON.stringify(data)}`);
        
        if ('name' in data) {
          addDebugLog(`Updating company name to: ${data.name}`);
          setCompanyName(data.name);
        }
        
        if ('totalFunding' in data) {
          addDebugLog(`Updating total funding to: ${data.totalFunding}`);
          setTotalFunding(data.totalFunding);
        }
        
        if ('recentRound' in data) {
          addDebugLog(`Updating recent round: ${JSON.stringify(data.recentRound)}`);
          setRecentRound(prev => ({ ...prev, ...data.recentRound }));
        }
        
        if ('notableInvestors' in data) {
          addDebugLog(`Updating notable investors: ${data.notableInvestors.join(', ')}`);
          setNotableInvestors(data.notableInvestors);
        }
        
        if ('sources' in data) {
          addDebugLog(`Updating sources: ${data.sources.join(', ')}`);
          setSources(data.sources);
        }
        
        if ('name' in data || 'totalFunding' in data || 'recentRound' in data) {
          addDebugLog(`Turning off initial loading state`);
          setLoading(false);
        }
      }
    };

    addDebugLog("Adding message listener");
    chrome.runtime.onMessage.addListener(messageListener);

    const getCurrentTab = async () => {
      try {
        addDebugLog("Getting current tab information");
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab.url) {
          addDebugLog("No URL found in tab");
          throw new Error('No URL found');
        }
        
        const url = new URL(tab.url);
        const domain = url.hostname;
        
        addDebugLog(`Got domain: ${domain}`);

        addDebugLog("Sending FETCH_COMPANY_DATA message to background script");
        chrome.runtime.sendMessage(
          { type: 'FETCH_COMPANY_DATA', domain },
          (response) => {
            if (chrome.runtime.lastError) {
              addDebugLog(`Chrome runtime error: ${chrome.runtime.lastError.message}`);
              setError(chrome.runtime.lastError.message || 'Chrome runtime error');
              setLoading(false);
              return;
            }
            
            addDebugLog(`Received initial response: ${JSON.stringify(response)}`);
          }
        );
      } catch (err) {
        addDebugLog(`Error in getCurrentTab: ${err instanceof Error ? err.message : String(err)}`);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        setLoading(false);
      }
    };

    addDebugLog("Calling getCurrentTab function");
    getCurrentTab();

    addDebugLog("Setting up cleanup function");
    return () => {
      addDebugLog("Component unmounting, removing message listener");
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  const renderContent = () => {
    if (error) {
      return (
        <div className="p-4">
          <div className="text-red-500 text-center font-bold mb-4">Error: {error}</div>
          <div className="mt-4 border-t pt-4">
            <h3 className="font-bold">Debug Logs:</h3>
            <div className="mt-2 text-xs bg-gray-100 p-2 max-h-60 overflow-y-auto">
              {debugLogs.map((log, index) => (
                <div key={index} className="mb-1">{log}</div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-6 p-6">
        {companyName && <CompanyName name={companyName} />}
        
        {totalFunding ? (
          <TotalFunding amount={totalFunding} />
        ) : (
          !isComplete && <div className="text-center animate-pulse">Retrieving funding info...</div>
        )}
        
        {recentRound ? (
          <RecentRound data={recentRound} />
        ) : (
          !isComplete && <div className="text-center animate-pulse">Finding recent rounds...</div>
        )}
        
        {notableInvestors.length > 0 ? (
          <NotableInvestors investors={notableInvestors} />
        ) : (
          !isComplete && <div className="text-center animate-pulse">Identifying investors...</div>
        )}
        
        {sources.length > 0 ? (
          <Sources sources={sources} />
        ) : (
          !isComplete && <div className="text-center animate-pulse">Locating sources...</div>
        )}
        
        {loading && !companyName && (
          <div className="text-center font-bold animate-pulse">
            Loading company data...
          </div>
        )}
        
        <div className="mt-4 border-t pt-4">
          <h3 className="font-bold text-sm">Debug Information:</h3>
          <div className="grid grid-cols-2 gap-2 text-xs mt-2">
            <div>Loading: {loading ? "Yes" : "No"}</div>
            <div>Complete: {isComplete ? "Yes" : "No"}</div>
            <div>Has Error: {error ? "Yes" : "No"}</div>
            <div>Has Name: {companyName ? "Yes" : "No"}</div>
            <div>Has Funding: {totalFunding ? "Yes" : "No"}</div>
            <div>Has Round: {recentRound ? "Yes" : "No"}</div>
            <div>Investors: {notableInvestors.length}</div>
            <div>Sources: {sources.length}</div>
          </div>
          
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-blue-500">Show Debug Logs</summary>
            <div className="mt-2 text-xs bg-gray-100 p-2 max-h-60 overflow-y-auto">
              {debugLogs.map((log, index) => (
                <div key={index} className="mb-1">{log}</div>
              ))}
            </div>
          </details>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white w-[400px] min-h-[500px] overflow-y-auto">
      {renderContent()}
    </div>
  );
};