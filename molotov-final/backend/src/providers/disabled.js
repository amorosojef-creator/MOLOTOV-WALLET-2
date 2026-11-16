import { PaymentProvider } from './interface.js';
export class DisabledProvider extends PaymentProvider {
  get name() { return 'disabled'; }
}
