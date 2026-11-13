import Phaser from 'phaser';

export class DomainSceneCapture {
  /**
   * Captures an HTML string to a Phaser texture.
   * Creates a hidden iframe to render the HTML, extracts the canvas,
   * and adds it to the texture manager.
   */
  static async capture(scene: Phaser.Scene, html: string, key: string): Promise<void> {
    return new Promise((resolve) => {
      // 1. Create a hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.top = '-9999px';
      iframe.style.width = '1280px'; // Higher res for domain backgrounds
      iframe.style.height = '720px';
      document.body.appendChild(iframe);

      // 2. Set the HTML content
      iframe.srcdoc = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body, html { margin: 0; padding: 0; overflow: hidden; height: 100%; width: 100%; background: black; }
              canvas { width: 100%; height: 100%; display: block; }
            </style>
          </head>
          <body>
            ${html}
          </body>
        </html>
      `;

      // 3. Handle capture
      iframe.onload = () => {
        // Wait for the internal scripts to initialize and draw a frame
        // Most AI-generated scenes will use requestAnimationFrame
        setTimeout(() => {
          try {
            const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
            const canvas = innerDoc?.querySelector('canvas');

            if (canvas) {
              // Add to texture manager
              if (scene.textures.exists(key)) {
                scene.textures.remove(key);
              }
              scene.textures.addCanvas(key, canvas);
              console.log(`[DomainSceneCapture] Captured HTML to texture: ${key}`);
            } else {
              console.warn('[DomainSceneCapture] No canvas found in domain HTML');
            }
          } catch (e) {
            console.error('[DomainSceneCapture] Failed to capture iframe canvas:', e);
          } finally {
            document.body.removeChild(iframe);
            resolve();
          }
        }, 1000); // Give it a full second to render the first few frames
      };
    });
  }
}
