export class RequestInputError extends Error {}

const speechFailureMessages = {
  network: 'Fish Audio request failed. Check your connection and API access.',
  timeout: 'Fish Audio speech request timed out.',
  empty: 'Fish Audio returned no audio.',
  'invalid-audio': 'Fish Audio returned invalid MP3 audio.',
  'audio-too-large': 'Speech audio exceeded the 5 MB limit.',
};
type SpeechFailureCode = keyof typeof speechFailureMessages | 'http';

// Public diagnostics come from fixed application text, never a provider body or exception message.
export class SpeechFailure extends Error {
  readonly code: SpeechFailureCode;
  readonly httpStatus?: number;
  constructor(code: SpeechFailureCode, httpStatus?: number) {
    super();
    this.code = code;
    this.httpStatus = httpStatus;
    this.message = this.publicMessage;
  }
  get publicMessage(): string {
    if (this.code !== 'http') return speechFailureMessages[this.code];
    const status = this.httpStatus;
    const reason =
      status === 401 || status === 403
        ? 'Check API key and voice/model access.'
        : status === 402
          ? 'API billing or model access rejected. Check Developer API credit and the selected engine; website credits are separate.'
          : status === 429
            ? 'Rate limit reached; try again later.'
            : status === 404
              ? 'Voice or endpoint unavailable.'
              : status === 400 || status === 422
                ? 'Request rejected. Check the speech engine and character voice ID.'
                : 'Provider rejected the request.';
    const label =
      Number.isInteger(status) && status! >= 100 && status! <= 599 ? ` HTTP ${status}` : '';
    return `Fish Audio${label}: ${reason}`;
  }
}

export class OperationTimeoutError extends Error {}
