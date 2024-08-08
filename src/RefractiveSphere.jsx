import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';

const PhysicallyExactRefractiveSphereVisualizer = () => {
  const mountRef = useRef(null);
  const [radius, setRadius] = useState(1);
  const [wavelength, setWavelength] = useState(550); // nm
  const [showIncident, setShowIncident] = useState(true);
  const [showReflected, setShowReflected] = useState(true);
  const [showRefracted, setShowRefracted] = useState(true);
  const [maxBounces, setMaxBounces] = useState(5);

  const getRefractiveIndex = (wavelength) => {
    // Sellmeier equation for BK7 optical glass
    const B1 = 1.03961212, B2 = 0.231792344, B3 = 1.01046945;
    const C1 = 0.00600069867, C2 = 0.0200179144, C3 = 103.560653;
    const l = wavelength / 1000; // convert to micrometers
    return Math.sqrt(1 + (B1*l*l)/(l*l-C1) + (B2*l*l)/(l*l-C2) + (B3*l*l)/(l*l-C3));
  };

  const wavelengthToRGB = (wavelength) => {
    let r, g, b;
    if (wavelength >= 380 && wavelength < 440) {
      r = -(wavelength - 440) / (440 - 380);
      g = 0;
      b = 1;
    } else if (wavelength >= 440 && wavelength < 490) {
      r = 0;
      g = (wavelength - 440) / (490 - 440);
      b = 1;
    } else if (wavelength >= 490 && wavelength < 510) {
      r = 0;
      g = 1;
      b = -(wavelength - 510) / (510 - 490);
    } else if (wavelength >= 510 && wavelength < 580) {
      r = (wavelength - 510) / (580 - 510);
      g = 1;
      b = 0;
    } else if (wavelength >= 580 && wavelength < 645) {
      r = 1;
      g = -(wavelength - 645) / (645 - 580);
      b = 0;
    } else if (wavelength >= 645 && wavelength <= 780) {
      r = 1;
      g = 0;
      b = 0;
    } else {
      r = 0;
      g = 0;
      b = 0;
    }
    return new THREE.Color(r, g, b);
  };

  const fresnelEquations = (cosI, n1, n2) => {
    const sinI = Math.sqrt(1 - cosI * cosI);
    const sinT = n1 * sinI / n2;
    if (sinT >= 1) {
      return { Rs: 1, Rp: 1, R: 1, T: 0 }; // Total internal reflection
    }
    const cosT = Math.sqrt(1 - sinT * sinT);
    const Rs = Math.pow((n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT), 2);
    const Rp = Math.pow((n2 * cosI - n1 * cosT) / (n2 * cosI + n1 * cosT), 2);
    const R = (Rs + Rp) / 2;
    const T = 1 - R;
    return { Rs, Rp, R, T };
  };

  const refract = (incident, normal, n1, n2) => {
    const cosI = -normal.dot(incident);
    const sinI2 = 1 - cosI * cosI;
    const sinT2 = (n1 / n2) * (n1 / n2) * sinI2;
    if (sinT2 > 1) return null; // Total internal reflection
    const cosT = Math.sqrt(1 - sinT2);
    return incident.clone().multiplyScalar(n1 / n2).add(normal.clone().multiplyScalar(n1 / n2 * cosI - cosT));
  };

  useEffect(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    const sphereGeometry = new THREE.SphereGeometry(radius, 64, 64);
    const sphereMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
      roughness: 0.1,
      transmission: 0.9,
      thickness: radius * 2,
      ior: getRefractiveIndex(wavelength),
      side: THREE.DoubleSide,
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphere);

    const rayGeometry = new THREE.BufferGeometry();
    const rayMaterial = new THREE.LineBasicMaterial({ vertexColors: true });
    const rays = new THREE.LineSegments(rayGeometry, rayMaterial);
    scene.add(rays);

    const traceRay = (origin, direction, n1, intensity, bounces = 0) => {
      if (bounces >= maxBounces || intensity < 0.01) return [];

      const raycaster = new THREE.Raycaster(origin, direction);
      const intersects = raycaster.intersectObject(sphere);

      if (intersects.length === 0) return [[origin, origin.clone().add(direction.clone().multiplyScalar(10)), intensity, 'incident']];

      const hit = intersects[0];
      const n2 = getRefractiveIndex(wavelength);
      const normal = hit.face.normal.clone();
      if (hit.object.material.side === THREE.BackSide) normal.negate();

      const cosI = Math.abs(direction.dot(normal));
      const { R, T } = fresnelEquations(cosI, n1, n2);

      const segments = [];
      if (showIncident || bounces > 0) {
        segments.push([origin, hit.point, intensity, bounces === 0 ? 'incident' : (n1 > n2 ? 'reflected' : 'refracted')]);
      }

      // Reflected ray
      if (showReflected && Math.random() < R) {
        const reflectedDir = direction.clone().reflect(normal);
        segments.push(...traceRay(hit.point, reflectedDir, n1, intensity * R, bounces + 1));
      }

      // Refracted ray
      if (showRefracted && Math.random() < T) {
        const refractedDir = refract(direction, normal, n1, n2);
        if (refractedDir) {
          segments.push(...traceRay(hit.point, refractedDir, n2, intensity * T, bounces + 1));
        }
      }

      return segments;
    };

    const updateRays = () => {
      const positions = [];
      const colors = [];
      const baseColor = wavelengthToRGB(wavelength);
      const rayCount = 50;

      for (let i = 0; i < rayCount; i++) {
        const y = (i / (rayCount - 1) - 0.5) * 2 * radius;
        const origin = new THREE.Vector3(-3, y, 0);
        const direction = new THREE.Vector3(1, 0, 0);

        const segments = traceRay(origin, direction, 1.0, 1.0);

        segments.forEach(([start, end, intensity, type]) => {
          if ((type === 'incident' && showIncident) || 
              (type === 'reflected' && showReflected) || 
              (type === 'refracted' && showRefracted)) {
            positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
            colors.push(
              baseColor.r * intensity, baseColor.g * intensity, baseColor.b * intensity,
              baseColor.r * intensity, baseColor.g * intensity, baseColor.b * intensity
            );
          }
        });
      }

      rayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      rayGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    };

    updateRays();

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    const updateSphere = () => {
      sphere.geometry.dispose();
      sphere.geometry = new THREE.SphereGeometry(radius, 64, 64);
      sphere.material.ior = getRefractiveIndex(wavelength);
      sphere.material.thickness = radius * 2;
      updateRays();
    };

    updateSphere();

    return () => {
      window.removeEventListener('resize', handleResize);
      mountRef.current.removeChild(renderer.domElement);
    };
  }, [radius, wavelength, showIncident, showReflected, showRefracted, maxBounces]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <h1 className="text-3xl font-bold mb-4">Physically Exact Refractive Sphere Visualizer</h1>
      <div ref={mountRef} className="w-full h-[60vh] mb-4" />
      <div className="w-full max-w-md space-y-4">
        <div>
          <label htmlFor="radius-slider" className="block text-sm font-medium mb-2">
            Sphere Radius: {radius.toFixed(2)}
          </label>
          <Slider
            id="radius-slider"
            min={0.1}
            max={2}
            step={0.01}
            value={[radius]}
            onValueChange={(value) => setRadius(value[0])}
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="wavelength-slider" className="block text-sm font-medium mb-2">
            Light Wavelength: {wavelength.toFixed(0)} nm
          </label>
          <Slider
            id="wavelength-slider"
            min={380}
            max={780}
            step={1}
            value={[wavelength]}
            onValueChange={(value) => setWavelength(value[0])}
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="max-bounces-slider" className="block text-sm font-medium mb-2">
            Max Bounces: {maxBounces}
          </label>
          <Slider
            id="max-bounces-slider"
            min={1}
            max={10}
            step={1}
            value={[maxBounces]}
            onValueChange={(value) => setMaxBounces(value[0])}
            className="w-full"
          />
        </div>
        <div className="flex space-x-4">
          <div className="flex items-center">
            <Checkbox 
              id="show-incident" 
              checked={showIncident} 
              onCheckedChange={setShowIncident}
            />
            <label htmlFor="show-incident" className="ml-2">Show Incident Rays</label>
          </div>
          <div className="flex items-center">
            <Checkbox 
              id="show-reflected" 
              checked={showReflected} 
              onCheckedChange={setShowReflected}
            />
            <label htmlFor="show-reflected" className="ml-2">Show Reflected Rays</label>
          </div>
          <div className="flex items-center">
            <Checkbox 
              id="show-refracted" 
              checked={showRefracted} 
              onCheckedChange={setShowRefracted}
            />
            <label htmlFor="show-refracted" className="ml-2">Show Refracted Rays</label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhysicallyExactRefractiveSphereVisualizer;