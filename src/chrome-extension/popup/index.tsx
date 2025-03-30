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
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState<boolean>(false);

  useEffect(() => {
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
          setCompanyName(data.name);
        }
        
        if ('totalFunding' in data) {
          setTotalFunding(data.totalFunding);
        }
        
        if ('recentRound' in data) {
          setRecentRound(prev => ({ ...prev, ...data.recentRound }));
        }
        
        if ('notableInvestors' in data) {
          setNotableInvestors(data.notableInvestors);
        }
        
        if ('sources' in data) {
          setSources(data.sources);
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    const getCurrentTab = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab.url) {
          throw new Error('No URL found');
        }
        
        const url = new URL(tab.url);
        const domain = url.hostname;
        
        chrome.runtime.sendMessage(
          { type: 'FETCH_COMPANY_DATA', domain },
          () => {
            if (chrome.runtime.lastError) {
              setError(chrome.runtime.lastError.message || 'Chrome runtime error');
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

  const renderContent = () => {
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
      <div className="flex flex-col gap-6 p-6">
        {companyName && <CompanyName name={companyName} />}
        <TotalFunding amount={totalFunding} isLoading={!isComplete && !totalFunding} />
        <RecentRound data={recentRound ?? {}} isLoading={!isComplete && !recentRound} />
        <NotableInvestors investors={notableInvestors} isLoading={!isComplete && notableInvestors.length === 0} />
        <Sources sources={sources} isLoading={!isComplete && sources.length === 0} />
      </div>
    );
  };

  return (
    <div className="bg-white w-[400px] min-h-[500px] overflow-y-auto">
      {renderContent()}
    </div>
  );
};