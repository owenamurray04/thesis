// The signature camera transition (design doc 8.3). ONE PerspectiveCamera with two
// target poses; on `mode` change we lerp position + target every frame so the view
// smoothly orbits down/up -- "as if it was always 3D and you're now looking from an
// angle." No OrbitControls: the camera is mode-driven and pointer drag reshapes the
// blob. Snaps instantly under prefers-reduced-motion.

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// 2D / top-down: high above, looking straight down (minimal perspective distortion).
// up is toward -z so that higher prices (more-negative z) read upward on screen.
const POSE_2D = {
  pos: new THREE.Vector3(0, 16, 0.001),
  target: new THREE.Vector3(0, 0, 0),
  up: new THREE.Vector3(0, 0, -1),
};

// 3D / tilted: lower + pulled back, the receding-grid perspective from the mockup.
const POSE_3D = {
  pos: new THREE.Vector3(0, 7.5, 10),
  target: new THREE.Vector3(0, 0.3, 0),
  up: new THREE.Vector3(0, 1, 0),
};

export function SceneCamera({
  mode,
  reducedMotion,
}: {
  mode: "2d" | "3d";
  reducedMotion: boolean;
}): null {
  const camera = useThree((s) => s.camera);
  // mutable current target the camera is actually looking at.
  const lookAt = useRef(new THREE.Vector3().copy(POSE_2D.target));
  const upCur = useRef(new THREE.Vector3().copy(POSE_2D.up));

  useFrame((_, dt) => {
    const pose = mode === "3d" ? POSE_3D : POSE_2D;

    if (reducedMotion) {
      camera.position.copy(pose.pos);
      lookAt.current.copy(pose.target);
      upCur.current.copy(pose.up);
      camera.up.copy(upCur.current);
      camera.lookAt(lookAt.current);
      return;
    }

    // frame-rate-independent damping toward the pose.
    const k = 1 - Math.pow(0.0001, dt);
    camera.position.lerp(pose.pos, k);
    lookAt.current.lerp(pose.target, k);
    upCur.current.lerp(pose.up, k).normalize();
    camera.up.copy(upCur.current);
    camera.lookAt(lookAt.current);
  });

  return null;
}
