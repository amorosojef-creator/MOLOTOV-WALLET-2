import { DisabledProvider } from './disabled.js';

// Register real adapters here ONLY after a legitimate provider agreement exists, e.g.:
//   registry.set('acme-psp', (cfg) => new AcmePspProvider(cfg));
const registry = new Map([['disabled', () => new DisabledProvider()]]);

export const providerNames = () => [...registry.keys()];
export const getProvider = (name = 'disabled', cfg = {}) => {
  const make = registry.get(name);
  if (!make) throw new Error(`Unknown payment provider "${name}"`);
  return make(cfg);
};
