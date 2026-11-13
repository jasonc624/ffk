import { experimental_generateVideo as generateVideo } from 'ai';
import { ai } from './ai';
import fs from 'node:fs';
import path from 'node:path';
import { DOMAIN_VIDEO_PROMPT } from '../../prompts';

export class DomainVideoService {
  constructor() { }

  async generateDomainVideo(domainName: string, domainDescription: string, themeColor: string): Promise<string> {
    const prompt = DOMAIN_VIDEO_PROMPT(domainName, domainDescription, themeColor);

    const { videos } = await generateVideo({
      model: ai.video("google/veo-3.1-generate-001"),
      duration: 4,
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
