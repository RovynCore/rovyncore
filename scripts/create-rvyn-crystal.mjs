import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const outputRoot = path.join(workspaceRoot, "output");
const publicModelRoot = path.join(projectRoot, "public", "models");
const outputPath = path.join(outputRoot, "rvyn-crystal.glb");
const publicPath = path.join(publicModelRoot, "rvyn-core.glb");
const qaPath = path.join(workspaceRoot, "tmp", "rvyn-crystal-qa.json");

const TAU = Math.PI * 2;

// GLTFExporter uses the browser FileReader API when assembling a binary GLB.
// Node 22 provides Blob but not FileReader, so provide the tiny compatible
// adapter needed for this offline asset build.
if (!globalThis.FileReader) {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = result;
        this.onloadend?.();
      });
    }
  };
}

function makePhysicalMaterial(name, {
  color,
  roughness = 0.14,
  transmission = 0.3,
  thickness = 0.8,
  attenuationColor = 0x0b3d12,
  attenuationDistance = 1.4,
  emissive = 0x000000,
  emissiveIntensity = 0,
  transparent = false,
  opacity = 1,
  depthWrite = true,
  side = THREE.FrontSide,
} = {}) {
  const material = new THREE.MeshPhysicalMaterial({
    name,
    color,
    roughness,
    metalness: 0,
    transmission,
    thickness,
    ior: 1.52,
    attenuationColor,
    attenuationDistance,
    clearcoat: 0.24,
    clearcoatRoughness: 0.08,
    specularIntensity: 0.95,
    emissive,
    emissiveIntensity,
    transparent,
    opacity,
    depthWrite,
    side,
  });
  return material;
}

function makeEnergyMaterial(name, color, emissiveIntensity, opacity, roughness = 0.14) {
  return makePhysicalMaterial(name, {
    color,
    roughness,
    transmission: 0.06,
    thickness: 0.12,
    attenuationColor: 0x5bcf16,
    attenuationDistance: 0.7,
    emissive: 0x7dff19,
    emissiveIntensity,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function addTriangle(positions, triangles, a, b, c, materialIndex) {
  const start = positions.length / 3;
  positions.push(...a, ...b, ...c);
  triangles.push({ points: [a, b, c], indices: [start, start + 1, start + 2], materialIndex });
}

function createTriangleGeometry(name, triangles) {
  const positions = [];
  const groups = [];
  let index = 0;
  for (const triangle of triangles) {
    positions.push(...triangle.points[0], ...triangle.points[1], ...triangle.points[2]);
    groups.push({ start: index, count: 3, materialIndex: triangle.materialIndex ?? 0 });
    index += 3;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([...Array(positions.length / 3).keys()]);
  for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = name;
  return geometry;
}

function facetMaterialIndex(band, segment, half, variantCount) {
  // The distribution is deliberate: larger, lighter facets run up the front
  // centre and the opposite diagonal, matching the reference's cut pattern.
  const isFront = segment === 2 || segment === 3 || segment === 4;
  const isBack = segment === 8 || segment === 9 || segment === 10;
  if (half === 0 && isFront && (band === 2 || band === 3)) return Math.min(5, variantCount - 1);
  if (half === 1 && isFront && band === 1) return Math.min(4, variantCount - 1);
  if (isBack && band === 4) return Math.min(2, variantCount - 1);
  if ((band + segment * 2 + half) % 11 === 0) return Math.min(6, variantCount - 1);
  if ((band * 3 + segment + half) % 7 === 0) return Math.min(3, variantCount - 1);
  if ((band + segment) % 5 === 0) return 1;
  return 0;
}

function createFacetedCrystal(name, ringSpecs, materials, {
  segments = 12,
  phase = 0,
  jitter = 0.028,
  ringTwist = 0.065,
} = {}) {
  const points = ringSpecs.map((ring, ringIndex) => {
    const ringPoints = [];
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = phase + (segment / segments) * TAU + ringIndex * ringTwist;
      const wave = 1 + jitter * Math.sin(segment * 2.31 + ringIndex * 1.77) + jitter * 0.5 * Math.cos(segment * 4.13 - ringIndex);
      ringPoints.push([
        ring.cx + ring.rx * wave * Math.cos(angle),
        ring.y,
        ring.cz + ring.rz * wave * Math.sin(angle),
      ]);
    }
    return ringPoints;
  });

  const top = [0, ringSpecs[0].topY, 0];
  const bottom = [0, ringSpecs[ringSpecs.length - 1].bottomY, 0];
  const triangles = [];

  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    addTriangle(
      [],
      triangles,
      top,
      points[0][segment],
      points[0][next],
      facetMaterialIndex(0, segment, 0, materials.length),
    );
  }

  for (let band = 0; band < points.length - 1; band += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const a = points[band][segment];
      const b = points[band][next];
      const c = points[band + 1][next];
      const d = points[band + 1][segment];
      const materialA = facetMaterialIndex(band + 1, segment, 0, materials.length);
      const materialB = facetMaterialIndex(band + 1, segment, 1, materials.length);
      if ((band + segment) % 2 === 0) {
        addTriangle([], triangles, a, b, c, materialA);
        addTriangle([], triangles, a, c, d, materialB);
      } else {
        addTriangle([], triangles, a, b, d, materialA);
        addTriangle([], triangles, b, c, d, materialB);
      }
    }
  }

  const last = points.length - 1;
  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    addTriangle(
      [],
      triangles,
      points[last][segment],
      bottom,
      points[last][next],
      facetMaterialIndex(ringSpecs.length, segment, 0, materials.length),
    );
  }

  const geometry = createTriangleGeometry(name, triangles);
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.name = name;
  mesh.userData = {
    role: "faceted-crystal-shell",
    referenceViews: ["front", "back", "right-side"],
    frontAxis: "+Z",
  };
  return mesh;
}

function makeShell() {
  const ringSpecs = [
    { y: 3.23, rx: 0.74, rz: 0.28, cx: 0.00, cz: 0.00 },
    { y: 2.34, rx: 1.36, rz: 0.51, cx: -0.03, cz: 0.01 },
    { y: 1.28, rx: 1.87, rz: 0.78, cx: 0.04, cz: 0.00 },
    { y: 0.15, rx: 2.08, rz: 0.95, cx: 0.02, cz: 0.01 },
    { y: -0.93, rx: 2.01, rz: 0.91, cx: -0.05, cz: -0.01 },
    { y: -1.98, rx: 1.63, rz: 0.67, cx: 0.03, cz: 0.00 },
    { y: -3.05, rx: 0.99, rz: 0.39, cx: -0.01, cz: 0.00 },
  ];
  ringSpecs[0].topY = 4.04;
  ringSpecs[ringSpecs.length - 1].bottomY = -4.04;

  const materials = [
    makePhysicalMaterial("Crystal Deep Emerald", {
      color: 0x062409,
      roughness: 0.13,
      transmission: 0.38,
      thickness: 0.95,
      attenuationColor: 0x061e0a,
      attenuationDistance: 1.0,
    }),
    makePhysicalMaterial("Crystal Emerald", {
      color: 0x175b18,
      roughness: 0.12,
      transmission: 0.46,
      thickness: 0.86,
      attenuationColor: 0x0d4b12,
      attenuationDistance: 1.35,
    }),
    makePhysicalMaterial("Crystal Olive Lime", {
      color: 0x4f8a16,
      roughness: 0.11,
      transmission: 0.5,
      thickness: 0.72,
      attenuationColor: 0x2e7410,
      attenuationDistance: 1.65,
    }),
    makePhysicalMaterial("Crystal Clear Lime", {
      color: 0x8fca35,
      roughness: 0.08,
      transmission: 0.62,
      thickness: 0.55,
      attenuationColor: 0x6dbf19,
      attenuationDistance: 2.4,
      emissive: 0x163b05,
      emissiveIntensity: 0.18,
    }),
    makePhysicalMaterial("Crystal Pale Facet", {
      color: 0xb4e56a,
      roughness: 0.065,
      transmission: 0.68,
      thickness: 0.38,
      attenuationColor: 0x8adf31,
      attenuationDistance: 3.0,
      emissive: 0x2b6508,
      emissiveIntensity: 0.24,
    }),
    makePhysicalMaterial("Crystal Front Highlight", {
      color: 0x5b9d17,
      roughness: 0.075,
      transmission: 0.6,
      thickness: 0.58,
      attenuationColor: 0x47a414,
      attenuationDistance: 2.2,
      emissive: 0x1c5b04,
      emissiveIntensity: 0.28,
    }),
    makePhysicalMaterial("Crystal Shadow Green", {
      color: 0x021408,
      roughness: 0.17,
      transmission: 0.24,
      thickness: 1.15,
      attenuationColor: 0x04170a,
      attenuationDistance: 0.72,
    }),
  ];

  return createFacetedCrystal("Rvyn Crystal Shell", ringSpecs, materials, {
    segments: 12,
    phase: Math.PI / 12,
    jitter: 0.026,
    ringTwist: 0.045,
  });
}

function makeInnerCore() {
  const ringSpecs = [
    { y: 2.88, rx: 0.50, rz: 0.17, cx: 0.03, cz: 0.01 },
    { y: 2.02, rx: 0.91, rz: 0.35, cx: -0.03, cz: 0.02 },
    { y: 0.94, rx: 1.28, rz: 0.55, cx: -0.05, cz: 0.02 },
    { y: -0.30, rx: 1.46, rz: 0.60, cx: 0.04, cz: 0.02 },
    { y: -1.48, rx: 1.08, rz: 0.47, cx: 0.00, cz: 0.01 },
    { y: -2.48, rx: 0.55, rz: 0.20, cx: 0.02, cz: 0.00 },
  ];
  ringSpecs[0].topY = 3.35;
  ringSpecs[ringSpecs.length - 1].bottomY = -3.15;
  const materials = [
    makePhysicalMaterial("Inner Core Dark Green", {
      color: 0x0a3410,
      roughness: 0.12,
      transmission: 0.2,
      thickness: 0.6,
      attenuationColor: 0x07320d,
      attenuationDistance: 0.9,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    makePhysicalMaterial("Inner Core Emerald", {
      color: 0x1f7419,
      roughness: 0.1,
      transmission: 0.25,
      thickness: 0.48,
      attenuationColor: 0x159016,
      attenuationDistance: 1.25,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    makePhysicalMaterial("Inner Core Light Facet", {
      color: 0x73bc23,
      roughness: 0.08,
      transmission: 0.32,
      thickness: 0.34,
      attenuationColor: 0x7ad91b,
      attenuationDistance: 1.8,
      emissive: 0x1d5f08,
      emissiveIntensity: 0.28,
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  ];
  return createFacetedCrystal("Rvyn Inner Faceted Core", ringSpecs, materials, {
    segments: 10,
    phase: 0.1,
    jitter: 0.035,
    ringTwist: -0.04,
  });
}

function makeInternalFacetPlates() {
  const dark = makePhysicalMaterial("Internal Refraction Deep", {
    color: 0x0b4211,
    roughness: 0.08,
    transmission: 0.4,
    thickness: 0.22,
    attenuationColor: 0x0d4e12,
    attenuationDistance: 0.8,
    transparent: true,
    opacity: 0.54,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const light = makePhysicalMaterial("Internal Refraction Lime", {
    color: 0x8bdc2b,
    roughness: 0.07,
    transmission: 0.44,
    thickness: 0.18,
    attenuationColor: 0x71d51e,
    attenuationDistance: 1.1,
    emissive: 0x234d05,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const triangles = [
    { points: [[-0.74, 1.36, 0.39], [0.03, 2.42, 0.26], [0.54, 1.02, 0.42]], materialIndex: 1 },
    { points: [[-1.16, 0.28, 0.37], [-0.35, 0.86, 0.51], [0.19, -0.20, 0.46]], materialIndex: 0 },
    { points: [[0.19, -0.20, 0.46], [0.92, 0.42, 0.30], [0.76, -0.76, 0.38]], materialIndex: 1 },
    { points: [[-0.57, -1.05, 0.34], [0.19, -0.20, 0.46], [0.06, -1.82, 0.28]], materialIndex: 0 },
    { points: [[-0.93, -2.00, 0.24], [0.06, -1.82, 0.28], [0.39, -2.55, 0.13]], materialIndex: 1 },
    { points: [[0.92, 0.42, -0.22], [0.17, 1.28, -0.30], [-0.28, 0.05, -0.36]], materialIndex: 0 },
  ];
  const mesh = new THREE.Mesh(createTriangleGeometry("Internal Facet Plates", triangles), [dark, light]);
  mesh.name = "Rvyn Internal Facet Plates";
  mesh.userData = { role: "internal-refraction-facets" };
  return mesh;
}

function makeEnergyFlow() {
  const mainPath = [
    [0.12, -2.62, 0.24],
    [0.33, -2.20, 0.25],
    [0.49, -1.76, 0.24],
    [0.38, -1.28, 0.25],
    [0.06, -0.79, 0.28],
    [-0.38, -0.30, 0.29],
    [-0.62, 0.22, 0.27],
    [-0.58, 0.72, 0.24],
    [-0.31, 1.18, 0.22],
    [0.04, 1.58, 0.20],
    [0.30, 1.98, 0.17],
    [0.43, 2.28, 0.14],
  ].map((point) => new THREE.Vector3(...point));
  const curve = new THREE.CatmullRomCurve3(mainPath, false, "catmullrom", 0.48);
  const main = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 72, 0.185, 12, false),
    makeEnergyMaterial("Energy Flow Core", 0x70e816, 5.2, 0.78, 0.1),
  );
  main.name = "Rvyn Internal Energy Flow";
  main.userData = { role: "internal-3d-energy-flow", path: "S-curve", frontDepth: 0.24 };

  const secondaryPath = mainPath.map((point, index) => new THREE.Vector3(
    point.x + Math.sin(index * 1.13) * 0.11,
    point.y + (index % 2 ? 0.035 : -0.025),
    point.z + 0.07 + Math.cos(index * 0.77) * 0.025,
  ));
  const secondaryCurve = new THREE.CatmullRomCurve3(secondaryPath, false, "catmullrom", 0.48);
  const secondary = new THREE.Mesh(
    new THREE.TubeGeometry(secondaryCurve, 68, 0.064, 9, false),
    makeEnergyMaterial("Energy Flow Filament", 0xb3ff37, 7.8, 0.9, 0.075),
  );
  secondary.name = "Rvyn Energy Filament";
  secondary.userData = { role: "internal-3d-energy-filament" };

  const backPath = mainPath.map((point, index) => new THREE.Vector3(
    point.x * 0.88 - 0.05,
    point.y + 0.12 * Math.sin(index * 0.9),
    point.z - 0.36,
  ));
  const backCurve = new THREE.CatmullRomCurve3(backPath, false, "catmullrom", 0.5);
  const back = new THREE.Mesh(
    new THREE.TubeGeometry(backCurve, 56, 0.095, 9, false),
    makeEnergyMaterial("Energy Flow Inner Glow", 0x4fcf10, 3.1, 0.38, 0.15),
  );
  back.name = "Rvyn Energy Depth Strand";
  back.userData = { role: "internal-3d-energy-depth-strand" };
  return new THREE.Group().add(main, secondary, back);
}

function createScene() {
  const scene = new THREE.Scene();
  scene.name = "RovynCore Crystal Reference Reconstruction";
  scene.userData = {
    asset: "rvyn-crystal",
    sourceReferences: [
      "rvyn-crystal-front-reference.png",
      "rvyn-crystal-back-reference.png",
      "rvyn-crystal-side-reference.png",
    ],
    reconstruction: "multi-view silhouette, faceted shell, internal 3D energy flow",
    axes: "Y-up, front +Z, centered at origin",
    dimensions: { height: 8.08, maxWidth: 4.16, maxDepth: 1.9 },
  };
  scene.add(makeShell(), makeInnerCore(), makeInternalFacetPlates(), makeEnergyFlow());
  scene.updateMatrixWorld(true);
  return scene;
}

function getSceneStats(scene) {
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  let meshes = 0;
  let triangles = 0;
  let vertices = 0;
  const materials = new Set();
  scene.traverse((object) => {
    if (!object.isMesh) return;
    meshes += 1;
    if (object.geometry.index) triangles += object.geometry.index.count / 3;
    else if (object.geometry.attributes.position) triangles += object.geometry.attributes.position.count / 3;
    vertices += object.geometry.attributes.position?.count ?? 0;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material) materials.add(material.name);
    }
  });
  return {
    bounds: {
      min: box.min.toArray().map((value) => Number(value.toFixed(5))),
      max: box.max.toArray().map((value) => Number(value.toFixed(5))),
      size: size.toArray().map((value) => Number(value.toFixed(5))),
    },
    meshes,
    vertices,
    triangles,
    materials: [...materials],
  };
}

async function exportGlb(scene) {
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const group of object.geometry.groups) {
      if (!materials[group.materialIndex]) {
        throw new Error(`${object.name} has invalid material group ${group.materialIndex}; materials=${materials.length}; groups=${JSON.stringify(object.geometry.groups.slice(-12))}`);
      }
    }
  });
  const exporter = new GLTFExporter();
  const data = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: true,
    trs: false,
    embedImages: true,
    maxTextureSize: 4096,
  });
  if (!(data instanceof ArrayBuffer)) throw new Error("GLB export did not return binary data");
  return Buffer.from(data);
}

function inspectGlb(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "glTF") throw new Error("Invalid GLB magic");
  if (buffer.readUInt32LE(4) !== 2) throw new Error("Expected glTF 2.0");
  const length = buffer.readUInt32LE(8);
  if (length !== buffer.length) throw new Error(`GLB length mismatch: header ${length}, actual ${buffer.length}`);
  let offset = 12;
  let json = null;
  const chunks = [];
  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + chunkLength);
    chunks.push({ chunkType, chunkLength });
    if (chunkType === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8").replace(/\u0000+$/g, "").trim());
    offset += 8 + chunkLength;
  }
  if (!json?.asset?.version?.startsWith("2")) throw new Error("Missing glTF 2.x asset metadata");
  return {
    byteLength: buffer.length,
    sceneCount: json.scenes?.length ?? 0,
    nodeCount: json.nodes?.length ?? 0,
    meshCount: json.meshes?.length ?? 0,
    materialCount: json.materials?.length ?? 0,
    extensionsUsed: json.extensionsUsed ?? [],
    chunks,
  };
}

async function main() {
  const scene = createScene();
  const stats = getSceneStats(scene);
  const buffer = await exportGlb(scene);
  const glb = inspectGlb(buffer);
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.mkdir(publicModelRoot, { recursive: true });
  await fs.mkdir(path.dirname(qaPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);
  await fs.writeFile(publicPath, buffer);
  const report = {
    generatedAt: new Date().toISOString(),
    source: [
      path.join(projectRoot, "design", "rvyn-crystal-front-reference.png"),
      path.join(projectRoot, "design", "rvyn-crystal-back-reference.png"),
      path.join(projectRoot, "design", "rvyn-crystal-side-reference.png"),
    ],
    intent: "reference-faithful multi-view crystal reconstruction",
    targetSilhouette: {
      frontBackHeightToWidth: "~1.94:1",
      sideDepthToHeight: "~0.235:1",
      frontAxis: "+Z",
      upAxis: "+Y",
    },
    stats,
    glb,
    checks: {
      centeredNearOrigin: Math.max(...stats.bounds.min.map(Math.abs), ...stats.bounds.max.map(Math.abs)) < 5,
      yUpAndVertical: stats.bounds.size[1] > stats.bounds.size[0] && stats.bounds.size[1] > stats.bounds.size[2],
      noExternalTextures: glb.materialCount > 0 && !glb.extensionsUsed.includes("KHR_texture_basisu"),
      transmissionEncoded: glb.extensionsUsed.includes("KHR_materials_transmission"),
      internalEnergyMeshes: scene.getObjectByName("Rvyn Internal Energy Flow") !== undefined,
      qaViews: ["front", "back", "right-side", "left-side", "3/4-front", "3/4-back"],
    },
  };
  await fs.writeFile(qaPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, publicPath, qaPath, stats, glb }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
