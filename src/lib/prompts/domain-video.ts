/**
 * Generates the prompt for the Domain Video generation service.
 */
export const DOMAIN_VIDEO_PROMPT = (domainName: string, domainDescription: string, themeColor: string) => `Generate a seamlessly looping animated background environment for a Jujutsu Kaisen–inspired domain expansion named "${domainName}".

Description: ${domainDescription}
Primary Color Theme: ${themeColor}

The output should depict the environment only — no characters, creatures, or people.
The scene must include a clear ground or floor surface where characters could stand (stone, cursed energy platform, ritual floor, etc.).

Camera rules:
- Camera must be completely static
- No zooming, panning, dollying, or rotation
- Perspective should feel like a battle arena backdrop

Looping requirement:
- The animation must loop perfectly
- The last frame must visually match the first frame
- Motion should come from environmental effects only such as: drifting cursed energy, flickering symbols, flowing mist, moving clouds, floating debris, pulsing light

Style:
- Dark supernatural anime aesthetic
- Cinematic lighting
- High detail
- Dramatic atmosphere

Composition:
- Foreground: domain floor/platform
- Midground: environmental structures or terrain
- Background: large atmospheric elements (sky, void, cursed energy, structures)

The environment should feel mystical, dangerous, and otherworldly, consistent with a domain expansion battlefield.
Important: The animation must be perfectly loopable and suitable for use as a game background layer.`;
