import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const RefractiveSphere = () => {
  const mountRef = useRef(null);

  useEffect(() => {
    const width = 800;
    const height = 600;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);  // Dark background for better contrast

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Sphere setup
    const radius = 1;
    const refractiveIndex = 1.5;
    const sphereGeometry = new THREE.SphereGeometry(radius, 32, 32);
    const sphereMaterial = new THREE.MeshPhongMaterial({
      color: 0xaaaaaa,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphere);

    // Light setup
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    // Ray tracing function
    const traceRay = (origin, direction, depth = 0) => {
      if (depth > 5) return null;

      const ray = new THREE.Ray(origin, direction);
      const intersection = ray.intersectSphere(sphere);

      if (!intersection) return null;

      const normal = new THREE.Vector3().subVectors(intersection, sphere.position).normalize();
      const cosTheta1 = normal.dot(direction.negate());
      const n1 = cosTheta1 > 0 ? 1 : refractiveIndex;
      const n2 = cosTheta1 > 0 ? refractiveIndex : 1;

      // Snell's law
      const sinTheta2 = (n1 / n2) * Math.sqrt(1 - cosTheta1 * cosTheta1);

      if (sinTheta2 > 1) {
        // Total internal reflection
        const reflected = direction.reflect(normal);
        return [intersection, reflected];
      } else {
        const cosTheta2 = Math.sqrt(1 - sinTheta2 * sinTheta2);
        const refracted = new THREE.Vector3()
          .copy(direction)
          .multiplyScalar(n1 / n2)
          .add(normal.multiplyScalar(n1 / n2 * cosTheta1 - cosTheta2));

        return [intersection, refracted];
      }
    };

    // Create light paths
    const createLightPaths = () => {
      const pathsGroup = new THREE.Group();
      const numPaths = 20;

      for (let i = 0; i < numPaths; i++) {
        const angle = (i / numPaths) * Math.PI - Math.PI / 2;
        const origin = new THREE.Vector3(-3, Math.sin(angle) * 2, 0);
        const direction = new THREE.Vector3(1, 0, 0);

        const pathPoints = [origin];
        let currentPoint = origin;
        let currentDirection = direction;

        for (let j = 0; j < 5; j++) {
          const result = traceRay(currentPoint, currentDirection, j);
          if (!result) break;

          const [intersection, newDirection] = result;
          pathPoints.push(intersection);
          currentPoint = intersection;
          currentDirection = newDirection;
        }

        const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
        const pathMaterial = new THREE.LineBasicMaterial({ color: 0xffff00 });
        const pathLine = new THREE.Line(pathGeometry, pathMaterial);
        pathsGroup.add(pathLine);
      }

      scene.add(pathsGroup);
    };

    createLightPaths();

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      mountRef.current.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} />;
};

export default RefractiveSphere;