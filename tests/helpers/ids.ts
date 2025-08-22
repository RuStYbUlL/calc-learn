// Unique-ish IDs for headers/keys per test run
export function corr(label = "corr") {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  
  export function idem(label = "idem") {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  