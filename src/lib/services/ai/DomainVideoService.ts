import { experimental_generateVideo as generateVideo } from 'ai';
import { ai } from './ai';
import fs from 'node:fs';
import path from 'node:path';

export class DomainVideoService {
  constructor() { }

  async generateDomainVideo(domainName: string, domainDescription: string, themeColor: string): Promise<string> {
    const prompt = `Generate a seamlessly looping animated background environment for a Jujutsu Kaisen–inspired domain expansion named "${domainName}".

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

    const { videos } = await generateVideo({
      model: ai.video("google/veo-3.1-generate-001"),
      duration: 4,
      personGeneration: "dont_allow",
      prompt,
    });

    console.log("video response received");

    // "Download" (Save) the video to the filesystem
    const fileName = `${domainName.toLowerCase().replace(/\s+/g, '_')}_domain.mp4`;
    const directoryPath = path.resolve('static/assets');

    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true });
    }

    const filePath = path.join(directoryPath, fileName);
    fs.writeFileSync(filePath, videos[0].uint8Array);

    console.log(`Video saved to: ${filePath}`);

    // Return the public URL for the video
    return `/assets/${fileName}`;
  }
}
