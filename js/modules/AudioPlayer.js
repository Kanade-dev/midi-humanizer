/**
 * Audio Player Module
 * Handles MIDI playback using Web Audio API
 */

export class AudioPlayer {
  constructor() {
    this.audioContext = null;
    this.currentPlayback = null;
    this.activeAudioNodes = [];
    this.isPlaying = false;
    this.isPlayingOriginal = false;
    this.isPlayingHumanized = false;
    this.playbackStartTime = 0;
    this.playbackDuration = 0;
    this.progressInterval = null;
    this.onProgressUpdate = null; // Callback for progress updates
    
    this.initializeAudio();
  }

  /**
   * Initialize Web Audio API
   */
  initializeAudio() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
    }
  }

  /**
   * Create piano note using lightweight synthesis
   * Inspired by PicoTune approach for efficiency
   */
  createPianoNote(frequency, velocity = 64, startTime, duration = 1000) {
    if (!this.audioContext) return null;

    // Calculate timing values
    const noteDuration = Math.min(duration / 1000, 2.0); // Cap max duration
    const releaseTime = Math.min(0.3, noteDuration * 0.3); // Much shorter release

    // Use single oscillator for better performance (like PicoAudio.js approach)
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    // Track nodes for cleanup with shorter duration
    const totalDuration = noteDuration + releaseTime + 0.05;
    
    const nodes = {
      oscillators: [oscillator], 
      gains: [gainNode],
      startTime: startTime,
      endTime: startTime + totalDuration
    };
    this.activeAudioNodes.push(nodes);
    
    // Simple but effective waveform for piano-like sound
    oscillator.type = 'triangle'; // Triangle wave sounds more piano-like than multiple oscillators
    oscillator.frequency.setValueAtTime(frequency, startTime);
    
    // Simpler volume calculation
    const baseVolume = Math.max(0.1, Math.min(0.6, velocity / 127 * 0.4));
    
    // Simplified envelope (faster attack, quick decay, no sustain complexity)
    const attackTime = 0.005; // Very quick attack
    const decayTime = Math.min(0.05, noteDuration * 0.1); // Proportional but capped decay
    
    // Simple envelope (inspired by lightweight MIDI players like Picotune)
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(baseVolume, startTime + attackTime);
    gainNode.gain.linearRampToValueAtTime(baseVolume * 0.8, startTime + attackTime + decayTime);
    gainNode.gain.setValueAtTime(baseVolume * 0.8, startTime + noteDuration);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + releaseTime);
    
    // Connect audio graph
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    // Schedule oscillator with shorter, more efficient timing
    oscillator.start(startTime);
    oscillator.stop(startTime + totalDuration);
    
    return nodes;
  }

  /**
   * Convert MIDI note number to frequency
   */
  midiNoteToFrequency(midiNote) {
    return Math.pow(2, (midiNote - 69) / 12) * 440;
  }

  /**
   * Stop current playback
   */
  stopPlayback() {
    if (this.currentPlayback) {
      clearTimeout(this.currentPlayback);
      this.currentPlayback = null;
    }
    
    // Immediately stop progress tracking
    this.stopProgressTracking();
    
    // Cleanup active audio nodes efficiently
    this.activeAudioNodes.forEach(nodeSet => {
      nodeSet.oscillators.forEach(osc => {
        try {
          // Use more reliable stopping method
          if (osc && osc.stop && typeof osc.stop === 'function') {
            osc.stop(this.audioContext.currentTime);
          }
        } catch(e) {
          // Ignore errors from already-stopped oscillators
        }
      });
      nodeSet.gains.forEach(gain => {
        try {
          if (gain && gain.gain && gain.disconnect) {
            // Set gain to 0 immediately and disconnect
            gain.gain.setValueAtTime(0, this.audioContext.currentTime);
            gain.disconnect();
          }
        } catch(e) {
          // Ignore errors
        }
      });
    });
    
    // Clear all active nodes immediately
    this.activeAudioNodes = [];
    
    this.isPlaying = false;
    this.isPlayingOriginal = false;
    this.isPlayingHumanized = false;
  }

  /**
   * Start progress tracking for visualization
   */
  startProgressTracking() {
    this.progressInterval = setInterval(() => {
      if (this.isPlaying && this.audioContext) {
        const elapsed = (this.audioContext.currentTime - this.playbackStartTime - 0.1) * 1000; // Subtract initial delay
        const progress = Math.max(0, Math.min(elapsed / this.playbackDuration, 1));
        
        if (this.onProgressUpdate) {
          this.onProgressUpdate(progress);
        }
      }
    }, 50); // Update every 50ms for smooth visualization
  }

  /**
   * Stop progress tracking
   */
  stopProgressTracking() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  /**
   * Play MIDI data
   */
  async playMIDIData(midiData, isOriginal = true) {
    if (!this.audioContext) {
      console.warn('Web Audio API not available');
      return;
    }

    // Resume audio context if suspended (required by some browsers)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Stop any current playback
    this.stopPlayback();

    this.isPlaying = true;
    this.isPlayingOriginal = isOriginal;
    this.isPlayingHumanized = !isOriginal;

    const currentTime = this.audioContext.currentTime;
    this.playbackStartTime = currentTime;
    
    // Convert MIDI to audio events
    const audioEvents = this.convertMIDIToAudioEvents(midiData);
    
    // Calculate playback duration
    this.playbackDuration = audioEvents.length > 0 ? 
      Math.max(...audioEvents.map(e => e.time + e.duration)) : 0;

    // Start progress tracking
    this.startProgressTracking();

    // Schedule audio events
    const startDelay = 0.1; // Small delay to ensure proper timing
    
    audioEvents.forEach(event => {
      const scheduleTime = currentTime + startDelay + (event.time / 1000);
      const frequency = this.midiNoteToFrequency(event.note);
      
      this.createPianoNote(
        frequency,
        event.velocity,
        scheduleTime,
        event.duration
      );
    });

    // Schedule playback end
    this.currentPlayback = setTimeout(() => {
      this.stopPlayback();
    }, this.playbackDuration + (startDelay * 1000) + 500); // Add buffer time
  }

  /**
   * Convert MIDI data to audio events
   */
  convertMIDIToAudioEvents(midiData) {
    const audioEvents = [];
    const noteOnEvents = new Map();

    midiData.tracks.forEach(track => {
      track.forEach(event => {
        if (event.type === 0x90 && event.velocity > 0) {
          // Note on
          noteOnEvents.set(event.note, {
            startTime: event.time,
            velocity: event.velocity,
            note: event.note
          });
        } else if (event.type === 0x80 || (event.type === 0x90 && event.velocity === 0)) {
          // Note off
          const noteOn = noteOnEvents.get(event.note);
          if (noteOn) {
            audioEvents.push({
              time: noteOn.startTime,
              duration: event.time - noteOn.startTime,
              note: event.note,
              velocity: noteOn.velocity
            });
            noteOnEvents.delete(event.note);
          }
        }
      });
    });

    return audioEvents.sort((a, b) => a.time - b.time);
  }

  /**
   * Play original MIDI
   */
  async playOriginal(midiData) {
    if (!midiData) {
      console.warn('No original MIDI data available');
      return;
    }
    
    await this.playMIDIData(midiData, true);
  }

  /**
   * Play humanized MIDI
   */
  async playHumanized(midiData) {
    if (!midiData) {
      console.warn('No humanized MIDI data available');
      return;
    }
    
    await this.playMIDIData(midiData, false);
  }

  /**
   * Set progress update callback
   */
  setProgressCallback(callback) {
    this.onProgressUpdate = callback;
  }

  /**
   * Get current playback state
   */
  getPlaybackState() {
    return {
      isPlaying: this.isPlaying,
      isPlayingOriginal: this.isPlayingOriginal,
      isPlayingHumanized: this.isPlayingHumanized,
      duration: this.playbackDuration
    };
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.stopPlayback();
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }
}