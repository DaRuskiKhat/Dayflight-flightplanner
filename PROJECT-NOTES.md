# Dayflight project notes

Last updated: 5 November 2026.

## Project

- Public site: https://dayflight-flightplanner.pages.dev/ (Cloudflare Pages project `dayflight-flightplanner`, auto-deploys `dist` from `main` of https://github.com/DaRuskiKhat/Dayflight-flightplanner; no build command).
- Previous public site (ChatGPT hosting, retiring 2027): https://daylight-flight-planner-nw.spunkyconch.chatgpt.site/
- Buildless application: `dist/index.html`, `dist/style.css`, `dist/app.js`.
- Hosting: any static host serving `dist` (no build step, no server). Deploy options for GitHub Pages and Cloudflare Pages are in README.md under Hosting. The OpenAI `.openai/hosting.json` binding was removed on 5 November 2026.
- Run checks from this directory: `node --check dist/app.js` and `node check.cjs`.
- Refresh the self-contained offline HTML and source ZIP: `python export-offline.py`. Default output is the sibling `Dayflight-local` directory.

## Current behavior

- Airport search, coordinate entry and map picking for both endpoints; a full-width styled Swap button carries endpoint clock settings. The main form action is labelled Apply changes in both modes.
- Automatic DST-aware endpoint time zones or independent fixed UTC offsets.
- Date picker with Today, Apply and Cancel; bounded 24-hour dropdown time picker.
- Flight duration or ground speed in knots, km/h or mph; unit switching converts the value.
- Great-circle route with constant ground speed, sampled every 30 seconds for daylight, three twilight stages and night. No wind, taxi or aircraft performance model.
- Scrubbing/playback, zoom/pan/reset, center/follow aircraft, smooth day/night map shading.
- Sun/Moon aircraft-relative positions in the map card footer, plus overhead map markers.
- Desktop layout is capped at 1880px (raised from 1480px on 5 Nov 2026 so the map and playback cards fill wide screens; the map stays exactly 2:1, so it grows without stretching or cropping) with reduced header/intro spacing so the full 2:1 map is shorter without cropping or stretching. At 1400px and wider, origin, destination and aircraft clock cards stack in a 300px right-hand column. Playback stays at the map width; daylight/twilight/night totals sit in a five-card row below playback, with the sun/twilight/moon icons above their labels to preserve readable text. Smaller screens stack responsively.
- Map projection uses the same pixels per degree on both axes; wide/tall viewports crop rather than stretch. Map picking, shading, follow and wraparound share this scale.
- The redundant midpoint duration beneath the scrubber is removed; UTC crossing buttons remain.
- Map controls sit in a single column: zoom in, zoom out, flight-data toggle (altitude + ground speed tag beside the aircraft), follow aircraft, reset, zoom factor. Center on aircraft was removed on 5 Nov 2026 (Follow covers it).
- Playback: play button centred at the top of the time-travel card with «/» rate steps (1×–3600× real time, default 600×) replacing the old 30 s / 1 min / 2 min duration select. Rate and flight-data toggle persist in localStorage (`dayflight-rate`, `dayflight-flightdata`).
- Large ETA with local calendar day difference badge. Aircraft clock estimates regional time zone independently of endpoint overrides.
- Local plan saving, share URLs, CSV export; offline HTML supports plan JSON save/load.
- Polar map edges preserve the full South Pole boundary so Antarctica fills toward the bottom of the map.

## SimBrief initial integration (implemented)

- Manual / SimBrief source switch preserves each mode's form. Live import uses the documented public `xml.fetcher.php` endpoint with alias or Pilot ID, `client=Dayflight-1.0`, `json=v2`. No key, password, paid navdata, server proxy or automatic polling. Browser connectivity/error response verified with a synthetic nonexistent alias; no personal account was fetched.
- `dist/simbrief.js` parses JSON v2, legacy JSON and XML into a compact validated playback plan. Raw OFPs, account IDs, captain details and credentials are not stored or shared.
- Uses `est_off` for takeoff; fallback off-block + taxi-out, then scheduled takeoff, with notes. Uses airborne enroute duration; cross-checks estimated landing. Excludes taxi. Override local takeoff date/time without changing imported leg durations.
- Follows primary navlog coordinates and cumulative times, retaining supplied procedure fixes. Connects fixes with great-circle legs; no airway database or reconstruction of missing procedure turns. No route silently falls back: user must select direct fallback.
- Optional direct great-circle overlay and geometric route/direct distance comparison. Map, follow camera, profile, clocks, CSV and light totals all sample the same timed route.
- Collapsible vertical profile beneath the main scrubber: interpolated altitude in feet, TOC/TOD labels where present, a smooth solar-light background and five-category strip. Native range control scrubs in sync; unknown unbounded altitude remains missing. It is not an aircraft performance model. Altitude does not change the sea-level light thresholds.
- Imported route is browser-local and survives reload. Save imported flight downloads portable plan JSON; SimBrief file-import control can restore it on hosted/offline versions. Share uses a URL for small plans or a JSON download when too large for a reliable URL. Offline HTML embeds both import modules; live fetch still needs internet, file import does not.
- Checks: `node check.cjs`, `node check-simbrief.cjs` and JS syntax checks. Synthetic JSON fixture includes date-line routing and altitude changes. Sanitized public XML fixture has 61 fixes and only planning fields; original source: https://gist.github.com/extratone/d56c6374e88f1b0b83ce0bd1ce732d8d . Real XML import verified in browser.
- Outstanding possible enhancements: altitude-aware horizon, precise step-climb transitions, detailed procedure geometry, independent direct-route timing/daylight comparison, generating plans inside Dayflight. These are outside the initial scope.
