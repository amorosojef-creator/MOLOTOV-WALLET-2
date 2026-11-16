import { ApiError } from '../errors.js';

export class ProviderNotConfiguredError extends ApiError {
  constructor(method) {
    super(501, 'PROVIDER_NOT_CONFIGURED',
      `Real-money operation "${method}" is disabled: no licensed payment provider is connected. ` +
      'This requires BSP-authorised status (or an authorised partner programme), signed provider agreements and credentials.');
  }
}

/**
 * Contract every real payment-provider adapter must implement. An adapter may only call the
 * provider's OFFICIALLY DOCUMENTED API under an executed agreement. Rules that apply to all adapters:
 *  - credentials come from a secret manager / env, never from the repo or the app;
 *  - a request being *accepted* is NOT a settled payment; only a verified webhook / status
 *    call (or settlement file) may move a transfer to "completed";
 *  - no balance may be created without verified funding; sandbox value never converts to live value.
 */
export class PaymentProvider {
  get name() { return 'abstract'; }
  /** Create the user's receiving identifier (e.g. registered beneficiary / virtual account). */
  async createReceivingIdentifier(_user) { throw new ProviderNotConfiguredError('createReceivingIdentifier'); }
  /** Issue an AUTHORISED QR (e.g. personal QR Ph) through the provider; never self-generated. */
  async generateAuthorizedQR(_user, _type) { throw new ProviderNotConfiguredError('generateAuthorizedQR'); }
  /** Resolve a scanned payload to a payee using the provider's lookup. */
  async resolveQrRecipient(_payload) { throw new ProviderNotConfiguredError('resolveQrRecipient'); }
  /** Submit a funded transfer. Must be idempotent on idempotencyKey. */
  async initiateFundedTransfer(_user, _recipient, _amountCents, _idempotencyKey) { throw new ProviderNotConfiguredError('initiateFundedTransfer'); }
  /** Poll provider for authoritative status of a previously submitted transfer. */
  async getTransferStatus(_providerReference) { throw new ProviderNotConfiguredError('getTransferStatus'); }
  /** Cryptographically verify a webhook (signature over the RAW body). Return true only if valid. */
  verifyWebhook(_signature, _rawPayload) { throw new ProviderNotConfiguredError('verifyWebhook'); }
  /** Compare the provider's settlement file/feed to the internal journal. */
  async reconcileSettlement(_fileOrFeed) { throw new ProviderNotConfiguredError('reconcileSettlement'); }
}
