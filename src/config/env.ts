interface EnvConfig {
    PERPLEXITY_API_KEY: string;
  }
  
  export const config: EnvConfig = {
    PERPLEXITY_API_KEY: import.meta.env.VITE_PERPLEXITY_API_KEY as string
  };