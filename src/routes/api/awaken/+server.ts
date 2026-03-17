import { json } from '@sveltejs/kit';
import { CharacterAwakeningService } from '$lib/services/ai/CharacterAwakeningService';
import { DomainVideoService } from '$lib/services/ai/DomainVideoService';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const { answers, sorcererName } = await request.json();
  const awakeningService = new CharacterAwakeningService();
  const videoService = new DomainVideoService();

  try {
    // 1. Awaken the character and get their technique/domain profile
    const characterData = await awakeningService.awaken(sorcererName, answers);

    // 2. Generate the domain background video using the AI-generated domain metadata
    try {
      const videoUrl = await videoService.generateDomainVideo(
        characterData.domain.name,
        characterData.domain.description,
        characterData.color
      );
      characterData.domain.videoUrl = videoUrl;
    } catch (videoError) {
      console.error('Domain Video Generation Failed:', videoError);
      // We continue even if video fails so the character is still created
    }

    return json({
      ...characterData,
      grade: 0,
      maxGrade: 0
    });
  } catch (error) {
    console.error('AI Generation Error:', error);
    return json({ error: 'Failed to awaken technique' }, { status: 500 });
  }
};
