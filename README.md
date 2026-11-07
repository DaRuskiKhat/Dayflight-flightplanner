# Dayflight

A buildless flight daylight planner. Live at **https://dayflight-flightplanner.pages.dev/**. Serve `dist` with any static HTTP server.

## Gate-to-gate timing

When taxi times are known, the timeline runs from off-block (push-back) to on-block (gate arrival): taxi-out at the origin, the airborne route, then taxi-in at the destination. SimBrief imports use the OFP taxi-out/taxi-in times (or the off/on-block gaps), so the planner's time field is the off-block time and takeoff = off-block + taxi-out. Manual plans have optional Taxi out / Taxi in fields (minutes, default 0 = takeoff-to-landing as before); with taxi times, departure time is gate push-back and flight time stays airborne time. The origin card shows off-block and takeoff side by side, the destination card landing and on-block (ETA) side by side at equal size, the timeline bar has takeoff/landing ticks and chips, and the vertical profile is labelled Off-block / On-block. While taxiing, the telemetry tag reads Taxiing to runway / to gate. Older saved plans without taxi times behave as before.

Route colours: the unflown SimBrief route is gold dashed; the direct great-circle (manual route, and the SimBrief direct overlay) is pale dashed. The wind line in the telemetry tag has an arrow pointing the way the wind blows.

## Airport weather

SimBrief imports show Origin weather and Destination weather cards. Everything keeps its main-branch size and the weather cards are added as an extra column to the right of the origin/destination cards (screens 1400px and wider). The page grows by one card column (312px), so on screens narrower than about 2240px it scrolls sideways to reach them; below 1400px they pair up under the map. Each card decodes the OFP's METAR (wind, visibility, ceiling, temperature/dew point, QNH) with a VFR/MVFR/IFR/LIFR badge (SimBrief's category, FAA thresholds), and the TAF conditions forecast at off-block (origin) or on-block ETA (destination): prevailing conditions after FM/BECMG changes, plus any TEMPO/PROB spells covering that time. Raw METAR/TAF text is collapsible. Weather is the OFP snapshot at planning time, not live; decoding is in `dist/weather.js` (tests: `check-weather.cjs`). Saved plan files keep the weather; share links leave it out.

## Light and dark mode

The sun/moon button in the header switches between light and dark mode. By default Dayflight follows the system setting; once you switch, the choice is remembered in this browser (`dayflight-theme`). The theme is applied by a small inline script in `<head>` before the page paints, so there is no flash of the wrong theme. Dark colours live in `dist/dark.css`, generated from `style.css` by `tools/make-dark-theme.py` (re-run it after editing `style.css`; hand-tuned tweaks go in `tools/dark-overrides.css`). The map card is already dark and is unchanged; the vertical profile chart picks its frame and label colours from the theme.

## Hosting

There is no build step and no server code: publish the `dist` folder as-is. SimBrief is called directly from the viewer's browser, so live import works on any static host.

**Cloudflare Pages (repo can stay private, free plan)**

- With Git: push this folder to a GitHub repo (private is fine). In the Cloudflare dashboard go to Workers & Pages → Create → Pages → Connect to Git, pick the repo, set Framework preset to *None*, leave Build command empty and set Build output directory to `dist`. Every push to `main` redeploys.
- Without Git: Workers & Pages → Create → Pages → Upload assets, and drag in the contents of `dist`. Or from a terminal: `npx wrangler pages deploy dist --project-name dayflight`.
- The site will be at `https://<project-name>.pages.dev`.

**GitHub Pages (repo must be public on the free plan)**

- Push this folder to a public GitHub repo. In the repo go to Settings → Pages → Build and deployment and set Source to *GitHub Actions*. The included workflow `.github/workflows/pages.yml` publishes `dist`; it is manual-only while Cloudflare Pages is the main host (run it from the Actions tab, or add a `push` trigger to make it automatic).
- The site will be at `https://<username>.github.io/<repo>/`. All asset paths are relative, so the sub-path works without changes.

Saved plans live in each browser's local storage, which is tied to the site address, so plans saved on the old ChatGPT-hosted address won't appear on the new one. Use Share or Save imported flight on the old site to carry a plan across.

Features: global ICAO/IATA search, coordinate paste and map selection for both endpoints, editable custom-point time zones, route reversal, date and local departure time, independent fixed UTC-offset overrides for both endpoints, duration or ground-speed estimates in knots or km/h, great-circle simulation, separate civil/nautical/astronomical twilight totals and smooth day/night map shading, local clocks, elapsed/remaining time, ETA, shareable plan links and CSV export. Plans are stored in the browser.

Coordinates accept decimal latitude/longitude or DMS with hemisphere letters (prefix or suffix). Each endpoint has a clock mode: its location time zone with DST or a fixed UTC offset. Clock preferences move with locations on route reversal, and persist in saved/shared plans. The departure override controls departure conversion and the origin clock. The arrival override controls the destination clock, ETA and arrival display without changing flight duration. Switching speed units converts the entered value and preserves the physical ground speed.

Run verification with `node check.cjs` and syntax checking with `node --check dist/app.js`.

Map navigation: use +/− for 1×–16× zoom, drag to pan while zoomed, and ↺ to reset. After focusing the map, the wheel zooms around the pointer; +/−/0 and arrow keys support keyboard navigation. Map picking, routes, celestial markers and night shading use the same zoom transform.

Follow aircraft (✈) tracks the aircraft during playback and scrubbing. The flight-data toggle (chart icon) shows a tag beside the aircraft with planned altitude (SimBrief plans with a vertical profile; ↑/↓ while climbing or descending) and ground speed, averaged over ±1 minute of the timed route, in the selected speed unit (knots by default). For SimBrief OFPs the tag uses the planned navlog values: ground speed, TAS/Mach, true heading and track (HDG/TRK), wind and outside air temperature, and fuel on board (OFP weight units). Leg values come from the waypoint ending the current leg, wind/OAT from the nearest waypoint, and fuel is interpolated from planned takeoff to landing fuel. Ground speed and heading come from the wind triangle (TAS of the leg being flown, wind interpolated as a vector between waypoints, and the current track): GS = TAS·cos(WCA) − headwind, HDG = TRK + WCA. This matches the OFP navlog ground speed within a few knots mid-leg; the wind line also shows the head/tailwind component. Older saved plans and manual plans fall back to estimates (ground speed averaged over ±1 minute of the timed route, and true track). Manual plans show ground speed and track only. While the tag is on, the flown part of SimBrief routes with a vertical profile is coloured by planned altitude on a rainbow scale (pale yellow below 100 m → yellow → green → cyan → blue → violet → magenta → red at 13,000 m / about 43,000 ft); the unflown part stays the plain dotted planned line. A ramp appears in the map legend. Settings → Telemetry has checkboxes for each item (altitude, ground speed, airspeed, heading/track, wind & temperature, fuel, route colouring; airspeed and fuel are off by default); the chart button is the master on/off. The toggle is remembered per browser.

For SimBrief flights with an altitude profile, light at the aircraft is altitude-corrected by default: from height h the visible horizon sits ≈1.76′·√(h in metres) lower (about 3.1° at 36,000 ft, including standard terrestrial refraction), so sunrise comes earlier and sunset later aloft. Light categories, route percentages, the event chips and the vertical-profile shading use sun elevation + dip; the Sky at the aircraft panel shows the dip. Airport sunrise/sunset cards stay at ground level. Toggle it under Settings → Altitude-corrected light. CSV export includes both the geometric and the corrected sun elevation.

The departure (or SimBrief off-block) time can be typed in 24-hour form (14:30, 1430, 930, or just an hour) and applies on Enter or when leaving the field; the clock button opens the hour/minute picker. Origin and destination cards show each zone's UTC offset at the simulated moment (DST-aware), e.g. Australia/Sydney (UTC+11).

The gear button in the map controls opens Settings: speed unit (knots, km/h, mph; shared with the planner's ground-speed field), temperature unit (°C/°F for the telemetry OAT; SimBrief telemetry only), altitude unit (feet or metres; SimBrief only, also used by the vertical profile) and the direct great-circle overlay (SimBrief routes only). Units are remembered per browser; CSV export stays in feet. Manual dragging or arrow-key panning turns Follow off. Reset returns to the route overview. Playback controls sit at the top centre of the time-travel card: « and » step the playback rate through 1×, 10×, 30×, 60×, 120×, 300×, 600× (default), 1200×, 1800× and 3600× real time, and the label shows how long the full flight takes to play. The rate is remembered per browser. Reset sits beside the elapsed time; information cards use tighter vertical padding without smaller text. Short desktop viewports use an adaptive map height to keep the scrubber and Play button in view.

Aircraft’s local time follows the aircraft coordinates using the vendored @photostructure/tz-lookup 11.7.0 estimated regional zone and the browser's DST rules. Ocean zones may use nautical UTC offsets. Border/coastal lookup is approximate. The clock is independent of endpoint UTC overrides and updates with playback/scrubbing. The lookup library is CC0; its license is included in dist/vendor.

Create a self-contained offline HTML and source ZIP with `python export-offline.py`. The export embeds all runtime assets and data, replaces the online Share action with local Save/Load plan files, and excludes hosting identity and Git metadata. The hosted copy stays separately managed.

Departure time uses a single field with a combined, bounded hour/minute dropdown (00–23 / 00–59), including keyboard navigation. The calendar stages date selections until Apply is pressed; Cancel discards them. Today stages the current date in the departure location's selected time zone or fixed offset. Origin and destination information panels use larger type, with a prominent ETA and a local-calendar arrival-day badge (+1/+2/−1; hidden for same-day arrival). Aircraft time is separate. The timeline has a 44px pointer target covering its visible handle, pointer capture for dragging outside the bar, and native keyboard range controls. Sun and Moon overhead markers and aircraft-relative altitude/bearing update with the timeline. Lunar illumination is shown in the sky panel. Sky positions use the vendored SunCalc 2.1.1 library; its MIT license is included in `dist/vendor/suncalc-LICENSE.txt`. Map overhead markers are approximate; the Sun marker uses the same solar model as the shading.

Solar model: https://gml.noaa.gov/grad/solcalc/solareqns.PDF

Map: Natural Earth public-domain land geometry (110m).
Airport data: https://github.com/mwgg/Airports (snapshot downloaded 2026-11-04; MIT, © 2014 mwgg, see `dist/vendor/airports-LICENSE.txt`). Airport data is not a current navigation database.

## Licence and disclaimer

Dayflight's code is MIT-licensed (see `LICENSE`); bundled data and libraries keep their own licences, listed there. Dayflight is for flight simulation and travel curiosity only, not real-world navigation or flight planning. SimBrief imports use Navigraph's public OFP fetch endpoint for the viewer's own flight; SimBrief and Navigraph data must only be used for flight simulation. Dayflight is not affiliated with or endorsed by Navigraph or SimBrief. Inspired by Daylight Dispatch.

Model uses constant-speed great-circle travel, a sea-level horizon, and 30-second sampling. It does not model terrain, weather, cruise altitude, actual airways, winds, stops or taxi time. Ground speed is not true airspeed. Custom map point time zones are suggested by the nearest airport and should be verified.

## SimBrief import

Choose SimBrief, enter your Navigraph alias or Pilot ID, then click Import latest flight. Generate your OFP in SimBrief first. The free public import endpoint requires no API key or subscription; current AIRAC data is optional. Requests occur only on an import click, with no polling. Raw OFPs and aliases are not persisted.

Alternatively import an OFP JSON/XML file. Takeoff is based on estimated OFF time, with documented taxi/scheduled fallbacks; airborne duration and timed fixes drive playback. The optional dashed direct route is a visual comparison. The profile shows approximate planned altitudes, TOC/TOD when supplied, and light along the same time axis. Altitude does not alter daylight thresholds. Missing routes require explicit direct fallback; missing altitude is not invented. Importing a flight does not recalculate its weather or performance.

Save imported flight downloads a portable Dayflight JSON, loadable through the OFP file button or the offline edition. Long share links fall back to a plan download. Live imports require internet; file imports and saved playback can run offline.

Additional checks: `node check-simbrief.cjs`. Fixtures are in `tests/`; the synthetic fixture is fictional. The XML fixture is stripped to planning fields from a publicly posted sample, cited in PROJECT-NOTES.md.
