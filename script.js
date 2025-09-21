// MIDI Humanizer Script
// Handles MIDI file processing and humanization

class MIDIHumanizer {
  constructor() {
    this.originalMidiData = null;
    this.humanizedMidiData = null;
    this.isProcessing = false;
    
    // Audio playback properties
    this.audioContext = null;
    this.currentPlayback = null;
    this.isPlaying = false;
    this.isPlayingOriginal = false;
    this.isPlayingHumanized = false;
    this.playbackStartTime = 0;
    this.playbackDuration = 0;
    this.progressInterval = null;
    
    this.initializeEventListeners();
    this.setupIntensitySlider();
    this.initializeAudio();
  }

  initializeEventListeners() {
    const form = document.getElementById('form');
    const fileInput = document.getElementById('file');
    
    form.addEventListener('submit', (e) => this.handleFormSubmit(e));
    fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
  }

  setupIntensitySlider() {
    const intensitySlider = document.getElementById('intensity');
    const intensityValue = document.getElementById('intensityValue');
    
    intensitySlider.addEventListener('input', (e) => {
      intensityValue.textContent = e.target.value;
    });
  }

  initializeAudio() {
    try {
      // Initialize AudioContext for MIDI playback
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
    }
  }

  // Advanced synthesizer for smooth MIDI note playback
  createPianoNote(frequency, velocity = 64, startTime, duration = 1000) {
    if (!this.audioContext) return null;

    // Create multiple oscillators for richer piano-like sound
    const fundamental = this.audioContext.createOscillator();
    const harmonic2 = this.audioContext.createOscillator();
    const harmonic3 = this.audioContext.createOscillator();
    
    // Create gain nodes for each oscillator
    const fundamentalGain = this.audioContext.createGain();
    const harmonic2Gain = this.audioContext.createGain();
    const harmonic3Gain = this.audioContext.createGain();
    const masterGain = this.audioContext.createGain();
    
    // Configure oscillators for piano-like timbre
    fundamental.type = 'sine';
    harmonic2.type = 'triangle';
    harmonic3.type = 'sawtooth';
    
    fundamental.frequency.setValueAtTime(frequency, startTime);
    harmonic2.frequency.setValueAtTime(frequency * 2.01, startTime); // Slightly detuned for realism
    harmonic3.frequency.setValueAtTime(frequency * 3.02, startTime);
    
    // Set relative volumes for harmonics
    const baseVolume = Math.max(0.05, Math.min(0.8, velocity / 127 * 0.5));
    fundamentalGain.gain.setValueAtTime(baseVolume, startTime);
    harmonic2Gain.gain.setValueAtTime(baseVolume * 0.3, startTime);
    harmonic3Gain.gain.setValueAtTime(baseVolume * 0.1, startTime);
    
    // Create realistic piano envelope (ADSR)
    const attackTime = 0.01;
    const decayTime = duration / 1000 * 0.2;
    const sustainLevel = baseVolume * 0.6;
    const releaseTime = duration / 1000 * 0.8;
    
    masterGain.gain.setValueAtTime(0, startTime);
    masterGain.gain.linearRampToValueAtTime(baseVolume, startTime + attackTime);
    masterGain.gain.exponentialRampToValueAtTime(sustainLevel, startTime + attackTime + decayTime);
    masterGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration / 1000);
    
    // Connect the audio graph
    fundamental.connect(fundamentalGain);
    harmonic2.connect(harmonic2Gain);
    harmonic3.connect(harmonic3Gain);
    
    fundamentalGain.connect(masterGain);
    harmonic2Gain.connect(masterGain);
    harmonic3Gain.connect(masterGain);
    masterGain.connect(this.audioContext.destination);
    
    // Schedule oscillator start and stop with precise timing
    fundamental.start(startTime);
    harmonic2.start(startTime);
    harmonic3.start(startTime);
    
    fundamental.stop(startTime + duration / 1000 + 0.1);
    harmonic2.stop(startTime + duration / 1000 + 0.1);
    harmonic3.stop(startTime + duration / 1000 + 0.1);
    
    return { 
      oscillators: [fundamental, harmonic2, harmonic3], 
      gains: [fundamentalGain, harmonic2Gain, harmonic3Gain, masterGain] 
    };
  }

  // Convert MIDI note number to frequency
  midiNoteToFrequency(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  // Stop current playback
  stopPlayback() {
    if (this.currentPlayback) {
      this.currentPlayback.forEach(timeout => clearTimeout(timeout));
      this.currentPlayback = [];
    }
    this.isPlaying = false;
    this.stopProgressTracking();
    this.updatePlaybackButtons();
  }

  startProgressTracking() {
    this.stopProgressTracking(); // Clear any existing interval
    this.progressInterval = setInterval(() => {
      if (this.isPlaying && this.audioContext) {
        const elapsed = (this.audioContext.currentTime - this.playbackStartTime - 0.1) * 1000; // Subtract initial delay
        const progress = Math.max(0, Math.min(elapsed / this.playbackDuration, 1));
        this.updateVisualizationProgress(progress);
      }
    }, 30); // Update every 30ms for ultra-smooth animation
  }

  stopProgressTracking() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    this.updateVisualizationProgress(0); // Reset progress
  }

  updateVisualizationProgress(progress) {
    // Update progress in visualization instead of progress bar
    if (this.currentVisualizationMode) {
      this.updateVisualizationProgress(progress);
    }
  }

  updateVisualizationProgress(progress) {
    // Find or create progress indicator in visualization
    const canvas = document.getElementById('visualizationCanvas');
    if (!canvas) return;
    
    const existingIndicator = canvas.querySelector('.playback-progress-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    if (progress > 0 && this.isPlaying) {
      const indicator = document.createElement('div');
      indicator.className = 'playback-progress-indicator';
      
      // Calculate position accounting for zoom level
      const zoomLevel = this.zoomLevel || 1;
      const adjustedProgress = progress * zoomLevel;
      
      indicator.style.cssText = `
        position: absolute;
        top: 0;
        bottom: 0;
        width: 3px;
        background: linear-gradient(to bottom, #ff4444, #ff6666);
        z-index: 1000;
        box-shadow: 0 0 8px rgba(255, 68, 68, 0.6);
        left: ${adjustedProgress * 100}%;
        pointer-events: none;
        border-radius: 2px;
      `;
      
      // Find the appropriate container based on current mode
      const timelineContainer = canvas.querySelector('.timeline-track, .phrase-visualization, .phrase-blocks');
      if (timelineContainer) {
        timelineContainer.style.position = 'relative';
        timelineContainer.appendChild(indicator);
      }
    }
  }

  // Play MIDI data using Web Audio API with precise scheduling
  async playMIDIData(midiData, isOriginal = true) {
    if (!this.audioContext) {
      alert('Web Audio APIがサポートされていません。ブラウザを更新してお試しください。');
      return;
    }

    if (this.isPlaying) {
      this.stopPlayback();
      return;
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.isPlaying = true;
    this.currentPlayback = [];
    this.playbackStartTime = this.audioContext.currentTime;
    this.updatePlaybackButtons();

    console.log(`Playing ${isOriginal ? 'original' : 'humanized'} MIDI...`);

    try {
      // Process all tracks and collect note events
      const noteEvents = [];
      let maxTime = 0;
      const tempo = 120; // Default tempo (BPM)
      const division = midiData.header.division || 96; // Ticks per quarter note
      
      midiData.tracks.forEach((track, trackIndex) => {
        const activeNotes = new Map();
        
        track.forEach(event => {
          // Convert MIDI ticks to seconds
          const realTimeSeconds = (event.time / division) * (60 / tempo);
          
          if (event.status >= 0x80 && event.status <= 0x9F) { // Note events
            const isNoteOn = (event.status & 0xF0) === 0x90 && event.data2 > 0;
            const isNoteOff = (event.status & 0xF0) === 0x80 || ((event.status & 0xF0) === 0x90 && event.data2 === 0);
            
            if (isNoteOn) {
              const noteNumber = event.data1;
              const velocity = event.data2;
              const noteKey = `${noteNumber}_${trackIndex}`;
              
              activeNotes.set(noteKey, {
                noteNumber,
                velocity,
                startTime: realTimeSeconds,
                trackIndex
              });
            } else if (isNoteOff) {
              const noteNumber = event.data1;
              const noteKey = `${noteNumber}_${trackIndex}`;
              
              if (activeNotes.has(noteKey)) {
                const noteData = activeNotes.get(noteKey);
                const duration = Math.max(0.1, (realTimeSeconds - noteData.startTime) * 1000); // Convert to ms
                
                noteEvents.push({
                  noteNumber: noteData.noteNumber,
                  velocity: noteData.velocity,
                  startTime: noteData.startTime,
                  duration: duration,
                  trackIndex: noteData.trackIndex
                });
                
                activeNotes.delete(noteKey);
                maxTime = Math.max(maxTime, realTimeSeconds);
              }
            }
          }
        });
        
        // Handle any remaining active notes (notes without explicit note-off)
        activeNotes.forEach(noteData => {
          const duration = 500; // Default duration in ms
          noteEvents.push({
            noteNumber: noteData.noteNumber,
            velocity: noteData.velocity,
            startTime: noteData.startTime,
            duration: duration,
            trackIndex: noteData.trackIndex
          });
          maxTime = Math.max(maxTime, noteData.startTime + duration / 1000);
        });
      });

      // Schedule all notes using Web Audio's precise timing
      const audioStartTime = this.audioContext.currentTime + 0.1; // Small delay to ensure smooth start
      
      noteEvents.forEach(noteEvent => {
        const frequency = this.midiNoteToFrequency(noteEvent.noteNumber);
        const scheduleTime = audioStartTime + noteEvent.startTime;
        
        try {
          this.createPianoNote(frequency, noteEvent.velocity, scheduleTime, noteEvent.duration);
        } catch (error) {
          console.warn('Error creating note:', error);
        }
      });

      // Set playback duration and auto-stop
      this.playbackDuration = maxTime * 1000; // Convert to milliseconds
      
      // Use a more precise timeout for stopping playback
      const stopTimeout = setTimeout(() => {
        this.stopPlayback();
      }, this.playbackDuration + 1000);
      
      this.currentPlayback.push(stopTimeout);
      
      // Start progress tracking
      this.startProgressTracking();
      
    } catch (error) {
      console.error('Error during MIDI playback:', error);
      this.stopPlayback();
      alert('再生中にエラーが発生しました。');
    }
  }

  async handleFormSubmit(e) {
    e.preventDefault();
    
    if (this.isProcessing) return;
    
    const fileInput = document.getElementById('file');
    const file = fileInput.files[0];
    
    if (!file) {
      this.showError('MIDIファイルを選択してください。');
      return;
    }

    await this.processMIDIFile(file);
  }

  async handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
      // Reset previous results
      this.hideElements(['result', 'error', 'analysis']);
    }
  }

  async processMIDIFile(file) {
    try {
      this.isProcessing = true;
      this.showProcessing();
      this.hideElements(['result', 'error', 'analysis']);

      // Read MIDI file
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      const midiData = this.parseMIDI(arrayBuffer);
      this.originalMidiData = midiData;

      // Apply humanization
      const style = document.getElementById('style').value;
      const intensity = parseFloat(document.getElementById('intensity').value);
      const seed = document.getElementById('seed').value || Date.now();

      this.humanizedMidiData = this.humanizeMIDI(midiData, style, intensity, seed);

      // Show results
      this.showResults();
      
    } catch (error) {
      console.error('Error processing MIDI:', error);
      this.showError('MIDIファイルの処理中にエラーが発生しました: ' + error.message);
    } finally {
      this.isProcessing = false;
      this.hideProcessing();
    }
  }

  readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
      reader.readAsArrayBuffer(file);
    });
  }

  parseMIDI(arrayBuffer) {
    // Simple MIDI parser for demonstration
    // In a real implementation, you'd use a library like midi-parser-js
    const data = new Uint8Array(arrayBuffer);
    
    // Basic MIDI file validation
    if (data.length < 14 || 
        String.fromCharCode(...data.slice(0, 4)) !== 'MThd') {
      throw new Error('有効なMIDIファイルではありません');
    }

    // Parse MIDI tracks and events
    const tracks = this.parseTrackData(data);
    
    return {
      header: this.parseHeader(data),
      tracks: tracks,
      originalData: arrayBuffer
    };
  }

  parseHeader(data) {
    const view = new DataView(data.buffer);
    return {
      format: view.getUint16(8),
      tracks: view.getUint16(10),
      division: view.getUint16(12)
    };
  }

  parseTrackData(data) {
    const tracks = [];
    let offset = 14; // After header
    
    while (offset < data.length) {
      if (String.fromCharCode(...data.slice(offset, offset + 4)) === 'MTrk') {
        const trackLength = new DataView(data.buffer).getUint32(offset + 4);
        const trackData = data.slice(offset + 8, offset + 8 + trackLength);
        tracks.push(this.parseEvents(trackData));
        offset += 8 + trackLength;
      } else {
        break;
      }
    }
    
    return tracks;
  }

  parseEvents(trackData) {
    const events = [];
    let time = 0;
    let offset = 0;
    let runningStatus = null;
    
    while (offset < trackData.length) {
      // Parse variable length delta time
      const deltaTime = this.readVariableLength(trackData, offset);
      offset += deltaTime.bytesRead;
      time += deltaTime.value;
      
      let status = trackData[offset];
      
      // Handle running status
      if (status < 0x80 && runningStatus) {
        status = runningStatus;
      } else {
        offset++;
        runningStatus = status;
      }
      
      const event = {
        time: time,
        status: status,
        type: this.getEventType(status)
      };
      
      // Parse event data based on type
      if (status >= 0x80 && status <= 0xEF) {
        // Channel messages
        event.channel = status & 0x0F;
        event.data1 = trackData[offset++];
        
        if (this.needsSecondByte(status)) {
          event.data2 = trackData[offset++];
        }
      } else if (status === 0xFF) {
        // Meta events
        event.metaType = trackData[offset++];
        const length = this.readVariableLength(trackData, offset);
        offset += length.bytesRead;
        event.data = trackData.slice(offset, offset + length.value);
        offset += length.value;
      }
      
      events.push(event);
    }
    
    return events;
  }

  humanizeMIDI(midiData, style, intensity, seed) {
    // Set random seed for reproducibility
    this.rng = this.seedRandom(seed);
    
    // Store style for later use in results display
    this.lastStyle = style;
    
    // Perform musical analysis for intelligent humanization
    const musicalAnalysis = this.analyzeMusicStructure(midiData.tracks, style);
    
    // Store analysis for visualization
    this.lastAnalysis = musicalAnalysis;
    
    const humanizedTracks = midiData.tracks.map((track, trackIndex) => 
      this.humanizeTrack(track, style, intensity, musicalAnalysis.tracks[trackIndex])
    );
    
    // Don't display analysis results here anymore - they'll be shown in the integrated section
    // this.displayAnalysisResults(musicalAnalysis, style);
    
    return {
      ...midiData,
      tracks: humanizedTracks
    };
  }

  humanizeTrack(track, style, intensity, trackAnalysis = null) {
    const humanizedEvents = [];
    const noteOnEvents = [];
    let cumulativeDrift = 0; // Track cumulative timing drift
    const beatTicks = 480; // Standard MIDI beat in ticks
    
    // Pre-process to detect chords for micro-arpeggiation
    const chordGroups = this.detectChordGroups(track);
    
    for (let i = 0; i < track.length; i++) {
      const event = { ...track[i] };
      
      if (this.isNoteOn(event)) {
        // Apply intelligent timing humanization based on musical context
        const originalTime = event.time;
        event.time = this.humanizeTimingIntelligent(event.time, event.data1, style, intensity, trackAnalysis, i, cumulativeDrift, beatTicks);
        
        // Apply micro-arpeggiation for chords (suggestion from @Kanade-dev)
        const chordGroup = chordGroups.find(group => 
          group.events.some(e => e.originalIndex === i)
        );
        
        if (chordGroup && chordGroup.events.length > 2) {
          const eventInChord = chordGroup.events.find(e => e.originalIndex === i);
          if (eventInChord) {
            // Sort notes by pitch for arpeggiation (bottom to top)
            const sortedNotes = [...chordGroup.events].sort((a, b) => a.pitch - b.pitch);
            const noteIndex = sortedNotes.findIndex(e => e.originalIndex === i);
            
            // Apply micro-timing offset (1-3ms per note)
            const arpeggiationDelay = noteIndex * intensity * 2; // 0-2 ticks per note
            event.time += arpeggiationDelay;
          }
        }
        
        // Update cumulative drift
        cumulativeDrift += (event.time - originalTime);
        
        // Check for timing conflicts with previous events and resolve
        event.time = this.resolveTimingConflicts(event, humanizedEvents, originalTime);
        
        // Apply velocity-timing correlation (suggestion from @Kanade-dev)
        const velocityTimingAdjustment = this.calculateVelocityTimingCorrelation(event.data2, intensity);
        event.time += velocityTimingAdjustment;
        
        // Apply intelligent velocity humanization based on musical phrasing
        event.data2 = this.humanizeVelocityIntelligent(event.data2, event.data1, style, intensity, trackAnalysis, i);
        
        noteOnEvents.push(event);
      } else if (this.isNoteOff(event)) {
        // Find corresponding note on event
        const noteOnIndex = noteOnEvents.findIndex(noteOn => 
          noteOn.data1 === event.data1 && noteOn.channel === event.channel
        );
        
        if (noteOnIndex !== -1) {
          const noteOn = noteOnEvents[noteOnIndex];
          const duration = event.time - noteOn.time;
          
          // Apply intelligent duration humanization
          const humanizedDuration = this.humanizeDurationIntelligent(duration, event.data1, style, intensity, trackAnalysis, i);
          event.time = noteOn.time + humanizedDuration;
          
          // Ensure note off doesn't conflict with subsequent note ons
          event.time = this.resolveNoteOffConflicts(event, humanizedEvents, noteOn);
          
          noteOnEvents.splice(noteOnIndex, 1);
        }
      }
      
      humanizedEvents.push(event);
    }
    
    // Sort events by time and perform final conflict resolution
    humanizedEvents.sort((a, b) => a.time - b.time);
    
    // Final pass: ensure minimum spacing between all events
    this.enforceMinimumSpacing(humanizedEvents);
    
    return humanizedEvents;
  }

  // Detect simultaneous notes for micro-arpeggiation (suggestion from @Kanade-dev)
  detectChordGroups(track) {
    const chordGroups = [];
    const tolerance = 5; // Ticks tolerance for "simultaneous" notes
    
    track.forEach((event, index) => {
      if (this.isNoteOn(event)) {
        // Find existing chord group or create new one
        let chordGroup = chordGroups.find(group => 
          Math.abs(group.time - event.time) <= tolerance
        );
        
        if (!chordGroup) {
          chordGroup = {
            time: event.time,
            events: []
          };
          chordGroups.push(chordGroup);
        }
        
        chordGroup.events.push({
          originalIndex: index,
          pitch: event.data1,
          velocity: event.data2,
          time: event.time
        });
      }
    });
    
    return chordGroups;
  }

  // Calculate velocity-timing correlation (suggestion from @Kanade-dev)
  calculateVelocityTimingCorrelation(velocity, intensity) {
    // Strong notes (high velocity) played slightly early, weak notes slightly late
    const velocityNormalized = (velocity - 64) / 64; // Normalize around middle velocity
    const timingAdjustment = -velocityNormalized * intensity * 3; // Max 3 ticks adjustment
    return timingAdjustment;
  }

  // Timing conflict resolution methods
  resolveTimingConflicts(currentEvent, previousEvents, originalTime) {
    const minSpacing = 5; // Minimum ticks between events
    let adjustedTime = currentEvent.time;
    
    // Find the latest event that could conflict
    for (let i = previousEvents.length - 1; i >= 0; i--) {
      const prevEvent = previousEvents[i];
      
      // Only check recent events within a reasonable window
      if (originalTime - prevEvent.time > 480) break; // Within 1 beat (480 ticks)
      
      if (Math.abs(adjustedTime - prevEvent.time) < minSpacing) {
        // Conflict detected, adjust timing
        if (adjustedTime >= prevEvent.time) {
          adjustedTime = prevEvent.time + minSpacing;
        } else {
          // If adjustment would push us forward too much, limit the humanization
          const maxForwardAdjustment = originalTime * 0.02; // Max 2% forward adjustment
          adjustedTime = Math.min(adjustedTime, originalTime + maxForwardAdjustment);
          
          if (adjustedTime - prevEvent.time < minSpacing) {
            adjustedTime = prevEvent.time + minSpacing;
          }
        }
      }
    }
    
    return adjustedTime;
  }

  resolveNoteOffConflicts(noteOffEvent, allEvents, correspondingNoteOn) {
    const minDuration = 10; // Minimum note duration in ticks
    let adjustedTime = noteOffEvent.time;
    
    // Ensure minimum note duration
    const minOffTime = correspondingNoteOn.time + minDuration;
    if (adjustedTime < minOffTime) {
      adjustedTime = minOffTime;
    }
    
    // Check conflicts with subsequent events
    const futureEvents = allEvents.filter(e => e.time > correspondingNoteOn.time);
    for (const futureEvent of futureEvents) {
      if (this.isNoteOn(futureEvent) && 
          Math.abs(adjustedTime - futureEvent.time) < 5) {
        // Adjust to avoid conflict
        adjustedTime = Math.min(adjustedTime, futureEvent.time - 5);
        break;
      }
    }
    
    return Math.max(adjustedTime, minOffTime);
  }

  enforceMinimumSpacing(events) {
    const minSpacing = 3; // Minimum spacing between any events
    
    for (let i = 1; i < events.length; i++) {
      const prevEvent = events[i - 1];
      const currentEvent = events[i];
      
      if (currentEvent.time - prevEvent.time < minSpacing) {
        currentEvent.time = prevEvent.time + minSpacing;
      }
    }
  }

  humanizeTiming(time, style, intensity) {
    // Human-like timing variations based on musical context
    const baseVariation = this.getTimingVariation(style);
    const variation = baseVariation * intensity * (this.rng() - 0.5) * 2;
    
    // Micro-timing adjustments (in ticks)
    const adjustment = Math.round(variation * 10);
    
    return Math.max(0, time + adjustment);
  }

  getTimingVariation(style) {
    const variations = {
      classical: 0.02, // Very subtle timing variations
      pop: 0.03,       // Slight timing variations
      jazz: 0.05       // More pronounced swing feel
    };
    
    return variations[style] || variations.pop;
  }

  humanizeVelocity(velocity, style, intensity, note) {
    // Human-like velocity variations based on musical phrasing
    const baseVelocity = velocity;
    const variation = this.getVelocityVariation(style, note);
    const adjustment = Math.round(variation * intensity * (this.rng() - 0.5) * 2 * 20);
    
    return Math.max(1, Math.min(127, baseVelocity + adjustment));
  }

  getVelocityVariation(style, note) {
    const variations = {
      classical: this.getClassicalVelocityPattern(note),
      pop: 0.15,
      jazz: this.getJazzVelocityPattern(note)
    };
    
    return variations[style] || variations.pop;
  }

  getClassicalVelocityPattern(note) {
    // Classical music tends to have more dynamic expression
    const octave = Math.floor(note / 12);
    return 0.1 + (octave * 0.02); // Higher notes slightly more varied
  }

  getJazzVelocityPattern(note) {
    // Jazz often emphasizes certain beats and notes
    return 0.12 + (this.rng() * 0.08);
  }

  humanizeDuration(duration, style, intensity) {
    // Subtle duration adjustments for more natural phrasing
    const variation = this.getDurationVariation(style);
    const adjustment = Math.round(duration * variation * intensity * (this.rng() - 0.5) * 2);
    
    return Math.max(1, duration + adjustment);
  }

  getDurationVariation(style) {
    const variations = {
      classical: 0.05,
      pop: 0.03,
      jazz: 0.07
    };
    
    return variations[style] || variations.pop;
  }

  // Musical Analysis Functions for Intelligent Humanization
  analyzeMusicStructure(tracks, style) {
    const analysis = {
      tracks: [],
      globalTempo: 120,
      timeSignature: [4, 4]
    };

    tracks.forEach(track => {
      const trackAnalysis = {
        chords: this.analyzeChordProgression(track),
        melody: this.analyzeMelody(track),
        rhythm: this.analyzeRhythmicContext(track, style),
        phrasing: this.identifyPhraseBoundaries(track),
        dynamics: this.analyzeDynamicStructure(track)
      };
      analysis.tracks.push(trackAnalysis);
    });

    return analysis;
  }

  analyzeChordProgression(track) {
    const chords = [];
    const simultaneousNotes = {};
    
    // Group simultaneous notes to identify chords
    track.forEach(event => {
      if (this.isNoteOn(event)) {
        const time = Math.floor(event.time / 96); // Quantize to beat level
        if (!simultaneousNotes[time]) simultaneousNotes[time] = [];
        simultaneousNotes[time].push(event.data1 % 12); // Get pitch class
      }
    });

    // Analyze chord qualities and progressions
    Object.keys(simultaneousNotes).forEach(time => {
      const notes = [...new Set(simultaneousNotes[time])].sort();
      if (notes.length >= 3) {
        chords.push({
          time: parseInt(time),
          notes: notes,
          quality: this.identifyChordQuality(notes),
          tension: this.calculateHarmonicTension(notes)
        });
      }
    });

    return chords;
  }

  identifyChordQuality(notes) {
    // Simple chord identification (major, minor, dominant, etc.)
    const intervals = [];
    for (let i = 1; i < notes.length; i++) {
      intervals.push((notes[i] - notes[0] + 12) % 12);
    }
    
    if (intervals.includes(4) && intervals.includes(7)) return 'major';
    if (intervals.includes(3) && intervals.includes(7)) return 'minor';
    if (intervals.includes(4) && intervals.includes(7) && intervals.includes(10)) return 'dominant';
    if (intervals.includes(3) && intervals.includes(6)) return 'diminished';
    return 'other';
  }

  calculateHarmonicTension(notes) {
    // Calculate dissonance level based on intervals
    let tension = 0;
    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        const interval = (notes[j] - notes[i]) % 12;
        // Dissonant intervals get higher tension scores
        if ([1, 2, 6, 10, 11].includes(interval)) tension += 0.5;
        if ([1, 11].includes(interval)) tension += 0.3; // Minor 2nd/Major 7th
      }
    }
    return Math.min(1.0, tension / notes.length);
  }

  analyzeMelody(track) {
    const melodyNotes = [];
    
    // Extract melodic line (highest notes typically)
    track.forEach(event => {
      if (this.isNoteOn(event)) {
        melodyNotes.push({
          time: event.time,
          pitch: event.data1,
          velocity: event.data2
        });
      }
    });

    // Identify melodic peaks and phrases
    const peaks = [];
    const valleys = [];
    
    for (let i = 1; i < melodyNotes.length - 1; i++) {
      const prev = melodyNotes[i - 1].pitch;
      const curr = melodyNotes[i].pitch;
      const next = melodyNotes[i + 1].pitch;
      
      if (curr > prev && curr > next) {
        peaks.push({ index: i, intensity: curr - Math.min(prev, next) });
      }
      if (curr < prev && curr < next) {
        valleys.push({ index: i, intensity: Math.max(prev, next) - curr });
      }
    }

    return {
      notes: melodyNotes,
      peaks: peaks,
      valleys: valleys,
      range: this.calculateMelodicRange(melodyNotes),
      contour: this.analyzeMelodicContour(melodyNotes)
    };
  }

  calculateMelodicRange(notes) {
    if (notes.length === 0) return 0;
    const pitches = notes.map(n => n.pitch);
    return Math.max(...pitches) - Math.min(...pitches);
  }

  analyzeMelodicContour(notes) {
    const contour = [];
    for (let i = 1; i < notes.length; i++) {
      const diff = notes[i].pitch - notes[i - 1].pitch;
      if (diff > 0) contour.push('up');
      else if (diff < 0) contour.push('down');
      else contour.push('same');
    }
    return contour;
  }

  analyzeRhythmicContext(track, style) {
    const beats = {};
    const beatStrength = [1.0, 0.5, 0.75, 0.5]; // 4/4 beat strengths: Strong-Weak-Medium-Weak
    const beatAnalysis = {};
    
    track.forEach(event => {
      if (this.isNoteOn(event)) {
        const measureTime = event.time % (96 * 4); // Time within measure (4 beats)
        const beatPosition = measureTime / 96; // Float position within measure
        const beatIndex = Math.floor(beatPosition); // Which beat (0,1,2,3)
        const subdivision = (beatPosition % 1) * 4; // Subdivision within beat
        
        // Analyze beat strength and timing
        if (!beatAnalysis[beatIndex]) {
          beatAnalysis[beatIndex] = { 
            count: 0, 
            offbeat: 0, 
            strength: beatStrength[beatIndex],
            subdivisions: { onBeat: 0, offBeat: 0 }
          };
        }
        
        beatAnalysis[beatIndex].count++;
        
        // More precise syncopation detection
        if (subdivision > 0.1 && subdivision < 0.9) { // Not exactly on beat
          beatAnalysis[beatIndex].offbeat++;
          beatAnalysis[beatIndex].subdivisions.offBeat++;
        } else {
          beatAnalysis[beatIndex].subdivisions.onBeat++;
        }
        
        // Legacy beats object for compatibility
        if (!beats[beatIndex]) beats[beatIndex] = { count: 0, offbeat: 0 };
        beats[beatIndex].count++;
        if (subdivision > 0.1 && subdivision < 0.9) beats[beatIndex].offbeat++;
      }
    });

    // Calculate weighted syncopation based on beat strength
    let weightedSyncopation = 0;
    let totalWeight = 0;
    Object.entries(beatAnalysis).forEach(([beat, data]) => {
      const syncopationRatio = data.count > 0 ? data.offbeat / data.count : 0;
      weightedSyncopation += syncopationRatio * data.strength;
      totalWeight += data.strength;
    });

    return {
      beats: beats, // For compatibility
      beatAnalysis: beatAnalysis,
      syncopation: this.calculateSyncopationLevel(beats),
      weightedSyncopation: totalWeight > 0 ? weightedSyncopation / totalWeight : 0,
      groove: this.identifyGroovePattern(beats, style),
      offbeatRatio: this.calculateOffbeatRatio(beatAnalysis)
    };
  }

  calculateSyncopationLevel(beats) {
    let total = 0;
    let offbeat = 0;
    
    Object.values(beats).forEach(beat => {
      total += beat.count;
      offbeat += beat.offbeat;
    });
    
    return total > 0 ? offbeat / total : 0;
  }

  calculateOffbeatRatio(beatAnalysis) {
    let totalOnBeat = 0;
    let totalOffBeat = 0;
    
    Object.values(beatAnalysis).forEach(beat => {
      totalOnBeat += beat.subdivisions.onBeat;
      totalOffBeat += beat.subdivisions.offBeat;
    });
    
    const total = totalOnBeat + totalOffBeat;
    return total > 0 ? totalOffBeat / total : 0;
  }

  identifyGroovePattern(beats, style) {
    // Style-specific groove identification
    const patterns = {
      jazz: { swing: true, emphasis: [0, 2] },
      classical: { swing: false, emphasis: [0] },
      pop: { swing: false, emphasis: [0, 2] }
    };
    
    return patterns[style] || patterns.pop;
  }

  identifyPhraseBoundaries(track) {
    const noteEvents = track.filter(event => this.isNoteOn(event));
    if (noteEvents.length < 6) return [{ start: 0, end: noteEvents[noteEvents.length - 1]?.time || 0, notes: noteEvents }];
    
    // Extract notes with durations
    const notes = this.extractNotesFromTrack(track);
    if (notes.length < 6) return [{ start: 0, end: notes[notes.length - 1]?.endTime || 0, notes: noteEvents }];
    
    // Use enhanced grid-aware phrase detection
    return this.detectPhrasesWithGrid(track, notes, noteEvents);
  }

  detectPhrasesWithGrid(track, notes, noteEvents) {
    // Step 1: Establish beat and measure grid
    const grid = this.calculateBeatMeasureGrid(track, notes);
    
    // Step 2: Calculate musical feature change scores
    const changeScores = this.calculateMusicFeatureChanges(notes, grid);
    
    // Step 3: Apply structural importance weighting
    const weightedScores = this.applyStructuralWeighting(changeScores, grid);
    
    // Step 4: Detect peaks in weighted scores as phrase boundaries
    const boundaries = this.detectPhraseBoundaryPeaks(weightedScores, grid);
    
    console.log('Enhanced phrase detection:', {
      totalNotes: notes.length,
      measuresDetected: grid.totalMeasures,
      timeSig: `${grid.timeSig.numerator}/${grid.timeSig.denominator}`,
      tempo: grid.tempo,
      rawBoundaries: changeScores.length,
      weightedBoundaries: boundaries.length,
      finalPhrases: boundaries.length + 1
    });
    
    return this.createPhrasesFromBoundaries(boundaries, notes, noteEvents);
  }

  calculateBeatMeasureGrid(track, notes) {
    // Extract tempo and time signature from MIDI track
    let tempo = 120; // Default BPM
    let timeSig = { numerator: 4, denominator: 4 }; // Default 4/4
    const division = 96; // Ticks per quarter note (from header)
    
    // Look for tempo and time signature events in track
    track.forEach(event => {
      if (event.status === 0xFF) { // Meta event
        if (event.data1 === 0x51) { // Set Tempo
          // Tempo in microseconds per quarter note
          const microsecondsPerQuarter = (event.data[0] << 16) | (event.data[1] << 8) | event.data[2];
          tempo = Math.round(60000000 / microsecondsPerQuarter);
        } else if (event.data1 === 0x58) { // Time Signature
          timeSig.numerator = event.data[0];
          timeSig.denominator = Math.pow(2, event.data[1]);
        }
      }
    });
    
    // Calculate grid information
    const ticksPerBeat = division;
    const ticksPerMeasure = ticksPerBeat * timeSig.numerator;
    const totalTicks = Math.max(...notes.map(n => n.endTime || n.time));
    const totalMeasures = Math.ceil(totalTicks / ticksPerMeasure);
    
    return {
      tempo,
      timeSig,
      division,
      ticksPerBeat,
      ticksPerMeasure,
      totalTicks,
      totalMeasures
    };
  }

  calculateMusicFeatureChanges(notes, grid) {
    const windowSize = grid.ticksPerBeat; // Analyze in beat-sized windows
    const changeScores = [];
    
    for (let time = 0; time < grid.totalTicks; time += windowSize) {
      const windowNotes = notes.filter(n => n.time >= time && n.time < time + windowSize);
      const nextWindowNotes = notes.filter(n => n.time >= time + windowSize && n.time < time + 2 * windowSize);
      
      if (windowNotes.length === 0 && nextWindowNotes.length === 0) continue;
      
      // Calculate features for current and next windows
      const currentFeatures = this.extractMusicFeatures(windowNotes);
      const nextFeatures = this.extractMusicFeatures(nextWindowNotes);
      
      // Calculate change magnitude
      const changeScore = this.calculateFeatureChangeMagnitude(currentFeatures, nextFeatures);
      
      changeScores.push({
        time: time + windowSize, // Boundary is at end of current window
        score: changeScore,
        features: { current: currentFeatures, next: nextFeatures }
      });
    }
    
    return changeScores;
  }

  extractMusicFeatures(notes) {
    if (notes.length === 0) {
      return { density: 0, avgPitch: 60, avgVelocity: 64, pitchVariance: 0 };
    }
    
    const density = notes.length;
    const avgPitch = notes.reduce((sum, n) => sum + n.pitch, 0) / notes.length;
    const avgVelocity = notes.reduce((sum, n) => sum + n.velocity, 0) / notes.length;
    const pitchVariance = notes.reduce((sum, n) => sum + Math.pow(n.pitch - avgPitch, 2), 0) / notes.length;
    
    return { density, avgPitch, avgVelocity, pitchVariance };
  }

  calculateFeatureChangeMagnitude(current, next) {
    // Normalize changes to 0-1 scale
    const densityChange = Math.abs(current.density - next.density) / Math.max(current.density, next.density, 1);
    const pitchChange = Math.abs(current.avgPitch - next.avgPitch) / 12; // Semitone normalization
    const velocityChange = Math.abs(current.avgVelocity - next.avgVelocity) / 127;
    const varianceChange = Math.abs(current.pitchVariance - next.pitchVariance) / Math.max(current.pitchVariance, next.pitchVariance, 1);
    
    // Weighted combination
    return (densityChange * 0.3 + pitchChange * 0.3 + velocityChange * 0.2 + varianceChange * 0.2);
  }

  applyStructuralWeighting(changeScores, grid) {
    return changeScores.map(score => {
      const structuralWeight = this.calculateStructuralImportance(score.time, grid);
      return {
        ...score,
        weightedScore: score.score * structuralWeight,
        structuralWeight
      };
    });
  }

  calculateStructuralImportance(time, grid) {
    const { ticksPerBeat, ticksPerMeasure } = grid;
    
    // Determine position within musical structure
    const beatPosition = (time % ticksPerBeat) / ticksPerBeat;
    const measurePosition = (time % ticksPerMeasure) / ticksPerMeasure;
    const measureNumber = Math.floor(time / ticksPerMeasure);
    
    let weight = 0.8; // Base weight for non-structural positions
    
    // Check if at measure boundary
    if (Math.abs(measurePosition) < 0.1 || Math.abs(measurePosition - 1) < 0.1) {
      weight = 1.2; // Slightly important - measure boundary
      
      // Check for higher-level structural boundaries
      if (measureNumber % 8 === 0) {
        weight = 2.0; // Very important - 8-measure boundary
      } else if (measureNumber % 4 === 0) {
        weight = 1.5; // Important - 4-measure boundary
      } else if (measureNumber % 2 === 0) {
        weight = 1.3; // Moderately important - 2-measure boundary
      }
    }
    // Check if at beat boundary (within measure)
    else if (Math.abs(beatPosition) < 0.1 || Math.abs(beatPosition - 1) < 0.1) {
      weight = 1.1; // Slightly important - beat boundary
    }
    
    return weight;
  }

  detectPhraseBoundaryPeaks(weightedScores, grid) {
    if (weightedScores.length < 3) return [];
    
    const peaks = [];
    const minPhraseLength = grid.ticksPerMeasure * 1.0; // Minimum 1 measure between phrases
    
    // Find local maxima in weighted scores
    for (let i = 1; i < weightedScores.length - 1; i++) {
      const current = weightedScores[i];
      const prev = weightedScores[i - 1];
      const next = weightedScores[i + 1];
      
      // Check if this is a local maximum with significant score
      if (current.weightedScore > prev.weightedScore && 
          current.weightedScore > next.weightedScore &&
          current.weightedScore > 0.15) { // Lowered threshold for better phrase detection
        
        // Ensure minimum distance from previous peak
        if (peaks.length === 0 || current.time - peaks[peaks.length - 1] >= minPhraseLength) {
          peaks.push(current.time);
        }
      }
    }
    
    // Limit to maximum 4 boundaries (5 phrases) for clarity
    return peaks.slice(0, 4);
  }
  
  extractNotesFromTrack(track) {
    const notes = [];
    const activeNotes = {};
    
    track.forEach(event => {
      if (this.isNoteOn(event)) {
        activeNotes[event.data1] = {
          pitch: event.data1,
          velocity: event.data2,
          startTime: event.time,
          endTime: null
        };
      } else if (this.isNoteOff(event)) {
        if (activeNotes[event.data1]) {
          activeNotes[event.data1].endTime = event.time;
          notes.push({...activeNotes[event.data1]});
          delete activeNotes[event.data1];
        }
      }
    });
    
    // Handle any remaining active notes
    Object.values(activeNotes).forEach(note => {
      note.endTime = note.startTime + 480; // Default duration
      notes.push(note);
    });
    
    return notes.sort((a, b) => a.startTime - b.startTime);
  }
  
  calculatePhraseBoundaryScore(candidate, notes, chords) {
    const { index, time, nextTime } = candidate;
    const currentNote = notes[index];
    const nextNote = notes[index + 1];
    
    // 1. ギャップ・スコア (Gap Score)
    const gap = nextTime - time;
    const gapScore = Math.min(1.0, gap / 384); // Normalize to quarter note gaps
    
    // 2. 先行音符の長さスコア (Duration Score)  
    const currentDuration = currentNote.endTime - currentNote.startTime;
    const avgDuration = this.calculateAverageDurationAround(notes, index, 5);
    const durationRatio = currentDuration / Math.max(avgDuration, 96);
    const durationScore = Math.min(1.0, Math.max(0, (durationRatio - 1.0) * 0.5));
    
    // 3. メロディ輪郭スコア (Contour Score)
    const contourScore = this.calculateContourScore(notes, index);
    
    // 4. カデンツ・スコア (Cadence Score) - most important
    const cadenceScore = this.calculateCadenceScore(chords, time);
    
    return {
      gap: gapScore,
      duration: durationScore,
      contour: contourScore,
      cadence: cadenceScore
    };
  }
  
  calculateAverageDurationAround(notes, centerIndex, radius) {
    const start = Math.max(0, centerIndex - radius);
    const end = Math.min(notes.length, centerIndex + radius + 1);
    
    let totalDuration = 0;
    let count = 0;
    
    for (let i = start; i < end; i++) {
      totalDuration += notes[i].endTime - notes[i].startTime;
      count++;
    }
    
    return count > 0 ? totalDuration / count : 96;
  }
  
  calculateContourScore(notes, index) {
    if (index < 1 || index >= notes.length - 1) return 0;
    
    const prevPitch = notes[index - 1].pitch;
    const currPitch = notes[index].pitch;
    const nextPitch = notes[index + 1].pitch;
    
    // Check if this is a melodic peak (mountain top) or valley
    const isPeak = currPitch > prevPitch && currPitch > nextPitch;
    const isValley = currPitch < prevPitch && currPitch < nextPitch;
    
    if (isPeak || isValley) {
      const intensity = Math.abs(currPitch - prevPitch) + Math.abs(currPitch - nextPitch);
      return Math.min(1.0, intensity / 24); // Normalize to 2 octaves max
    }
    
    return 0;
  }
  
  calculateCadenceScore(chords, time) {
    if (chords.length < 2) return 0;
    
    const timeInBeats = time / 96;
    
    // Find chords before and after this time point
    let beforeChord = null;
    let afterChord = null;
    
    for (let i = 0; i < chords.length - 1; i++) {
      if (chords[i].time <= timeInBeats && chords[i + 1].time > timeInBeats) {
        beforeChord = chords[i];
        afterChord = chords[i + 1];
        break;
      }
    }
    
    if (!beforeChord || !afterChord) return 0;
    
    // Calculate tension decrease (high → low tension indicates strong cadence)
    const tensionDecrease = beforeChord.tension - afterChord.tension;
    
    if (tensionDecrease > 0.3) { // Significant tension decrease
      // Additional bonus for strong cadential progressions
      let cadenceBonus = 0;
      if (beforeChord.quality === 'dominant' && 
          (afterChord.quality === 'major' || afterChord.quality === 'minor')) {
        cadenceBonus = 0.5; // V-I or V-i cadence
      }
      
      return Math.min(1.0, tensionDecrease + cadenceBonus);
    }
    
    return 0;
  }
  
  createPhrasesFromBoundaries(boundaries, notes, noteEvents) {
    if (boundaries.length === 0) {
      // No boundaries found, return single phrase
      return [{
        start: 0,
        end: Math.max(...notes.map(n => n.endTime)),
        notes: noteEvents
      }];
    }
    
    const phrases = [];
    let currentStart = 0;
    
    // Sort boundaries
    boundaries.sort((a, b) => a - b);
    
    boundaries.forEach(boundary => {
      const phraseNotes = noteEvents.filter(event => 
        event.time >= currentStart && event.time < boundary
      );
      
      if (phraseNotes.length > 0) {
        phrases.push({
          start: currentStart,
          end: boundary,
          notes: phraseNotes
        });
      }
      
      currentStart = boundary;
    });
    
    // Add final phrase
    const finalNotes = noteEvents.filter(event => event.time >= currentStart);
    if (finalNotes.length > 0) {
      phrases.push({
        start: currentStart,
        end: Math.max(...notes.map(n => n.endTime)),
        notes: finalNotes
      });
    }
    
    return phrases.filter(phrase => phrase.notes.length > 0);
  }

  // New phrase detection methods based on musical patterns
  
  findRepetitionBoundaries(notes) {
    const boundaries = [];
    const windowSize = 4; // Look for patterns of 4 notes
    
    for (let i = 0; i < notes.length - windowSize * 2; i++) {
      const pattern1 = notes.slice(i, i + windowSize);
      
      // Look for similar patterns later in the piece
      for (let j = i + windowSize; j < notes.length - windowSize; j++) {
        const pattern2 = notes.slice(j, j + windowSize);
        
        if (this.patternsAreSimilar(pattern1, pattern2)) {
          // Found repetition - add boundary at start of second pattern
          boundaries.push(pattern2[0].startTime);
          break; // Only find first repetition for each pattern
        }
      }
    }
    
    return boundaries;
  }
  
  patternsAreSimilar(pattern1, pattern2, tolerance = 2) {
    if (pattern1.length !== pattern2.length) return false;
    
    // Compare pitch intervals and rhythm patterns
    let similarityScore = 0;
    const maxScore = pattern1.length * 2; // Pitch + rhythm similarity
    
    for (let i = 0; i < pattern1.length; i++) {
      // Pitch similarity (allow for transposition)
      const pitch1 = pattern1[i].note;
      const pitch2 = pattern2[i].note;
      if (Math.abs(pitch1 - pitch2) <= tolerance) {
        similarityScore++;
      }
      
      // Rhythm similarity
      const duration1 = pattern1[i].duration;
      const duration2 = pattern2[i].duration;
      if (Math.abs(duration1 - duration2) <= duration1 * 0.3) { // 30% tolerance
        similarityScore++;
      }
    }
    
    return similarityScore >= maxScore * 0.6; // 60% similarity threshold
  }
  
  findChordChangeBoundaries(track, notes) {
    const boundaries = [];
    const chords = this.analyzeChordProgression(track);
    
    if (chords.length <= 1) return boundaries;
    
    // Find significant chord changes
    for (let i = 1; i < chords.length; i++) {
      const prevChord = chords[i - 1];
      const currentChord = chords[i];
      
      // Detect functional chord changes (not just different voicings)
      if (this.isSignificantChordChange(prevChord, currentChord)) {
        // Find the closest note boundary to this chord change
        const chordTime = currentChord.time;
        const closestNote = notes.find(note => note.startTime >= chordTime);
        if (closestNote) {
          boundaries.push(closestNote.startTime);
        }
      }
    }
    
    return boundaries;
  }
  
  isSignificantChordChange(chord1, chord2) {
    if (!chord1.root || !chord2.root) return false;
    
    // Different root note
    if (chord1.root !== chord2.root) return true;
    
    // Major/minor quality change
    if (chord1.quality !== chord2.quality) return true;
    
    // Function change (tonic to dominant, etc.)
    const functionalDistance = Math.abs(
      this.getChordFunction(chord1.root) - this.getChordFunction(chord2.root)
    );
    return functionalDistance >= 3; // Fifth relationship or more
  }
  
  getChordFunction(root) {
    // Circle of fifths position (0 = C, 1 = G, 2 = D, etc.)
    const circleOfFifths = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab'];
    return circleOfFifths.indexOf(root) || 0;
  }
  
  findRestBoundaries(notes) {
    const boundaries = [];
    const significantRestDuration = 480; // Half beat or more
    
    for (let i = 0; i < notes.length - 1; i++) {
      const currentNote = notes[i];
      const nextNote = notes[i + 1];
      
      const restDuration = nextNote.startTime - currentNote.endTime;
      
      if (restDuration >= significantRestDuration) {
        boundaries.push(nextNote.startTime);
      }
    }
    
    return boundaries;
  }

  analyzeDynamicStructure(track) {
    const dynamics = [];
    let velocitySum = 0;
    let noteCount = 0;
    
    track.forEach(event => {
      if (this.isNoteOn(event)) {
        velocitySum += event.data2;
        noteCount++;
        
        // Analyze local dynamics in windows
        const windowStart = Math.max(0, noteCount - 8);
        const recentVelocities = track.slice(windowStart, noteCount)
          .filter(e => this.isNoteOn(e))
          .map(e => e.data2);
        
        const avgVelocity = recentVelocities.reduce((a, b) => a + b, 0) / recentVelocities.length;
        const variance = recentVelocities.reduce((acc, v) => acc + Math.pow(v - avgVelocity, 2), 0) / recentVelocities.length;
        
        dynamics.push({
          time: event.time,
          velocity: event.data2,
          localAverage: avgVelocity,
          variance: variance,
          trend: this.calculateVelocityTrend(recentVelocities)
        });
      }
    });
    
    return dynamics;
  }

  calculateVelocityTrend(velocities) {
    if (velocities.length < 3) return 0;
    
    const first = velocities.slice(0, Math.floor(velocities.length / 2));
    const second = velocities.slice(Math.floor(velocities.length / 2));
    
    const firstAvg = first.reduce((a, b) => a + b, 0) / first.length;
    const secondAvg = second.reduce((a, b) => a + b, 0) / second.length;
    
    return (secondAvg - firstAvg) / 127; // Normalize to -1 to 1
  }

  // Intelligent Humanization Functions
  humanizeTimingIntelligent(time, note, style, intensity, analysis, eventIndex, cumulativeDrift = 0, beatTicks = 480) {
    let adjustment = this.humanizeTiming(time, style, intensity) - time; // Get base adjustment
    
    // Beat-aware drift correction: limit cumulative drift to prevent beat loss
    const maxDriftPerBeat = beatTicks * 0.05; // Max 5% of a beat drift
    const currentBeat = Math.floor(time / beatTicks);
    const expectedDriftAtThisBeat = currentBeat * maxDriftPerBeat;
    
    // If cumulative drift exceeds acceptable limits, apply correction
    if (Math.abs(cumulativeDrift) > expectedDriftAtThisBeat) {
      const driftCorrection = -cumulativeDrift * 0.1; // Gradual correction
      adjustment += driftCorrection;
    }
    
    // Limit maximum adjustment to prevent excessive timing changes
    const maxAdjustment = beatTicks * 0.02; // Max 2% of a beat per event
    adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, adjustment));
    
    if (!analysis) return Math.max(0, time + adjustment);

    // Beat strength analysis for rhythmic accuracy
    if (analysis.rhythm && analysis.rhythm.beatAnalysis) {
      const measureTime = time % (beatTicks * 4);
      const beatPosition = measureTime / beatTicks;
      const beatIndex = Math.floor(beatPosition);
      const beatData = analysis.rhythm.beatAnalysis[beatIndex];
      
      if (beatData) {
        // Strong beats (downbeats) should be more accurate
        const beatStrengthAdjustment = -adjustment * beatData.strength * 0.3;
        adjustment += beatStrengthAdjustment;
      }
    }
    
    // Apply phrase-aware timing (reduced intensity to prevent drift)
    const phrase = analysis.phrasing.find(p => 
      time >= p.start && time <= p.end
    );
    
    if (phrase) {
      const phrasePosition = (time - phrase.start) / (phrase.end - phrase.start);
      
      // Subtle ritardando at phrase ends (reduced from intensity * 5 to intensity * 2)
      if (phrasePosition > 0.8) {
        adjustment += intensity * 2 * phrasePosition;
      }
      
      // Accelerando through phrase climax (reduced from intensity * 2 to intensity * 1)
      if (phrasePosition > 0.3 && phrasePosition < 0.7) {
        adjustment -= intensity * 1;
      }
    }
    
    // Enhanced chord-based timing adjustments with dynamic hesitation
    const nearbyChord = analysis.chords.find(c => 
      Math.abs(c.time - time / 96) < 2
    );
    
    if (nearbyChord && nearbyChord.tension > 0.5) {
      // Dynamic hesitation based on tension level (suggestion from @Kanade-dev)
      const hesitationIntensity = nearbyChord.tension * intensity * 2.5;
      adjustment += hesitationIntensity;
    }
    
    // Style-specific timing adjustments (reduced intensity)
    if (style === 'jazz' && analysis.rhythm && analysis.rhythm.groove && analysis.rhythm.groove.swing) {
      const beat = (time / 48) % 2;
      if (beat >= 1) {
        adjustment += intensity * 4; // Reduced from intensity * 8 to intensity * 4
      }
    }
    
    // Final constraint: ensure adjustment doesn't exceed maximum limits
    adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, adjustment));
    
    return Math.max(0, time + adjustment);
  }

  humanizeVelocityIntelligent(velocity, note, style, intensity, analysis, eventIndex) {
    let adjustment = this.humanizeVelocity(velocity, style, intensity, note) - velocity;
    
    if (!analysis) return Math.max(1, Math.min(127, velocity + adjustment));
    
    // Velocity-timing correlation (suggestion from @Kanade-dev)
    // Strong notes (high velocity) tend to be played slightly early
    // Weak notes (low velocity) tend to be played slightly late
    const velocityNormalized = velocity / 127;
    const timingInfluence = (velocityNormalized - 0.5) * intensity * 0.1;
    // This will be used in timing adjustments elsewhere
    
    // Apply melodic peak emphasis
    const melodyNote = analysis.melody.notes.find(m => 
      Math.abs(m.time - eventIndex * 10) < 50 && m.pitch === note
    );
    
    if (melodyNote) {
      const peak = analysis.melody.peaks.find(p => 
        Math.abs(analysis.melody.notes[p.index].time - melodyNote.time) < 96
      );
      
      if (peak) {
        // Emphasize melodic peaks
        adjustment += intensity * peak.intensity * 0.3;
      }
    }

    // Beat strength emphasis (suggestion from @Kanade-dev)
    if (analysis.rhythm && analysis.rhythm.beatAnalysis) {
      const time = eventIndex * 10; // Approximate time
      const measureTime = time % (96 * 4);
      const beatPosition = measureTime / 96;
      const beatIndex = Math.floor(beatPosition);
      const beatData = analysis.rhythm.beatAnalysis[beatIndex];
      
      if (beatData) {
        // Strong beats get slight velocity boost
        const beatStrengthBoost = (beatData.strength - 0.5) * intensity * 0.1;
        adjustment += beatStrengthBoost;
      }
    }
    
    // Apply harmonic tension-based dynamics
    const nearbyChord = analysis.chords.find(c => 
      Math.abs(c.time - eventIndex / 10) < 2
    );
    
    if (nearbyChord) {
      if (nearbyChord.quality === 'dominant') {
        adjustment += intensity * 8; // Emphasize dominant chords
      } else if (nearbyChord.tension > 0.6) {
        adjustment += intensity * nearbyChord.tension * 10;
      }
    }
    
    // Apply phrase-based dynamics
    const phrase = analysis.phrasing.find(p => 
      eventIndex * 10 >= p.start && eventIndex * 10 <= p.end
    );
    
    if (phrase) {
      const phrasePosition = (eventIndex * 10 - phrase.start) / (phrase.end - phrase.start);
      
      // Crescendo toward phrase middle, diminuendo at end
      if (phrasePosition < 0.6) {
        adjustment += intensity * phrasePosition * 8;
      } else {
        adjustment -= intensity * (phrasePosition - 0.6) * 12;
      }
    }
    
    return Math.max(1, Math.min(127, velocity + adjustment));
  }

  humanizeDurationIntelligent(duration, note, style, intensity, analysis, eventIndex) {
    let adjustment = this.humanizeDuration(duration, style, intensity) - duration;
    
    if (!analysis) return Math.max(1, duration + adjustment);
    
    // Apply phrase-aware duration adjustments
    const phrase = analysis.phrasing.find(p => 
      eventIndex * 10 >= p.start && eventIndex * 10 <= p.end
    );
    
    if (phrase) {
      const phrasePosition = (eventIndex * 10 - phrase.start) / (phrase.end - phrase.start);
      
      // Lengthen notes at phrase endings
      if (phrasePosition > 0.85) {
        adjustment += duration * intensity * 0.2;
      }
      
      // Slightly shorten notes in busy passages
      if (phrase.notes.length > 20) {
        adjustment -= duration * intensity * 0.1;
      }
    }
    
    // Style-specific duration adjustments
    if (style === 'classical') {
      // More legato in classical style
      adjustment += duration * intensity * 0.05;
    } else if (style === 'jazz') {
      // More detached in jazz
      adjustment -= duration * intensity * 0.1;
    }
    
    return Math.max(1, duration + adjustment);
  }

  // Utility functions
  isNoteOn(event) {
    return (event.status & 0xF0) === 0x90 && event.data2 > 0;
  }

  isNoteOff(event) {
    return (event.status & 0xF0) === 0x80 || 
           ((event.status & 0xF0) === 0x90 && event.data2 === 0);
  }

  getEventType(status) {
    if (status >= 0x80 && status <= 0x8F) return 'noteOff';
    if (status >= 0x90 && status <= 0x9F) return 'noteOn';
    if (status >= 0xA0 && status <= 0xAF) return 'aftertouch';
    if (status >= 0xB0 && status <= 0xBF) return 'controlChange';
    if (status >= 0xC0 && status <= 0xCF) return 'programChange';
    if (status >= 0xD0 && status <= 0xDF) return 'channelPressure';
    if (status >= 0xE0 && status <= 0xEF) return 'pitchBend';
    if (status === 0xFF) return 'meta';
    return 'unknown';
  }

  needsSecondByte(status) {
    const type = status & 0xF0;
    return type !== 0xC0 && type !== 0xD0; // Program change and channel pressure only need 1 data byte
  }

  readVariableLength(data, offset) {
    let value = 0;
    let bytesRead = 0;
    
    while (bytesRead < 4 && offset + bytesRead < data.length) {
      const byte = data[offset + bytesRead];
      value = (value << 7) | (byte & 0x7F);
      bytesRead++;
      
      if ((byte & 0x80) === 0) break;
    }
    
    return { value, bytesRead };
  }

  writeVariableLength(value) {
    const bytes = [];
    bytes.push(value & 0x7F);
    
    while (value >>= 7) {
      bytes.unshift((value & 0x7F) | 0x80);
    }
    
    return bytes;
  }

  seedRandom(seed) {
    let m_w = seed;
    let m_z = 987654321;
    const mask = 0xffffffff;
    
    return function() {
      m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
      m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
      let result = ((m_z << 16) + m_w) & mask;
      result /= 4294967296;
      return result + 0.5;
    };
  }

  generateMIDIFile(midiData) {
    // Generate MIDI file from processed data
    const header = this.generateHeader(midiData.header);
    const tracks = midiData.tracks.map(track => this.generateTrack(track));
    
    // Combine header and tracks
    const totalLength = header.length + tracks.reduce((sum, track) => sum + track.length, 0);
    const result = new Uint8Array(totalLength);
    
    let offset = 0;
    result.set(header, offset);
    offset += header.length;
    
    tracks.forEach(track => {
      result.set(track, offset);
      offset += track.length;
    });
    
    return result.buffer;
  }

  generateHeader(header) {
    const headerData = new Uint8Array(14);
    const view = new DataView(headerData.buffer);
    
    // "MThd"
    headerData.set([0x4D, 0x54, 0x68, 0x64], 0);
    
    // Header length (6 bytes)
    view.setUint32(4, 6);
    
    // Format, tracks, division
    view.setUint16(8, header.format);
    view.setUint16(10, header.tracks);
    view.setUint16(12, header.division);
    
    return headerData;
  }

  generateTrack(events) {
    const trackEvents = [];
    let lastTime = 0;
    
    events.forEach(event => {
      const deltaTime = event.time - lastTime;
      const deltaBytes = this.writeVariableLength(deltaTime);
      
      trackEvents.push(...deltaBytes);
      
      if (event.type === 'meta') {
        trackEvents.push(0xFF, event.metaType);
        const lengthBytes = this.writeVariableLength(event.data.length);
        trackEvents.push(...lengthBytes, ...event.data);
      } else {
        trackEvents.push(event.status);
        if (event.data1 !== undefined) trackEvents.push(event.data1);
        if (event.data2 !== undefined) trackEvents.push(event.data2);
      }
      
      lastTime = event.time;
    });
    
    // Add end of track meta event
    trackEvents.push(0x00, 0xFF, 0x2F, 0x00);
    
    // Create track chunk
    const trackHeader = new Uint8Array(8);
    const trackData = new Uint8Array(trackEvents);
    const view = new DataView(trackHeader.buffer);
    
    // "MTrk"
    trackHeader.set([0x4D, 0x54, 0x72, 0x6B], 0);
    
    // Track length
    view.setUint32(4, trackData.length);
    
    const result = new Uint8Array(trackHeader.length + trackData.length);
    result.set(trackHeader, 0);
    result.set(trackData, trackHeader.length);
    
    return result;
  }

  showResults() {
    const resultDiv = document.getElementById('result');
    
    // Add integrated playback and analysis section first
    this.addIntegratedSection(resultDiv);
    
    // Initialize MIDI visualization after UI is created
    this.initializeMIDIVisualization();
    
    // Generate humanized MIDI file
    const humanizedBuffer = this.generateMIDIFile(this.humanizedMidiData);
    const blob = new Blob([humanizedBuffer], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    
    // Set download link (now that the integrated section has been added)
    const downloadLink = document.getElementById('download');
    if (downloadLink) {
      downloadLink.href = url;
      downloadLink.download = 'humanized.mid';
    }
    
    resultDiv.classList.remove('hidden');
  }

  addIntegratedSection(container) {
    // Remove existing sections
    const existingSection = container.querySelector('.integrated-section');
    if (existingSection) {
      existingSection.remove();
    }
    
    // Create simplified integrated section
    const integratedSection = document.createElement('div');
    integratedSection.className = 'integrated-section';
    
    // Simplified interface with essential features only
    const simplifiedHtml = `
      <div class="results-summary">
        <h3>ヒューマナイズ完了</h3>
        <p>処理が完了しました。以下で結果をプレビューしてダウンロードできます。</p>
      </div>
      
      <div class="playback-section">
        <h4>再生とプレビュー</h4>
        <div class="playback-controls">
          <button class="play-button" onclick="midiHumanizer.playOriginal()">オリジナル再生</button>
          <button class="play-button" onclick="midiHumanizer.playHumanized()">ヒューマナイズ後再生</button>
        </div>
        
        <!-- Enhanced MIDI Visualizer with playback progress -->
        <div class="midi-visualizer-container">
          <h5>MIDIビジュアライザー</h5>
          <div id="midiVisualization" class="midi-visualization">
            <!-- Visualization will be populated here -->
          </div>
          <div class="visualization-controls">
            <button onclick="midiHumanizer.showVisualization('timeline')" class="viz-button active">タイムライン表示</button>
            <button onclick="midiHumanizer.showVisualization('phrases')" class="viz-button">フレーズ構造</button>
            <button onclick="midiHumanizer.showVisualization('comparison')" class="viz-button">ビフォー・アフター比較</button>
          </div>
        </div>
        
        <small>※ 基本的な再生機能です。赤い線が現在の再生位置を示します。</small>
      </div>
      
      <div class="phrase-analysis-section">
        <h4>フレーズ分析結果</h4>
        <div id="phraseAnalysisResults">
          <!-- Phrase analysis will be inserted here -->
        </div>
      </div>
      
      <div class="download-section">
        <a id="download" href="#" download class="download-button">ヒューマナイズされたMIDIをダウンロード</a>
      </div>
    `;
    
    integratedSection.innerHTML = simplifiedHtml;
    container.appendChild(integratedSection);
    
    // Add phrase analysis results
    this.displaySimplifiedPhraseAnalysis();
  }

  displaySimplifiedPhraseAnalysis() {
    const container = document.getElementById('phraseAnalysisResults');
    if (!container || !this.lastAnalysis) return;
    
    const firstTrack = this.lastAnalysis.tracks[0];
    if (!firstTrack || !firstTrack.phrasing) return;
    
    const phrases = firstTrack.phrasing;
    const avgLength = this.calculateAveragePhraseLength(phrases);
    
    let html = `
      <div class="phrase-summary">
        <div class="phrase-stats">
          <span class="stat-item">検出フレーズ数: <strong>${phrases.length}</strong></span>
          <span class="stat-item">平均フレーズ長: <strong>${avgLength.toFixed(1)}秒</strong></span>
        </div>
      </div>
      
      <div class="phrase-list">
    `;
    
    phrases.forEach((phrase, index) => {
      const duration = ((phrase.end - phrase.start) / 480).toFixed(1); // Convert to seconds
      const noteCount = phrase.notes.length;
      
      html += `
        <div class="phrase-item">
          <span class="phrase-number">フレーズ ${index + 1}</span>
          <span class="phrase-details">${duration}秒 (${noteCount}音)</span>
        </div>
      `;
    });
    
    html += `</div>`;
    
    // Add style-specific interpretation
    const style = this.lastStyle || 'classical';
    const styleEffects = this.getStyleEffects(style);
    
    html += `
      <div class="style-effects">
        <h5>適用された効果 (${style}スタイル)</h5>
        <div class="effects-list">
          ${styleEffects.map(effect => `<span class="effect-tag">${effect}</span>`).join('')}
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  }

  getStyleEffects(style) {
    switch(style) {
      case 'classical':
        return ['表現力豊かな演奏', '和声の響きを重視', 'レガート奏法'];
      case 'jazz':
        return ['スウィング感', 'シンコペーション強調', 'アーティキュレーション'];
      case 'pop':
        return ['グルーヴ感重視', 'コード感の強化', '歌いやすい表現'];
      default:
        return ['自然な演奏表現'];
    }
  }

  displayAnalysisResults(analysis, style) {
    const analysisDiv = document.getElementById('analysis');
    const analysisContent = document.getElementById('analysisContent');
    
    // Clear previous analysis
    analysisContent.innerHTML = '';
    
    // Show analysis section
    analysisDiv.classList.remove('hidden');
    
    // Create analysis summary
    const summaryHtml = this.createAnalysisSummary(analysis, style);
    analysisContent.innerHTML = summaryHtml;
  }

  createAnalysisSummary(analysis, style) {
    let html = '';
    
    // Create a more user-friendly summary first
    html += `<div class="analysis-section summary-section">`;
    html += `<h4>楽曲の特徴とヒューマナイズ効果</h4>`;
    html += this.createUserFriendlySummary(analysis, style);
    html += `</div>`;
    
    // Add a toggle for detailed technical analysis
    html += `<div class="analysis-section">`;
    html += `<h4>詳細分析データ <button class="toggle-btn" onclick="document.getElementById('detailed-analysis').classList.toggle('hidden')">表示/非表示</button></h4>`;
    html += `<div id="detailed-analysis" class="detailed-analysis hidden">`;
    
    // Process each track's analysis with better explanations
    analysis.tracks.forEach((trackAnalysis, trackIndex) => {
      if (trackAnalysis.chords.length === 0 && trackAnalysis.melody.notes.length === 0) return;
      
      html += `<div class="track-analysis">`;
      html += `<h5>Track ${trackIndex + 1} の詳細</h5>`;
      
      // Chord Analysis with better explanations
      if (trackAnalysis.chords.length > 0) {
        html += `<div class="analysis-subsection chord-progression">`;
        html += `<strong>和音の流れ:</strong> `;
        html += this.interpretChordProgression(trackAnalysis.chords);
        html += `</div>`;
      }
      
      // Melody Analysis with interpretation
      if (trackAnalysis.melody.notes.length > 0) {
        html += `<div class="analysis-subsection melody-analysis">`;
        html += `<strong>メロディーライン:</strong> `;
        html += this.interpretMelody(trackAnalysis.melody);
        html += `</div>`;
      }
      
      // Phrase Analysis with timing info
      if (trackAnalysis.phrasing.length > 0) {
        html += `<div class="analysis-subsection phrase-structure">`;
        html += `<strong>フレーズ構造:</strong> `;
        html += this.interpretPhrasing(trackAnalysis.phrasing);
        html += `</div>`;
      }
      
      // Rhythm Analysis with groove explanation
      if (trackAnalysis.rhythm) {
        html += `<div class="analysis-subsection rhythm-analysis">`;
        html += `<strong>リズム感:</strong> `;
        html += this.interpretRhythm(trackAnalysis.rhythm, style);
        html += `</div>`;
      }
      
      html += `</div>`; // Close track-analysis
    });
    
    html += `</div>`; // Close detailed-analysis
    html += `</div>`; // Close analysis-section
    
    return html;
  }

  createUserFriendlySummary(analysis, style) {
    let html = `<div class="friendly-summary">`;
    
    // Calculate overall characteristics
    const totalTracks = analysis.tracks.filter(t => t.chords.length > 0 || t.melody.notes.length > 0).length;
    const hasChords = analysis.tracks.some(t => t.chords.length > 0);
    const hasMelody = analysis.tracks.some(t => t.melody.notes.length > 0);
    
    // Music type detection
    let musicType = '';
    if (hasChords && hasMelody) {
      musicType = 'メロディーと伴奏を含む楽曲';
    } else if (hasChords) {
      musicType = '主に和音中心の楽曲';
    } else if (hasMelody) {
      musicType = '主にメロディー中心の楽曲';
    }
    
    html += `<div class="music-interpretation">`;
    html += `<h5>この楽曲について</h5>`;
    html += `<p><strong>${musicType}</strong>として認識されました。`;
    html += `${totalTracks}つの音源パートを検出し、<strong>${style}スタイル</strong>でヒューマナイズを適用しました。</p>`;
    html += `</div>`;
    
    // What humanization did
    html += `<div class="humanization-effects">`;
    html += `<h5>適用された効果</h5>`;
    html += `<div class="effect-grid">`;
    
    switch(style) {
      case 'classical':
        html += `<div class="effect-item"><strong>表現力豊かな演奏</strong><br><small>フレーズの自然な起伏とルバート</small></div>`;
        html += `<div class="effect-item"><strong>和声の響きを重視</strong><br><small>不協和音での微妙な間の取り方</small></div>`;
        html += `<div class="effect-item"><strong>レガート奏法</strong><br><small>音符同士の滑らかなつながり</small></div>`;
        break;
      case 'jazz':
        html += `<div class="effect-item"><strong>スウィング感</strong><br><small>8分音符の跳ねるようなリズム</small></div>`;
        html += `<div class="effect-item"><strong>シンコペーション強調</strong><br><small>裏拍のアクセントと緊張感</small></div>`;
        html += `<div class="effect-item"><strong>アーティキュレーション</strong><br><small>音符の歯切れ良い表現</small></div>`;
        break;
      case 'pop':
        html += `<div class="effect-item"><strong>グルーヴ感重視</strong><br><small>一定のビート感を保った演奏</small></div>`;
        html += `<div class="effect-item"><strong>コード感の強化</strong><br><small>ポップスらしい和音の響き</small></div>`;
        html += `<div class="effect-item"><strong>歌いやすい表現</strong><br><small>メロディーの自然な流れ</small></div>`;
        break;
    }
    
    html += `</div></div>`;
    
    // Before/After comparison info
    html += `<div class="comparison-info">`;
    html += `<h5>変化のポイント</h5>`;
    html += `<ul>`;
    html += `<li><strong>タイミング:</strong> 機械的な正確さから人間らしい微妙なズレに変更</li>`;
    html += `<li><strong>音量:</strong> 一定の強さからフレーズに応じた自然な強弱に変更</li>`;
    html += `<li><strong>音の長さ:</strong> 楽譜通りの長さから表現に応じた自然な長さに変更</li>`;
    html += `<li><strong>音色の変化:</strong> 演奏者の感情や技巧が反映された表現に変更</li>`;
    html += `</ul>`;
    html += `</div>`;
    
    html += `</div>`;
    return html;
  }

  interpretChordProgression(chords) {
    if (chords.length === 0) return '和音情報が検出されませんでした。';
    
    const tensionChords = chords.filter(c => c.tension > 0.5).length;
    const majorChords = chords.filter(c => c.quality === 'major').length;
    const minorChords = chords.filter(c => c.quality === 'minor').length;
    
    let interpretation = `${chords.length}個の和音を検出。`;
    
    if (majorChords > minorChords) {
      interpretation += ' 明るい響きが中心の楽曲です。';
    } else if (minorChords > majorChords) {
      interpretation += ' 落ち着いた、または哀愁のある響きが中心の楽曲です。';
    } else {
      interpretation += ' 明暗のバランスが取れた楽曲です。';
    }
    
    if (tensionChords > chords.length * 0.3) {
      interpretation += ' 複雑で豊かな和声進行を持っています。';
    } else {
      interpretation += ' シンプルで親しみやすい和音構成です。';
    }
    
    return interpretation;
  }

  interpretMelody(melody) {
    if (melody.notes.length === 0) return 'メロディー情報が検出されませんでした。';
    
    const range = melody.range;
    const peaks = melody.peaks.length;
    const notes = melody.notes;
    
    // Analyze intervallic content
    let stepMotion = 0;
    let leapMotion = 0;
    for (let i = 1; i < notes.length; i++) {
      const interval = Math.abs(notes[i].pitch - notes[i-1].pitch);
      if (interval <= 2) stepMotion++;
      else if (interval >= 4) leapMotion++;
    }
    
    const stepRatio = stepMotion / Math.max(1, notes.length - 1);
    const leapRatio = leapMotion / Math.max(1, notes.length - 1);
    
    // Analyze pitch direction trends
    let ascending = 0;
    let descending = 0;
    for (let i = 1; i < notes.length; i++) {
      if (notes[i].pitch > notes[i-1].pitch) ascending++;
      else if (notes[i].pitch < notes[i-1].pitch) descending++;
    }
    
    let interpretation = '';
    
    // Range analysis
    if (range > 24) {
      interpretation += '広い音域(2オクターブ以上)を活用した';
    } else if (range > 12) {
      interpretation += '1オクターブ程度の適度な音域の';
    } else {
      interpretation += '狭い音域に収まった';
    }
    
    // Motion analysis
    if (stepRatio > 0.7) {
      interpretation += '順次進行中心の滑らかなメロディー';
    } else if (leapRatio > 0.3) {
      interpretation += '跳躍進行を含む動的なメロディー';
    } else {
      interpretation += 'バランスの取れたメロディー';
    }
    
    // Contour analysis
    if (ascending > descending * 1.5) {
      interpretation += '。全体的に上昇傾向';
    } else if (descending > ascending * 1.5) {
      interpretation += '。全体的に下降傾向';
    }
    
    // Peak analysis (more sophisticated)
    const peakDensity = peaks / Math.max(1, notes.length);
    if (peakDensity > 0.15) {
      interpretation += 'で、起伏に富んだ表情豊かな展開';
    } else if (peakDensity < 0.05) {
      interpretation += 'で、穏やかで安定した展開';
    }
    
    return interpretation + 'です。';
  }

  interpretPhrasing(phrasing) {
    if (phrasing.length === 0) return 'フレーズ構造が検出されませんでした。';
    
    // More sophisticated analysis of phrase structure
    const phraseLengths = phrasing.map(p => (p.end - p.start) / 96); // Convert to beats
    const avgLength = phraseLengths.reduce((sum, len) => sum + len, 0) / phrasing.length;
    const lengthVariance = phraseLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / phrasing.length;
    const lengthStdDev = Math.sqrt(lengthVariance);
    
    // Analyze phrase overlap and gaps
    let hasOverlaps = false;
    let hasGaps = false;
    for (let i = 1; i < phrasing.length; i++) {
      const gap = phrasing[i].start - phrasing[i-1].end;
      if (gap < 0) hasOverlaps = true;
      if (gap > 96) hasGaps = true; // More than 1 beat gap
    }
    
    let interpretation = `${phrasing.length}つのフレーズを検出。`;
    
    // More nuanced length analysis
    if (lengthStdDev > 2) {
      interpretation += '長さが大きく変化する変化に富んだ構成';
    } else if (avgLength > 8) {
      interpretation += '長めのフレーズによる展開重視の構成';
    } else if (avgLength > 4) {
      interpretation += 'バランスの取れたフレーズ構成';
    } else {
      interpretation += '短いフレーズによる区切りの明確な構成';
    }
    
    // Add structural characteristics
    if (hasOverlaps) {
      interpretation += '。フレーズ間のつながりが密接';
    } else if (hasGaps) {
      interpretation += '。フレーズ間に明確な区切り';
    }
    
    return interpretation + 'です。';
  }

  interpretRhythm(rhythm, style) {
    let interpretation = '';
    
    // Analyze actual rhythmic content
    const syncopationLevel = rhythm.syncopation || 0;
    const offbeatRatio = rhythm.offbeatRatio || 0;
    
    // Base rhythm character analysis
    if (syncopationLevel > 0.4) {
      interpretation += '高度にシンコペートされたリズム';
    } else if (syncopationLevel > 0.2) {
      interpretation += '適度なシンコペーションを含むリズム';
    } else {
      interpretation += 'ストレートなリズム';
    }
    
    // Offbeat analysis
    if (offbeatRatio > 0.3) {
      interpretation += 'で、裏拍の強調が特徴的';
    } else if (offbeatRatio > 0.1) {
      interpretation += 'で、バランスの取れた拍感';
    }
    
    // Groove analysis based on actual patterns, not just style
    if (rhythm.groove) {
      if (rhythm.groove.swing && syncopationLevel > 0.2) {
        interpretation += '。実際のスウィング感が検出されました';
      } else if (rhythm.groove.straight && syncopationLevel < 0.1) {
        interpretation += '。安定したストレートビートが特徴';
      }
    }
    
    // Add style context only if it matches the detected content
    if (style === 'jazz' && syncopationLevel > 0.2) {
      interpretation += '(ジャズスタイルに適した特徴)';
    } else if (style === 'classical' && syncopationLevel < 0.1) {
      interpretation += '(クラシカルな整然とした特徴)';
    } else if (style === 'pop' && offbeatRatio > 0.1 && syncopationLevel < 0.3) {
      interpretation += '(ポップス的なバランス)';
    }
    
    return interpretation + 'です。';
  }

  // Update button states during playback
  updatePlaybackButtons() {
    const playButtons = document.querySelectorAll('.play-button');
    playButtons.forEach((button, index) => {
      if (this.isPlaying) {
        if (index === 0 || button.textContent.includes('オリジナル')) {
          button.textContent = this.isPlayingOriginal ? 'オリジナル停止' : 'オリジナル再生';
        } else {
          button.textContent = this.isPlayingHumanized ? 'ヒューマナイズ後停止' : 'ヒューマナイズ後再生';
        }
      } else {
        if (index === 0 || button.textContent.includes('オリジナル')) {
          button.textContent = 'オリジナル再生';
        } else {
          button.textContent = 'ヒューマナイズ後再生';
        }
      }
    });
  }

  async playOriginal() {
    if (!this.originalMidiData) {
      alert('オリジナルのMIDIデータが見つかりません。ファイルを再度アップロードしてください。');
      return;
    }
    
    this.isPlayingOriginal = true;
    this.isPlayingHumanized = false;
    await this.playMIDIData(this.originalMidiData, true);
  }

  async playHumanized() {
    if (!this.humanizedMidiData) {
      alert('ヒューマナイズされたMIDIデータが見つかりません。処理を完了してからお試しください。');
      return;
    }
    
    this.isPlayingOriginal = false;
    this.isPlayingHumanized = true;
    await this.playMIDIData(this.humanizedMidiData, false);
  }

  showProcessing() {
    const existing = document.getElementById('processing');
    if (existing) return;
    
    const processingDiv = document.createElement('div');
    processingDiv.id = 'processing';
    processingDiv.className = 'processing';
    processingDiv.innerHTML = `
      <div class="spinner"></div>
      <p>MIDIファイルをヒューマナイズしています...</p>
    `;
    
    const form = document.getElementById('form');
    form.parentNode.insertBefore(processingDiv, form.nextSibling);
  }

  hideProcessing() {
    const processingDiv = document.getElementById('processing');
    if (processingDiv) {
      processingDiv.remove();
    }
  }

  showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
  }

  hideElements(elementIds) {
    elementIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.classList.add('hidden');
      }
    });
  }

  // MIDI Visualization Functions
  initializeMIDIVisualization() {
    if (!this.originalMidiData || !this.humanizedMidiData || !this.lastAnalysis) {
      console.warn('Cannot initialize visualization: Missing data');
      return;
    }
    
    this.currentVisualizationMode = 'timeline';
    this.setupVisualizationContainer();
    // Auto-expand visualizer by showing timeline by default
    this.showVisualization('timeline');
  }

  setupVisualizationContainer() {
    const container = document.getElementById('midiVisualization');
    if (!container) {
      console.warn('Visualization container not found');
      return;
    }
    
    container.innerHTML = `
      <div class="visualization-content">
        <div id="visualizationCanvas" class="visualization-canvas"></div>
        <div class="visualization-legend">
          <div class="legend-item">
            <div class="legend-color original"></div>
            <span>オリジナル</span>
          </div>
          <div class="legend-item">
            <div class="legend-color humanized"></div>
            <span>ヒューマナイズ後</span>
          </div>
          <div class="legend-item">
            <div class="legend-color phrase-boundary"></div>
            <span>フレーズ境界</span>
          </div>
        </div>
      </div>
    `;
  }

  showVisualization(mode, targetButton = null) {
    this.currentVisualizationMode = mode;
    
    // Update button states
    document.querySelectorAll('.viz-button').forEach(btn => {
      btn.classList.remove('active');
    });
    
    // Find the button to activate based on mode or use targetButton
    let buttonToActivate = targetButton;
    if (!buttonToActivate) {
      const buttons = document.querySelectorAll('.viz-button');
      buttons.forEach(btn => {
        if ((mode === 'timeline' && btn.textContent.includes('タイムライン')) ||
            (mode === 'phrases' && btn.textContent.includes('フレーズ'))) {
          buttonToActivate = btn;
        }
      });
    }
    
    if (buttonToActivate) {
      buttonToActivate.classList.add('active');
    }
    
    // Render the appropriate visualization
    switch(mode) {
      case 'timeline':
        this.renderTimelineVisualization();
        break;
      case 'phrases':
        this.renderPhraseVisualization();
        break;
    }
  }

  renderTimelineVisualization() {
    const canvas = document.getElementById('visualizationCanvas');
    if (!canvas) return;
    
    const originalNotes = this.extractNotesFromMIDI(this.originalMidiData);
    const humanizedNotes = this.extractNotesFromMIDI(this.humanizedMidiData);
    const phrases = this.lastAnalysis.tracks[0].phrasing;
    
    // Initialize zoom level if not set
    if (!this.zoomLevel) this.zoomLevel = 5;
    
    canvas.innerHTML = `
      <div class="timeline-container">
        <h4>MIDIタイムライン表示（オリジナル vs ヒューマナイズ後）</h4>
        <div class="timeline-controls">
          <button class="zoom-control" onclick="midiHumanizer.adjustZoom(-0.5)">ズームアウト</button>
          <span class="zoom-level">縮尺: ${this.zoomLevel.toFixed(1)}x</span>
          <button class="zoom-control" onclick="midiHumanizer.adjustZoom(0.5)">ズームイン</button>
          <button class="zoom-control" onclick="midiHumanizer.resetZoom()">リセット</button>
        </div>
        <div class="timeline-track">
          ${this.renderOverlaidTimeline(originalNotes, humanizedNotes, phrases)}
        </div>
        <div class="timeline-ruler">
          ${this.renderTimeRuler(originalNotes.concat(humanizedNotes))}
        </div>
      </div>
    `;
  }

  renderPhraseVisualization() {
    const canvas = document.getElementById('visualizationCanvas');
    if (!canvas) return;
    
    const phrases = this.lastAnalysis.tracks[0].phrasing;
    const originalNotes = this.extractNotesFromMIDI(this.originalMidiData);
    
    // Initialize zoom level if not set
    if (!this.zoomLevel) this.zoomLevel = 5;
    
    canvas.innerHTML = `
      <div class="phrase-container">
        <h4>フレーズ構造表示</h4>
        <div class="timeline-controls">
          <button class="zoom-control" onclick="midiHumanizer.adjustZoom(-0.5)">ズームアウト</button>
          <span class="zoom-level">縮尺: ${this.zoomLevel.toFixed(1)}x</span>
          <button class="zoom-control" onclick="midiHumanizer.adjustZoom(0.5)">ズームイン</button>
          <button class="zoom-control" onclick="midiHumanizer.resetZoom()">リセット</button>
        </div>
        <div class="timeline-track">
          ${this.renderNoteTimeline(originalNotes, phrases)}
        </div>
        <div class="timeline-ruler">
          ${this.renderTimeRuler(originalNotes)}
        </div>
        <div class="phrase-visualization">
          ${this.renderPhraseStructure(phrases, originalNotes)}
        </div>
        <div class="phrase-info">
          <p>検出されたフレーズ数: <strong>${phrases.length}</strong></p>
          <p>平均フレーズ長: <strong>${this.calculateAveragePhraseLength(phrases).toFixed(1)}秒</strong></p>
        </div>
      </div>
    `;
  }

  extractNotesFromMIDI(midiData) {
    const notes = [];
    if (!midiData || !midiData.tracks || midiData.tracks.length === 0) return notes;
    
    // Extract notes from all tracks and combine them
    midiData.tracks.forEach((track, trackIndex) => {
      const activeNotes = {};
      
      track.forEach(event => {
        if (this.isNoteOn(event)) {
          const noteKey = `${event.data1}_${trackIndex}`;
          activeNotes[noteKey] = {
            pitch: event.data1,
            velocity: event.data2,
            startTime: event.time,
            endTime: null,
            track: trackIndex
          };
        } else if (this.isNoteOff(event)) {
          const noteKey = `${event.data1}_${trackIndex}`;
          if (activeNotes[noteKey]) {
            activeNotes[noteKey].endTime = event.time;
            notes.push({...activeNotes[noteKey]});
            delete activeNotes[noteKey];
          }
        }
      });
      
      // Handle any remaining active notes for this track
      Object.values(activeNotes).forEach(note => {
        note.endTime = note.startTime + 480; // Default duration
        notes.push(note);
      });
    });
    
    return notes.sort((a, b) => a.startTime - b.startTime);
  }

  renderNoteTimeline(notes, phrases) {
    if (notes.length === 0) return '<p>ノートが見つかりません</p>';
    
    const maxTime = Math.max(...notes.map(n => n.endTime));
    const minPitch = Math.min(...notes.map(n => n.pitch));
    const maxPitch = Math.max(...notes.map(n => n.pitch));
    const pitchRange = maxPitch - minPitch;
    
    // Apply zoom level
    const zoomLevel = this.zoomLevel || 1;
    const timelineWidth = 100 * zoomLevel;
    
    let html = `<div class="timeline-notes" style="width: ${timelineWidth}%;">`;
    
    // Render notes
    notes.forEach((note, index) => {
      const left = (note.startTime / maxTime) * 100;
      const width = Math.max(0.5, ((note.endTime - note.startTime) / maxTime) * 100);
      const top = ((maxPitch - note.pitch) / Math.max(1, pitchRange)) * 80 + 10; // Keep some margin
      const intensity = note.velocity / 127;
      
      html += `
        <div class="timeline-note" 
             style="left: ${left}%; width: ${width}%; top: ${top}%; opacity: ${0.3 + intensity * 0.7}"
             title="音程: ${note.pitch}, 音量: ${note.velocity}, 開始: ${note.startTime}">
        </div>
      `;
    });
    
    // Render phrase boundaries
    phrases.forEach((phrase, index) => {
      const startPos = (phrase.start / maxTime) * 100;
      const endPos = (phrase.end / maxTime) * 100;
      
      html += `
        <div class="phrase-boundary start" 
             style="left: ${startPos}%"
             title="フレーズ ${index + 1} 開始">
        </div>
        <div class="phrase-boundary end" 
             style="left: ${endPos}%"
             title="フレーズ ${index + 1} 終了">
        </div>
        <div class="phrase-span" 
             style="left: ${startPos}%; width: ${endPos - startPos}%"
             title="フレーズ ${index + 1}">
        </div>
      `;
    });
    
    html += '</div>';
    return html;
  }

  renderOverlaidTimeline(originalNotes, humanizedNotes, phrases) {
    if (originalNotes.length === 0 && humanizedNotes.length === 0) {
      return '<p>ノートが見つかりません</p>';
    }
    
    // Combine all notes to determine range
    const allNotes = [...originalNotes, ...humanizedNotes];
    const maxTime = Math.max(...allNotes.map(n => n.endTime));
    const minPitch = Math.min(...allNotes.map(n => n.pitch));
    const maxPitch = Math.max(...allNotes.map(n => n.pitch));
    const pitchRange = maxPitch - minPitch;
    
    // Apply zoom level
    const zoomLevel = this.zoomLevel || 1;
    const timelineWidth = 100 * zoomLevel;
    
    let html = `<div class="timeline-notes overlaid" style="width: ${timelineWidth}%;">`;
    
    // Render original notes (with original styling)
    originalNotes.forEach((note, index) => {
      const left = (note.startTime / maxTime) * 100;
      const width = Math.max(0.5, ((note.endTime - note.startTime) / maxTime) * 100);
      const top = ((maxPitch - note.pitch) / Math.max(1, pitchRange)) * 80 + 10;
      const intensity = note.velocity / 127;
      
      html += `
        <div class="timeline-note original" 
             style="left: ${left}%; width: ${width}%; top: ${top}%; opacity: ${0.4 + intensity * 0.4}"
             title="オリジナル - 音程: ${note.pitch}, 音量: ${note.velocity}, 開始: ${note.startTime}">
        </div>
      `;
    });
    
    // Render humanized notes (with humanized styling)
    humanizedNotes.forEach((note, index) => {
      const left = (note.startTime / maxTime) * 100;
      const width = Math.max(0.5, ((note.endTime - note.startTime) / maxTime) * 100);
      const top = ((maxPitch - note.pitch) / Math.max(1, pitchRange)) * 80 + 10;
      const intensity = note.velocity / 127;
      
      html += `
        <div class="timeline-note humanized" 
             style="left: ${left}%; width: ${width}%; top: ${top}%; opacity: ${0.4 + intensity * 0.4}"
             title="ヒューマナイズ後 - 音程: ${note.pitch}, 音量: ${note.velocity}, 開始: ${note.startTime}">
        </div>
      `;
    });
    
    // Render phrase boundaries
    phrases.forEach((phrase, index) => {
      const startPos = (phrase.start / maxTime) * 100;
      const endPos = (phrase.end / maxTime) * 100;
      
      html += `
        <div class="phrase-boundary start" 
             style="left: ${startPos}%"
             title="フレーズ ${index + 1} 開始">
        </div>
        <div class="phrase-boundary end" 
             style="left: ${endPos}%"
             title="フレーズ ${index + 1} 終了">
        </div>
        <div class="phrase-span" 
             style="left: ${startPos}%; width: ${endPos - startPos}%"
             title="フレーズ ${index + 1}">
        </div>
      `;
    });
    
    html += '</div>';
    return html;
  }

  adjustZoom(delta) {
    this.zoomLevel = Math.max(0.5, Math.min(20, (this.zoomLevel || 5) + delta));
    // Re-render the current visualization mode
    if (this.currentVisualizationMode === 'phrases') {
      this.renderPhraseVisualization();
    } else {
      this.renderTimelineVisualization();
    }
  }

  resetZoom() {
    this.zoomLevel = 5;
    // Re-render the current visualization mode
    if (this.currentVisualizationMode === 'phrases') {
      this.renderPhraseVisualization();
    } else {
      this.renderTimelineVisualization();
    }
  }

  renderTimeRuler(notes) {
    if (notes.length === 0) return '';
    
    const maxTime = Math.max(...notes.map(n => n.endTime));
    const secondsTotal = maxTime / 480; // Convert MIDI ticks to approximate seconds
    const intervals = Math.min(10, Math.max(4, Math.floor(secondsTotal)));
    
    let html = '<div class="time-ruler">';
    for (let i = 0; i <= intervals; i++) {
      const percent = (i / intervals) * 100;
      const timeLabel = ((secondsTotal * i) / intervals).toFixed(1);
      html += `
        <div class="time-marker" style="left: ${percent}%">
          <div class="time-label">${timeLabel}s</div>
        </div>
      `;
    }
    html += '</div>';
    return html;
  }

  renderPhraseStructure(phrases, notes) {
    if (phrases.length === 0) return '<p>フレーズが検出されませんでした</p>';
    
    const maxTime = Math.max(...notes.map(n => n.endTime));
    
    let html = '<div class="phrase-blocks">';
    
    phrases.forEach((phrase, index) => {
      const startPercent = (phrase.start / maxTime) * 100;
      const endPercent = (phrase.end / maxTime) * 100;
      const width = endPercent - startPercent;
      const duration = ((phrase.end - phrase.start) / 480).toFixed(1);
      const noteCount = phrase.notes ? phrase.notes.length : 0;
      
      html += `
        <div class="phrase-block" 
             style="left: ${startPercent}%; width: ${width}%"
             title="フレーズ ${index + 1}: ${duration}秒, ${noteCount}音">
          <div class="phrase-label">フレーズ ${index + 1}</div>
          <div class="phrase-details">
            <span class="phrase-duration">${duration}s</span>
            <span class="phrase-notes">${noteCount}音</span>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    return html;
  }

  calculateAveragePhraseLength(phrases) {
    if (phrases.length === 0) return 0;
    const totalDuration = phrases.reduce((sum, phrase) => sum + (phrase.end - phrase.start), 0);
    return (totalDuration / phrases.length) / 480; // Convert to seconds
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.midiHumanizer = new MIDIHumanizer();
});