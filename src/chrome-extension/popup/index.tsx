import "../global.css";
import React, { useState, useEffect, useRef } from "react";
import { CompanyName } from "../../components/CompanyName";
import { TotalFunding } from "../../components/TotalFunding";
import { RecentRound } from "../../components/RecentRound";
import { NotableInvestors } from "../../components/NotableInvestors";
import { Sources } from "../../components/Sources";
import { CompanyData } from "../../types";

// Animation settings
const TYPE_SPEED = 30; // ms between characters

// Types for animation tracking
type AnimationStringKeys = 'name' | 'totalFunding' | 'roundType' | 'roundAmount' | 'roundDate';
type AnimationArrayKeys = 'investors' | 'sources';

type AnimatedState = {
  [K in AnimationStringKeys]?: string;
} & {
  [K in AnimationArrayKeys]?: string[];
};

export const Popup: React.FC = () => {
  const [companyData, setCompanyData] = useState<Partial<CompanyData> | null>(null);
  const [streamedText, setStreamedText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  
  // State for typing animation
  const [typingName, setTypingName] = useState<string>("");
  const [typingFunding, setTypingFunding] = useState<string>("");
  const [typingRoundType, setTypingRoundType] = useState<string>("");
  const [typingRoundAmount, setTypingRoundAmount] = useState<string>("");
  const [typingRoundDate, setTypingRoundDate] = useState<string>("");
  const [typingInvestors, setTypingInvestors] = useState<string[]>([]);
  const [typingSources, setTypingSources] = useState<string[]>([]);
  
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  
  // Track what data we've already animated
  const animatedRef = useRef<AnimatedState>({});
  
  // Animation helper function to create typing effect with duplicate prevention
  const animateTyping = (
    text: string, 
    setter: React.Dispatch<React.SetStateAction<string>>,
    animatedKey: AnimationStringKeys
  ) => {
    // Skip if we've already animated this exact text
    if (animatedRef.current[animatedKey] === text) {
      return;
    }
    
    // Store what we're animating
    animatedRef.current[animatedKey] = text;
    
    // Clear previous animation timeouts
    timeoutsRef.current.forEach(id => clearTimeout(id));
    timeoutsRef.current = [];
    
    // Clear previous animation
    setter("");
    
    let currentText = "";
    
    // Animate typing one character at a time
    for (let i = 0; i < text.length; i++) {
      const timeoutId = setTimeout(() => {
        currentText += text[i];
        setter(currentText);
      }, i * TYPE_SPEED);
      
      timeoutsRef.current.push(timeoutId);
    }
  };
  
  // Animation helper for arrays with duplicate prevention
  const animateTypingArray = (
    items: string[], 
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    animatedKey: AnimationArrayKeys
  ) => {
    // Skip if we've already animated this exact array
    if (animatedRef.current[animatedKey] && 
        JSON.stringify(animatedRef.current[animatedKey]) === JSON.stringify(items)) {
      return;
    }
    
    // Store what we're animating
    animatedRef.current[animatedKey] = [...items];
    
    // Clear previous animation timeouts
    timeoutsRef.current.forEach(id => clearTimeout(id));
    timeoutsRef.current = [];
    
    // Start with empty array
    setter([]);
    
    // Animate adding one item at a time
    items.forEach((item, index) => {
      const timeoutId = setTimeout(() => {
        setter((prev: string[]) => {
          // Avoid duplicates within the animation too
          if (prev.some(p => p.toLowerCase() === item.toLowerCase())) {
            return prev;
          }
          return [...prev, item];
        });
      }, index * TYPE_SPEED * 10);
      
      timeoutsRef.current.push(timeoutId);
    });
  };
  
  useEffect(() => {
    const connectToBackground = async () => {
      try {
        // Get the current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.url) throw new Error('No URL found');
        
        const url = new URL(tab.url);
        const domain = url.hostname;
        
        // Connect to background script for streaming
        const port = chrome.runtime.connect({ name: 'streaming-response' });
        portRef.current = port;
        
        // Listen for messages from background script
        port.onMessage.addListener((message) => {
          if (message.type === 'CHUNK') {
            // Show the raw text immediately when no structured data yet
            setStreamedText(message.content);
          } 
          else if (message.type === 'PARTIAL') {
            // Update with partial structured data
            setCompanyData((prev: Partial<CompanyData> | null) => {
              const newData = { ...prev, ...message.data };
              
              // Animate any new data
              if (message.data.name && (!prev || message.data.name !== prev.name)) {
                animateTyping(message.data.name, setTypingName, 'name');
              }
              
              if (message.data.totalFunding && (!prev || message.data.totalFunding !== prev.totalFunding)) {
                animateTyping(message.data.totalFunding, setTypingFunding, 'totalFunding');
              }
              
              if (message.data.recentRound) {
                if (message.data.recentRound.type && 
                    (!prev?.recentRound || message.data.recentRound.type !== prev.recentRound.type)) {
                  animateTyping(message.data.recentRound.type, setTypingRoundType, 'roundType');
                }
                
                if (message.data.recentRound.amount && 
                    (!prev?.recentRound || message.data.recentRound.amount !== prev.recentRound.amount)) {
                  animateTyping(message.data.recentRound.amount, setTypingRoundAmount, 'roundAmount');
                }
                
                if (message.data.recentRound.date && 
                    (!prev?.recentRound || message.data.recentRound.date !== prev.recentRound.date)) {
                  animateTyping(message.data.recentRound.date, setTypingRoundDate, 'roundDate');
                }
              }
              
              if (message.data.notableInvestors && 
                  (!prev?.notableInvestors || 
                   JSON.stringify(message.data.notableInvestors) !== JSON.stringify(prev.notableInvestors))) {
                animateTypingArray(message.data.notableInvestors, setTypingInvestors, 'investors');
              }
              
              if (message.data.sources && 
                  (!prev?.sources || 
                   JSON.stringify(message.data.sources) !== JSON.stringify(prev.sources))) {
                animateTypingArray(message.data.sources, setTypingSources, 'sources');
              }
              
              return newData;
            });
          }
          else if (message.type === 'COMPLETE') {
            // Set the complete data
            setCompanyData(message.data);
            setIsComplete(true);
            setLoading(false);
            
            // Make sure all typing animations reflect final data
            if (message.data.name) {
              animateTyping(message.data.name, setTypingName, 'name');
            }
            
            if (message.data.totalFunding) {
              animateTyping(message.data.totalFunding, setTypingFunding, 'totalFunding');
            }
            
            if (message.data.recentRound) {
              animateTyping(message.data.recentRound.type, setTypingRoundType, 'roundType');
              animateTyping(message.data.recentRound.amount, setTypingRoundAmount, 'roundAmount');
              animateTyping(message.data.recentRound.date, setTypingRoundDate, 'roundDate');
            }
            
            if (message.data.notableInvestors) {
              animateTypingArray(message.data.notableInvestors, setTypingInvestors, 'investors');
            }
            
            if (message.data.sources) {
              animateTypingArray(message.data.sources, setTypingSources, 'sources');
            }
          } 
          else if (message.type === 'ERROR') {
            // Handle error
            setError(message.error);
            setLoading(false);
          }
        });
        
        // Start the streaming request
        port.postMessage({ type: 'FETCH_COMPANY_DATA', domain });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        setLoading(false);
      }
    };
    
    connectToBackground();
    
    // Cleanup
    return () => {
      // Clear any pending animations
      timeoutsRef.current.forEach(id => clearTimeout(id));
      
      // Disconnect the port
      if (portRef.current) {
        portRef.current.disconnect();
      }
    };
  }, []);
  
  // Determine what view to show based on streaming state
  const hasRawContent = streamedText.length > 0;
  const hasStructuredContent = companyData && Object.keys(companyData).length > 0;
  
  // Show the structured view once we have any structured data
  const showStructuredView = hasStructuredContent;
  
  if (loading && !hasRawContent) {
    return <div className="p-4">Connecting to Perplexity API...</div>;
  }
  
  if (error) {
    return <div className="p-4 text-red-500">Error: {error}</div>;
  }
  
  return (
    <div className="bg-white w-[400px] h-[500px] overflow-y-auto">
      <div className="flex flex-col gap-6 p-6">
        {/* If we have structured data, show components with typing animation */}
        {showStructuredView ? (
          <>
            {companyData?.name && (
              <CompanyName name={typingName || "..."} />
            )}
            
            {companyData?.totalFunding && (
              <TotalFunding amount={typingFunding || "..."} />
            )}
            
            {companyData?.recentRound && (
              <RecentRound data={{
                amount: typingRoundAmount || "...",
                date: typingRoundDate || "...",
                type: typingRoundType || "..."
              }} />
            )}
            
            {companyData?.notableInvestors && companyData.notableInvestors.length > 0 && (
              <NotableInvestors investors={typingInvestors.length > 0 ? typingInvestors : ["..."]} />
            )}
            
            {companyData?.sources && companyData.sources.length > 0 && (
              <Sources sources={typingSources.length > 0 ? typingSources : ["..."]} />
            )}
            
            {/* Show typing indicator if not complete */}
            {!isComplete && (
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            )}
          </>
        ) : (
          // If no structured data yet, show the raw streamed text
          hasRawContent && (
            <div className="text-gray-800 whitespace-pre-wrap overflow-x-hidden font-mono text-sm">
              {streamedText}
            </div>
          )
        )}
        
        {/* If no data at all */}
        {!hasRawContent && !hasStructuredContent && !loading && !error && (
          <div className="p-4">No company data found</div>
        )}
      </div>
    </div>
  );
};