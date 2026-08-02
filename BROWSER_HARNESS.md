# Browser receiver harness

`harness.html` runs the production receiver UI and `receiver.js` in a regular
desktop or mobile browser. A small mock Cast runtime supplies media state,
tracks, remote-control keys, buffering, and playback errors.

Public URL:

`https://hennadiiponomarov.github.io/cast-drm-receiver-test/harness.html`

Local run:

```sh
python3 -m http.server 8765
```

Then open `http://127.0.0.1:8765/harness.html`.

The panel can load movie, series, live, and recording presets. It can also
simulate buffering, error 905, D-pad navigation, OK, Back, Play, and Pause.

## What this verifies

- The exact HTML, CSS, and JavaScript used by the production receiver.
- Receiver presentation states and control navigation.
- Movie, series, live, recording, buffering, and error UI.
- Audio, subtitle, and quality menus exposed by the mock track managers.

## What still requires a Cast device

- Google Cast discovery and sender-to-receiver transport.
- The real Cast Application ID lifecycle.
- Hardware Widevine capabilities and license exchange.
- Device-specific native overlays and remote-control behavior.

An Android TV emulator is not advertised as a Chromecast receiver. A future
LAN browser mode can use an HTTP/WebSocket session between the phone and a
browser, but that is a separate custom protocol rather than Google Cast.
