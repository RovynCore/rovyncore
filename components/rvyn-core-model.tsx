"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

type RvynCoreModelProps = {
  /** Public URL of the model. Place the final file at /models/rvyn-core.glb. */
  modelUrl: string;
  /** Optional scale multiplier after automatic framing. */
  scale?: number;
  /** Exact duration of the seamless turntable loop, in seconds. */
  loopDuration?: number;
  /** Horizontal composition offset in world units; positive values move right. */
  positionX?: number;
};

function makeOrbit(
  radiusX: number,
  radiusZ: number,
  rotation: THREE.Euler,
  opacity: number,
) {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= 160; index += 1) {
    const angle = (index / 160) * Math.PI * 2;
    points.push(
      new THREE.Vector3(
        Math.cos(angle) * radiusX,
        0,
        Math.sin(angle) * radiusZ,
      ),
    );
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0xd2ff79,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  material.userData.baseOpacity = opacity;
  const orbit = new THREE.LineLoop(geometry, material);
  orbit.rotation.copy(rotation);
  return orbit;
}

function makeParticles() {
  let seed = 19;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const positions: number[] = [];
  for (let index = 0; index < 72; index += 1) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const radius = 2.1 + random() * 1.5;
    positions.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi) * 0.8,
      radius * Math.sin(phi) * Math.sin(theta),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  const material = new THREE.PointsMaterial({
    color: 0xd8ff8b,
    size: 0.034,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  material.userData.baseOpacity = material.opacity;
  return new THREE.Points(geometry, material);
}

function disposeModel(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    materials.forEach((material) => material?.dispose());
  });
}

export default function RvynCoreModel({
  modelUrl,
  scale = 1,
  loopDuration = 9,
  positionX = 1.2,
}: RvynCoreModelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !modelUrl) return undefined;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;

    const scene = new THREE.Scene();
    const composition = new THREE.Group();
    composition.position.x = positionX;
    scene.add(composition);
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmremGenerator.fromScene(room, 0.04).texture;
    room.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
    camera.position.set(0, 0, 8.2);

    const lighting = new THREE.Group();
    composition.add(lighting);
    lighting.add(new THREE.AmbientLight(0x274d20, 0.34));
    const keyLight = new THREE.PointLight(0xeaffc6, 2.7, 11, 2);
    keyLight.position.set(2.7, 2.5, 4.8);
    lighting.add(keyLight);
    const greenLight = new THREE.PointLight(0x91ff45, 4.2, 9, 2);
    greenLight.position.set(-2.6, 0.2, 2.6);
    lighting.add(greenLight);
    const rimLight = new THREE.PointLight(0x4a9e2b, 2, 9, 2);
    rimLight.position.set(0, -2.7, -3.2);
    lighting.add(rimLight);

    const modelGroup = new THREE.Group();
    composition.add(modelGroup);
    const orbitRig = new THREE.Group();
    orbitRig.add(
      makeOrbit(2.62, 0.82, new THREE.Euler(0.92, -0.28, -0.24), 0.48),
      makeOrbit(2.22, 0.69, new THREE.Euler(1.12, 0.12, 0.86), 0.31),
      makeOrbit(1.92, 2.58, new THREE.Euler(0.2, 0.88, 0.22), 0.22),
    );
    orbitRig.position.z = -0.08;
    composition.add(orbitRig);
    const particles = makeParticles();
    composition.add(particles);

    const loader = new GLTFLoader();
    let loadedModel: THREE.Object3D | null = null;
    let disposed = false;
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) {
          disposeModel(gltf.scene);
          return;
        }
        loadedModel = gltf.scene;
        loadedModel.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          materials.forEach((material) => {
            if (!material) return;
            material.side = THREE.DoubleSide;
            if ("envMapIntensity" in material) {
              (material as THREE.MeshStandardMaterial).envMapIntensity = 1.28;
            }
          });
        });
        loadedModel.updateMatrixWorld(true);
        const initialBounds = new THREE.Box3().setFromObject(loadedModel);
        const initialSize = initialBounds.getSize(new THREE.Vector3());
        const longestSide = Math.max(initialSize.x, initialSize.y, initialSize.z, 0.001);
        loadedModel.scale.setScalar((4.86 / longestSide) * scale);
        loadedModel.updateMatrixWorld(true);
        const centeredBounds = new THREE.Box3().setFromObject(loadedModel);
        const center = centeredBounds.getCenter(new THREE.Vector3());
        loadedModel.position.sub(center);
        modelGroup.add(loadedModel);
      },
      undefined,
      (error) => {
        // Keep the stage empty until the user supplies a valid GLB; do not
        // replace it with an unrelated placeholder shape.
        console.warn("RovynCore model could not be loaded", error);
      },
    );

      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(rect.width, 1);
        const height = Math.max(rect.height, 1);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        composition.position.x = positionX * Math.max(0.42, Math.min(1, width / 1100));
        camera.updateProjectionMatrix();
      };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const clock = new THREE.Clock();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const render = () => {
      const elapsed = clock.getElapsedTime();
      const loopSeconds = Math.max(loopDuration, 1);
      const phase = ((elapsed % loopSeconds) / loopSeconds) * Math.PI * 2;
      if (!reduceMotion) {
        // Keep the crystal on one stable vertical axis: exactly one turn per loop.
        modelGroup.rotation.set(0, phase, 0);
        // Orbit lines share the turntable phase but retain fixed centered ellipses.
        orbitRig.rotation.set(0, phase, 0);
        particles.rotation.set(Math.sin(phase) * 0.025, -phase * 0.16, 0);
      }
      renderer.render(scene, camera);
      if (!reduceMotion) frame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      if (loadedModel) disposeModel(loadedModel);
      orbitRig.children.forEach((child) => {
        const line = child as THREE.Line;
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      });
      particles.geometry.dispose();
      (particles.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, [loopDuration, modelUrl, positionX, scale]);

  return (
    <div className="core-model-shell" role="img" aria-label="Animated 3D RovynCore crystal">
      <canvas ref={canvasRef} className="core-model-canvas" />
    </div>
  );
}
