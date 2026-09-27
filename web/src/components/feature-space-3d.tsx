"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RotateCcw, RotateCw } from "lucide-react";
import { Button } from "./ui/button";
import type { CandidateResult } from "@/lib/analysis/types";

export default function FeatureSpace3D({
  candidates,
  selected,
  onSelect,
  domain,
}: {
  candidates: CandidateResult[];
  selected: string;
  onSelect: (id: string) => void;
  domain: [number, number];
}) {
  const host = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<{
    reset: () => void;
    rotate: () => void;
    select: (id: string) => void;
  } | null>(null);
  const selection = useRef(selected);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [minimum, maximum] = domain;

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let alive = true;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      queueMicrotask(() => {
        if (alive)
          setError(
            "3D is unavailable in this browser. Use the 2D view to explore the same candidates.",
          );
      });
      return () => {
        alive = false;
      };
    }
    const color = (token: string) =>
      getComputedStyle(container).getPropertyValue(token).trim();
    const paletteBindings: (() => void)[] = [];
    const scene = new THREE.Scene();
    const background = new THREE.Color(color("--chart-surface"));
    scene.background = background;
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    camera.position.set(3.7, 2.7, 4.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.minDistance = 3.5;
    controls.maxDistance = 10;
    // Wheel events remain page scrolling; zooming is unnecessary for ten points.
    controls.enableZoom = false;
    controls.update();
    controls.saveState();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.domElement.setAttribute(
      "aria-label",
      "Three-dimensional candidate feature plot. Drag to rotate; use the candidate buttons below to select a point.",
    );
    renderer.domElement.setAttribute("role", "img");
    container.append(renderer.domElement);
    const line = (a: number[], b: number[], token: string) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...a),
        new THREE.Vector3(...b),
      ]);
      const material = new THREE.LineBasicMaterial({ color: color(token) });
      paletteBindings.push(() => material.color.set(color(token)));
      scene.add(new THREE.Line(geometry, material));
    };
    for (let step = 0; step <= 4; step++) {
      const t = -1 + step / 2;
      line([-1, -1, t], [1, -1, t], "--chart-grid");
      line([t, -1, -1], [t, -1, 1], "--chart-grid");
      line([-1, t, -1], [1, t, -1], "--chart-grid");
    }
    line([-1, -1, -1], [1.12, -1, -1], "--chart-blue");
    line([-1, -1, -1], [-1, 1.12, -1], "--chart-teal");
    line([-1, -1, -1], [-1, -1, 1.12], "--chart-amber");
    const textures: THREE.Texture[] = [];
    const label = (
      text: string,
      position: [number, number, number],
      height = 0.36,
    ) => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;
      context.font = "32px Inter, sans-serif";
      canvas.width = Math.ceil(context.measureText(text).width) + 24;
      canvas.height = 64;
      context.font = "32px Inter, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const redraw = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = color("--chart-label");
        context.fillText(text, canvas.width / 2, 32);
        texture.needsUpdate = true;
      };
      redraw();
      paletteBindings.push(redraw);
      textures.push(texture);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, depthTest: false }),
      );
      sprite.position.set(...position);
      sprite.scale.set((canvas.width / canvas.height) * height, height, 1);
      scene.add(sprite);
      return sprite;
    };
    label("Energy / nt", [0.3, -1.4, -1.05]);
    label("Score", [-1.1, 1.45, -1]);
    label("Paired fraction", [-1.25, -1.7, 0.65]);
    label(minimum.toFixed(2), [-1, -1.16, -1], 0.28);
    label(maximum.toFixed(2), [1, -1.16, -1], 0.28);
    label("100", [-1.35, 1, -1], 0.28);
    label("0", [-1.35, -0.9, -1], 0.28);
    label("100%", [-1, -1.16, 1], 0.28);
    const geometry = new THREE.SphereGeometry(0.048, 20, 16);
    const points = candidates.map((candidate) => {
      const point = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: color(
            candidate.strand === "+" ? "--chart-blue" : "--chart-teal",
          ),
        }),
      );
      point.position.set(
        (2 * (candidate.features.mfe_per_nt - minimum)) / (maximum - minimum) -
          1,
        2 * candidate.model_score - 1,
        2 * candidate.features.paired_fraction - 1,
      );
      point.userData.id = candidate.id;
      scene.add(point);
      line(
        [point.position.x, -1, point.position.z],
        point.position.toArray(),
        "--chart-grid",
      );
      point.userData.label = label(
        String(candidate.rank),
        [point.position.x, point.position.y + 0.2, point.position.z],
        0.32,
      );
      return point;
    });
    const render = () => {
      if (alive && !renderer.getContext().isContextLost())
        renderer.render(scene, camera);
    };
    const select = (id: string) => {
      points.forEach((point, index) => {
        const active = point.userData.id === id;
        if (point.userData.label) point.userData.label.visible = active;
        point.scale.setScalar(active ? 1.8 : 1);
        point.material.color.set(
          color(
            active
              ? "--chart-amber"
              : candidates[index].strand === "+"
                ? "--chart-blue"
                : "--chart-teal",
          ),
        );
      });
      render();
    };
    const resize = () => {
      const width = container.clientWidth,
        height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    controls.addEventListener("change", render);
    const pointer = new THREE.Vector2();
    const ray = new THREE.Raycaster();
    let pointerStart = [0, 0];
    const down = (event: PointerEvent) => {
      pointerStart = [event.clientX, event.clientY];
    };
    const up = (event: PointerEvent) => {
      if (
        Math.hypot(
          event.clientX - pointerStart[0],
          event.clientY - pointerStart[1],
        ) > 5
      )
        return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      const point = ray.intersectObjects(points)[0];
      if (point) onSelect(String(point.object.userData.id));
    };
    const lost = (event: Event) => {
      event.preventDefault();
      setError(
        "The 3D context was interrupted. Switch to 2D to continue exploring the candidates.",
      );
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    controlsRef.current = {
      reset: () => {
        controls.reset();
        render();
      },
      rotate: () => {
        camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 8);
        controls.update();
        render();
      },
      select,
    };
    const themeObserver = new MutationObserver(() => {
      background.set(color("--chart-surface"));
      paletteBindings.forEach((update) => update());
      select(selection.current);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    resize();
    select(selection.current);
    queueMicrotask(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
      observer.disconnect();
      themeObserver.disconnect();
      controls.dispose();
      controlsRef.current = null;
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Line ||
          object instanceof THREE.Sprite
        ) {
          if (object.geometry) geometries.add(object.geometry);
          (Array.isArray(object.material)
            ? object.material
            : [object.material]
          ).forEach((material) => materials.add(material));
        }
      });
      geometries.forEach((item) => item.dispose());
      materials.forEach((item) => item.dispose());
      textures.forEach((item) => item.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [candidates, minimum, maximum, onSelect]);

  useEffect(() => {
    selection.current = selected;
    controlsRef.current?.select(selected);
  }, [selected]);
  return (
    <div className="feature-space">
      <div
        ref={host}
        className="three-canvas"
        data-ready={ready && !error}
        hidden={Boolean(error)}
      />
      {error ? (
        <p className="plot-loading" role="status">
          {error}
        </p>
      ) : (
        <div className="three-controls">
          <span className="caption">
            Drag to rotate · Select a candidate below
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={!ready}
            onClick={() => controlsRef.current?.rotate()}
          >
            <RotateCw data-icon="inline-start" />
            Rotate view
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!ready}
            onClick={() => controlsRef.current?.reset()}
          >
            <RotateCcw data-icon="inline-start" />
            Reset view
          </Button>
        </div>
      )}
    </div>
  );
}
