import { json } from '@sveltejs/kit';
import { CharacterAwakeningService } from '$lib/services/ai/CharacterAwakeningService';
import { DomainHtmlService } from '$lib/services/ai/DomainHtmlService';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const { answers, sorcererName } = await request.json();
  const awakeningService = new CharacterAwakeningService();
  const htmlService = new DomainHtmlService();

  try {
    // 1. Awaken the character and get their technique/initial domain lore
    const characterData = await awakeningService.awaken(sorcererName, answers);

    // 2. Generate the high-fidelity HTML domain separately
    let htmlDomain: any = null;
    try {
      htmlDomain = await htmlService.generateDomainHtml(
        characterData.domain.name,
        characterData.domain.description
      );
    } catch (htmlError) {
      console.error('Domain HTML Generation Failed:', htmlError);
    }

    // 3. Prepare separated records
    const characterId = crypto.randomUUID();
    
    // Relate them: Merging lore from awakening with technical assets from HTML service
    const finalDomain = {
      ...(htmlDomain || characterData.domain),
      id: characterId // Relating it to the character
    };

    const finalCharacter = {
      ...characterData,
      id: characterId,
      domain: {
        name: finalDomain.name,
        description: finalDomain.description,
        // We keep the heavy lifting (html/config) in the 'domain' record, 
        // the 'character' record only has metadata
      },
      grade: 0,
      maxGrade: 0
    };

    return json({
      character: finalCharacter,
      domain: finalDomain
    });
  } catch (error) {
    console.error('AI Generation Error:', error);
    return json({ error: 'Failed to awaken technique' }, { status: 500 });
  }
};
