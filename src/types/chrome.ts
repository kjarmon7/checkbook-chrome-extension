// Chrome Extension Type Declarations
declare const chrome: {
  runtime: {
    onMessage: {
      addListener: (callback: (message: any) => void) => void;
    };
    sendMessage: (message: any, callback?: () => void) => void;
    lastError?: {
      message: string;
    };
  };
  tabs: {
    query: (queryInfo: { active: boolean; currentWindow: boolean }) => Promise<{
      id?: number;
      url?: string;
    }[]>;
  };
}; 