// Farcaster client types
declare global {
  interface Window {
    farcaster?: {
      addMiniApp: () => Promise<void>;
    };
  }
}

export {};