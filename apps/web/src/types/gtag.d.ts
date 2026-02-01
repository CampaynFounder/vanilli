declare global {
  interface Window {
    gtag?: (command: string, eventOrConfig: string, params?: object) => void;
  }
}

export {};
