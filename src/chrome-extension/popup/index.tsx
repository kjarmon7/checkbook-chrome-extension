import "../global.css";
import { useState, useEffect } from "react";
import { CompanyName } from "../../components/CompanyName";
import { TotalFunding } from "../../components/TotalFunding";
import { RecentRound } from "../../components/RecentRound";
import { NotableInvestors } from "../../components/NotableInvestors";
import { Sources } from "../../components/Sources";
import { CompanyData } from "../../types";

export const Popup: React.FC = () => {
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getCurrentTab = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.url) throw new Error('No URL found');
        
        const url = new URL(tab.url);
        const domain = url.hostname;

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
          }
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        setLoading(false);
      }
    };

    getCurrentTab();
  }, []);

  if (loading) {
    return <div className="p-4">Loading company data...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">Error: {error}</div>;
  }

  if (!companyData) {
    return <div className="p-4">No company data found</div>;
  }

  return (
    <div className="bg-white w-[400px] h-[500px] overflow-y-auto">
      <div className="flex flex-col gap-6 p-6">
        <CompanyName name={companyData.name} />
        <TotalFunding amount={companyData.totalFunding} />
        <RecentRound data={companyData.recentRound} />
        <NotableInvestors investors={companyData.notableInvestors} />
        <Sources sources={companyData.sources} />
      </div>
    </div>
  );
};

