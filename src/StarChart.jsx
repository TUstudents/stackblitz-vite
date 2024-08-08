import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// Star data (simplified for brevity - expand this to 100 stars)
const starData = [
  { name: "Sun", x: 0, y: 0, z: 0, magnitude: -26.74, spectralType: "G2V" },
  { name: "Proxima Centauri", x: -1.29, y: -0.93, z: 0.04, magnitude: 11.13, spectralType: "M5.5Ve" },
  { name: "Alpha Centauri A", x: -1.31, y: -0.98, z: 0.01, magnitude: 0.01, spectralType: "G2V" },
  { name: "Alpha Centauri B", x: -1.31, y: -0.98, z: 0.01, magnitude: 1.33, spectralType: "K1V" },
  { name: "Barnard's Star", x: -0.02, y: -1.81, z: 0.11, magnitude: 9.54, spectralType: "M4V" },
  // ... Add more star data here to reach 100 stars
];

const getStarColor = (spectralType) => {
  const type = spectralType.charAt(0);
  switch (type) {
    case 'O': return 0x9bb0ff;
    case 'B': return 0xaabfff;
    case 'A': return 0xcad7ff;
    case 'F': return 0xf8f7ff;
    case 'G': return 0xfff4ea;
    case 'K': return 0xffd2a1;
    case 'M': return 0xffcc6f;
    default: return 0xffffff;
  }
};

const StarChart = () => {
  const mountRef = useRef(null);
  const [hoveredStar, setHoveredStar] = useState(null);
  const [starSize, setStarSize] = useState(1);
  const [starBrightness, setStarBrightness] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const currentMount = mountRef.current;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    currentMount.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    // Stars
    const starGeometry = new THREE.SphereGeometry(0.02, 32, 32);
    const stars = starData.map(star => {
      const starColor = getStarColor(star.spectralType);
      const starMaterial = new THREE.MeshBasicMaterial({ color: starColor });
      const starMesh = new THREE.Mesh(starGeometry, starMaterial);
      starMesh.position.set(star.x, star.y, star.z);
      starMesh.userData = star;
      scene.add(starMesh);
      return starMesh;
    });

    // Grid and Axes
    const gridHelper = new THREE.GridHelper(20, 20);
    scene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    // Camera position
    camera.position.z = 5;

    // Raycaster for star selection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Animation
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Event listeners
    const handleResize = () => {
      camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    };

    const handleMouseMove = (event) => {
      const rect = currentMount.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / currentMount.clientWidth) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / currentMount.clientHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(stars);

      if (intersects.length > 0) {
        setHoveredStar(intersects[0].object.userData);
      } else {
        setHoveredStar(null);
      }
    };

    window.addEventListener('resize', handleResize);
    currentMount.addEventListener('mousemove', handleMouseMove);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      currentMount.removeEventListener('mousemove', handleMouseMove);
      currentMount.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const stars = currentMount.querySelectorAll('mesh');
    stars.forEach(star => {
      star.scale.setScalar(starSize * (1 / (star.userData.magnitude + 30)));
      star.material.color.multiplyScalar(starBrightness);
    });
  }, [starSize, starBrightness]);

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const stars = currentMount.querySelectorAll('mesh');
    stars.forEach(star => {
      if (star.userData.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        star.material.emissive.setHex(0xff0000);
      } else {
        star.material.emissive.setHex(0x000000);
      }
    });
  }, [searchTerm]);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.7)', padding: 10, borderRadius: 5 }}>
        <h2>Nearest 100 Star Systems</h2>
        <p>Hover over a star to see details</p>
        {hoveredStar && (
          <div>
            <h3>{hoveredStar.name}</h3>
            <p>Magnitude: {hoveredStar.magnitude.toFixed(2)}</p>
            <p>Spectral Type: {hoveredStar.spectralType}</p>
            <p>Coordinates: ({hoveredStar.x.toFixed(2)}, {hoveredStar.y.toFixed(2)}, {hoveredStar.z.toFixed(2)})</p>
          </div>
        )}
      </div>
      <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.7)', padding: 10, borderRadius: 5 }}>
        <label>
          Star Size:
          <input type="range" min="0.1" max="2" step="0.1" value={starSize} onChange={(e) => setStarSize(parseFloat(e.target.value))} />
        </label>
        <br />
        <label>
          Brightness:
          <input type="range" min="0.1" max="2" step="0.1" value={starBrightness} onChange={(e) => setStarBrightness(parseFloat(e.target.value))} />
        </label>
        <br />
        <input type="text" placeholder="Search for a star..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>
    </div>
  );
};

export default StarChart;