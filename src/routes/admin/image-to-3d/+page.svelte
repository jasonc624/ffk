<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
  import type { Img2ThreeSpec, LocalReliefOptions, MeshStats } from '$lib/admin/image-to-3d/schema';
  import {
    buildGroupFromSpec,
    buildLocalReliefMesh,
    computeMeshStats,
    disposeObject3D,
    exportGroupToGlb,
    generateThreeJsCode,
    normalizeGroupToGround
  } from '$lib/admin/image-to-3d/builder';

  type ConversionMode = 'trellis' | 'local-relief' | 'ai-procedural';
  type TrellisSpace = 'microsoft/TRELLIS.2' | 'trellis-community/TRELLIS';
  type LightPreset = 'studio' | 'dramatic' | 'bright';

  interface SavedModelEntry {
    name: string;
    url: string;
    bytes: number;
    modifiedAt: string;
  }

  // Image input state
  let isDragging = $state(false);
  let fileInputEl = $state<HTMLInputElement | null>(null);
  let imageDataUrl = $state<string | null>(null);
  let imageName = $state<string>('');
  let imageDims = $state<{ w: number; h: number } | null>(null);
  let loadedImageEl: HTMLImageElement | null = null;
  let uploadedFile: File | null = null;

  // Conversion controls
  let mode = $state<ConversionMode>('trellis');
  let trellisSpace = $state<TrellisSpace>('microsoft/TRELLIS.2');
  let trellisResolution = $state<'512' | '1024' | '1536'>('1024');
  let trellisTextureSize = $state<number>(1024);
  let trellisDecimation = $state<number>(150000);
  let trellisSimplify = $state<number>(0.95);
  let trellisRandomSeed = $state<boolean>(true);
  let trellisSeed = $state<number>(42);
  let hfToken = $state<string>('');
  let showHfToken = $state<boolean>(false);
  let elapsedConvertSec = $state<number>(0);
  let convertTimerInterval: ReturnType<typeof setInterval> | null = null;
  let rawGlbBlob: Blob | null = null;
  let rawGlbBytes = $state<number | null>(null);

  let detailLevel = $state<'balanced' | 'high'>('balanced');
  let promptHint = $state('');
  let localOpts = $state<LocalReliefOptions>({
    depth: 0.48,
    resolution: 88,
    removeBg: true,
    bgThreshold: 38,
    smoothPasses: 3,
    roughness: 0.45,
    metalness: 0.08,
    doubleSidedRelief: true
  });
  let mattePreviewUrl = $state<string | null>(null);

  // Generation & Export state
  let isConverting = $state(false);
  let statusMessage = $state('');
  let errorMessage = $state<string | null>(null);
  let activeSpec = $state<Img2ThreeSpec | null>(null);
  let generatedCode = $state<string>('');
  let showCodeModal = $state(false);
  let copiedCode = $state(false);
  let showEngineInfo = $state(false);

  let outputFilename = $state('my_model');
  let meshStats = $state<MeshStats | null>(null);
  let hasModel = $state(false);
  let isExporting = $state(false);
  let isSavingToProject = $state(false);
  let savedResult = $state<{ filename: string; publicUrl: string; bytes: number } | null>(null);
  let copiedPath = $state(false);

  // Viewport controls
  let autoSpin = $state(true);
  let wireframe = $state(false);
  let showGrid = $state(true);
  let lightPreset = $state<LightPreset>('studio');
  let savedModels = $state<SavedModelEntry[]>([]);
  let showSavedVault = $state(false);

  // Three.js viewport references (non-reactive)
  let viewportEl = $state<HTMLDivElement | null>(null);
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let gridHelper: THREE.GridHelper | null = null;
  let keyLight: THREE.DirectionalLight | null = null;
  let fillLight: THREE.DirectionalLight | null = null;
  let rimLight: THREE.DirectionalLight | null = null;
  let hemiLight: THREE.HemisphereLight | null = null;
  let currentModelGroup: THREE.Group | null = null;
  let animFrameId = 0;
  let resizeObserver: ResizeObserver | null = null;
  let reliefRebuildTimer: ReturnType<typeof setTimeout> | null = null;

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function sanitizeBaseName(raw: string): string {
    return (
      raw
        .replace(/\.[^.]+$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48) || 'custom_model'
    );
  }

  async function refreshSavedModels() {
    try {
      const res = await fetch('/api/admin/save-glb');
      if (res.ok) {
        const data = (await res.json()) as { models?: SavedModelEntry[] };
        savedModels = data.models ?? [];
      }
    } catch {
      // Ignore network errors
    }
  }

  function initThreeViewport() {
    if (!viewportEl) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090f1d);

    const w = Math.max(300, viewportEl.clientWidth);
    const h = Math.max(300, viewportEl.clientHeight);

    camera = new THREE.PerspectiveCamera(42, w / h, 0.05, 100);
    camera.position.set(2.8, 2.1, 3.6);

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    viewportEl.innerHTML = '';
    viewportEl.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.target.set(0, 1.0, 0);
    controls.minDistance = 0.8;
    controls.maxDistance = 16;

    // Studio 3-point lighting
    hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 1.3);
    scene.add(hemiLight);

    keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(4.5, 7, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 25;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    scene.add(keyLight);

    fillLight = new THREE.DirectionalLight(0x7dd3fc, 0.9);
    fillLight.position.set(-5, 3, -3);
    scene.add(fillLight);

    rimLight = new THREE.DirectionalLight(0xc084fc, 0.85);
    rimLight.position.set(0, 4, -6);
    scene.add(rimLight);

    // Subtle ground shadow receiver + crisp coordinate grid
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.ShadowMaterial({ opacity: 0.35 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    gridHelper = new THREE.GridHelper(10, 20, 0x38bdf8, 0x1e293b);
    gridHelper.position.y = 0.002;
    scene.add(gridHelper);

    applyLightPreset(lightPreset);

    resizeObserver = new ResizeObserver(() => {
      if (!viewportEl || !renderer || !camera) return;
      const nw = Math.max(200, viewportEl.clientWidth);
      const nh = Math.max(200, viewportEl.clientHeight);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    resizeObserver.observe(viewportEl);

    const clock = new THREE.Clock();
    const tick = () => {
      animFrameId = requestAnimationFrame(tick);
      const dt = Math.min(0.05, clock.getDelta());
      if (currentModelGroup && autoSpin) {
        currentModelGroup.rotation.y += dt * 0.45;
      }
      controls?.update();
      if (renderer && scene && camera) {
        renderer.render(scene, camera);
      }
    };
    tick();
  }

  function applyLightPreset(preset: LightPreset) {
    lightPreset = preset;
    if (!scene || !hemiLight || !keyLight || !fillLight || !rimLight) return;
    if (preset === 'studio') {
      scene.background = new THREE.Color(0x090f1d);
      hemiLight.intensity = 1.3;
      keyLight.intensity = 2.4;
      fillLight.intensity = 0.9;
      rimLight.intensity = 0.85;
    } else if (preset === 'dramatic') {
      scene.background = new THREE.Color(0x04060d);
      hemiLight.intensity = 0.55;
      keyLight.intensity = 3.1;
      fillLight.intensity = 0.4;
      rimLight.intensity = 1.9;
    } else {
      scene.background = new THREE.Color(0x182338);
      hemiLight.intensity = 2.1;
      keyLight.intensity = 2.6;
      fillLight.intensity = 1.4;
      rimLight.intensity = 0.7;
    }
  }

  function setWireframe(next: boolean) {
    wireframe = next;
    if (!currentModelGroup) return;
    currentModelGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mats = Array.isArray((obj as THREE.Mesh).material)
          ? ((obj as THREE.Mesh).material as THREE.Material[])
          : [(obj as THREE.Mesh).material as THREE.Material];
        for (const m of mats) {
          if ('wireframe' in m) {
            (m as THREE.MeshStandardMaterial).wireframe = next;
          }
        }
      }
    });
  }

  function setGridVisible(next: boolean) {
    showGrid = next;
    if (gridHelper) gridHelper.visible = next;
  }

  function resetCamera() {
    if (!camera || !controls) return;
    camera.position.set(2.8, 2.1, 3.6);
    controls.target.set(0, 1.0, 0);
    controls.update();
  }

  function mountModelInViewport(group: THREE.Group) {
    if (!scene) return;
    if (currentModelGroup) {
      scene.remove(currentModelGroup);
      disposeObject3D(currentModelGroup);
      currentModelGroup = null;
    }
    currentModelGroup = group;
    scene.add(group);
    setWireframe(wireframe);
    meshStats = computeMeshStats(group);
    hasModel = true;

    // Frame camera gently on the model's vertical center
    if (controls && camera) {
      const targetY = Math.max(0.55, meshStats.height * 0.5);
      controls.target.set(0, targetY, 0);
      controls.update();
    }
  }

  function clearAll() {
    imageDataUrl = null;
    imageName = '';
    imageDims = null;
    loadedImageEl = null;
    uploadedFile = null;
    rawGlbBlob = null;
    rawGlbBytes = null;
    mattePreviewUrl = null;
    activeSpec = null;
    generatedCode = '';
    errorMessage = null;
    savedResult = null;
    statusMessage = '';
    if (scene && currentModelGroup) {
      scene.remove(currentModelGroup);
      disposeObject3D(currentModelGroup);
      currentModelGroup = null;
    }
    meshStats = null;
    hasModel = false;
  }

  function resizeDataUrlForUpload(img: HTMLImageElement, maxEdge = 1024): string {
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  }

  function ingestFile(file: File) {
    if (!file.type.startsWith('image/')) {
      errorMessage = 'Please drop a valid image file (PNG, JPG, WebP, etc.).';
      return;
    }
    errorMessage = null;
    savedResult = null;
    uploadedFile = file;
    imageName = file.name || 'pasted_image.png';
    outputFilename = sanitizeBaseName(imageName);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        loadedImageEl = img;
        imageDims = { w: img.naturalWidth, h: img.naturalHeight };
        imageDataUrl = resizeDataUrlForUpload(img, 1024);

        // If user is in Instant Local Relief mode, generate 3D preview right away!
        if (mode === 'local-relief') {
          runLocalReliefBuild();
        }
      };
      img.onerror = () => {
        errorMessage = 'Could not decode that image file.';
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function handleFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) ingestFile(file);
    input.value = '';
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) ingestFile(file);
  }

  function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          ingestFile(file);
          break;
        }
      }
    }
  }

  function runLocalReliefBuild() {
    if (!loadedImageEl) return;
    errorMessage = null;
    savedResult = null;
    activeSpec = null;
    generatedCode = '';
    rawGlbBlob = null;
    rawGlbBytes = null;
    statusMessage = 'Sculpting watertight 3D relief mesh...';
    try {
      const { group, previewDataUrl } = buildLocalReliefMesh(loadedImageEl, localOpts);
      mattePreviewUrl = previewDataUrl;
      mountModelInViewport(group);
      statusMessage = 'Instant 3D relief ready — adjust sliders or export .glb!';
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Local 3D relief build failed.';
      statusMessage = '';
    }
  }

  function scheduleLocalReliefRebuild() {
    if (mode !== 'local-relief' || !loadedImageEl) return;
    if (reliefRebuildTimer) clearTimeout(reliefRebuildTimer);
    reliefRebuildTimer = setTimeout(() => {
      runLocalReliefBuild();
    }, 90);
  }

  async function runTrellisConversion() {
    if (!uploadedFile && !imageDataUrl) {
      errorMessage = 'Drop or select an image first.';
      return;
    }
    isConverting = true;
    errorMessage = null;
    savedResult = null;
    activeSpec = null;
    generatedCode = '';
    elapsedConvertSec = 0;
    if (convertTimerInterval) clearInterval(convertTimerInterval);
    convertTimerInterval = setInterval(() => {
      elapsedConvertSec += 1;
    }, 1000);

    const usedSeed = trellisRandomSeed ? Math.floor(Math.random() * 1_000_000) : trellisSeed;
    trellisSeed = usedSeed;
    statusMessage = `Connecting to ${trellisSpace} (ZeroGPU) · preprocessing & generating neural 3D GLB...`;

    try {
      const form = new FormData();
      if (uploadedFile) {
        form.append('image', uploadedFile, uploadedFile.name || 'input.png');
      } else if (imageDataUrl) {
        const blobRes = await fetch(imageDataUrl);
        const blob = await blobRes.blob();
        form.append('image', new File([blob], 'input.png', { type: 'image/png' }));
      }
      form.append('space', trellisSpace);
      form.append('resolution', trellisResolution);
      form.append('textureSize', String(trellisTextureSize));
      form.append('decimationTarget', String(trellisDecimation));
      form.append('meshSimplify', String(trellisSimplify));
      form.append('seed', String(usedSeed));
      if (hfToken.trim()) {
        form.append('hfToken', hfToken.trim());
        try {
          localStorage.setItem('admin_hf_token', hfToken.trim());
        } catch {
          // Ignore storage errors
        }
      }

      const res = await fetch('/api/admin/trellis', {
        method: 'POST',
        body: form
      });

      if (!res.ok) {
        let errText = `TRELLIS generation failed (HTTP ${res.status})`;
        try {
          const errJson = (await res.json()) as { error?: string };
          if (errJson.error) errText = errJson.error;
        } catch {
          // Ignore JSON parse errors
        }
        throw new Error(errText);
      }

      const glbBuffer = await res.arrayBuffer();
      rawGlbBlob = new Blob([glbBuffer], { type: 'model/gltf-binary' });
      rawGlbBytes = glbBuffer.byteLength;

      // Parse the real neural GLB straight into our interactive Three.js viewport
      const loader = new GLTFLoader();
      const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
        loader.parse(glbBuffer.slice(0), '', resolve, reject);
      });
      const normalized = normalizeGroupToGround(gltf.scene, 2.2);
      mountModelInViewport(normalized);

      const usedSpaceHeader = res.headers.get('X-Trellis-Space') || trellisSpace;
      statusMessage = `Generated neural GLB via ${usedSpaceHeader} (${formatBytes(glbBuffer.byteLength)}, seed ${usedSeed}) — ready to download or save!`;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'TRELLIS conversion failed.';
      statusMessage = '';
    } finally {
      isConverting = false;
      if (convertTimerInterval) {
        clearInterval(convertTimerInterval);
        convertTimerInterval = null;
      }
    }
  }

  async function runAiProceduralConversion() {
    if (!imageDataUrl) {
      errorMessage = 'Drop or select an image first.';
      return;
    }
    isConverting = true;
    errorMessage = null;
    savedResult = null;
    rawGlbBlob = null;
    rawGlbBytes = null;
    statusMessage = 'Analyzing reference silhouette, materials & detail inventory...';

    try {
      const res = await fetch('/api/admin/image-to-3d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl,
          hint: promptHint,
          detailLevel
        })
      });
      const data = (await res.json()) as { spec?: Img2ThreeSpec; error?: string };
      if (!res.ok || !data.spec) {
        throw new Error(data.error || `Conversion failed (HTTP ${res.status})`);
      }

      statusMessage = 'Assembling Three.js procedural geometry & normalizing scale...';
      activeSpec = data.spec;
      if (data.spec.suggestedFilename) {
        outputFilename = sanitizeBaseName(data.spec.suggestedFilename);
      }
      generatedCode = generateThreeJsCode(data.spec);

      const group = buildGroupFromSpec(data.spec);
      mountModelInViewport(group);
      statusMessage = `Reconstructed "${data.spec.title}" (${data.spec.parts.length} parts) — ready to export .glb!`;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to convert image to 3D.';
      statusMessage = '';
    } finally {
      isConverting = false;
    }
  }

  async function handleConvertClick() {
    if (mode === 'trellis') {
      await runTrellisConversion();
    } else if (mode === 'ai-procedural') {
      await runAiProceduralConversion();
    } else {
      runLocalReliefBuild();
    }
  }

  function switchMode(next: ConversionMode) {
    mode = next;
    errorMessage = null;
    if (next === 'local-relief' && loadedImageEl) {
      runLocalReliefBuild();
    }
  }

  async function exportCurrentGlbBlob(): Promise<Blob> {
    // If the active model came directly from TRELLIS, preserve its pristine neural GLB binary verbatim!
    if (rawGlbBlob) {
      return rawGlbBlob;
    }
    if (!currentModelGroup) {
      throw new Error('No 3D model is currently loaded in the viewport.');
    }
    // Temporarily reset turntable rotation & wireframe so the exported GLB is clean and upright
    const prevRotY = currentModelGroup.rotation.y;
    const prevWire = wireframe;
    currentModelGroup.rotation.y = 0;
    if (prevWire) setWireframe(false);
    try {
      const buffer = await exportGroupToGlb(currentModelGroup);
      return new Blob([buffer], { type: 'model/gltf-binary' });
    } finally {
      currentModelGroup.rotation.y = prevRotY;
      if (prevWire) setWireframe(true);
    }
  }

  async function downloadGlb() {
    if (!currentModelGroup || isExporting) return;
    isExporting = true;
    errorMessage = null;
    try {
      const blob = await exportCurrentGlbBlob();
      const name = `${sanitizeBaseName(outputFilename)}.glb`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      statusMessage = `Downloaded ${name} (${formatBytes(blob.size)})`;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'GLB export failed.';
    } finally {
      isExporting = false;
    }
  }

  async function saveGlbToProject() {
    if (!currentModelGroup || isSavingToProject) return;
    isSavingToProject = true;
    errorMessage = null;
    savedResult = null;
    try {
      const blob = await exportCurrentGlbBlob();
      const safeName = sanitizeBaseName(outputFilename);
      const form = new FormData();
      form.append('filename', safeName);
      form.append('file', new File([blob], `${safeName}.glb`, { type: 'model/gltf-binary' }));

      const res = await fetch('/api/admin/save-glb', {
        method: 'POST',
        body: form
      });
      const data = (await res.json()) as {
        ok?: boolean;
        filename?: string;
        publicUrl?: string;
        bytes?: number;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.filename || !data.publicUrl) {
        throw new Error(data.error || 'Failed to save GLB to static/models/');
      }
      savedResult = {
        filename: data.filename,
        publicUrl: data.publicUrl,
        bytes: data.bytes ?? blob.size
      };
      statusMessage = `Saved directly to static/models/${data.filename}!`;
      await refreshSavedModels();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to save GLB.';
    } finally {
      isSavingToProject = false;
    }
  }

  async function previewExistingGlb(entry: SavedModelEntry) {
    errorMessage = null;
    statusMessage = `Loading ${entry.name}...`;
    rawGlbBlob = null;
    rawGlbBytes = null;
    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(entry.url);
      const group = normalizeGroupToGround(gltf.scene, 2.2);
      mountModelInViewport(group);
      outputFilename = sanitizeBaseName(entry.name);
      activeSpec = null;
      generatedCode = '';
      statusMessage = `Inspecting ${entry.name} (${formatBytes(entry.bytes)})`;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : `Could not load ${entry.name}`;
      statusMessage = '';
    }
  }

  async function copyText(text: string, which: 'code' | 'path') {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'code') {
        copiedCode = true;
        setTimeout(() => (copiedCode = false), 1800);
      } else {
        copiedPath = true;
        setTimeout(() => (copiedPath = false), 1800);
      }
    } catch {
      // Ignore clipboard failures
    }
  }

  onMount(() => {
    try {
      hfToken = localStorage.getItem('admin_hf_token') ?? '';
    } catch {
      // Ignore storage errors
    }
    initThreeViewport();
    refreshSavedModels();
    window.addEventListener('paste', handlePaste);
  });

  onDestroy(() => {
    if (reliefRebuildTimer) clearTimeout(reliefRebuildTimer);
    if (convertTimerInterval) clearInterval(convertTimerInterval);
    if (typeof window === 'undefined') return;
    window.removeEventListener('paste', handlePaste);
    if (animFrameId) cancelAnimationFrame(animFrameId);
    resizeObserver?.disconnect();
    if (currentModelGroup) disposeObject3D(currentModelGroup);
    controls?.dispose();
    renderer?.dispose();
  });
</script>

<svelte:head>
  <title>Image to 3D GLB Studio — Admin</title>
</svelte:head>

<div class="min-h-screen bg-[#070b14] text-white flex flex-col relative overflow-x-hidden">
  <!-- Ambient Background -->
  <div class="pointer-events-none fixed inset-0">
    <div
      class="absolute inset-0 opacity-60"
      style="background: radial-gradient(circle at 15% 18%, rgba(56, 189, 248, 0.14), transparent 40%), radial-gradient(circle at 85% 85%, rgba(99, 102, 241, 0.12), transparent 45%), linear-gradient(180deg, #0b1222 0%, #050811 100%);"
    ></div>
  </div>

  <!-- Top Navigation Bar -->
  <header class="relative z-20 h-16 bg-[#0a101d]/95 backdrop-blur-md border-b border-white/10 px-5 md:px-8 flex items-center justify-between gap-4">
    <div class="flex items-center gap-3 min-w-0">
      <button
        onclick={() => goto('/admin')}
        class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-sky-400/40 font-['Share_Tech_Mono'] text-xs text-slate-300 hover:text-white transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
      >
        <span>←</span>
        <span>ADMIN</span>
      </button>
      <div class="h-5 w-px bg-white/10 hidden sm:block"></div>
      <div class="truncate">
        <div class="font-['Share_Tech_Mono'] text-[10px] tracking-[0.28em] text-sky-400 uppercase">
          MODULE 01 · ASSET GENERATOR
        </div>
        <h1 class="font-['Share_Tech_Mono'] text-sm md:text-base font-bold tracking-[0.1em] uppercase text-white truncate">
          IMAGE → 3D GLB STUDIO
        </h1>
      </div>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      <button
        onclick={() => (showSavedVault = !showSavedVault)}
        class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 font-['Share_Tech_Mono'] text-xs text-slate-200 transition-all cursor-pointer"
      >
        SAVED GLBS ({savedModels.length})
      </button>
      <button
        onclick={() => (showEngineInfo = !showEngineInfo)}
        title="How the installed libraries work"
        class="px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-400/30 font-['Share_Tech_Mono'] text-xs text-sky-300 transition-all cursor-pointer"
      >
        PIPELINE INFO
      </button>
    </div>
  </header>

  <!-- Optional Pipeline Info Banner -->
  {#if showEngineInfo}
    <div class="relative z-20 bg-[#0d172a] border-b border-sky-400/25 px-6 md:px-8 py-3 text-xs text-slate-300 flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div class="max-w-4xl leading-relaxed">
        <span class="font-['Share_Tech_Mono'] text-sky-300 font-bold uppercase mr-2">Pipeline Note:</span>
        <strong class="text-white">TRELLIS Neural GLB</strong> connects directly to Microsoft's hosted Hugging Face <code class="px-1.5 py-0.5 rounded bg-white/10 text-emerald-300">microsoft/TRELLIS.2</code> (or <code class="px-1.5 py-0.5 rounded bg-white/10 text-emerald-300">trellis-community/TRELLIS</code>) Space via <code class="px-1.5 py-0.5 rounded bg-white/10 text-sky-200">@gradio/client</code> — the same neural backend used by <code class="px-1.5 py-0.5 rounded bg-white/10 text-sky-200">img2threejs/plugin-img2glb</code> — with <strong class="text-emerald-300">no API key required</strong>. <strong class="text-white">Instant Relief</strong> runs 100% locally in your browser, and <strong class="text-white">Procedural AI</strong> generates editable Three.js code.
      </div>
      <button
        onclick={() => (showEngineInfo = false)}
        class="self-start md:self-center px-2.5 py-1 rounded bg-white/10 hover:bg-white/15 font-['Share_Tech_Mono'] text-[11px] text-white cursor-pointer"
      >
        DISMISS
      </button>
    </div>
  {/if}

  <!-- Optional Saved GLB Drawer -->
  {#if showSavedVault}
    <div class="relative z-20 bg-[#0a1222] border-b border-white/10 px-6 md:px-8 py-4">
      <div class="flex items-center justify-between mb-3">
        <span class="font-['Share_Tech_Mono'] text-xs tracking-[0.2em] uppercase text-sky-300">
          EXISTING MODELS IN static/models/ (CLICK TO INSPECT IN 3D)
        </span>
        <button
          onclick={() => (showSavedVault = false)}
          class="font-['Share_Tech_Mono'] text-xs text-slate-400 hover:text-white cursor-pointer"
        >
          CLOSE ✕
        </button>
      </div>
      {#if savedModels.length === 0}
        <p class="text-xs text-slate-400">No .glb files found in static/models/ yet.</p>
      {:else}
        <div class="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
          {#each savedModels as m}
            <button
              onclick={() => previewExistingGlb(m)}
              class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-sky-500/20 border border-white/10 hover:border-sky-400/50 font-['Share_Tech_Mono'] text-xs text-slate-200 hover:text-white transition-all cursor-pointer flex items-center gap-2"
            >
              <span>{m.name}</span>
              <span class="text-[10px] text-slate-400">{formatBytes(m.bytes)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Main Two-Column Studio Workspace -->
  <main class="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 md:p-6 max-w-[1600px] w-full mx-auto">
    <!-- ══════════════════════════════════════════════════════════════════ -->
    <!-- LEFT PANEL: IMAGE DROPZONE + CONVERSION CONTROLS                   -->
    <!-- ══════════════════════════════════════════════════════════════════ -->
    <section class="lg:col-span-5 xl:col-span-4 flex flex-col gap-4">
      <!-- 1. Image Dropzone -->
      <div class="bg-[#0c1424]/95 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <span class="font-['Share_Tech_Mono'] text-xs font-bold tracking-[0.2em] uppercase text-sky-300">
            1 · REFERENCE IMAGE
          </span>
          {#if imageDataUrl}
            <div class="flex items-center gap-2">
              <button
                onclick={() => fileInputEl?.click()}
                class="font-['Share_Tech_Mono'] text-[11px] text-slate-300 hover:text-sky-300 cursor-pointer"
              >
                REPLACE
              </button>
              <button
                onclick={clearAll}
                class="font-['Share_Tech_Mono'] text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer"
              >
                CLEAR
              </button>
            </div>
          {/if}
        </div>

        <input
          bind:this={fileInputEl}
          type="file"
          accept="image/*"
          onchange={handleFileChange}
          class="hidden"
        />

        {#if !imageDataUrl}
          <div
            role="button"
            tabindex="0"
            onclick={() => fileInputEl?.click()}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputEl?.click()}
            ondragover={(e) => {
              e.preventDefault();
              isDragging = true;
            }}
            ondragleave={() => (isDragging = false)}
            ondrop={handleDrop}
            class="group rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 min-h-[210px] {isDragging
              ? 'border-sky-400 bg-sky-500/15 scale-[1.01]'
              : 'border-white/15 hover:border-sky-400/60 bg-[#080e1a] hover:bg-sky-500/[0.06]'}"
          >
            <div class="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-400/35 flex items-center justify-center text-sky-300 group-hover:scale-105 transition-transform">
              <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div>
              <p class="text-base font-semibold text-white">Drop an image here or click to browse</p>
              <p class="font-['Share_Tech_Mono'] text-[11px] text-slate-400 mt-1">
                PNG · JPG · WEBP · OR PRESS CMD/CTRL+V TO PASTE
              </p>
            </div>
          </div>
        {:else}
          <div
            role="region"
            aria-label="Reference image drop zone"
            ondragover={(e) => {
              e.preventDefault();
              isDragging = true;
            }}
            ondragleave={() => (isDragging = false)}
            ondrop={handleDrop}
            class="relative rounded-xl overflow-hidden bg-[#060a14] border {isDragging
              ? 'border-sky-400'
              : 'border-white/10'} p-3 flex items-center gap-3"
          >
            <img
              src={imageDataUrl}
              alt="Reference"
              class="w-24 h-24 object-contain rounded-lg bg-[#0d1526] border border-white/10 shrink-0"
            />
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-white truncate" title={imageName}>{imageName}</div>
              {#if imageDims}
                <div class="font-['Share_Tech_Mono'] text-[11px] text-slate-400 mt-0.5">
                  {imageDims.w} × {imageDims.h} px
                </div>
              {/if}
              <div class="font-['Share_Tech_Mono'] text-[10px] text-emerald-400 mt-1.5">
                ● IMAGE READY FOR 3D CONVERSION
              </div>
            </div>
            {#if mode === 'local-relief' && mattePreviewUrl}
              <div class="flex flex-col items-center gap-1 shrink-0" title="Background Cutout Preview">
                <img
                  src={mattePreviewUrl}
                  alt="Cutout matte"
                  class="w-16 h-16 object-contain rounded-lg border border-sky-400/30"
                  style="background-image: repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%); background-size: 10px 10px;"
                />
                <span class="font-['Share_Tech_Mono'] text-[9px] text-slate-400">CUTOUT</span>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- 2. Conversion Mode & Settings -->
      <div class="bg-[#0c1424]/95 border border-white/10 rounded-2xl p-4 flex flex-col gap-4">
        <span class="font-['Share_Tech_Mono'] text-xs font-bold tracking-[0.2em] uppercase text-sky-300">
          2 · CONVERSION ENGINE
        </span>

        <!-- Mode Toggle -->
        <div class="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#070c17] border border-white/10">
          <button
            onclick={() => switchMode('trellis')}
            class="px-2.5 py-2 rounded-lg text-left transition-all cursor-pointer {mode === 'trellis'
              ? 'bg-emerald-500/20 border border-emerald-400/60 text-white shadow-[0_0_20px_rgba(16,185,129,0.18)]'
              : 'border border-transparent text-slate-400 hover:text-white'}"
          >
            <div class="font-['Share_Tech_Mono'] text-[11px] font-bold">TRELLIS GLB</div>
            <div class="text-[10px] opacity-80 mt-0.5">Real neural 3D</div>
          </button>

          <button
            onclick={() => switchMode('local-relief')}
            class="px-2.5 py-2 rounded-lg text-left transition-all cursor-pointer {mode === 'local-relief'
              ? 'bg-purple-500/20 border border-purple-400/60 text-white shadow-[0_0_20px_rgba(168,85,247,0.15)]'
              : 'border border-transparent text-slate-400 hover:text-white'}"
          >
            <div class="font-['Share_Tech_Mono'] text-[11px] font-bold">Local Relief</div>
            <div class="text-[10px] opacity-80 mt-0.5">Instant offline</div>
          </button>

          <button
            onclick={() => switchMode('ai-procedural')}
            class="px-2.5 py-2 rounded-lg text-left transition-all cursor-pointer {mode === 'ai-procedural'
              ? 'bg-sky-500/20 border border-sky-400/60 text-white shadow-[0_0_20px_rgba(56,189,248,0.15)]'
              : 'border border-transparent text-slate-400 hover:text-white'}"
          >
            <div class="font-['Share_Tech_Mono'] text-[11px] font-bold">Three.js Code</div>
            <div class="text-[10px] opacity-80 mt-0.5">Procedural spec</div>
          </button>
        </div>

        {#if mode === 'trellis'}
          <!-- Real Neural TRELLIS (img2glb) Controls -->
          <div class="flex flex-col gap-3">
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <span class="font-['Share_Tech_Mono'] text-[10px] tracking-[0.2em] uppercase text-slate-400">
                  HUGGING FACE TRELLIS SPACE
                </span>
                <span class="font-['Share_Tech_Mono'] text-[10px] text-emerald-300">
                  NO API KEY NEEDED
                </span>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <button
                  onclick={() => (trellisSpace = 'microsoft/TRELLIS.2')}
                  class="px-3 py-2 rounded-lg text-left border transition-all cursor-pointer {trellisSpace === 'microsoft/TRELLIS.2'
                    ? 'bg-emerald-500/15 border-emerald-400/70 text-emerald-100'
                    : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'}"
                >
                  <div class="font-['Share_Tech_Mono'] text-[11px] font-bold">TRELLIS.2</div>
                  <div class="text-[10px] opacity-75">Microsoft · Full PBR</div>
                </button>
                <button
                  onclick={() => (trellisSpace = 'trellis-community/TRELLIS')}
                  class="px-3 py-2 rounded-lg text-left border transition-all cursor-pointer {trellisSpace === 'trellis-community/TRELLIS'
                    ? 'bg-emerald-500/15 border-emerald-400/70 text-emerald-100'
                    : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'}"
                >
                  <div class="font-['Share_Tech_Mono'] text-[11px] font-bold">TRELLIS v1</div>
                  <div class="text-[10px] opacity-75">Community · Fast</div>
                </button>
              </div>
            </div>

            {#if trellisSpace === 'microsoft/TRELLIS.2'}
              <div class="grid grid-cols-2 gap-2.5">
                <div>
                  <div class="font-['Share_Tech_Mono'] text-[10px] text-slate-400 mb-1">RESOLUTION</div>
                  <div class="grid grid-cols-3 gap-1">
                    {#each (['512', '1024', '1536'] as const) as r}
                      <button
                        onclick={() => (trellisResolution = r)}
                        class="py-1.5 rounded-md font-['Share_Tech_Mono'] text-[11px] border cursor-pointer {trellisResolution === r
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                          : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'}"
                      >
                        {r}
                      </button>
                    {/each}
                  </div>
                </div>

                <div>
                  <div class="font-['Share_Tech_Mono'] text-[10px] text-slate-400 mb-1">TEXTURE SIZE</div>
                  <div class="grid grid-cols-2 gap-1">
                    {#each [1024, 2048] as t}
                      <button
                        onclick={() => (trellisTextureSize = t)}
                        class="py-1.5 rounded-md font-['Share_Tech_Mono'] text-[11px] border cursor-pointer {trellisTextureSize === t
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                          : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'}"
                      >
                        {t}px
                      </button>
                    {/each}
                  </div>
                </div>
              </div>

              <label class="flex flex-col gap-1">
                <div class="flex justify-between font-['Share_Tech_Mono'] text-[10px] text-slate-400">
                  <span>POLY DECIMATION TARGET</span>
                  <span class="text-emerald-300">{Math.round(trellisDecimation / 1000)}k faces</span>
                </div>
                <input
                  type="range"
                  min="100000"
                  max="350000"
                  step="25000"
                  bind:value={trellisDecimation}
                  class="accent-emerald-400 cursor-pointer"
                />
              </label>
            {:else}
              <div class="grid grid-cols-2 gap-3">
                <label class="flex flex-col gap-1">
                  <div class="flex justify-between font-['Share_Tech_Mono'] text-[10px] text-slate-400">
                    <span>MESH SIMPLIFY</span>
                    <span class="text-emerald-300">{trellisSimplify.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.9"
                    max="0.98"
                    step="0.01"
                    bind:value={trellisSimplify}
                    class="accent-emerald-400 cursor-pointer"
                  />
                </label>

                <div>
                  <div class="font-['Share_Tech_Mono'] text-[10px] text-slate-400 mb-1">TEXTURE SIZE</div>
                  <div class="grid grid-cols-3 gap-1">
                    {#each [512, 1024, 2048] as t}
                      <button
                        onclick={() => (trellisTextureSize = t)}
                        class="py-1.5 rounded-md font-['Share_Tech_Mono'] text-[11px] border cursor-pointer {trellisTextureSize === t
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                          : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'}"
                      >
                        {t}
                      </button>
                    {/each}
                  </div>
                </div>
              </div>
            {/if}

            <!-- Seed + Optional HF Token -->
            <div class="flex items-center justify-between gap-2 text-xs">
              <label class="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  bind:checked={trellisRandomSeed}
                  class="accent-emerald-400 w-4 h-4"
                />
                <span>Random Seed</span>
              </label>
              {#if !trellisRandomSeed}
                <input
                  type="number"
                  min="0"
                  bind:value={trellisSeed}
                  class="w-28 px-2.5 py-1 rounded-lg bg-[#070c17] border border-white/15 font-['Share_Tech_Mono'] text-xs text-white outline-none focus:border-emerald-400"
                />
              {/if}
              <button
                onclick={() => (showHfToken = !showHfToken)}
                class="font-['Share_Tech_Mono'] text-[10px] text-slate-400 hover:text-emerald-300 cursor-pointer"
              >
                {showHfToken ? 'HIDE HF TOKEN' : '+ HF TOKEN (OPTIONAL)'}
              </button>
            </div>

            {#if showHfToken}
              <input
                type="password"
                bind:value={hfToken}
                placeholder="hf_... (optional, only if free ZeroGPU quota is hit)"
                class="w-full px-3 py-2 rounded-lg bg-[#070c17] border border-white/15 focus:border-emerald-400 font-['Share_Tech_Mono'] text-xs text-white placeholder:text-slate-500 outline-none"
              />
            {/if}

            <button
              onclick={handleConvertClick}
              disabled={!imageDataUrl || isConverting}
              class="w-full py-3.5 px-4 rounded-xl font-['Share_Tech_Mono'] text-xs font-bold tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-2 {!imageDataUrl || isConverting
                ? 'bg-slate-800 text-slate-500 border border-white/10 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-500 to-sky-500 hover:from-emerald-400 hover:to-sky-400 text-slate-950 shadow-[0_10px_30px_rgba(16,185,129,0.28)] cursor-pointer'}"
            >
              {#if isConverting}
                <span class="w-4 h-4 rounded-full border-2 border-slate-900/30 border-t-slate-950 animate-spin"></span>
                <span>GENERATING NEURAL GLB... ({elapsedConvertSec}s)</span>
              {:else}
                <span>✦ GENERATE NEURAL 3D .GLB (TRELLIS)</span>
              {/if}
            </button>
          </div>
        {:else if mode === 'ai-procedural'}
          <div class="flex flex-col gap-3">
            <div>
              <label
                for="hint-input"
                class="block font-['Share_Tech_Mono'] text-[10px] tracking-[0.2em] uppercase text-slate-400 mb-1.5"
              >
                OPTIONAL GUIDANCE / SUBJECT HINT
              </label>
              <input
                id="hint-input"
                type="text"
                bind:value={promptHint}
                placeholder="e.g. cursed katana with glowing blue blade, anime sorcerer..."
                class="w-full px-3.5 py-2.5 rounded-xl bg-[#070c17] border border-white/15 focus:border-sky-400 text-sm text-white placeholder:text-slate-500 outline-none"
              />
            </div>

            <div>
              <div class="font-['Share_Tech_Mono'] text-[10px] tracking-[0.2em] uppercase text-slate-400 mb-1.5">
                GEOMETRY DETAIL LEVEL
              </div>
              <div class="grid grid-cols-2 gap-2">
                <button
                  onclick={() => (detailLevel = 'balanced')}
                  class="py-2 rounded-lg font-['Share_Tech_Mono'] text-xs border transition-all cursor-pointer {detailLevel === 'balanced'
                    ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                    : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'}"
                >
                  BALANCED (22–40 PARTS)
                </button>
                <button
                  onclick={() => (detailLevel = 'high')}
                  class="py-2 rounded-lg font-['Share_Tech_Mono'] text-xs border transition-all cursor-pointer {detailLevel === 'high'
                    ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                    : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'}"
                >
                  HIGH DETAIL (36–64 PARTS)
                </button>
              </div>
            </div>

            <button
              onclick={handleConvertClick}
              disabled={!imageDataUrl || isConverting}
              class="w-full py-3.5 px-4 rounded-xl font-['Share_Tech_Mono'] text-xs font-bold tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-2 {!imageDataUrl || isConverting
                ? 'bg-slate-800 text-slate-500 border border-white/10 cursor-not-allowed'
                : 'bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white shadow-[0_10px_30px_rgba(56,189,248,0.28)] cursor-pointer'}"
            >
              {#if isConverting}
                <span class="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span>
                <span>RECONSTRUCTING 3D MODEL...</span>
              {:else}
                <span>✦ GENERATE 3D MODEL (img2threejs)</span>
              {/if}
            </button>
          </div>
        {:else}
          <!-- Instant Local Sculpted 3D Relief Sliders -->
          <div class="flex flex-col gap-3 text-xs">
            <div class="grid grid-cols-2 gap-3">
              <label class="flex flex-col gap-1">
                <div class="flex justify-between font-['Share_Tech_Mono'] text-[10px] text-slate-400">
                  <span>3D THICKNESS</span>
                  <span class="text-purple-300">{localOpts.depth.toFixed(2)}m</span>
                </div>
                <input
                  type="range"
                  min="0.12"
                  max="1.25"
                  step="0.02"
                  bind:value={localOpts.depth}
                  oninput={scheduleLocalReliefRebuild}
                  class="accent-purple-400 cursor-pointer"
                />
              </label>

              <label class="flex flex-col gap-1">
                <div class="flex justify-between font-['Share_Tech_Mono'] text-[10px] text-slate-400">
                  <span>MESH RESOLUTION</span>
                  <span class="text-purple-300">{localOpts.resolution}px</span>
                </div>
                <input
                  type="range"
                  min="36"
                  max="136"
                  step="4"
                  bind:value={localOpts.resolution}
                  oninput={scheduleLocalReliefRebuild}
                  class="accent-purple-400 cursor-pointer"
                />
              </label>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <label class="flex flex-col gap-1">
                <div class="flex justify-between font-['Share_Tech_Mono'] text-[10px] text-slate-400">
                  <span>BG THRESHOLD</span>
                  <span class="text-purple-300">{localOpts.bgThreshold}</span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="110"
                  step="2"
                  disabled={!localOpts.removeBg}
                  bind:value={localOpts.bgThreshold}
                  oninput={scheduleLocalReliefRebuild}
                  class="accent-purple-400 cursor-pointer disabled:opacity-40"
                />
              </label>

              <label class="flex flex-col gap-1">
                <div class="flex justify-between font-['Share_Tech_Mono'] text-[10px] text-slate-400">
                  <span>SMOOTHNESS</span>
                  <span class="text-purple-300">{localOpts.smoothPasses}×</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="6"
                  step="1"
                  bind:value={localOpts.smoothPasses}
                  oninput={scheduleLocalReliefRebuild}
                  class="accent-purple-400 cursor-pointer"
                />
              </label>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <label class="flex flex-col gap-1">
                <div class="flex justify-between font-['Share_Tech_Mono'] text-[10px] text-slate-400">
                  <span>ROUGHNESS</span>
                  <span class="text-purple-300">{localOpts.roughness.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  bind:value={localOpts.roughness}
                  oninput={scheduleLocalReliefRebuild}
                  class="accent-purple-400 cursor-pointer"
                />
              </label>

              <label class="flex flex-col gap-1">
                <div class="flex justify-between font-['Share_Tech_Mono'] text-[10px] text-slate-400">
                  <span>METALNESS</span>
                  <span class="text-purple-300">{localOpts.metalness.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  bind:value={localOpts.metalness}
                  oninput={scheduleLocalReliefRebuild}
                  class="accent-purple-400 cursor-pointer"
                />
              </label>
            </div>

            <div class="flex items-center gap-4 pt-1">
              <label class="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  bind:checked={localOpts.removeBg}
                  onchange={scheduleLocalReliefRebuild}
                  class="accent-purple-400 w-4 h-4"
                />
                <span>Auto Remove BG</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  bind:checked={localOpts.doubleSidedRelief}
                  onchange={scheduleLocalReliefRebuild}
                  class="accent-purple-400 w-4 h-4"
                />
                <span>Mirrored 3D Back</span>
              </label>
            </div>

            <button
              onclick={runLocalReliefBuild}
              disabled={!imageDataUrl}
              class="w-full py-3 px-4 rounded-xl font-['Share_Tech_Mono'] text-xs font-bold tracking-[0.2em] uppercase transition-all {!imageDataUrl
                ? 'bg-slate-800 text-slate-500 border border-white/10 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-500 to-sky-500 hover:from-purple-400 hover:to-sky-400 text-white shadow-[0_10px_28px_rgba(168,85,247,0.25)] cursor-pointer'}"
            >
              REBUILD INSTANT 3D MESH
            </button>
          </div>
        {/if}

        <!-- Status / Error Feed -->
        {#if errorMessage}
          <div class="rounded-xl bg-rose-500/15 border border-rose-400/40 px-3.5 py-2.5 text-xs text-rose-200">
            {errorMessage}
          </div>
        {:else if statusMessage}
          <div class="rounded-xl bg-sky-500/10 border border-sky-400/30 px-3.5 py-2.5 font-['Share_Tech_Mono'] text-[11px] text-sky-200">
            {statusMessage}
          </div>
        {/if}
      </div>

      <!-- 3. AI Reconstruction Breakdown (shown after img2threejs run) -->
      {#if activeSpec}
        <div class="bg-[#0c1424]/95 border border-sky-400/25 rounded-2xl p-4 flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="font-['Share_Tech_Mono'] text-[10px] tracking-[0.2em] uppercase text-sky-400">
                {activeSpec.subjectType} · {activeSpec.parts.length} COMPONENTS
              </div>
              <h3 class="text-base font-bold text-white">{activeSpec.title}</h3>
            </div>
            <button
              onclick={() => (showCodeModal = true)}
              class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 font-['Share_Tech_Mono'] text-[11px] text-sky-300 cursor-pointer shrink-0"
            >
              VIEW THREE.JS CODE
            </button>
          </div>

          <p class="text-xs text-slate-300 leading-relaxed">{activeSpec.summary}</p>

          <!-- Material Palette Swatches -->
          <div>
            <div class="font-['Share_Tech_Mono'] text-[10px] tracking-[0.2em] uppercase text-slate-400 mb-1.5">
              SAMPLED MATERIALS
            </div>
            <div class="flex flex-wrap gap-1.5">
              {#each activeSpec.materials as mat}
                <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 font-['Share_Tech_Mono'] text-[10px] text-slate-200">
                  <span
                    class="w-3 h-3 rounded-sm border border-white/25"
                    style="background: {mat.color};"
                  ></span>
                  {mat.id}
                </span>
              {/each}
            </div>
          </div>

          <!-- Detail Inventory -->
          <div>
            <div class="font-['Share_Tech_Mono'] text-[10px] tracking-[0.2em] uppercase text-slate-400 mb-1.5">
              DETAIL INVENTORY
            </div>
            <div class="flex flex-wrap gap-1.5">
              {#each activeSpec.detailInventory as item}
                <span class="px-2 py-0.5 rounded bg-sky-500/10 border border-sky-400/20 text-[11px] text-sky-100">
                  {item}
                </span>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </section>

    <!-- ══════════════════════════════════════════════════════════════════ -->
    <!-- RIGHT PANEL: LIVE 3D VIEWPORT + GLB EXPORT DOCK                    -->
    <!-- ══════════════════════════════════════════════════════════════════ -->
    <section class="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
      <div class="relative flex-1 min-h-[460px] lg:min-h-[580px] rounded-2xl overflow-hidden border border-white/15 bg-[#090f1d] flex flex-col">
        <!-- Viewport Overlay Toolbar -->
        <div class="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <div class="flex items-center gap-1.5 pointer-events-auto bg-[#070b14]/85 backdrop-blur-md border border-white/10 rounded-xl p-1">
            <button
              onclick={() => (autoSpin = !autoSpin)}
              class="px-2.5 py-1 rounded-lg font-['Share_Tech_Mono'] text-[11px] transition-all cursor-pointer {autoSpin
                ? 'bg-sky-500/25 text-sky-200'
                : 'text-slate-400 hover:text-white'}"
            >
              SPIN {autoSpin ? 'ON' : 'OFF'}
            </button>
            <button
              onclick={() => setWireframe(!wireframe)}
              class="px-2.5 py-1 rounded-lg font-['Share_Tech_Mono'] text-[11px] transition-all cursor-pointer {wireframe
                ? 'bg-purple-500/25 text-purple-200'
                : 'text-slate-400 hover:text-white'}"
            >
              WIREFRAME
            </button>
            <button
              onclick={() => setGridVisible(!showGrid)}
              class="px-2.5 py-1 rounded-lg font-['Share_Tech_Mono'] text-[11px] transition-all cursor-pointer {showGrid
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:text-white'}"
            >
              GRID
            </button>
            <button
              onclick={resetCamera}
              class="px-2.5 py-1 rounded-lg font-['Share_Tech_Mono'] text-[11px] text-slate-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            >
              RESET VIEW
            </button>
          </div>

          <!-- Lighting Presets -->
          <div class="flex items-center gap-1 pointer-events-auto bg-[#070b14]/85 backdrop-blur-md border border-white/10 rounded-xl p-1 font-['Share_Tech_Mono'] text-[10px]">
            {#each (['studio', 'dramatic', 'bright'] as const) as preset}
              <button
                onclick={() => applyLightPreset(preset)}
                class="px-2.5 py-1 rounded-lg uppercase transition-all cursor-pointer {lightPreset === preset
                  ? 'bg-amber-500/25 text-amber-200'
                  : 'text-slate-400 hover:text-white'}"
              >
                {preset}
              </button>
            {/each}
          </div>
        </div>

        <!-- Live Three.js WebGL Canvas -->
        <div bind:this={viewportEl} class="w-full h-full flex-1 cursor-grab active:cursor-grabbing"></div>

        <!-- Empty Viewport Guide -->
        {#if !hasModel && !isConverting}
          <div class="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div class="bg-[#070b14]/80 backdrop-blur-md border border-white/10 rounded-2xl px-6 py-5 text-center max-w-md">
              <div class="font-['Share_Tech_Mono'] text-[11px] tracking-[0.28em] uppercase text-sky-400 mb-2">
                LIVE 3D PREVIEW STAGE
              </div>
              <p class="text-sm text-slate-300 leading-relaxed">
                Drop or paste an image on the left, then generate a 3D model to orbit, inspect geometry, and export as a binary <code class="text-sky-300">.glb</code>.
              </p>
              <div class="font-['Share_Tech_Mono'] text-[10px] text-slate-500 mt-3">
                LEFT DRAG: ORBIT · SCROLL: ZOOM · RIGHT DRAG: PAN
              </div>
            </div>
          </div>
        {/if}

        <!-- Converting Overlay -->
        {#if isConverting}
          <div class="absolute inset-0 bg-[#070b14]/75 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20 p-6 text-center">
            <div class="w-12 h-12 rounded-full border-2 border-emerald-400/25 border-t-emerald-400 animate-spin"></div>
            <div class="font-['Share_Tech_Mono'] text-xs tracking-[0.25em] uppercase text-emerald-300">
              {mode === 'trellis'
                ? `GENERATING NEURAL GLB ON ${trellisSpace.toUpperCase()} · ${elapsedConvertSec}s`
                : 'RECONSTRUCTING 3D MESH...'}
            </div>
            <div class="text-xs text-slate-400 max-w-sm">
              {mode === 'trellis'
                ? 'Removing background, synthesizing 3D structured latents, and baking PBR textures on Hugging Face ZeroGPU (typically 20–60s)...'
                : 'Analyzing reference silhouette, proportions, and materials via procedural pipeline'}
            </div>
          </div>
        {/if}

        <!-- Bottom Mesh Diagnostics Overlay -->
        {#if meshStats}
          <div class="absolute bottom-3 left-3 right-3 z-10 pointer-events-none flex flex-wrap items-center justify-between gap-2">
            <div class="bg-[#070b14]/85 backdrop-blur-md border border-white/10 rounded-xl px-3.5 py-2 flex flex-wrap items-center gap-4 font-['Share_Tech_Mono'] text-[11px]">
              <span class="text-slate-400">MESHES <strong class="text-white">{meshStats.meshes}</strong></span>
              <span class="text-slate-400">TRIS <strong class="text-sky-300">{meshStats.triangles.toLocaleString()}</strong></span>
              <span class="text-slate-400">VERTS <strong class="text-white">{meshStats.vertices.toLocaleString()}</strong></span>
              <span class="text-slate-400">
                SIZE <strong class="text-emerald-300">{meshStats.width}×{meshStats.height}×{meshStats.depth}m</strong>
              </span>
              {#if rawGlbBytes}
                <span class="text-slate-400">
                  GLB <strong class="text-amber-300">{formatBytes(rawGlbBytes)}</strong>
                </span>
              {/if}
            </div>
            <div class="hidden sm:block bg-[#070b14]/75 border border-white/10 rounded-xl px-3 py-1.5 font-['Share_Tech_Mono'] text-[10px] text-slate-400">
              DRAG TO ORBIT · SCROLL TO ZOOM
            </div>
          </div>
        {/if}
      </div>

      <!-- 3. Export & Save GLB Bar -->
      <div class="bg-[#0c1424]/95 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
        <div class="flex flex-col md:flex-row md:items-center gap-3">
          <div class="flex-1 flex items-center rounded-xl bg-[#070c17] border border-white/15 focus-within:border-sky-400 overflow-hidden">
            <span class="px-3 font-['Share_Tech_Mono'] text-[11px] text-slate-400 border-r border-white/10">
              FILENAME
            </span>
            <input
              type="text"
              bind:value={outputFilename}
              placeholder="my_model"
              class="flex-1 bg-transparent px-3 py-2.5 font-['Share_Tech_Mono'] text-sm text-white outline-none"
            />
            <span class="px-3 font-['Share_Tech_Mono'] text-xs text-sky-300">.glb</span>
          </div>

          <div class="flex items-center gap-2.5 shrink-0">
            <button
              onclick={downloadGlb}
              disabled={!hasModel || isExporting}
              class="px-5 py-2.5 rounded-xl font-['Share_Tech_Mono'] text-xs font-bold tracking-[0.15em] uppercase transition-all {!hasModel || isExporting
                ? 'bg-slate-800 text-slate-500 border border-white/10 cursor-not-allowed'
                : 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-[0_8px_24px_rgba(56,189,248,0.28)] cursor-pointer'}"
            >
              {isExporting ? 'EXPORTING...' : '↓ DOWNLOAD .GLB'}
            </button>

            <button
              onclick={saveGlbToProject}
              disabled={!hasModel || isSavingToProject}
              class="px-5 py-2.5 rounded-xl font-['Share_Tech_Mono'] text-xs font-bold tracking-[0.15em] uppercase transition-all {!hasModel || isSavingToProject
                ? 'bg-slate-800 text-slate-500 border border-white/10 cursor-not-allowed'
                : 'bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/60 text-emerald-200 cursor-pointer'}"
            >
              {isSavingToProject ? 'SAVING...' : 'SAVE TO STATIC/MODELS'}
            </button>
          </div>
        </div>

        {#if savedResult}
          <div class="rounded-xl bg-emerald-500/10 border border-emerald-400/35 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 font-['Share_Tech_Mono'] text-xs">
            <div class="text-emerald-200">
              ✓ Saved <strong class="text-white">{savedResult.filename}</strong> ({formatBytes(savedResult.bytes)}) →
              <code class="ml-1 px-1.5 py-0.5 rounded bg-black/40 text-emerald-300">{savedResult.publicUrl}</code>
            </div>
            <button
              onclick={() => savedResult && copyText(savedResult.publicUrl, 'path')}
              class="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 text-[11px] cursor-pointer"
            >
              {copiedPath ? 'COPIED ✓' : 'COPY URL'}
            </button>
          </div>
        {/if}
      </div>
    </section>
  </main>
</div>

<!-- Generated Three.js Factory Code Modal -->
{#if showCodeModal && generatedCode}
  <div class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-[#0b1222] border border-white/15 rounded-2xl w-full max-w-3xl max-h-[82vh] flex flex-col overflow-hidden shadow-2xl">
      <div class="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
        <div>
          <div class="font-['Share_Tech_Mono'] text-[10px] tracking-[0.25em] uppercase text-sky-400">
            IMG2THREEJS PROCEDURAL OUTPUT
          </div>
          <div class="text-sm font-bold text-white">Generated Three.js TypeScript Factory</div>
        </div>
        <div class="flex items-center gap-2">
          <button
            onclick={() => copyText(generatedCode, 'code')}
            class="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 font-['Share_Tech_Mono'] text-xs text-sky-200 cursor-pointer"
          >
            {copiedCode ? 'COPIED ✓' : 'COPY CODE'}
          </button>
          <button
            onclick={() => (showCodeModal = false)}
            class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 font-['Share_Tech_Mono'] text-xs text-slate-300 cursor-pointer"
          >
            CLOSE ✕
          </button>
        </div>
      </div>
      <pre class="p-5 overflow-auto text-xs font-['Share_Tech_Mono'] text-sky-100/90 leading-relaxed">{generatedCode}</pre>
    </div>
  </div>
{/if}
