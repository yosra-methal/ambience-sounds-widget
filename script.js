document.addEventListener('DOMContentLoaded', () => {
    // Audio Configuration
    // Audio Configuration
    const tracks = [
        { id: 'rain', path: './assets/audio/RAIN.mp3' },
        { id: 'wind', path: './assets/audio/Vent.mp3' },
        { id: 'waves', path: './assets/audio/waves.mp3' },
        { id: 'fire', path: './assets/audio/FEU.mp3' },
        { id: 'birds', path: './assets/audio/Oiseaux.wav' }
    ];

    // Global Audio State
    let audioContext = null;
    let masterGainNode = null;
    let isPlaying = false;
    const fadeDuration = 1.0; // Seconds for smooth Master fade

    // Track State: { [id]: { buffer, gainNode, sourceNode, loaded } }
    const trackNodes = {};

    // UI Elements
    const playPauseBtn = document.getElementById('master-play-pause');
    const iconPlay = document.getElementById('icon-play');
    const iconPause = document.getElementById('icon-pause');
    const masterVolumeSlider = document.getElementById('master-volume');

    // --- Initialization ---

    async function initAudioEngine() {
        if (audioContext) return; // Prevent double init

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();

        // Create Master Gain
        masterGainNode = audioContext.createGain();
        masterGainNode.gain.value = parseFloat(masterVolumeSlider.value);
        masterGainNode.connect(audioContext.destination);

        console.log("Audio Engine Initialized. Starting Preload...");

        // Pre-load all tracks in parallel
        const loadPromises = tracks.map(track => loadTrack(track));
        await Promise.all(loadPromises);
        console.log("All audio assets loaded and decoded.");
    }

    async function loadTrack(track) {
        try {
            // 1. Fetch ArrayBuffer
            const response = await fetch(track.path);
            if (!response.ok) {
                throw new Error(`File not found: ${track.path} (Status: ${response.status})`);
            }
            const arrayBuffer = await response.arrayBuffer();

            // 2. Decode into AudioBuffer
            let audioBuffer;
            try {
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            } catch (decodeErr) {
                throw new Error(`Failed to decode audio for ${track.id}: ${decodeErr.message}`);
            }

            // 3. Setup Gain Node for this track
            const gainNode = audioContext.createGain();
            // Get initial volume from slider
            const slider = document.querySelector(`.track-column[data-track="${track.id}"] input[type="range"]`);
            let initialVol = slider ? parseFloat(slider.value) : 0;

            if (track.id === 'waves') {
                initialVol = initialVol * 0.6;
            }

            gainNode.gain.value = initialVol;
            gainNode.connect(masterGainNode);

            // 4. Store Data
            trackNodes[track.id] = {
                buffer: audioBuffer,
                gainNode: gainNode,
                sourceNode: null,
                loaded: true
            };

            // 5. Initial Visual Sync
            if (slider) {
                const column = document.querySelector(`.track-column[data-track="${track.id}"]`);
                updateIconVisuals(column, initialVol);
            }

        } catch (error) {
            console.error(`CRITICAL ERROR loading ${track.id}:`, error);
        }
    }

    // --- Playback Control (Gapless) ---

    function startGaplessLoop(trackId) {
        const data = trackNodes[trackId];
        if (!data || !data.loaded || !data.buffer) return;

        // Clean up old source if existing (robustness)
        if (data.sourceNode) {
            try { data.sourceNode.stop(); } catch (e) { }
        }

        // Create Source (Buffer Source Pattern)
        const source = audioContext.createBufferSource();
        source.buffer = data.buffer;
        source.loop = true; // CRITICAL for gapless

        // Optional: define loop start/end explicitly
        source.loopStart = 0;
        source.loopEnd = data.buffer.duration;

        source.connect(data.gainNode);
        source.start(0);

        data.sourceNode = source;
    }

    function stopTrack(trackId) {
        const data = trackNodes[trackId];
        if (data && data.sourceNode) {
            try {
                data.sourceNode.stop();
                data.sourceNode.disconnect();
            } catch (e) {
                // Ignore errors if already stopped or invalid state
            }
            data.sourceNode = null;
        }
    }

    async function togglePlayback() {
        if (!audioContext) {
            await initAudioEngine();
        }

        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        if (isPlaying) {
            // PAUSE ACTION
            const currentTime = audioContext.currentTime;

            // Fade Out Master
            masterGainNode.gain.cancelScheduledValues(currentTime);
            masterGainNode.gain.setValueAtTime(masterGainNode.gain.value, currentTime);
            masterGainNode.gain.linearRampToValueAtTime(0, currentTime + 0.5);

            // Stop logic after fade
            setTimeout(() => {
                Object.keys(trackNodes).forEach(id => stopTrack(id));
                isPlaying = false;
                updatePlayButtonUI();
                // Restore master gain value internally for next play
                masterGainNode.gain.value = parseFloat(masterVolumeSlider.value);
            }, 500);

        } else {
            // PLAY ACTION
            // Start all sources immediately
            Object.keys(trackNodes).forEach(id => {
                startGaplessLoop(id);
            });

            // Fade In Master
            const targetVol = parseFloat(masterVolumeSlider.value);
            const currentTime = audioContext.currentTime;
            masterGainNode.gain.cancelScheduledValues(currentTime);
            masterGainNode.gain.setValueAtTime(0, currentTime);
            masterGainNode.gain.linearRampToValueAtTime(targetVol, currentTime + fadeDuration);

            isPlaying = true;
            updatePlayButtonUI();
        }
    }

    function updatePlayButtonUI() {
        if (isPlaying) {
            iconPlay.classList.add('hidden');
            iconPause.classList.remove('hidden');
            playPauseBtn.setAttribute('aria-label', 'Pause');
        } else {
            iconPlay.classList.remove('hidden');
            iconPause.classList.add('hidden');
            playPauseBtn.setAttribute('aria-label', 'Play');
        }
    }

    // --- Inputs & Reactivity ---

    // Master Volume
    if (masterVolumeSlider) {
        masterVolumeSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (audioContext && masterGainNode) {
                masterGainNode.gain.cancelScheduledValues(audioContext.currentTime);
                masterGainNode.gain.setTargetAtTime(val, audioContext.currentTime, 0.1);
            }
        });
    }

    // Individual Track Volume & Visuals
    tracks.forEach(track => {
        const slider = document.querySelector(`.track-column[data-track="${track.id}"] input[type="range"]`);
        const column = document.querySelector(`.track-column[data-track="${track.id}"]`);

        if (slider && column) {
            // Initial Visual Set
            updateIconVisuals(column, parseFloat(slider.value));

            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);

                // 1. Update Audio Gain
                if (trackNodes[track.id] && trackNodes[track.id].gainNode && audioContext) {
                    const node = trackNodes[track.id].gainNode;

                    let finalVol = val;
                    if (track.id === 'waves') {
                        finalVol = val * 0.6;
                    }

                    node.gain.cancelScheduledValues(audioContext.currentTime);
                    node.gain.setTargetAtTime(finalVol, audioContext.currentTime, 0.1);
                }

                // 2. Update Visuals
                updateIconVisuals(column, val);
            });
        }
    });

    // Play Button Listener
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', togglePlayback);
    }

    // --- Helper: Visuals (Strict Inline Styles) ---
    function updateIconVisuals(columnElement, volume) {
        const iconWrapper = columnElement.querySelector('.icon-wrapper');
        const svg = iconWrapper.querySelector('svg');
        const trackId = columnElement.dataset.track;

        // Robust selector for all SVG shapes
        const shapes = svg.querySelectorAll('path, line, circle, polyline, polygon, rect');

        // Logic: 
        // Volume > 0: Add .active, set opacity 0.4-1.0, set Stroke Gradient
        // Volume == 0: Remove .active, reset opacity, set Stroke Grey

        if (volume > 0) {
            columnElement.classList.add('active');

            const computedOpacity = 0.4 + (volume * 0.6);
            svg.style.opacity = computedOpacity;
            svg.style.filter = 'none';

            shapes.forEach(shape => {
                // Ensure we don't accidentally style hidden bounding rects with gradient if they are display:none
                // But setting stroke on hidden element is harmless.
                shape.style.stroke = `url(#grad-${trackId})`;
            });

        } else {
            columnElement.classList.remove('active');

            svg.style.opacity = '';
            svg.style.filter = '';

            shapes.forEach(shape => {
                shape.style.stroke = '#cccccc';
            });
        }
    }

    // Pre-init on load (browser might suspend it, but loading can happen)
    initAudioEngine().catch(err => console.log("Auto-init deferred:", err));

});
