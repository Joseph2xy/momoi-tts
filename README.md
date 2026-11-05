# Momoi TTS

An experiment with characters that have their own personalities and voices.
Twitch viewers ask a character a question through Channel Points, and the app
generates a spoken reply for the stream.

It runs locally on Windows, with a browser interface for managing characters
and requests. OpenRouter generates the replies, Fish Audio provides the voices,
and an OBS Browser source plays the audio.

**Built with:** TypeScript, React, Twitch, OpenRouter, Fish Audio and OBS.

**Work in progress.** More development and testing are needed, including
connected Twitch and OBS trials.

See the [user guide](USER_GUIDE.md) for setup and controls,
[architecture](docs/architecture.md) for implementation details, and
[verification notes](docs/verification.md) for current testing limits.

## Source development

Requires Node.js 24.12 or newer.

```sh
npm ci
npm run build
npm run test:offline
```

`npm run package` creates the Windows ZIP with its runtime and user guide included.
Generation and speech require your own provider credentials and may incur charges.

## License

[MIT](LICENSE) for original code. Third-party dependencies and media retain their
own rights and notices.
