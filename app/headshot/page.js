"use client";

// TEMP build-tool page: renders the vrm head on green for logo generation.
import { useEffect, useRef } from "react";

export default function Headshot() {
  const ref = useRef(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm");
      if (dead) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setClearColor(0x00ff00, 1);
      renderer.setSize(1024, 1024);
      ref.current.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 10);
      scene.add(new THREE.AmbientLight(0xffffff, 1.15));
      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(0.4, 1.6, 1.5);
      scene.add(key);
      const loader = new GLTFLoader();
      loader.register((p) => new VRMLoaderPlugin(p));
      const gltf = await loader.loadAsync("/mochi.vrm");
      const vrm = gltf.userData.vrm;
      VRMUtils.rotateVRM0(vrm);
      scene.add(vrm.scene);
      vrm.update(0);
      // arms down for full-body captures
      const setRot = (bone, z) => {
        const n = vrm.humanoid?.getNormalizedBoneNode(bone);
        if (n) n.rotation.z = z;
      };
      setRot("leftUpperArm", -1.38);
      setRot("rightUpperArm", 1.38);
      const full = new URLSearchParams(location.search).has("full");
      const head = vrm.humanoid.getNormalizedBoneNode("head");
      const p = new THREE.Vector3();
      head.getWorldPosition(p);
      if (full) {
        camera.position.set(0, 0.92, 4.6);
        camera.lookAt(0, 0.9, 0);
      } else {
        camera.position.set(p.x, p.y + 0.09, p.z + 1.1);
        camera.lookAt(p.x, p.y + 0.05, p.z);
      }
      vrm.update(0); // propagate the arm pose to the raw bones
      const loop = () => {
        if (dead) return;
        requestAnimationFrame(loop);
        renderer.render(scene, camera);
      };
      loop();
      document.title = "ready";
    })();
    return () => {
      dead = true;
    };
  }, []);
  return <div ref={ref} style={{ background: "#00ff00" }} />;
}
