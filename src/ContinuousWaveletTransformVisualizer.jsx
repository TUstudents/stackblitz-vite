import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Activity, Loader } from "lucide-react";

const workerCode = `
  function debugLog(message) {
    self.postMessage({ type: 'debug', message: 'Worker: ' + message });
  }

  debugLog('Worker initialized');

  function fft(re, im) {
    const n = re.length;
    for (let i = 0; i < n; i++) {
      if (i < reverseIndex(i, n)) {
        [re[i], re[reverseIndex(i, n)]] = [re[reverseIndex(i, n)], re[i]];
        [im[i], im[reverseIndex(i, n)]] = [im[reverseIndex(i, n)], im[i]];
      }
    }

    for (let size = 2; size <= n; size *= 2) {
      const halfsize = size / 2;
      const tablestep = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + halfsize; j++, k += tablestep) {
          const tpre =  re[j+halfsize] * Math.cos(2*Math.PI*k/n) + im[j+halfsize] * Math.sin(2*Math.PI*k/n);
          const tpim = -re[j+halfsize] * Math.sin(2*Math.PI*k/n) + im[j+halfsize] * Math.cos(2*Math.PI*k/n);
          re[j + halfsize] = re[j] - tpre;
          im[j + halfsize] = im[j] - tpim;
          re[j] += tpre;
          im[j] += tpim;
        }
      }
    }
  }

  function reverseIndex(index, n) {
    let reversed = 0;
    for (let i = 0; i < Math.log2(n); i++) {
      reversed = (reversed << 1) | (index & 1);
      index >>= 1;
    }
    return reversed;
  }

  function ifft(re, im) {
    fft(re, im);
    const n = re.length;
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
    im.forEach((x, i) => im[i] = -x);
  }

  function morlet(t, scale, centralFrequency = 6) {
    const norm = Math.sqrt(1 / scale);
    const exp1 = Math.exp(-(t * t) / (2 * scale * scale));
    return norm * exp1 * Math.cos(centralFrequency * t / scale);
  }

  function mexicanHat(t, scale) {
    const norm = Math.sqrt(2 / (Math.sqrt(3) * Math.PI ** 0.25));
    const x = t / scale;
    return norm * (1 - x * x) * Math.exp(-x * x / 2) / Math.sqrt(scale);
  }

  function cwt(signal, scales, waveletFunction) {
    debugLog('Starting CWT calculation');
    const N = signal.length;
    debugLog('Signal length: ' + N);
    debugLog('Number of scales: ' + scales.length);

    const paddedLength = Math.pow(2, Math.ceil(Math.log2(N * 2)));
    debugLog('Padded length: ' + paddedLength);

    const paddedSignal = new Float64Array(paddedLength);
    paddedSignal.set(signal);

    const signalRe = new Float64Array(paddedLength);
    const signalIm = new Float64Array(paddedLength);
    signalRe.set(paddedSignal);

    debugLog('Calculating signal FFT');
    fft(signalRe, signalIm);

    const W = new Float64Array(scales.length * N);

    for (let i = 0; i < scales.length; i++) {
      debugLog('Processing scale ' + (i + 1) + ' of ' + scales.length);
      const scale = scales[i];
      const waveletRe = new Float64Array(paddedLength);
      const waveletIm = new Float64Array(paddedLength);

      for (let t = 0; t < paddedLength; t++) {
        const shiftedT = t - N / 2;
        waveletRe[t] = waveletFunction(shiftedT, scale);
      }

      debugLog('Calculating wavelet FFT for scale ' + scale);
      fft(waveletRe, waveletIm);

      const convolutionRe = new Float64Array(paddedLength);
      const convolutionIm = new Float64Array(paddedLength);

      for (let j = 0; j < paddedLength; j++) {
        convolutionRe[j] = signalRe[j] * waveletRe[j] + signalIm[j] * waveletIm[j];
        convolutionIm[j] = signalIm[j] * waveletRe[j] - signalRe[j] * waveletIm[j];
      }

      debugLog('Calculating convolution for scale ' + scale);
      ifft(convolutionRe, convolutionIm);

      for (let t = 0; t < N; t++) {
        W[i * N + t] = Math.sqrt(convolutionRe[t] * convolutionRe[t] + convolutionIm[t] * convolutionIm[t]) / Math.sqrt(scale);
      }
    }

    debugLog('CWT calculation complete');
    return W;
  }

  self.onmessage = function(e) {
    debugLog('Worker received message');
    const { signal, scales, waveletType } = e.data;
    debugLog('Message contents: ' + JSON.stringify({ signalLength: signal.length, scalesLength: scales.length, waveletType }));
    
    try {
      const waveletFunction = waveletType === 'morlet' ? morlet : mexicanHat;
      const result = cwt(signal, scales, waveletFunction);
      
      debugLog('CWT calculation complete. Result size: ' + result.length);
      self.postMessage({ type: 'result', data: result.buffer }, [result.buffer]);
    } catch (error) {
      debugLog('Error in worker: ' + error.message);
      self.postMessage({ type: 'error', message: error.message });
    }
  }

  debugLog('Worker setup complete');
`;

const ContinuousWaveletTransformVisualizer = () => {
  const [signal, setSignal] = useState([]);
  const [cwtResult, setCwtResult] = useState([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [waveletType, setWaveletType] = useState('morlet');
  const [signalType, setSignalType] = useState('sine');
  const [frequency, setFrequency] = useState(1);
  const [amplitude, setAmplitude] = useState(1);
  const [noiseLevel, setNoiseLevel] = useState(0);
  const [scales, setScales] = useState([]);
  const [debugInfo, setDebugInfo] = useState('');
  const workerRef = useRef(null);
  const cwtImageRef = useRef(null);

  const addDebugInfo = useCallback((message) => {
    console.log(message);
    setDebugInfo(prev => prev + '\n' + message);
  }, []);

  useEffect(() => {
    if (!workerRef.current) {
      addDebugInfo('Creating Web Worker');
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      workerRef.current = new Worker(URL.createObjectURL(blob));
      addDebugInfo('Web Worker created');

      workerRef.current.onmessage = (e) => {
        const { type, data, message } = e.data;
        if (type === 'result') {
          addDebugInfo('Received result from worker');
          const result = new Float64Array(data);
          addDebugInfo('Result array created with length: ' + result.length);
          
          const formattedResult = [];
          const numScales = 100;
          const signalLength = 1000;
          
          for (let i = 0; i < numScales; i++) {
            formattedResult.push(Array.from(result.subarray(i * signalLength, (i + 1) * signalLength)));
          }
          
          addDebugInfo('Formatted result created with length: ' + formattedResult.length);
          setCwtResult(formattedResult);
          setIsCalculating(false);
          addDebugInfo('CWT calculation complete. Result size: ' + formattedResult.length);
        } else if (type === 'debug') {
          addDebugInfo(message);
        } else if (type === 'error') {
          addDebugInfo('Error: ' + message);
          setIsCalculating(false);
        }
      };

      workerRef.current.onerror = (error) => {
        addDebugInfo('Worker error: ' + error.message);
        setIsCalculating(false);
      };
    }

    return () => {
      if (workerRef.current) {
        addDebugInfo('Terminating worker');
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [addDebugInfo]);

  const generateSignalAndScales = useCallback(() => {
    addDebugInfo('Generating new signal and scales');
    const newSignal = [];
    for (let i = 0; i < 1000; i++) {
      const t = i / 999;
      let value;
      switch (signalType) {
        case 'sine':
          value = amplitude * Math.sin(2 * Math.PI * frequency * t);
          break;
        case 'square':
          value = amplitude * Math.sign(Math.sin(2 * Math.PI * frequency * t));
          break;
        case 'sawtooth':
          value = amplitude * (2 * (frequency * t - Math.floor(0.5 + frequency * t)));
          break;
        case 'chirp':
          value = amplitude * Math.sin(2 * Math.PI * frequency * t * t);
          break;
        default:
          value = 0;
      }
      value += (Math.random() - 0.5) * noiseLevel;
      newSignal.push({ t, value });
    }
    setSignal(newSignal);

    const newScales = Array.from({ length: 100 }, (_, i) => 10 - i * 0.1);
    setScales(newScales);
    
    addDebugInfo('Signal and scales updated: ' + JSON.stringify({ signalLength: newSignal.length, scalesLength: newScales.length }));
  }, [signalType, frequency, amplitude, noiseLevel, addDebugInfo]);

  useEffect(() => {
    generateSignalAndScales();
  }, [generateSignalAndScales]);

  useEffect(() => {
    if (signal.length === 0 || scales.length === 0 || !workerRef.current) {
      addDebugInfo('Signal, scales, or worker not ready');
      return;
    }
    
    setIsCalculating(true);
    const signalArray = new Float64Array(signal.map(s => s.value));
    const scalesArray = new Float64Array(scales);
    
    addDebugInfo('Sending message to worker: ' + JSON.stringify({ signalLength: signalArray.length, scalesLength: scalesArray.length, waveletType }));
    
    workerRef.current.postMessage({
      signal: signalArray,
      scales: scalesArray,
      waveletType: waveletType
    });
  }, [signal, scales, waveletType, addDebugInfo]);

  const renderCWT = useCallback(() => {
    if (cwtResult.length === 0) {
      addDebugInfo('No CWT result to render');
      return null;
    }

    addDebugInfo('Rendering CWT: ' + JSON.stringify({ resultSize: cwtResult.length, firstRowSize: cwtResult[0].length }));

    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(1000, 100);

    const maxValue = Math.max(...cwtResult.flat());
    addDebugInfo('Max CWT value: ' + maxValue);

    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 1000; x++) {
        const i = (y * 1000 + x) * 4;
        const value = cwtResult[y][x] / maxValue;
        const intensity = Math.floor(value * 255);
        
        imageData.data[i] = intensity;
        imageData.data[i + 1] = intensity < 128 ? intensity : 255 - intensity;
        imageData.data[i + 2] = 255 - intensity;
        imageData.data[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
  }, [cwtResult, addDebugInfo]);

  useEffect(() => {
    if (cwtResult.length > 0) {
      const imageUrl = renderCWT();
      if (imageUrl) {
        cwtImageRef.current = imageUrl;
      }
    }
  }, [cwtResult, renderCWT]);

  return (
    <div className="flex flex-col items-center p-4 bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-4">Continuous Wavelet Transform Visualizer</h1>
      <div className="w-full max-w-6xl space-y-4">
        <div className="flex space-x-4">
          <Select value={waveletType} onValueChange={setWaveletType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Wavelet Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="morlet">Morlet</SelectItem>
              <SelectItem value="mexicanHat">Mexican Hat</SelectItem>
            </SelectContent>
          </Select>
          <Select value={signalType} onValueChange={setSignalType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Signal Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sine">Sine Wave</SelectItem>
              <SelectItem value="square">Square Wave</SelectItem>
              <SelectItem value="sawtooth">Sawtooth Wave</SelectItem>
              <SelectItem value="chirp">Chirp Signal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Frequency</label>
          <Slider value={[frequency]} onValueChange={([value]) => setFrequency(value)} min={0.1} max={10} step={0.1} />
          <span className="text-sm text-gray-400">{frequency.toFixed(1)} Hz</span>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Amplitude</label>
          <Slider value={[amplitude]} onValueChange={([value]) => setAmplitude(value)} min={0.1} max={2} step={0.1} />
          <span className="text-sm text-gray-400">{amplitude.toFixed(1)}</span>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Noise Level</label>
          <Slider value={[noiseLevel]} onValueChange={([value]) => setNoiseLevel(value)} min={0} max={1} step={0.05} />
          <span className="text-sm text-gray-400">{noiseLevel.toFixed(2)}</span>
        </div>
      </div>
      <div className="mt-8 w-full max-w-6xl">
  <h2 className="text-2xl font-bold mb-4">Input Signal</h2>
  <ResponsiveContainer width="100%" height={200}>
    <LineChart data={signal}>
      <XAxis dataKey="t"
      domain={['auto', 'auto']}
      tickCount={5}
      tickFormatter={(value) => value.toFixed(2)} />
      <YAxis 
        width={50}
        domain={['auto', 'auto']}
        tickCount={5}
        tickFormatter={(value) => value.toFixed(2)}
      />
      <Tooltip />
      <Line type="monotone" dataKey="value" stroke="#8884d8" dot={false} />
    </LineChart>
  </ResponsiveContainer>
</div>
      <div className="mt-8 w-full max-w-6xl">
        <h2 className="text-2xl font-bold mb-4">Continuous Wavelet Transform</h2>
        {isCalculating ? (
          <div className="flex items-center justify-center h-[300px]">
          <Loader className="h-8 w-8 animate-spin" />
          <span className="ml-2">Calculating CWT...</span>
        </div>
      ) : cwtImageRef.current ? (
        <div className="relative">
          <img src={cwtImageRef.current} alt="CWT Scaleogram" className="w-full h-[300px] object-cover" />
          <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs">
            <span>High Freq</span>
            <span>Low Freq</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-[300px] text-red-500">
          No CWT result available
        </div>
      )}
      </div>
      <div className="mt-8 w-full max-w-6xl">
        <h2 className="text-2xl font-bold mb-4">Debug Information</h2>
        <pre className="bg-gray-800 p-4 rounded overflow-auto max-h-60 text-xs">
          {debugInfo}
        </pre>
      </div>
      <Alert className="mt-8 w-full max-w-6xl">
        <Activity className="h-4 w-4" />
        <AlertTitle>About the CWT</AlertTitle>
        <AlertDescription>
          The Continuous Wavelet Transform (CWT) shown above is calculated using an optimized implementation of the transform. 
          The x-axis represents time, the y-axis represents scale (inverse of frequency, with high frequencies at the top), 
          and the color intensity represents the magnitude of the wavelet coefficients. Brighter colors indicate stronger 
          correlation between the signal and the wavelet at that time and scale.
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default ContinuousWaveletTransformVisualizer;