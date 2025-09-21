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

  // Simple synthesizer for MIDI note playback
  createNoteOscillator(frequency, velocity = 64, duration = 1000) {
    if (!this.audioContext) return null;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    // Configure oscillator for piano-like sound
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    
    // Configure volume based on MIDI velocity
    const volume = Math.max(0.1, Math.min(0.8, velocity / 127 * 0.6));
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(volume * 0.3, this.audioContext.currentTime + duration / 1000 * 0.3);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration / 1000);
    
    // Connect audio nodes
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    return { oscillator, gainNode };
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
        const elapsed = (this.audioContext.currentTime - this.playbackStartTime) * 1000; // Convert to milliseconds
        const progress = Math.min(elapsed / this.playbackDuration, 1);
        this.updateProgressIndicator(progress);
      }
    }, 50); // Update every 50ms for smooth animation
  }

  stopProgressTracking() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    this.updateProgressIndicator(0); // Reset progress
  }

  updateProgressIndicator(progress) {
    const progressBar = document.getElementById('playbackProgress');
    if (progressBar) {
      progressBar.style.width = `${progress * 100}%`;
    }
    
    // Update progress in visualization if available
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
      indicator.style.cssText = `
        position: absolute;
        top: 0;
        bottom: 0;
        width: 3px;
        background: #ff4444;
        z-index: 100;
        box-shadow: 0 0 8px rgba(255, 68, 68, 0.6);
        left: ${progress * 100}%;
        pointer-events: none;
      `;
      
      // Find the appropriate container based on current mode
      const timelineContainer = canvas.querySelector('.timeline-visualization, .phrase-visualization, .notes-container');
      if (timelineContainer) {
        timelineContainer.style.position = 'relative';
        timelineContainer.appendChild(indicator);
      }
    }
  }

  // Play MIDI data using Web Audio API
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
      // Process all tracks
      let maxTime = 0;
      const tempo = 120; // Default tempo (BPM)
      const division = midiData.header.division || 96; // Ticks per quarter note
      
      midiData.tracks.forEach((track, trackIndex) => {
        let activeNotes = new Map(); // Track active notes for note-off events
        
        track.forEach(event => {
          // Convert MIDI ticks to milliseconds
          const realTime = (event.time / division) * (60000 / tempo);
          
          if (event.status >= 0x80 && event.status <= 0x9F) { // Note events
            const isNoteOn = (event.status & 0xF0) === 0x90 && event.data2 > 0;
            const isNoteOff = (event.status & 0xF0) === 0x80 || ((event.status & 0xF0) === 0x90 && event.data2 === 0);
            
            if (isNoteOn) {
              const noteNumber = event.data1;
              const velocity = event.data2;
              const frequency = this.midiNoteToFrequency(noteNumber);
              
              const timeout = setTimeout(() => {
                if (this.isPlaying) {
                  const noteData = this.createNoteOscillator(frequency, velocity, 500);
                  if (noteData) {
                    noteData.oscillator.start();
                    activeNotes.set(noteNumber, noteData);
                    
                    // Auto-stop note after duration if no explicit note-off
                    setTimeout(() => {
                      if (activeNotes.has(noteNumber)) {
                        const note = activeNotes.get(noteNumber);
                        try {
                          note.oscillator.stop();
                        } catch (e) {
                          // Note may already be stopped
                        }
                        activeNotes.delete(noteNumber);
                      }
                    }, 500);
                  }
                }
              }, Math.max(0, realTime));
              
              this.currentPlayback.push(timeout);
            } else if (isNoteOff) {
              const noteNumber = event.data1;
              
              const timeout = setTimeout(() => {
                if (activeNotes.has(noteNumber)) {
                  const note = activeNotes.get(noteNumber);
                  try {
                    note.oscillator.stop();
                  } catch (e) {
                    // Note may already be stopped
                  }
                  activeNotes.delete(noteNumber);
                }
              }, Math.max(0, realTime));
              
              this.currentPlayback.push(timeout);
            }
          }
          
          maxTime = Math.max(maxTime, realTime);
        });
      });

      // Auto-stop playback after all notes
      this.playbackDuration = maxTime;
      const stopTimeout = setTimeout(() => {
        this.stopPlayback();
      }, maxTime + 1000);
      
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
    if (noteEvents.length < 4) return [{ start: 0, end: noteEvents[noteEvents.length - 1]?.time || 0, notes: noteEvents }];
    
    // Extract notes with durations
    const notes = this.extractNotesFromTrack(track);
    if (notes.length < 4) return [{ start: 0, end: notes[notes.length - 1]?.endTime || 0, notes: noteEvents }];
    
    // Get chord analysis for cadence scoring
    const chords = this.analyzeChordProgression(track);
    
    // Generate boundary candidates (with minimum spacing to reduce granularity)
    const candidates = [];
    const minPhraseLength = 480 * 2; // Minimum 2 beats between phrases
    let lastTime = 0;
    
    for (let i = 2; i < notes.length - 2; i++) { // Start from 2nd note, end 2 notes before end
      const candidateTime = notes[i].endTime;
      if (candidateTime - lastTime >= minPhraseLength) {
        candidates.push({
          index: i,
          time: candidateTime,
          nextTime: notes[i + 1].startTime
        });
        lastTime = candidateTime;
      }
    }
    
    // Score each candidate using multiple criteria
    const scoredCandidates = candidates.map(candidate => {
      const score = this.calculatePhraseBoundaryScore(candidate, notes, chords);
      return { ...candidate, score };
    });
    
    // Set configurable weights for more cohesive phrases
    const weights = {
      gap: 3.0,        // w1: ギャップ・スコア (increased importance)
      duration: 1.5,   // w2: 先行音符の長さスコア  
      contour: 1.0,    // w3: メロディ輪郭スコア
      cadence: 4.0     // w4: カデンツ・スコア (most important)
    };
    
    // Calculate weighted total scores
    scoredCandidates.forEach(candidate => {
      candidate.totalScore = 
        (weights.gap * candidate.score.gap) +
        (weights.duration * candidate.score.duration) +
        (weights.contour * candidate.score.contour) +
        (weights.cadence * candidate.score.cadence);
    });
    
    // Set higher threshold for more cohesive phrases
    const threshold = 1.2; // Increased from 0.8 to detect fewer, stronger boundaries
    
    // Debug: Log scoring information for development
    if (scoredCandidates.length > 0) {
      console.log('Phrase boundary analysis:', {
        candidates: scoredCandidates.length,
        maxScore: Math.max(...scoredCandidates.map(c => c.totalScore)),
        avgScore: scoredCandidates.reduce((sum, c) => sum + c.totalScore, 0) / scoredCandidates.length,
        threshold,
        detectedBoundaries: scoredCandidates.filter(c => c.totalScore > threshold).length
      });
    }
    
    // Select boundaries above threshold, limit to maximum of 3 phrases for simpler structure
    const boundaries = scoredCandidates
      .filter(candidate => candidate.totalScore > threshold)
      .sort((a, b) => b.totalScore - a.totalScore) // Sort by score (highest first)
      .slice(0, 2) // Maximum 2 boundaries = 3 phrases
      .map(candidate => candidate.time)
      .sort((a, b) => a - b); // Sort by time
    
    // Create phrases from boundaries
    return this.createPhrasesFromBoundaries(boundaries, notes, noteEvents);
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
    const downloadLink = document.getElementById('download');
    
    // Generate humanized MIDI file
    const humanizedBuffer = this.generateMIDIFile(this.humanizedMidiData);
    const blob = new Blob([humanizedBuffer], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    
    downloadLink.href = url;
    downloadLink.download = 'humanized.mid';
    
    // Add integrated playback and analysis section
    this.addIntegratedSection(resultDiv);
    
    resultDiv.classList.remove('hidden');
  }

  addIntegratedSection(container) {
    // Remove existing playback section
    const existingSection = container.querySelector('.playback-section');
    if (existingSection) {
      existingSection.remove();
    }
    
    // Create integrated section with both playback and analysis
    const integratedSection = document.createElement('div');
    integratedSection.className = 'integrated-section';
    
    // Add MIDI visualization section with integrated playback controls
    const visualizationHtml = `
      <div class="midi-visualization-subsection">
        <h3>MIDI視覚化 - フレーズ構造表示</h3>
        <div class="visualization-controls">
          <button class="viz-button active" onclick="midiHumanizer.showVisualization('timeline', this)">タイムライン表示</button>
          <button class="viz-button" onclick="midiHumanizer.showVisualization('phrases', this)">フレーズ構造</button>
        </div>
        <div class="integrated-playback-controls">
          <div class="playback-controls">
            <button class="play-button" onclick="midiHumanizer.playOriginal()">オリジナル再生</button>
            <button class="play-button" onclick="midiHumanizer.playHumanized()">ヒューマナイズ後再生</button>
          </div>
          <div class="playback-progress-container">
            <div class="playback-progress-bar">
              <div id="playbackProgress" class="playback-progress"></div>
            </div>
            <small>※ 再生機能は基本的な実装です。シークバーは現在の再生位置を表示します。</small>
          </div>
        </div>
        <div id="midiVisualization" class="midi-visualization-container">
          <!-- Visualization will be rendered here -->
        </div>
      </div>
    `;
    
    // Remove separate playback section since it's now integrated
    // const playbackHtml = ``;
    
    // Add analysis results if available
    let analysisHtml = '';
    if (this.lastAnalysis) {
      analysisHtml = `
        <div class="analysis-subsection">
          <h3>音楽分析結果 (Musical Analysis Results)</h3>
          <div class="analysis-content">
            ${this.createAnalysisSummary(this.lastAnalysis, this.lastStyle || 'classical')}
          </div>
        </div>
      `;
    }
    
    integratedSection.innerHTML = visualizationHtml + analysisHtml;
    container.insertBefore(integratedSection, container.firstChild);
    
    // Initialize MIDI visualization after the section is added to DOM
    setTimeout(() => {
      this.initializeMIDIVisualization();
      this.showVisualization('timeline');
    }, 100);
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
    const phrases = this.lastAnalysis.tracks[0].phrasing;
    
    // Initialize zoom level if not set
    if (!this.zoomLevel) this.zoomLevel = 5;
    
    canvas.innerHTML = `
      <div class="timeline-container">
        <h4>MIDIタイムライン表示</h4>
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
    
    const track = midiData.tracks[0]; // Use first track
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