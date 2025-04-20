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
  storage: {
    local: {
      get: (keys: string | string[] | object | null, callback: (items: { [key: string]: any }) => void) => void;
      set: (items: object, callback?: () => void) => void;
    };
  };
}; 