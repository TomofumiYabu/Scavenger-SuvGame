# Original environment artwork

Generated for this project on 2026-10-18 (JST) using the available OpenAI `image_gen.imagegen` image-generation tool. The tool does not expose a separate underlying model identifier. Both images were generated from text prompts in this task without third-party reference imagery. No game screenshots, wiki images, copied logos, or external art assets were supplied.

This provenance statement records how the files were created; it does not assert external licensing rights or a legal clearance determination.

| Asset | Purpose | Dimensions | Bytes |
| --- | --- | --- | --- |
| `public/art/terrain-atlas.webp` | Six terrain/location illustrations | 1536 × 1024 | 483,998 |
| `public/art/city-backdrop.webp` | Atmospheric city panorama behind the game interface | 1536 × 1024 | 330,320 |

Combined deployment size: **814,318 bytes** (approximately 795 KiB). Original PNG outputs remain in the generation workspace; deployment copies were encoded with ImageMagick WebP at quality 86 (atlas) and 84 (backdrop). No aesthetic manipulation, retouching, or third-party compositing was performed.

## Atlas layout

Three columns and two rows, each cell 512 × 512 pixels, with no gutters:

| Row | Left | Center | Right |
| --- | --- | --- | --- |
| Top | Ruins | Street | Park |
| Bottom | Clinic | Shelter | Tower |

For CSS sprites, use `background-size: 300% 200%`; column positions are 0%, 50%, 100%, and row positions are 0%, 100%.

## Terrain atlas prompt

Create an original professional game environment concept-art terrain atlas, landscape 3:2 aspect ratio, precise seamless-contact 3 columns by 2 rows grid of six equal square panels. This is artwork for a Japanese near-future ruined city survival game. No gutters, no panel borders, no frames. Each square has its own readable composition and fills its whole square edge-to-edge. Top row left: RUINS, collapsed dense Japanese urban concrete apartments with exposed rebar, rubble, vine growth, mist. Top row middle: STREET, deserted wet asphalt intersection, broken traffic lights and distant elevated rail, rain reflections. Top row right: PARK, overgrown urban park with cracked paths and abandoned benches, lush muted moss and a dark pond surrounded by ruined buildings. Bottom row left: CLINIC, weathered small near-future medical clinic facade with a plain luminous teal medical cross symbol but absolutely no letters, foliage, abandoned ambulance partly visible. Bottom row middle: SHELTER, survivor hideout built into a brutalist transit station with barricades, a warmly glowing doorway, carefully placed sandbags and supplies. Bottom row right: TOWER, looming damaged communications tower and high-rise infrastructure, antenna silhouette, cables, distant storm clouds. Coherent exceptional painterly cinematic realistic environment illustration throughout, detailed believable architecture, moody overcast light, desaturated petrol blues, concrete grays, moss greens, subtle rust and amber lighting accents. Quiet sophisticated art direction with depth and hand-painted surface texture, premium mature PC survival game, strong legibility at thumbnail size. The setting must feel Japanese through architecture and street furniture but no readable text, no characters, no logos, no lettering, no game UI. ALL SIX PANELS EQUALLY SIZED, three across and two down; no single overarching scene; no labels.

## City backdrop prompt

Original cinematic game environment art, wide panoramic landscape composition 3:2 aspect ratio, a Japanese near-future ruined megacity viewed from the sheltered edge of a fractured elevated pedestrian passage. Strong graphic silhouette of ruined apartment blocks, broken elevated railway receding into the distance, tall damaged radio mast above low rolling fog. In the near left foreground moss-covered concrete and hanging cables, below wet deserted streets and overgrown buildings; at the lower right a tiny isolated amber light in a survivor shelter. Moody storm after rain, richly textured weathered architecture, desaturated deep petrol blue and concrete gray with muted moss green and extremely subtle warm rust/amber accents. Sophisticated professional realistic painterly concept art for a mature PC survival game. Intricate hand-painted environmental storytelling, atmospheric depth, quiet desolation, restrained contrast, exceptional composition, detailed believable engineering. Dark foreground edges and quieter central atmospheric sky leave breathing room for game interface overlay. No people, no writing, no readable text, no logos, no UI, no border, no collage, no grid. Entire image is one coherent expansive city panorama; original artwork with no external game references.

## Source outputs

- Atlas: `/workspace/generated_images/exec-ba95f3f8-6e4a-4165-828e-95bd32fc2a31.png`
- Backdrop: `/workspace/generated_images/exec-5f7043dd-607f-470f-8b97-80c9c56f1d2f.png`

Visual inspection confirmed coherent weathered Japanese urban architecture, distinct terrain scenes in the expected order, and a separate city panorama. The images contain no readable labels, logos, or interface elements.

