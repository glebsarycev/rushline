# Premium environment: sky, time of day, landscapes, stadium, lawn

Date: 2026-09-26. Agreed with the user in chat (8 questions, hybrid approach A).

## Goal

Make the world around the track look premium in a clean Trackmania 2020 style.
Today the sky is a flat gradient with blob clouds, night stars look like snow,
distant mountains are flat silhouettes, the grass repeats in big stripes, the
grandstands are low boxes, and at sunset the white barriers facing the sun burn
out to white under bloom (the user could not see the road on Dust Bowl).

## Decisions

- Times of day: morning, day, sunset, night (adds morning). The track author
  picks one (editor select, as now).
- Landscape behind the stadium, picked per track: mountains, city, sea, canyon.
- Style: clean TM2020 (realistic sky, crisp bright stadium and track).
- Sun: keep the rays/glow, never blind the player.
- Stadium: TM2020-like bowl: tall white multi-tier stands, big canopy roof on
  trusses, giant screens, glowing scrolling LED ribbons, roof floodlights.
- Grass: stadium lawn with mowing stripes plus close-up detail.

## Approach (hybrid)

Higgsfield (`gpt_image_2_5`) generates images; code does light and geometry.

Assets (`assets/env/`, loaded only for the current track):
- 4 sky panoramas, 21:9 4K, sun placed at the image centre at a known height.
  Wrapped on a dome band (below the horizon to ~60°), the zenith fades into the
  top colour; the wrap seam is cross-faded at load time.
- 5 landscape strips with transparent sky (mountains, city day, city night,
  sea, canyon), wrapped around the stadium and tinted per time of day.
- Lawn detail, crowd, 5 original sponsor banners, giant-screen art (2K).

Code:
- Sun direction matches the sky image; PMREM environment from the sky dome, so
  reflections and ambient follow the picture.
- Bloom stays, but lit surfaces are kept under the bloom threshold (barriers,
  floodlights at dusk), plus a subtle lens flare and a light colour grade.
- New stadium geometry sized to the track bounds; LED ribbons scroll.
- Lawn shader: world-space mowing stripes + detail texture + macro variation.
- Track data: `env` gains `morning`; new optional `land` field; editor gets a
  landscape select; campaign tracks get a time/landscape pairing each.

## Checks

Screenshots of every time of day and landscape; 60 fps on the user's M1 with
automatic quality; strict-CSP (artifact) load; AI tests unaffected.
