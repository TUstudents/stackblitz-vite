import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Slider } from '@/components/ui/slider';

const RefractiveSphereVisualizer = () => {
  const mountRef = useRef(null);
  const [radius, setRadius] = useState(1);
  const n = 1.5; // Refractive index

  // Custom sphere intersection function
  const intersectSphere = (ray, sphereCenter, sphereRadius) => {
    const oc = ray.origin.clone().sub(sphereCenter);
    const a = ray.direction.dot(ray.direction);
    const b = 2.0 * oc.dot(ray.direction);
    const c = oc.dot(oc) - sphereRadius * sphereRadius;
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
      return null;
    } else {
      const t = (-b - Math.sqrt(discriminant)) / (2.0 * a);
      if (t < 0) return null;
      return ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));
    }
  };

  // Custom refraction function
  const refract = (incident, normal, n1, n2) => {
    const n = n1 / n2;
    const cosI = -normal.dot(incident);
    const sinT2 = n * n * (1.0 - cosI * cosI);
    if (sinT2 > 1.0) return null; // Total internal reflection
    const cosT = Math.sqrt(1.0 - sinT2);
    return incident.clone().multiplyScalar(n).add(normal.clone().multiplyScalar(n * cosI - cosT));
  };

  useEffect(() => {
    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    // Controls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Sphere setup
    const sphereGeometry = new THREE.SphereGeometry(radius, 32, 32);
    const sphereMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      roughness: 0,
      transmission: 1,
      ior: n,
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphere);

    // Light setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    // Ray visualization
    const rayCount = 10;
    const rayGeometry = new THREE.BufferGeometry();
    const rayMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const rays = new THREE.LineSegments(rayGeometry, rayMaterial);
    scene.add(rays);

    const updateRays = () => {
      const positions = [];
      const origin = new THREE.Vector3(-3, 0, 0);
      const direction = new THREE.Vector3(1, 0, 0);
      const sphereCenter = sphere.position;

      for (let i = 0; i < rayCount; i++) {
        const y = (i / (rayCount - 1) - 0.5) * 2;
        const ray = new THREE.Ray(origin.clone().setY(y), direction);
        const entryPoint = intersectSphere(ray, sphereCenter, radius);

        if (entryPoint) {
          positions.push(origin.x, origin.y, origin.z);
          positions.push(entryPoint.x, entryPoint.y, entryPoint.z);

          // Calculate refraction
          const normal = entryPoint.clone().sub(sphereCenter).normalize();
          const refractedDirection = refract(ray.direction, normal, 1, n);

          if (refractedDirection) {
            const exitRay = new THREE.Ray(entryPoint, refractedDirection);
            const exitPoint = intersectSphere(exitRay, sphereCenter, radius);

            if (exitPoint) {
              positions.push(entryPoint.x, entryPoint.y, entryPoint.z);
              positions.push(exitPoint.x, exitPoint.y, exitPoint.z);

              // Calculate second refraction
              const exitNormal = exitPoint.clone().sub(sphereCenter).normalize();
              const finalDirection = refract(refractedDirection, exitNormal.negate(), n, 1);

              if (finalDirection) {
                const finalPoint = exitPoint.clone().add(finalDirection.multiplyScalar(2));
                positions.push(exitPoint.x, exitPoint.y, exitPoint.z);
                positions.push(finalPoint.x, finalPoint.y, finalPoint.z);
              }
            }
          }
        }
      }

      rayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    };

    // Initial ray update
    updateRays();

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Update function for radius changes
    const updateSphere = () => {
      sphere.geometry.dispose();
      sphere.geometry = new THREE.SphereGeometry(radius, 32, 32);
      updateRays();
    };

    // Call updateSphere whenever radius changes
    updateSphere();

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      mountRef.current.removeChild(renderer.domElement);
    };
  }, [radius, n]);

  const handleRadiusChange = (newRadius) => {
    setRadius(newRadius[0]);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <h1 className="text-3xl font-bold mb-4">Refractive Sphere Visualizer</h1>
      <div ref={mountRef} className="w-full h-[80vh]" />
      <div className="w-full max-w-md mt-4">
        <label htmlFor="radius-slider" className="block text-sm font-medium mb-2">
          Sphere Radius: {radius.toFixed(2)}
        </label>
        <Slider
          id="radius-slider"
          min={0.1}
          max={2}
          step={0.01}
          value={[radius]}
          onValueChange={handleRadiusChange}
          className="w-full"
        />
      </div>
    </div>
  );
};

export default RefractiveSphereVisualizer;