"use client";

import { useEffect, useRef, useState } from "react";
import { THEME_CHANGE_EVENT } from "@/lib/theme-preferences";
import styles from "./landing-three.module.css";

type SceneState = "static" | "loading" | "ready" | "failed";
type ThreeModule = typeof import("three");
type ThreeRenderer = import("three").WebGLRenderer;
type ThreeCamera = import("three").OrthographicCamera;
type ThreeObject = import("three").Object3D;
type ThreeGeometry = import("three").BufferGeometry;
type ThreeMaterial = import("three").Material;

function mountFolioScene(
  THREE: ThreeModule,
  canvas: HTMLCanvasElement,
  onContextLoss: () => void,
): (loseContext?: boolean) => void {
  let renderer: ThreeRenderer | null = null;
  let camera: ThreeCamera | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let contextLostHandler: ((event: Event) => void) | null = null;
  let themeChangeHandler: (() => void) | null = null;
  let disposed = false;
  const geometries = new Set<ThreeGeometry>();
  const materials = new Set<ThreeMaterial>();

  const handleResize = () => {
    if (!renderer) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width <= 0 || height <= 0) return;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    const aspect = width / height;
    if (camera) {
      camera.left = -3.2 * aspect;
      camera.right = 3.2 * aspect;
      camera.top = 3.2;
      camera.bottom = -3.2;
      camera.updateProjectionMatrix();
    }
  };

  const cleanup = (loseContext = true) => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("resize", handleResize);
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (contextLostHandler) {
      canvas.removeEventListener("webglcontextlost", contextLostHandler);
      contextLostHandler = null;
    }
    if (themeChangeHandler) {
      window.removeEventListener(THEME_CHANGE_EVENT, themeChangeHandler);
      themeChangeHandler = null;
    }

    if (renderer) {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      if (loseContext) renderer.forceContextLoss();
      renderer = null;
    }
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    geometries.clear();
    materials.clear();
  };

  try {
    const activeRenderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer = activeRenderer;
    activeRenderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const activeCamera = new THREE.OrthographicCamera(-3.2, 3.2, 3.2, -3.2, 0.1, 50);
    camera = activeCamera;
    activeCamera.position.set(0, 0, 12);
    activeCamera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    const keyLight = new THREE.DirectionalLight(0xfff4da, 2.4);
    keyLight.position.set(-3, 5, 8);
    scene.add(keyLight);

    const coverMaterial = new THREE.MeshStandardMaterial({ color: "#174b46", roughness: 0.78 });
    const paperMaterial = new THREE.MeshStandardMaterial({ color: "#e7f2ef", roughness: 0.94 });
    const paperShadeMaterial = new THREE.MeshStandardMaterial({ color: "#d8e6e1", roughness: 0.96 });
    const inkMaterial = new THREE.MeshStandardMaterial({ color: "#78938c", roughness: 0.9 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: "#76e0bd", roughness: 0.62 });
    [coverMaterial, paperMaterial, paperShadeMaterial, inkMaterial, accentMaterial].forEach((material) => materials.add(material));
    const nodeMaterials: import("three").MeshStandardMaterial[] = [];

    const addBox = (
      parent: ThreeObject,
      dimensions: [number, number, number],
      position: [number, number, number],
      material: ThreeMaterial,
    ) => {
      const geometry = new THREE.BoxGeometry(...dimensions);
      geometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      parent.add(mesh);
      return mesh;
    };

    const folio = new THREE.Group();
    folio.rotation.x = -0.07;
    scene.add(folio);
    addBox(folio, [5.15, 3.62, 0.2], [0, 0, -0.15], coverMaterial);
    addBox(folio, [2.46, 3.16, 0.09], [-1.27, 0, 0.02], paperMaterial);
    addBox(folio, [2.46, 3.16, 0.09], [1.27, 0, 0.02], paperMaterial);
    addBox(folio, [0.14, 3.32, 0.18], [0, 0, 0.03], coverMaterial);

    addBox(folio, [1.02, 0.1, 0.035], [-1.7, 1.05, 0.09], accentMaterial);
    addBox(folio, [1.65, 0.045, 0.03], [-1.35, 0.68, 0.09], inkMaterial);
    addBox(folio, [1.72, 0.04, 0.03], [-1.31, 0.35, 0.09], paperShadeMaterial);
    addBox(folio, [1.56, 0.04, 0.03], [-1.39, 0.08, 0.09], paperShadeMaterial);
    addBox(folio, [1.24, 0.04, 0.03], [-1.55, -0.2, 0.09], paperShadeMaterial);
    addBox(folio, [0.66, 0.08, 0.03], [1.55, 1.05, 0.09], accentMaterial);
    addBox(folio, [1.72, 0.045, 0.03], [1.31, 0.68, 0.09], inkMaterial);
    addBox(folio, [1.68, 0.04, 0.03], [1.33, 0.35, 0.09], paperShadeMaterial);
    addBox(folio, [1.52, 0.04, 0.03], [1.41, 0.08, 0.09], paperShadeMaterial);
    addBox(folio, [1.68, 0.04, 0.03], [1.33, -0.2, 0.09], paperShadeMaterial);
    addBox(folio, [1.24, 0.04, 0.03], [1.55, -0.48, 0.09], paperShadeMaterial);
    addBox(folio, [1.48, 0.04, 0.03], [-1.43, -0.48, 0.09], paperShadeMaterial);
    addBox(folio, [1.64, 0.04, 0.03], [-1.35, -0.76, 0.09], paperShadeMaterial);
    addBox(folio, [1.36, 0.04, 0.03], [1.49, -0.76, 0.09], paperShadeMaterial);

    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(
      new THREE.EllipseCurve(0, 0, 3.08, 2.12, 0, Math.PI * 2).getPoints(96),
    );
    geometries.add(orbitGeometry);
    const orbitMaterial = new THREE.LineBasicMaterial({ color: "#76e0bd", transparent: true, opacity: 0.42 });
    materials.add(orbitMaterial);
    const orbit = new THREE.LineLoop(orbitGeometry, orbitMaterial);
    orbit.position.z = 0.42;
    const orbitingConcepts = new THREE.Group();
    orbitingConcepts.add(orbit);
    scene.add(orbitingConcepts);

    const nodeGeometry = new THREE.SphereGeometry(0.105, 16, 12);
    geometries.add(nodeGeometry);
    const nodeColors = ["#76e0bd", "#d8fff1", "#d8b783", "#91c5b2"];
    const nodePositions: Array<[number, number]> = [
      [3.08, 0],
      [0, 2.12],
      [-3.08, 0],
      [0, -2.12],
    ];
    nodePositions.forEach(([x, y], index) => {
      const material = new THREE.MeshStandardMaterial({ color: nodeColors[index], roughness: 0.52 });
      materials.add(material);
      nodeMaterials.push(material);
      const node = new THREE.Mesh(nodeGeometry, material);
      node.position.set(x, y, 0.48);
      orbitingConcepts.add(node);
    });

    const updateTheme = () => {
      const readColor = (property: string, fallback: string) => (
        window.getComputedStyle(canvas).getPropertyValue(property).trim() || fallback
      );
      const accentColor = new THREE.Color(readColor("--sea-glass", "#76e0bd"));
      const surfaceColor = new THREE.Color(readColor("--night-library", "#0b1118"));
      const partnerColor = readColor("--partner", "#9bb9b0");
      const highlightColor = readColor("--paper-glint", "#d8fff1");
      const mainColor = readColor("--palette-main", "#76e0bd");

      coverMaterial.color.copy(surfaceColor.lerp(accentColor, 0.38));
      inkMaterial.color.set(partnerColor);
      accentMaterial.color.copy(accentColor);
      orbitMaterial.color.copy(accentColor);
      nodeMaterials.forEach((material, index) => {
        material.color.set([accentColor, highlightColor, partnerColor, mainColor][index]);
      });
    };
    themeChangeHandler = updateTheme;
    window.addEventListener(THEME_CHANGE_EVENT, themeChangeHandler);
    updateTheme();

    const resizeTarget = canvas.parentElement;
    window.addEventListener("resize", handleResize, { passive: true });
    if (resizeTarget && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(resizeTarget);
    }
    handleResize();

    contextLostHandler = (event: Event) => {
      event.preventDefault();
      onContextLoss();
    };
    canvas.addEventListener("webglcontextlost", contextLostHandler);

    activeRenderer.setAnimationLoop((time) => {
      orbitingConcepts.rotation.z = time * 0.000035;
      folio.rotation.y = Math.sin(time * 0.0003) * 0.035;
      activeRenderer.render(scene, activeCamera);
    });

    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}

export default function LandingThreeHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sceneState, setSceneState] = useState<SceneState>("static");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mobileViewport = window.matchMedia("(max-width: 720px), (max-height: 500px) and (pointer: coarse)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cancelled = false;
    let loading = false;
    let failed = false;
    let sceneCleanup: ((loseContext?: boolean) => void) | null = null;
    let observer: IntersectionObserver | null = null;
    let loadTimer: number | null = null;

    const disallowed = () => mobileViewport.matches || reducedMotion.matches;
    const stopScene = () => {
      if (loadTimer !== null) {
        window.clearTimeout(loadTimer);
        loadTimer = null;
      }
      observer?.disconnect();
      observer = null;
      sceneCleanup?.(false);
      sceneCleanup = null;
      if (!cancelled) setSceneState("static");
    };
    const failScene = () => {
      failed = true;
      loading = false;
      sceneCleanup?.();
      sceneCleanup = null;
      if (!cancelled) setSceneState("failed");
    };
    const loadScene = async () => {
      if (cancelled || disallowed() || loading || failed) return;
      loading = true;
      setSceneState("loading");
      try {
        const THREE = await import("three");
        if (cancelled || disallowed()) {
          loading = false;
          return;
        }
        sceneCleanup = mountFolioScene(THREE, canvas, failScene);
        loading = false;
        setSceneState("ready");
      } catch {
        loading = false;
        if (!cancelled && !disallowed()) failScene();
      }
    };
    const scheduleScene = () => {
      if (cancelled || disallowed() || loading || failed || loadTimer !== null) return;
      loadTimer = window.setTimeout(() => {
        loadTimer = null;
        void loadScene();
      }, 120);
    };
    const observeHero = () => {
      observer?.disconnect();
      observer = null;
      if (cancelled || disallowed() || loading || failed) return;
      const target = canvas.parentElement;
      if (!target || typeof IntersectionObserver === "undefined") {
        scheduleScene();
        return;
      }
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          observer = null;
          scheduleScene();
        }
      }, { rootMargin: "120px" });
      observer.observe(target);
    };
    const handlePreferenceChange = () => {
      if (disallowed()) {
        stopScene();
        return;
      }
      failed = false;
      observeHero();
    };

    mobileViewport.addEventListener("change", handlePreferenceChange);
    reducedMotion.addEventListener("change", handlePreferenceChange);
    observeHero();

    return () => {
      cancelled = true;
      mobileViewport.removeEventListener("change", handlePreferenceChange);
      reducedMotion.removeEventListener("change", handlePreferenceChange);
      if (loadTimer !== null) window.clearTimeout(loadTimer);
      observer?.disconnect();
      sceneCleanup?.();
    };
  }, []);

  return (
    <figure className={styles.heroArtwork} data-scene={sceneState} aria-labelledby="folio-caption">
      <div className={styles.folioStatic} aria-hidden="true">
        <div className={styles.orbitLine} />
        <div className={`${styles.conceptNode} ${styles.nodeTop}`} />
        <div className={`${styles.conceptNode} ${styles.nodeRight}`} />
        <div className={`${styles.conceptNode} ${styles.nodeBottom}`} />
        <div className={`${styles.conceptNode} ${styles.nodeLeft}`} />
        <div className={styles.folio}>
          <div className={styles.folioPage}>
            <span className={styles.folioRule} />
            <span className={styles.folioHeading}>FIELD NOTES</span>
            <span className={styles.folioLine} />
            <span className={`${styles.folioLine} ${styles.lineShort}`} />
            <span className={styles.folioLine} />
            <span className={`${styles.folioLine} ${styles.lineMedium}`} />
          </div>
          <div className={`${styles.folioPage} ${styles.folioPageRight}`}>
            <span className={styles.folioRule} />
            <span className={`${styles.folioHeading} ${styles.headingShort}`}>IDEAS</span>
            <span className={styles.folioLine} />
            <span className={`${styles.folioLine} ${styles.lineMedium}`} />
            <span className={styles.folioLine} />
            <span className={`${styles.folioLine} ${styles.lineShort}`} />
          </div>
          <span className={styles.folioSpine} />
        </div>
        <span className={`${styles.nodeLabel} ${styles.labelTop}`}>CONCEPT</span>
        <span className={`${styles.nodeLabel} ${styles.labelRight}`}>CONTEXT</span>
        <span className={`${styles.nodeLabel} ${styles.labelBottom}`}>RECALL</span>
        <span className={`${styles.nodeLabel} ${styles.labelLeft}`}>DETAIL</span>
      </div>
      <canvas className={styles.sceneCanvas} ref={canvasRef} aria-hidden="true" />
      <figcaption className={styles.artCaption} id="folio-caption">
        An open folio brings connected ideas into view, one clear note at a time.
      </figcaption>
      {sceneState === "loading" && (
        <p className={styles.sceneStatus} role="status">Loading the optional interactive folio.</p>
      )}
      {sceneState === "failed" && (
        <p className={styles.sceneStatus} role="status">
          The interactive folio is unavailable; the static diagram remains.
        </p>
      )}
    </figure>
  );
}
