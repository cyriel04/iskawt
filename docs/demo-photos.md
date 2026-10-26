# Demo photos — generation prompts

Every photo here belongs to a `[DEMO]` space. None shows a real property. Each is
AI-generated, and the site marks every one of them "Demo photo · not a real space".

## How to add them

1. Generate each photo below (any image tool; landscape, 3:2 or wider).
2. Save as JPEG, about 1600px wide, under 400 KB, to
   `public/demo/<slug>/<n>.jpg` (or `.jpeg`) — e.g. `public/demo/demo-poblacion-loft/1.jpg`.
   Photo 1 is the cover.
3. Run `pnpm db:seed`. A space with no files keeps its SVG placeholder.

The listing frame crops to 2:1, so keep the subject in the middle band of the image.

## Rules for every prompt

- No people, no faces, no hands.
- No readable text, signage, logos, brand names or house numbers.
- No recognisable real landmark or building facade — nothing that points to a real address.
- Photographic, not illustrated.

Append this to every prompt:

> Realistic architectural interior photograph, natural colours, shot on a 24mm lens at eye
> level, landscape 3:2, no people, no text, no signage, no logos, no watermark.
>
> Set in tropical Metro Manila: outside views show concrete low-rises with painted walls,
> corrugated metal roofs, water tanks, air-con units, tangled power lines and mango or palm
> trees — not red-brick buildings. Humid, slightly hazy light.

## demo-poblacion-loft — Corner loft with afternoon light (Makati)

1. Open-plan upper-floor loft with an exposed concrete ceiling and visible ducts, one long wall
   of west-facing steel-framed windows, warm late-afternoon sun throwing long window shadows
   across a polished concrete floor, sparse furniture.
2. The same loft seen from the window wall looking back into the room: a worn leather sofa,
   a wooden work table, exposed ceiling, soft golden light.
3. Close detail of the window wall at golden hour, steel mullions, dust in the light,
   a blurred Manila low-rise rooftop view outside with no identifiable buildings.

## demo-kapitolyo-rowhouse — Two-storey rowhouse with a back garden (Pasig)

1. Ground floor of a modest Filipino family rowhouse: glazed ceramic floor tiles, a wooden
   dining set, a staircase with a metal railing, diffused daylight from a side window.
2. Small planted back yard enclosed by a plain painted concrete wall, potted plants and
   a calamansi tree, soft overcast daylight on the wall.
3. Upstairs bedroom with carpet, a simple wooden bed, jalousie windows, gentle morning light.

## demo-escolta-office — Pre-war office floor, unrenovated (Manila)

1. Empty half-floor of a 1930s heritage office building: original patterned terrazzo floor,
   tall wooden casement windows, peeling pale-green paint left as-is, bright side light.
2. Long view down the floor between square columns, old wooden partitions, light falling
   in bars across the terrazzo.
3. Detail of an old cage-style elevator door with brass fittings in a faded lobby.

## demo-cubao-warehouse — Bare warehouse bay with roller door (Quezon City)

1. Single-span empty warehouse bay, bare concrete floor, steel roof trusses overhead,
   a large roller door half open letting a wedge of daylight in, otherwise dim.
2. View from inside towards the fully open roller door onto a plain concrete yard,
   a small white van parked inside for scale (no markings).
3. Looking up at the steel trusses and corrugated roof with a row of high-bay lights.

## demo-malate-apartment — Lived-in apartment, period fittings (Manila)

1. Second-floor 1960s Manila apartment living room, original patterned cement floor tiles,
   mismatched lived-in furniture, books and plants, a capiz-shell window, warm daylight.
2. Narrow galley kitchen with old tiles, a two-burner stove, everyday clutter, window light.
3. Small balcony with a wrought-iron railing overlooking a leafy street, blurred, no signs.

## demo-lilac-cafe — Café with street frontage, before opening hours (Marikina)

1. Small empty café before opening, full-height glass frontage, soft morning light,
   wooden tables with chairs still tucked in, an espresso bar at the back.
2. Close view of the espresso bar: a chrome espresso machine, ceramic cups, a wooden counter.
3. View from inside out through the glass frontage to a quiet tree-lined street, blurred.

## demo-mandaluyong-rooftop — Rooftop deck with skyline view (Mandaluyong)

1. Open concrete rooftop deck on a mid-rise building at golden hour, low parapet wall,
   an unobstructed generic city skyline to the east, slightly hazy, no recognisable towers.
2. The same rooftop at harsh midday, hard shadows, bright sky, empty deck.
3. Detail of the parapet edge at dusk with city lights starting, soft focus background.

## demo-san-juan-studio — White cyc studio, small format (San Juan)

1. Small professional photo studio with a coved white cyclorama wall, blacked out,
   a lighting grid overhead, two softbox lights on stands, evenly lit cyc.
2. Wider view showing the studio's black walls, a lighting grid, a rolling cart of
   grip equipment, the white cyc at one end.
3. Detail of the curved join where the white cyc meets the floor, softly lit.
