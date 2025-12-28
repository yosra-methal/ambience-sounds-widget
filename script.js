document.addEventListener('DOMContentLoaded', () => {
    // Audio Configuration
    const tracks = [
        { id: 'wind', path: './assets/audio/wind.mp3' },
        { id: 'rain', path: './assets/audio/rain.mp3' },
        { id: 'birds', path: './assets/audio/birds.mp3' },
        { id: 'waves', path: './assets/audio/waves.mp3' },
        { id: 'fire', path: './assets/audio/fire.mp3' }
    ];

    let audioContext = null;
    let masterGainNode = null;
    let isPlaying = false;
    const fadeDuration = 2.0;

    const trackNodes = {};

    // UI Elements
    const playPauseBtn = document.getElementById('master-play-pause');
    const iconPlay = document.getElementById('icon-play');
    const iconPause = document.getElementById('icon-pause');
    const masterVolumeSlider = document.getElementById('master-volume');

    // Initialize Tracks
    tracks.forEach(track => {
        const column = document.querySelector(`.track-column[data-track="${track.id}"]`);
        const slider = column.querySelector('.track-volume');

        // Initial visual state
        updateIconVisuals(column, slider.value);

        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            updateTrackVolume(track.id, val);
            updateIconVisuals(column, val);
        });
    });

    // Master Volume
    masterVolumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (audioContext && masterGainNode) {
            // Master volume immediate control for responsiveness
            masterGainNode.gain.cancelScheduledValues(audioContext.currentTime);
            masterGainNode.gain.linearRampToValueAtTime(val, audioContext.currentTime + 0.1);
        }
    });

    // Play/Pause
    playPauseBtn.addEventListener('click', async () => {
        if (!audioContext) {
            await initAudio();
        }

        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        if (isPlaying) {
            pauseAll();
        } else {
            playAll();
        }
    });

    async function initAudio() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();

        masterGainNode = audioContext.createGain();
        masterGainNode.gain.value = parseFloat(masterVolumeSlider.value);
        masterGainNode.connect(audioContext.destination);

        // Load Tracks
        for (const track of tracks) {
            try {
                const response = await fetch(track.path);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                const gainNode = audioContext.createGain();
                gainNode.gain.value = 0; // Volume controlled by slider
                gainNode.connect(masterGainNode);

                trackNodes[track.id] = {
                    buffer: audioBuffer,
                    gainNode: gainNode,
                    sourceNode: null
                };

                // Sync with slider if it was moved before play
                const slider = document.querySelector(`.track-volume[data-track="${track.id}"]`);
                gainNode.gain.value = parseFloat(slider.value);

            } catch (error) {
                console.error(`Error loading track ${track.id}:`, error);
            }
        }
    }

    function startSource(trackId) {
        const trackData = trackNodes[trackId];
        if (!trackData || !trackData.buffer) return;

        const source = audioContext.createBufferSource();
        source.buffer = trackData.buffer;
        source.loop = true;
        source.connect(trackData.gainNode);
        source.start(0);
        trackData.sourceNode = source;
    }

    function stopSource(trackId) {
        const trackData = trackNodes[trackId];
        if (trackData && trackData.sourceNode) {
            try {
                trackData.sourceNode.stop();
                trackData.sourceNode.disconnect();
            } catch (e) { }
            trackData.sourceNode = null;
        }
    }

    function playAll() {
        if (audioContext.state === 'suspended') audioContext.resume();

        Object.keys(trackNodes).forEach(id => {
            if (!trackNodes[id].sourceNode) {
                startSource(id);
            }
        });

        // Global fade in
        const currentTime = audioContext.currentTime;
        const targetVol = parseFloat(masterVolumeSlider.value);

        masterGainNode.gain.cancelScheduledValues(currentTime);
        masterGainNode.gain.setValueAtTime(masterGainNode.gain.value, currentTime);
        masterGainNode.gain.linearRampToValueAtTime(targetVol, currentTime + fadeDuration);

        // UI
        isPlaying = true;
        iconPlay.classList.add('hidden');
        iconPause.classList.remove('hidden');
        playPauseBtn.setAttribute('aria-label', 'Pause');
    }

    function pauseAll() {
        if (!audioContext) return;

        const currentTime = audioContext.currentTime;
        // Global fade out
        masterGainNode.gain.cancelScheduledValues(currentTime);
        masterGainNode.gain.setValueAtTime(masterGainNode.gain.value, currentTime);
        masterGainNode.gain.linearRampToValueAtTime(0, currentTime + fadeDuration);

        // Optional: Stop sources after fade to save resources, or keep looping.
        // For Gapless ambient mixer, keeping them running is safer if user plays again quickly.
        // But to be "Clean", we can stop. Let's keep them running for instant resume.

        isPlaying = false;
        iconPlay.classList.remove('hidden');
        iconPause.classList.add('hidden');
        playPauseBtn.setAttribute('aria-label', 'Play');
    }

    function updateTrackVolume(trackId, value) {
        if (!audioContext) return;
        const trackData = trackNodes[trackId];
        if (trackData && trackData.gainNode) {
            const currentTime = audioContext.currentTime;
            trackData.gainNode.gain.cancelScheduledValues(currentTime);
            // Smooth volume change
            trackData.gainNode.gain.linearRampToValueAtTime(value, currentTime + 0.2);
        }
    }

    function updateIconVisuals(columnElement, volume) {
        const iconWrapper = columnElement.querySelector('.icon-wrapper');
        const svg = iconWrapper.querySelector('svg');

        if (volume > 0) {
            columnElement.classList.add('active');
            // Dynamic opacity from 0.4 to 1 based on volume
            // low volume (0.01) -> 0.4 opacity
            // high volume (1.0) -> 1.0 opacity
            const computedOpacity = 0.4 + (volume * 0.6);
            svg.style.opacity = computedOpacity;
        } else {
            columnElement.classList.remove('active');
            svg.style.opacity = ''; // Revert to CSS default (0.4)
        }
    }
});
