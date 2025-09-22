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
    this.activeAudioNodes = []; // Track active audio nodes for proper cleanup
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

  // Lightweight synthesizer for efficient MIDI note playback (inspired by Picotune approach)
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
    
    // Stop all active audio nodes
    const currentTime = this.audioContext ? this.audioContext.currentTime : 0;
    this.activeAudioNodes.forEach(nodeGroup => {
      try {
        // Stop oscillators immediately if they're still running
        nodeGroup.oscillators.forEach(osc => {
          if (osc.playbackState !== osc.FINISHED_STATE) {
            osc.stop(currentTime);
          }
        });
        
        // Fade out gain nodes quickly to prevent clicks
        nodeGroup.gains.forEach(gain => {
          if (gain.gain) {
            gain.gain.cancelScheduledValues(currentTime);
            gain.gain.setValueAtTime(gain.gain.value, currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.01);
          }
        });
        
        // Disconnect all nodes after a short delay
        setTimeout(() => {
          nodeGroup.oscillators.forEach(osc => {
            try { osc.disconnect(); } catch (e) {}
          });
          nodeGroup.gains.forEach(gain => {
            try { gain.disconnect(); } catch (e) {}
          });
        }, 20);
        
      } catch (error) {
        console.warn('Error stopping audio node:', error);
      }
    });
    
    // Clear the active nodes array
    this.activeAudioNodes = [];
    
    this.isPlaying = false;
    this.isPlayingOriginal = false;
    this.isPlayingHumanized = false;
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
    // PicoTune-inspired progress tracking with proper viewport following
    const canvas = document.getElementById('visualizationCanvas');
    if (!canvas) return;
    
    // Remove existing progress indicator
    const existingIndicator = canvas.querySelector('.picotime-progress-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    if (progress > 0 && this.isPlaying) {
      // Find the timeline content area
      const timelineContent = canvas.querySelector('.picotime-content');
      const viewport = canvas.querySelector('.picotime-viewport');
      
      if (timelineContent && viewport && this.timelineTotalDuration && this.timelineWidthPx) {
        // Calculate exact pixel position based on time progress
        const timeElapsed = progress * this.timelineTotalDuration; // milliseconds
        const pixelPosition = (timeElapsed / this.timelineTotalDuration) * this.timelineWidthPx;
        
        // Create progress indicator
        const indicator = document.createElement('div');
        indicator.className = 'picotime-progress-indicator';
        indicator.style.cssText = `
          position: absolute;
          top: 0;
          bottom: 0;
          width: 3px;
          left: ${pixelPosition}px;
          background: linear-gradient(to bottom, #ff4444 0%, #ff6666 50%, #ff4444 100%);
          box-shadow: 
            0 0 8px rgba(255, 68, 68, 0.8), 
            0 0 16px rgba(255, 68, 68, 0.4),
            inset 0 0 3px rgba(255, 255, 255, 0.3);
          z-index: 1000;
          border-radius: 2px;
          pointer-events: none;
          animation: picoProgressPulse 1.5s ease-in-out infinite;
          transition: left 0.05s linear;
        `;
        
        timelineContent.appendChild(indicator);
        
        // Smooth viewport following when zoomed
        this.followProgressInViewport(viewport, pixelPosition, this.timelineWidthPx);
      }
    }
  }
  
  // PicoTune-inspired viewport following
  followProgressInViewport(viewport, progressPx, totalWidthPx) {
    if (!viewport) return;
    
    const viewportWidth = viewport.clientWidth;
    const currentScrollLeft = viewport.scrollLeft;
    
    // Only follow if timeline is wider than viewport (i.e., zoomed)
    if (totalWidthPx > viewportWidth) {
      // Calculate the ideal scroll position to keep progress bar centered
      const idealScrollLeft = progressPx - (viewportWidth / 2);
      
      // Apply bounds - don't scroll beyond the timeline
      const maxScrollLeft = totalWidthPx - viewportWidth;
      const targetScrollLeft = Math.max(0, Math.min(maxScrollLeft, idealScrollLeft));
      
      // Only scroll if the progress bar would be near the edge or outside viewport
      const progressViewportPosition = progressPx - currentScrollLeft;
      const edgeThreshold = viewportWidth * 0.2; // Start following when within 20% of edges
      
      if (progressViewportPosition < edgeThreshold || 
          progressViewportPosition > viewportWidth - edgeThreshold) {
        
        // Smooth scroll to keep progress in view
        viewport.scrollTo({
          left: targetScrollLeft,
          behavior: 'smooth'
        });
      }
    }
  }

  // Smooth scroll function to follow playback progress when zoomed
  smoothScrollToProgress(container, progress, zoomLevel) {
    if (zoomLevel <= 1) return; // No need to scroll if not zoomed
    
    const parent = container.closest('.midi-visualization, .visualizationCanvas') || container.parentElement;
    if (!parent) return;
    
    // Calculate how much to scroll to keep progress bar in view
    const containerWidth = container.getBoundingClientRect().width;
    const viewportWidth = parent.getBoundingClientRect().width;
    
    if (containerWidth > viewportWidth) {
      // Calculate scroll position to center the progress bar
      const progressPosition = progress * containerWidth;
      const targetScrollLeft = Math.max(0, progressPosition - viewportWidth / 2);
      
      // Smooth scroll
      if (parent.scrollTo) {
        parent.scrollTo({
          left: targetScrollLeft,
          behavior: 'smooth'
        });
      } else {
        parent.scrollLeft = targetScrollLeft;
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
    this.activeAudioNodes = []; // Clear any previous audio nodes
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

      this.humanizedMidiData = this.humanizeMIDI(midiData, style, intensity, seed, true); // true = isUserUpload

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

  humanizeMIDI(midiData, style, intensity, seed, isUserUpload = false) {
    // Set random seed for reproducibility
    this.rng = this.seedRandom(seed);
    
    // Store style for later use in results display
    this.lastStyle = style;
    
    // Perform musical analysis for intelligent humanization
    const musicalAnalysis = this.analyzeMusicStructure(midiData.tracks, style, isUserUpload);
    
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
  analyzeMusicStructure(tracks, style, isUserUpload = false) {
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
        phrasing: this.identifyPhraseBoundaries(track, isUserUpload),
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

  identifyPhraseBoundaries(track, isUserUpload = false) {
    const noteEvents = track.filter(event => this.isNoteOn(event));
    if (noteEvents.length < 6) return [{ start: 0, end: noteEvents[noteEvents.length - 1]?.time || 0, notes: noteEvents }];
    
    // Extract notes with durations
    const notes = this.extractNotesFromTrack(track);
    if (notes.length < 6) return [{ start: 0, end: notes[notes.length - 1]?.endTime || 0, notes: noteEvents }];
    
    // For user-uploaded files, skip marker detection completely and use reinforcement learning approach
    if (isUserUpload) {
      console.log('🎯 User-uploaded file: Using reinforcement learning patterns for phrase detection');
      return this.detectPhrasesUsingReinforcementLearning(track, notes, noteEvents);
    }
    
    // For training files, check for markers but also skip if no markers found
    const trainingAnalysis = this.analyzeTrainingPhrases(track, notes);
    
    if (trainingAnalysis && trainingAnalysis.markerCount > 0) {
      console.log('🎵 Using training data for phrase detection - Enhanced analysis mode activated');
      console.log('Training markers found:', {
        phraseBoundaries: trainingAnalysis.markerCount,
        strongNuanceMarkers: trainingAnalysis.strongNuanceFeatures?.length || 0,
        regularNuanceMarkers: trainingAnalysis.nuanceFeatures?.length || 0
      });
      return this.detectPhrasesFromTrainingData(track, notes, noteEvents, trainingAnalysis);
    }
    
    // **UPDATED**: Always use reinforcement learning approach instead of grid-based analysis
    console.log('🧠 Using reinforcement learning patterns for phrase detection (bypassing grid-based analysis)');
    return this.detectPhrasesUsingReinforcementLearning(track, notes, noteEvents);
  }

  detectPhrasesFromTrainingData(track, notes, noteEvents, trainingAnalysis) {
    const markers = this.extractPhraseMarkers(track);
    const boundaries = markers.phraseBoundaries.map(m => m.time).sort((a, b) => a - b);
    
    // Filter out musical notes (exclude the marker notes C6, A5, and B5)
    const musicalNotes = notes.filter(n => n.pitch !== 96 && n.pitch !== 93 && n.pitch !== 95);
    const musicalNoteEvents = noteEvents.filter(e => e.data1 !== 96 && e.data1 !== 93 && e.data1 !== 95);
    
    console.log('Training data phrase detection:', {
      totalNotes: notes.length,
      musicalNotes: musicalNotes.length,
      markerNotes: notes.length - musicalNotes.length,
      phraseBoundaries: boundaries.length,
      strongNuanceMarkers: markers.strongNuanceMarkers.length,
      nuanceMarkers: markers.nuanceMarkers.length
    });
    
    // Create phrases from the C6 boundaries
    const phrases = this.createPhrasesFromBoundaries(boundaries, musicalNotes, musicalNoteEvents);
    
    // Analyze the training patterns for future use
    this.learnFromTrainingData(trainingAnalysis);
    
    console.log('Training phrases created:', {
      phraseCount: phrases.length,
      avgPhraseDuration: phrases.length > 0 ? 
        phrases.reduce((sum, p) => sum + (p.end - p.start), 0) / phrases.length / 480 : 0,
      avgNotesPerPhrase: phrases.length > 0 ?
        phrases.reduce((sum, p) => sum + p.notes.length, 0) / phrases.length : 0
    });
    
    return phrases;
  }
  
  // Store learned patterns from training data for improving regular phrase detection
  learnFromTrainingData(trainingAnalysis) {
    if (!this.learnedPatterns) {
      this.learnedPatterns = {
        phraseBoundaryFeatures: [],
        strongNuanceFeatures: [],
        nuanceFeatures: [],
        comprehensivePatterns: {
          repetitionPatterns: [],
          chordPatterns: [],
          rhythmicPatterns: [],
          intervalPatterns: [],
          lengthPatterns: []
        }
      };
    }
    
    // Store the features for learning
    this.learnedPatterns.phraseBoundaryFeatures.push(...trainingAnalysis.phraseFeatures);
    this.learnedPatterns.strongNuanceFeatures.push(...(trainingAnalysis.strongNuanceFeatures || []));
    this.learnedPatterns.nuanceFeatures.push(...trainingAnalysis.nuanceFeatures);
    
    // **ENHANCED LEARNING**: Store comprehensive patterns from limited training data
    if (trainingAnalysis.comprehensivePatterns) {
      const cp = trainingAnalysis.comprehensivePatterns;
      
      // Store repetition alignment patterns
      if (cp.repetitionAlignment) {
        this.learnedPatterns.comprehensivePatterns.repetitionPatterns.push(cp.repetitionAlignment);
      }
      
      // Store chord alignment patterns
      if (cp.chordAlignment) {
        this.learnedPatterns.comprehensivePatterns.chordPatterns.push(cp.chordAlignment);
      }
      
      // Store rhythmic patterns
      if (cp.rhythmicPatterns) {
        this.learnedPatterns.comprehensivePatterns.rhythmicPatterns.push(...cp.rhythmicPatterns.commonRhythms);
      }
      
      // Store interval patterns
      if (cp.intervalPatterns) {
        this.learnedPatterns.comprehensivePatterns.intervalPatterns.push(...cp.intervalPatterns.commonIntervals);
      }
      
      // Store length patterns
      if (cp.lengthPatterns) {
        this.learnedPatterns.comprehensivePatterns.lengthPatterns.push(...cp.lengthPatterns.categories);
      }
    }
    
    // Analyze patterns in the learned features
    const boundaryFeatures = this.learnedPatterns.phraseBoundaryFeatures;
    const strongNuanceFeatures = this.learnedPatterns.strongNuanceFeatures;
    const comprehensivePatterns = this.learnedPatterns.comprehensivePatterns;
    
    if (boundaryFeatures.length > 0) {
      const avgRestDuration = boundaryFeatures.reduce((sum, f) => sum + f.restDuration, 0) / boundaryFeatures.length;
      const avgPitchChange = boundaryFeatures.reduce((sum, f) => sum + f.pitchChange, 0) / boundaryFeatures.length;
      const avgVelocityChange = boundaryFeatures.reduce((sum, f) => sum + f.velocityChange, 0) / boundaryFeatures.length;
      
      console.log('Enhanced learned patterns from limited training data:', {
        phraseBoundaryCount: boundaryFeatures.length,
        strongNuanceCount: strongNuanceFeatures.length,
        nuanceCount: this.learnedPatterns.nuanceFeatures.length,
        avgRestDuration: Math.round(avgRestDuration),
        avgPitchChange: avgPitchChange.toFixed(1),
        avgVelocityChange: avgVelocityChange.toFixed(1),
        comprehensivePatterns: {
          repetitionSources: comprehensivePatterns.repetitionPatterns.length,
          chordSources: comprehensivePatterns.chordPatterns.length,
          rhythmicPatterns: comprehensivePatterns.rhythmicPatterns.length,
          intervalPatterns: comprehensivePatterns.intervalPatterns.length,
          lengthCategories: comprehensivePatterns.lengthPatterns.length
        }
      });
    }
  }

  detectPhrasesWithGrid(track, notes, noteEvents) {
    // Step 1: Establish beat and measure grid
    const grid = this.calculateBeatMeasureGrid(track, notes);
    
    // Step 2: Calculate musical feature change scores
    const changeScores = this.calculateMusicFeatureChanges(notes, grid);
    
    // Step 3: Apply learned patterns if available
    if (this.learnedPatterns && this.learnedPatterns.phraseBoundaryFeatures.length > 0) {
      this.enhanceScoresWithLearnedPatterns(changeScores, notes, grid);
      
      // **ENHANCED**: Apply comprehensive patterns learned from limited training data
      this.applyComprehensiveLearnedPatterns(changeScores, notes, grid, track);
    }
    
    // Step 4: Apply structural importance weighting
    const weightedScores = this.applyStructuralWeighting(changeScores, grid);
    
    // Step 5: Detect peaks in weighted scores as phrase boundaries
    const boundaries = this.detectPhraseBoundaryPeaks(weightedScores, grid);
    
    console.log('Enhanced phrase detection:', {
      totalNotes: notes.length,
      measuresDetected: grid.totalMeasures,
      timeSig: `${grid.timeSig.numerator}/${grid.timeSig.denominator}`,
      tempo: grid.tempo,
      rawBoundaries: changeScores.length,
      weightedBoundaries: boundaries.length,
      finalPhrases: boundaries.length + 1,
      totalTicks: grid.totalTicks,
      firstNote: notes[0]?.time,
      lastNote: notes[notes.length - 1]?.endTime,
      hasLearnedPatterns: !!(this.learnedPatterns && this.learnedPatterns.phraseBoundaryFeatures.length > 0)
    });
    
    const rawPhrases = this.createPhrasesFromBoundaries(boundaries, notes, noteEvents);
    
    // Apply intelligent post-processing to merge fragmented phrases
    const improvedPhrases = this.mergeFragmentedPhrases(rawPhrases, grid);
    
    // Second pass: Create measure-aligned phrases instead of merging
    const measureBasedPhrases = this.createMeasureAlignedPhrases(improvedPhrases, grid);
    
    console.log('Phrase improvement:', {
      beforeMerging: rawPhrases.length,
      afterFirstMerge: improvedPhrases.length,
      afterMeasureAlignment: measureBasedPhrases.length,
      totalImprovement: Math.round((rawPhrases.length - measureBasedPhrases.length) / rawPhrases.length * 100) + '%'
    });
    
    return measureBasedPhrases;
  }

  detectPhrasesUsingLearnedPatterns(track, notes, noteEvents) {
    // Use learned patterns to detect phrases without heavy grid-based analysis
    console.log('Applying learned patterns directly for phrase detection');
    
    // Still need basic grid info for timing calculations
    const grid = this.calculateBeatMeasureGrid(track, notes);
    
    // Calculate basic feature changes but with reduced complexity
    const changeScores = this.calculateMusicFeatureChanges(notes, grid);
    
    // Apply ONLY learned patterns without structural weighting that causes uniform lengths
    this.enhanceScoresWithLearnedPatterns(changeScores, notes, grid);
    this.applyComprehensiveLearnedPatterns(changeScores, notes, grid, track);
    
    // Use the learned patterns directly for boundary detection, skip structural weighting
    const boundaries = this.detectLearnedPatternBoundaries(changeScores, grid);
    
    console.log('Learned pattern phrase detection:', {
      totalNotes: notes.length,
      changeScores: changeScores.length,
      detectedBoundaries: boundaries.length,
      finalPhrases: boundaries.length + 1,
      learnedFeatures: this.learnedPatterns.phraseBoundaryFeatures.length
    });
    
    const phrases = this.createPhrasesFromBoundaries(boundaries, notes, noteEvents);
    
    // Apply minimal post-processing to avoid over-regularization
    return this.mergeOnlyVeryShortPhrases(phrases, grid);
  }

  detectLearnedPatternBoundaries(changeScores, grid) {
    // Detection focused on learned patterns without heavy structural constraints
    const peaks = [];
    const minPhraseLength = Math.max(grid.ticksPerBeat, 96); // Reduced minimum phrase length
    
    // Sort by change score to find most significant musical changes
    const sortedScores = [...changeScores].sort((a, b) => b.score - a.score);
    
    // Use adaptive threshold based on learned pattern features
    const maxScore = sortedScores[0]?.score || 0;
    const avgScore = changeScores.reduce((sum, s) => sum + s.score, 0) / changeScores.length;
    
    // More flexible threshold that allows varied phrase lengths
    const dynamicThreshold = Math.max(0.3, Math.min(maxScore * 0.3, avgScore * 1.5));
    
    console.log('Learned pattern boundary detection:', {
      totalScores: changeScores.length,
      maxScore: maxScore.toFixed(3),
      avgScore: avgScore.toFixed(3),
      threshold: dynamicThreshold.toFixed(3),
      minPhraseLength
    });
    
    // Find significant changes that respect learned patterns
    for (let i = 0; i < changeScores.length; i++) {
      const current = changeScores[i];
      
      if (current.score >= dynamicThreshold) {
        // Check if it's a local maximum or has learned pattern features
        const isLocalMax = (i === 0 || current.score >= changeScores[i - 1].score) &&
                          (i === changeScores.length - 1 || current.score >= changeScores[i + 1].score);
        
        const hasLearnedFeatures = current.features && (
          current.features.learnedPatternBoost > 0 ||
          current.features.strongNuanceBoost > 0 ||
          current.features.repetitionBoost > 0
        );
        
        if (isLocalMax || hasLearnedFeatures) {
          // Check minimum distance from previous peaks
          const validDistance = peaks.length === 0 || 
            (current.time - peaks[peaks.length - 1]) >= minPhraseLength;
          
          if (validDistance) {
            peaks.push(current.time);
          }
        }
      }
    }
    
    return peaks;
  }

  mergeOnlyVeryShortPhrases(phrases, grid) {
    // Only merge phrases that are extremely short (less than half a beat)
    const veryShortThreshold = grid.ticksPerBeat / 2;
    const result = [];
    
    for (let i = 0; i < phrases.length; i++) {
      const phrase = phrases[i];
      const phraseDuration = phrase.end - phrase.start;
      
      if (phraseDuration < veryShortThreshold && result.length > 0) {
        // Merge with previous phrase
        const previous = result[result.length - 1];
        previous.end = phrase.end;
        previous.notes = previous.notes.concat(phrase.notes);
      } else {
        result.push(phrase);
      }
    }
    
    console.log('Minimal phrase merging:', {
      originalPhrases: phrases.length,
      afterMerging: result.length,
      veryShortThreshold: veryShortThreshold
    });
    
    return result;
  }

  // **NEW**: Reinforcement learning-based phrase detection that prioritizes musical content over rigid grid analysis
  detectPhrasesUsingReinforcementLearning(track, notes, noteEvents) {
    console.log('🧠 Applying reinforcement learning approach for phrase detection');
    
    // Use basic timing info without heavy grid constraints
    const totalDuration = Math.max(...notes.map(n => n.endTime || n.startTime));
    const totalNotes = notes.length;
    
    // Calculate natural musical boundaries based on content analysis
    const musicalBoundaries = this.findNaturalMusicalBoundaries(notes);
    
    // Use rest analysis for phrase detection (more natural than grid-based)
    const restBoundaries = this.findRestBasedBoundaries(notes);
    
    // Apply harmonic change detection
    const harmonicBoundaries = this.findHarmonicChangeBoundaries(notes);
    
    // Combine all boundary types with intelligent weighting
    const combinedBoundaries = this.combineAndWeightBoundaries(
      musicalBoundaries,
      restBoundaries, 
      harmonicBoundaries,
      notes
    );
    
    console.log('Reinforcement learning phrase detection:', {
      totalNotes: totalNotes,
      totalDuration: (totalDuration / 1000).toFixed(1) + 's',
      musicalBoundaries: musicalBoundaries.length,
      restBoundaries: restBoundaries.length,
      harmonicBoundaries: harmonicBoundaries.length,
      finalBoundaries: combinedBoundaries.length,
      expectedPhrases: combinedBoundaries.length + 1
    });
    
    // Create phrases from detected boundaries
    const phrases = this.createPhrasesFromBoundaries(combinedBoundaries, notes, noteEvents);
    
    // Apply minimal post-processing to avoid over-regularization
    return this.applyMinimalPhraseCleaning(phrases);
  }

  // Find natural musical boundaries based on content analysis
  findNaturalMusicalBoundaries(notes) {
    const boundaries = [];
    
    for (let i = 1; i < notes.length - 1; i++) {
      const prev = notes[i - 1];
      const curr = notes[i];
      const next = notes[i + 1];
      
      // Detect significant pitch jumps (likely phrase transitions)
      const pitchJump = Math.abs(curr.pitch - prev.pitch);
      if (pitchJump >= 12) { // Octave or larger jump
        boundaries.push(curr.startTime);
        continue;
      }
      
      // Detect significant timing changes
      const prevGap = curr.startTime - prev.startTime;
      const nextGap = next.startTime - curr.startTime;
      if (prevGap > 0 && nextGap > 0) {
        const gapRatio = Math.max(prevGap, nextGap) / Math.min(prevGap, nextGap);
        if (gapRatio >= 2.5) { // Significant timing change
          boundaries.push(curr.startTime);
        }
      }
    }
    
    return boundaries.sort((a, b) => a - b);
  }

  // Find boundaries based on rest/silence analysis
  findRestBasedBoundaries(notes) {
    const boundaries = [];
    const significantRestThreshold = 240; // Quarter note rest at 120 BPM
    
    for (let i = 1; i < notes.length; i++) {
      const prev = notes[i - 1];
      const curr = notes[i];
      
      const restDuration = curr.startTime - (prev.endTime || prev.startTime);
      
      if (restDuration >= significantRestThreshold) {
        boundaries.push(curr.startTime);
      }
    }
    
    return boundaries.sort((a, b) => a - b);
  }

  // Find boundaries based on harmonic/melodic content changes
  findHarmonicChangeBoundaries(notes) {
    const boundaries = [];
    const windowSize = 4; // Look at groups of 4 notes
    
    for (let i = windowSize; i < notes.length - windowSize; i++) {
      const prevWindow = notes.slice(i - windowSize, i);
      const nextWindow = notes.slice(i, i + windowSize);
      
      // Calculate average pitch for each window
      const prevAvg = prevWindow.reduce((sum, n) => sum + n.pitch, 0) / prevWindow.length;
      const nextAvg = nextWindow.reduce((sum, n) => sum + n.pitch, 0) / nextWindow.length;
      
      // Detect significant harmonic shift
      if (Math.abs(nextAvg - prevAvg) >= 6) { // Half-octave shift
        boundaries.push(notes[i].startTime);
      }
    }
    
    return boundaries.sort((a, b) => a - b);
  }

  // Combine and intelligently weight different boundary types
  combineAndWeightBoundaries(musicalBoundaries, restBoundaries, harmonicBoundaries, notes) {
    const allBoundaries = new Map();
    
    // Add musical boundaries with weight
    musicalBoundaries.forEach(time => {
      allBoundaries.set(time, (allBoundaries.get(time) || 0) + 1.0);
    });
    
    // Add rest boundaries with higher weight (more reliable)
    restBoundaries.forEach(time => {
      allBoundaries.set(time, (allBoundaries.get(time) || 0) + 1.5);
    });
    
    // Add harmonic boundaries with moderate weight
    harmonicBoundaries.forEach(time => {
      allBoundaries.set(time, (allBoundaries.get(time) || 0) + 0.8);
    });
    
    // Filter boundaries by weight and ensure minimum phrase length
    const minPhraseLength = 480; // Half note at 120 BPM
    const weightedBoundaries = Array.from(allBoundaries.entries())
      .filter(([time, weight]) => weight >= 1.2) // Require some confidence
      .sort(([a], [b]) => a - b)
      .map(([time]) => time);
    
    // Ensure minimum distance between boundaries
    const finalBoundaries = [];
    let lastBoundary = 0;
    
    for (const boundary of weightedBoundaries) {
      if (boundary - lastBoundary >= minPhraseLength) {
        finalBoundaries.push(boundary);
        lastBoundary = boundary;
      }
    }
    
    return finalBoundaries;
  }

  // Apply minimal cleaning to avoid over-processing
  applyMinimalPhraseCleaning(phrases) {
    // Only merge extremely short phrases (less than 0.5 seconds)
    const minPhraseDuration = 500; // 0.5 seconds in milliseconds
    const result = [];
    
    for (let i = 0; i < phrases.length; i++) {
      const phrase = phrases[i];
      const phraseDuration = phrase.end - phrase.start;
      
      if (phraseDuration < minPhraseDuration && result.length > 0) {
        // Merge with previous phrase
        const previous = result[result.length - 1];
        previous.end = phrase.end;
        previous.notes = previous.notes.concat(phrase.notes);
      } else {
        result.push(phrase);
      }
    }
    
    console.log('Minimal phrase cleaning:', {
      originalPhrases: phrases.length,
      afterCleaning: result.length,
      averageDuration: result.length > 0 ? 
        (result.reduce((sum, p) => sum + (p.end - p.start), 0) / result.length / 1000).toFixed(1) + 's' : '0s'
    });
    
    return result;
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
    if (notes.length < 2) {
      console.log('Not enough notes for change detection');
      return [];
    }
    
    // Use more adaptive window sizing based on note density
    const avgNotesPerBeat = notes.length / (grid.totalTicks / grid.ticksPerBeat);
    const windowSize = Math.max(grid.ticksPerBeat / 8, Math.min(grid.ticksPerBeat, grid.totalTicks / 8));
    const changeScores = [];
    
    console.log('Window analysis:', {
      windowSize,
      totalTicks: grid.totalTicks,
      ticksPerBeat: grid.ticksPerBeat,
      avgNotesPerBeat,
      noteSpan: `${notes[0]?.time} to ${notes[notes.length - 1]?.endTime}`
    });
    
    // Analyze note-to-note changes as well as windowed changes
    for (let i = 1; i < notes.length; i++) {
      const prev = notes[i - 1];
      const current = notes[i];
      
      // Calculate note-level changes
      const timeDiff = current.time - prev.endTime; // Gap between notes
      const pitchDiff = Math.abs(current.pitch - prev.pitch);
      const velocityDiff = Math.abs(current.velocity - prev.velocity);
      
      // Score based on significant changes
      let noteChangeScore = 0;
      
      // Large time gaps suggest phrase boundaries
      if (timeDiff > grid.ticksPerBeat * 1.5) { // Changed from 1 beat to 1.5 beats - more restrictive
        noteChangeScore += Math.min(1, timeDiff / (grid.ticksPerBeat * 2)) * 0.8;
      }
      
      // Large pitch jumps suggest phrase boundaries
      if (pitchDiff > 7) { // Changed from 4 to 7 semitones - more restrictive
        noteChangeScore += Math.min(1, pitchDiff / 12) * 0.6;
      }
      
      // Significant velocity changes
      if (velocityDiff > 30) { // Changed from 20 to 30 - more restrictive
        noteChangeScore += Math.min(1, velocityDiff / 64) * 0.4;
      }
      
      // Register significant changes
      if (noteChangeScore > 1.0) { // Increased threshold from 0.6 to 1.0 - much more restrictive
        changeScores.push({
          time: current.startTime,
          score: noteChangeScore,
          features: { 
            type: 'note-level',
            timeDiff, 
            pitchDiff, 
            velocityDiff 
          }
        });
      }
    }
    
    // Also do windowed analysis for broader patterns
    for (let time = windowSize; time < grid.totalTicks - windowSize; time += windowSize / 2) {
      const windowNotes = notes.filter(n => n.startTime >= time - windowSize/2 && n.startTime < time + windowSize/2);
      const nextWindowNotes = notes.filter(n => n.startTime >= time + windowSize/2 && n.startTime < time + windowSize * 1.5);
      
      if (windowNotes.length === 0 && nextWindowNotes.length === 0) continue;
      
      // Calculate features for current and next windows
      const currentFeatures = this.extractMusicFeatures(windowNotes);
      const nextFeatures = this.extractMusicFeatures(nextWindowNotes);
      
      // Calculate change magnitude
      const changeScore = this.calculateFeatureChangeMagnitude(currentFeatures, nextFeatures);
      
      // Add rhythmic pattern analysis
      const rhythmScore = this.calculateRhythmicChange(windowNotes, nextWindowNotes);
      const combinedScore = Math.max(changeScore, rhythmScore * 0.5);
      
      if (combinedScore > 0.5) { // Increased threshold from 0.2 to 0.5 for windowed analysis
        changeScores.push({
          time: time,
          score: combinedScore,
          features: { 
            type: 'windowed', 
            current: currentFeatures, 
            next: nextFeatures 
          }
        });
      }
    }
    
    console.log('Change scores generated:', changeScores.length, changeScores.map(cs => `${cs.time}:${cs.score.toFixed(2)}`));
    return changeScores;
  }

  calculateRhythmicChange(currentNotes, nextNotes) {
    if (currentNotes.length === 0 && nextNotes.length === 0) return 0;
    if (currentNotes.length === 0 || nextNotes.length === 0) return 0.3; // Silence change
    
    // Simple rhythmic density change detection
    const currentDensity = currentNotes.length;
    const nextDensity = nextNotes.length;
    const densityChange = Math.abs(currentDensity - nextDensity) / Math.max(currentDensity, nextDensity, 1);
    
    // Pitch movement patterns
    const currentRange = this.getPitchRange(currentNotes);
    const nextRange = this.getPitchRange(nextNotes);
    const rangeChange = Math.abs(currentRange - nextRange) / Math.max(currentRange, nextRange, 12);
    
    return Math.min(1, densityChange + rangeChange * 0.5);
  }

  getPitchRange(notes) {
    if (notes.length === 0) return 0;
    const pitches = notes.map(n => n.pitch);
    return Math.max(...pitches) - Math.min(...pitches);
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

  // Enhance change scores using patterns learned from training data
  enhanceScoresWithLearnedPatterns(changeScores, notes, grid) {
    if (!this.learnedPatterns || this.learnedPatterns.phraseBoundaryFeatures.length === 0) {
      return;
    }
    
    const learnedFeatures = this.learnedPatterns.phraseBoundaryFeatures;
    
    // Calculate average characteristics of learned phrase boundaries
    const avgRestDuration = learnedFeatures.reduce((sum, f) => sum + f.restDuration, 0) / learnedFeatures.length;
    const avgPitchChange = learnedFeatures.reduce((sum, f) => sum + f.pitchChange, 0) / learnedFeatures.length;
    const avgVelocityChange = learnedFeatures.reduce((sum, f) => sum + f.velocityChange, 0) / learnedFeatures.length;
    const avgDensityChange = learnedFeatures.reduce((sum, f) => sum + f.densityChange, 0) / learnedFeatures.length;
    
    console.log('🧠 Applying learned patterns with enhanced weighting:', {
      learnedSamples: learnedFeatures.length,
      avgRestDuration: Math.round(avgRestDuration),
      avgPitchChange: avgPitchChange.toFixed(1),
      avgVelocityChange: avgVelocityChange.toFixed(1),
      avgDensityChange: avgDensityChange.toFixed(1)
    });
    
    // Look for candidate positions that match learned patterns
    const windowSize = 960; // 1 beat window for context analysis
    
    for (let i = 0; i < notes.length - 1; i++) {
      const currentNote = notes[i];
      const nextNote = notes[i + 1];
      const candidateTime = nextNote.startTime;
      
      // Analyze context around this candidate boundary
      const context = this.analyzeBoundaryContext(candidateTime, notes, windowSize);
      
      // Calculate similarity to learned patterns
      let similarity = 0;
      let matchCount = 0;
      
      // Rest duration similarity (if there's a significant rest)
      if (context.restDuration > 0 && avgRestDuration > 0) {
        const restSimilarity = 1 - Math.abs(context.restDuration - avgRestDuration) / Math.max(context.restDuration, avgRestDuration);
        similarity += restSimilarity * 0.3;
        matchCount++;
      }
      
      // Pitch change similarity
      if (context.pitchChange > 0 && avgPitchChange > 0) {
        const pitchSimilarity = 1 - Math.abs(context.pitchChange - avgPitchChange) / Math.max(context.pitchChange, avgPitchChange, 12);
        similarity += pitchSimilarity * 0.3;
        matchCount++;
      }
      
      // Velocity change similarity
      if (context.velocityChange > 0 && avgVelocityChange > 0) {
        const velocitySimilarity = 1 - Math.abs(context.velocityChange - avgVelocityChange) / Math.max(context.velocityChange, avgVelocityChange, 64);
        similarity += velocitySimilarity * 0.2;
        matchCount++;
      }
      
      // Density change similarity
      if (context.densityChange > 0 && avgDensityChange > 0) {
        const densitySimilarity = 1 - Math.abs(context.densityChange - avgDensityChange) / Math.max(context.densityChange, avgDensityChange, 10);
        similarity += densitySimilarity * 0.2;
        matchCount++;
      }
      
      // If this location matches learned patterns well, boost its score (enhanced for training data priority)
      if (matchCount > 0 && similarity > 0.3) { // Lowered threshold from 0.5 to 0.3 for more aggressive learning
        const boost = similarity * 1.2; // Increased boost from 0.8 to 1.2 for stronger training data influence
        
        // Find existing change score for this time or add new one
        let existingScore = changeScores.find(cs => Math.abs(cs.time - candidateTime) < grid.ticksPerBeat / 4);
        
        if (existingScore) {
          existingScore.score += boost;
          existingScore.features.learnedPatternBoost = boost;
          existingScore.features.learnedSimilarity = similarity;
        } else {
          changeScores.push({
            time: candidateTime,
            score: boost,
            features: {
              type: 'learned-pattern',
              learnedPatternBoost: boost,
              learnedSimilarity: similarity,
              matchCount: matchCount,
              ...context
            }
          });
        }
      }
    }
    
    // Sort change scores by time
    changeScores.sort((a, b) => a.time - b.time);
    
    // Also apply strong nuance patterns if available
    this.applyStrongNuancePatterns(changeScores, notes, grid);
    
    console.log('🎯 Enhanced with learned patterns (training data prioritized):', {
      totalChangeScores: changeScores.length,
      learnedPatternBoosts: changeScores.filter(cs => cs.features.learnedPatternBoost).length,
      strongNuanceBoosts: changeScores.filter(cs => cs.features.strongNuanceBoost).length,
      maxLearnedBoost: Math.max(...changeScores.filter(cs => cs.features.learnedPatternBoost).map(cs => cs.features.learnedPatternBoost), 0).toFixed(2)
    });
  }

  // Apply strong nuance patterns (A5 markers) with moderate weighting
  applyStrongNuancePatterns(changeScores, notes, grid) {
    if (!this.learnedPatterns || !this.learnedPatterns.strongNuanceFeatures || this.learnedPatterns.strongNuanceFeatures.length === 0) {
      return;
    }
    
    const strongNuanceFeatures = this.learnedPatterns.strongNuanceFeatures;
    
    // Calculate average characteristics of strong nuance markers
    const avgRestDuration = strongNuanceFeatures.reduce((sum, f) => sum + f.restDuration, 0) / strongNuanceFeatures.length;
    const avgPitchChange = strongNuanceFeatures.reduce((sum, f) => sum + f.pitchChange, 0) / strongNuanceFeatures.length;
    const avgVelocityChange = strongNuanceFeatures.reduce((sum, f) => sum + f.velocityChange, 0) / strongNuanceFeatures.length;
    const avgDensityChange = strongNuanceFeatures.reduce((sum, f) => sum + f.densityChange, 0) / strongNuanceFeatures.length;
    
    console.log('Applying strong nuance patterns:', {
      strongNuanceSamples: strongNuanceFeatures.length,
      avgRestDuration: Math.round(avgRestDuration),
      avgPitchChange: avgPitchChange.toFixed(1),
      avgVelocityChange: avgVelocityChange.toFixed(1),
      avgDensityChange: avgDensityChange.toFixed(1)
    });
    
    const windowSize = 960; // 1 beat window for context analysis
    
    for (let i = 0; i < notes.length - 1; i++) {
      const currentNote = notes[i];
      const nextNote = notes[i + 1];
      const candidateTime = nextNote.startTime;
      
      // Analyze context around this candidate boundary
      const context = this.analyzeBoundaryContext(candidateTime, notes, windowSize);
      
      // Calculate similarity to strong nuance patterns
      let similarity = 0;
      let matchCount = 0;
      
      // Rest duration similarity
      if (context.restDuration > 0 && avgRestDuration > 0) {
        const restSimilarity = 1 - Math.abs(context.restDuration - avgRestDuration) / Math.max(context.restDuration, avgRestDuration);
        similarity += restSimilarity * 0.3;
        matchCount++;
      }
      
      // Pitch change similarity
      if (context.pitchChange > 0 && avgPitchChange > 0) {
        const pitchSimilarity = 1 - Math.abs(context.pitchChange - avgPitchChange) / Math.max(context.pitchChange, avgPitchChange, 12);
        similarity += pitchSimilarity * 0.3;
        matchCount++;
      }
      
      // Velocity change similarity
      if (context.velocityChange > 0 && avgVelocityChange > 0) {
        const velocitySimilarity = 1 - Math.abs(context.velocityChange - avgVelocityChange) / Math.max(context.velocityChange, avgVelocityChange, 64);
        similarity += velocitySimilarity * 0.2;
        matchCount++;
      }
      
      // Density change similarity
      if (context.densityChange > 0 && avgDensityChange > 0) {
        const densitySimilarity = 1 - Math.abs(context.densityChange - avgDensityChange) / Math.max(context.densityChange, avgDensityChange, 10);
        similarity += densitySimilarity * 0.2;
        matchCount++;
      }
      
      // Apply moderate boost for strong nuance patterns (weaker than phrase boundaries)
      if (matchCount > 0 && similarity > 0.4) {
        const boost = similarity * 0.5; // Moderate boost (weaker than 0.8 for phrase boundaries)
        
        // Find existing change score for this time or add new one
        let existingScore = changeScores.find(cs => Math.abs(cs.time - candidateTime) < grid.ticksPerBeat / 4);
        
        if (existingScore) {
          existingScore.score += boost;
          existingScore.features.strongNuanceBoost = boost;
          existingScore.features.strongNuanceSimilarity = similarity;
        } else {
          changeScores.push({
            time: candidateTime,
            score: boost,
            features: {
              type: 'strong-nuance-pattern',
              strongNuanceBoost: boost,
              strongNuanceSimilarity: similarity,
              matchCount: matchCount,
              ...context
            }
          });
        }
      }
    }
    
    // Sort change scores by time
    changeScores.sort((a, b) => a.time - b.time);
  }

  // Apply comprehensive patterns learned from limited training data
  applyComprehensiveLearnedPatterns(changeScores, notes, grid, track) {
    if (!this.learnedPatterns || !this.learnedPatterns.comprehensivePatterns) {
      return;
    }
    
    const cp = this.learnedPatterns.comprehensivePatterns;
    let totalBoosts = 0;
    
    // 1. Apply repetition pattern knowledge
    if (cp.repetitionPatterns.length > 0) {
      const repetitionBoundaries = this.findRepetitionBoundaries(notes);
      totalBoosts += this.applyRepetitionPatternBoosts(changeScores, repetitionBoundaries, grid);
    }
    
    // 2. Apply chord change pattern knowledge
    if (cp.chordPatterns.length > 0) {
      const chordBoundaries = this.findChordChangeBoundaries(track, notes);
      totalBoosts += this.applyChordPatternBoosts(changeScores, chordBoundaries, grid);
    }
    
    // 3. Apply rhythmic pattern knowledge
    if (cp.rhythmicPatterns.length > 0) {
      totalBoosts += this.applyRhythmicPatternBoosts(changeScores, notes, grid);
    }
    
    // 4. Apply interval pattern knowledge
    if (cp.intervalPatterns.length > 0) {
      totalBoosts += this.applyIntervalPatternBoosts(changeScores, grid);
    }
    
    console.log('Applied comprehensive patterns from limited training data:', {
      repetitionPatterns: cp.repetitionPatterns.length,
      chordPatterns: cp.chordPatterns.length,
      rhythmicPatterns: cp.rhythmicPatterns.length,
      intervalPatterns: cp.intervalPatterns.length,
      totalBoosts: totalBoosts
    });
    
    // Sort change scores by time
    changeScores.sort((a, b) => a.time - b.time);
  }
  
  // Apply boosts based on learned repetition patterns
  applyRepetitionPatternBoosts(changeScores, repetitionBoundaries, grid) {
    let boosts = 0;
    const boostFactor = 0.3; // Moderate boost for repetition patterns
    
    repetitionBoundaries.forEach(repTime => {
      let existingScore = changeScores.find(cs => Math.abs(cs.time - repTime) < grid.ticksPerBeat / 4);
      
      if (existingScore) {
        existingScore.score += boostFactor;
        existingScore.features.repetitionBoost = boostFactor;
        boosts++;
      } else {
        changeScores.push({
          time: repTime,
          score: boostFactor,
          features: {
            type: 'repetition-pattern',
            repetitionBoost: boostFactor
          }
        });
        boosts++;
      }
    });
    
    return boosts;
  }
  
  // Apply boosts based on learned chord change patterns
  applyChordPatternBoosts(changeScores, chordBoundaries, grid) {
    let boosts = 0;
    const boostFactor = 0.25; // Moderate boost for chord patterns
    
    chordBoundaries.forEach(chordTime => {
      let existingScore = changeScores.find(cs => Math.abs(cs.time - chordTime) < grid.ticksPerBeat / 4);
      
      if (existingScore) {
        existingScore.score += boostFactor;
        existingScore.features.chordBoost = boostFactor;
        boosts++;
      } else {
        changeScores.push({
          time: chordTime,
          score: boostFactor,
          features: {
            type: 'chord-pattern',
            chordBoost: boostFactor
          }
        });
        boosts++;
      }
    });
    
    return boosts;
  }
  
  // Apply boosts based on learned rhythmic patterns
  applyRhythmicPatternBoosts(changeScores, notes, grid) {
    let boosts = 0;
    const cp = this.learnedPatterns.comprehensivePatterns;
    
    // Find locations matching learned rhythmic patterns
    for (let i = 0; i < notes.length - 4; i++) {
      const windowNotes = notes.slice(i, i + 4);
      const currentPattern = this.extractRhythmPattern(windowNotes, windowNotes[2].startTime);
      
      // Check if this pattern matches any learned rhythmic patterns
      const matchingPattern = cp.rhythmicPatterns.find(learnedPattern => 
        this.rhythmPatternsMatch(currentPattern, learnedPattern.pattern)
      );
      
      if (matchingPattern) {
        const targetTime = windowNotes[2].startTime;
        let existingScore = changeScores.find(cs => Math.abs(cs.time - targetTime) < grid.ticksPerBeat / 4);
        
        const boostFactor = 0.2 * (parseFloat(matchingPattern.percentage) / 100); // Scale by pattern frequency
        
        if (existingScore) {
          existingScore.score += boostFactor;
          existingScore.features.rhythmBoost = boostFactor;
          boosts++;
        } else {
          changeScores.push({
            time: targetTime,
            score: boostFactor,
            features: {
              type: 'rhythm-pattern',
              rhythmBoost: boostFactor,
              patternFrequency: matchingPattern.percentage
            }
          });
          boosts++;
        }
      }
    }
    
    return boosts;
  }
  
  // Apply boosts based on learned interval patterns
  applyIntervalPatternBoosts(changeScores, grid) {
    let boosts = 0;
    const cp = this.learnedPatterns.comprehensivePatterns;
    
    // Sort change scores by time to find intervals
    const sortedScores = [...changeScores].sort((a, b) => a.time - b.time);
    
    for (let i = 1; i < sortedScores.length; i++) {
      const interval = sortedScores[i].time - sortedScores[i-1].time;
      const quantizedInterval = Math.round(interval / 480) * 480;
      
      // Check if this interval matches learned patterns
      const matchingInterval = cp.intervalPatterns.find(pattern => 
        Math.abs(pattern.interval - quantizedInterval) < 240 // 0.5 beat tolerance
      );
      
      if (matchingInterval) {
        const boostFactor = 0.15 * (parseFloat(matchingInterval.percentage) / 100);
        sortedScores[i].score += boostFactor;
        sortedScores[i].features.intervalBoost = boostFactor;
        boosts++;
      }
    }
    
    return boosts;
  }
  
  // Check if two rhythm patterns match
  rhythmPatternsMatch(pattern1, pattern2) {
    // Simple comparison - in practice could be more sophisticated
    try {
      const sig1 = JSON.stringify(pattern1);
      const sig2 = JSON.stringify(pattern2);
      return sig1 === sig2;
    } catch (e) {
      return false;
    }
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
    if (weightedScores.length < 1) {
      console.log('No weighted scores available, using fallback strategy');
      return this.createFallbackBoundaries(grid);
    }
    
    const peaks = [];
    const minPhraseLength = Math.max(grid.ticksPerBeat * 2, 192); // Minimum 2 beats for meaningful phrases
    
    // Sort scores by weighted value to find most significant changes
    const sortedScores = [...weightedScores].sort((a, b) => b.weightedScore - a.weightedScore);
    
    // Use adaptive threshold based on the score distribution  
    const maxScore = sortedScores[0]?.weightedScore || 0;
    const avgScore = weightedScores.reduce((sum, s) => sum + s.weightedScore, 0) / weightedScores.length;
    const dynamicThreshold = Math.max(0.4, Math.min(maxScore * 0.5, avgScore * 2.0)); // More conservative thresholds
    
    console.log('Peak detection parameters:', {
      totalScores: weightedScores.length,
      maxScore: maxScore.toFixed(3),
      avgScore: avgScore.toFixed(3),
      threshold: dynamicThreshold.toFixed(3),
      minPhraseLength
    });
    
    // Find all significant peaks above threshold
    const candidatePeaks = [];
    for (let i = 0; i < weightedScores.length; i++) {
      const current = weightedScores[i];
      
      // Check if above threshold
      if (current.weightedScore >= dynamicThreshold) {
        // Check if local maximum (or allow boundary values)
        const isLocalMax = (i === 0 || current.weightedScore >= weightedScores[i - 1].weightedScore) &&
                          (i === weightedScores.length - 1 || current.weightedScore >= weightedScores[i + 1].weightedScore);
        
        if (isLocalMax) {
          candidatePeaks.push(current);
        }
      }
    }
    
    // Sort candidate peaks by time and select based on distance
    candidatePeaks.sort((a, b) => a.time - b.time);
    
    for (const peak of candidatePeaks) {
      // Ensure minimum distance from previous peak
      if (peaks.length === 0 || peak.time - peaks[peaks.length - 1] >= minPhraseLength) {
        peaks.push(peak.time);
      }
    }
    
    console.log('Detected peaks:', peaks.length, peaks);
    
    // Only fall back if we get too few peaks for the music length
    const expectedMinPhrases = Math.max(2, Math.min(6, Math.ceil(grid.totalTicks / (grid.ticksPerMeasure * 2))));
    if (peaks.length < expectedMinPhrases - 1) {
      console.log(`Too few peaks (${peaks.length}) for expected ${expectedMinPhrases} phrases, using hybrid approach`);
      return this.createHybridBoundaries(peaks, grid);
    }
    
    return peaks;
  }

  createHybridBoundaries(detectedPeaks, grid) {
    const totalTicks = grid.totalTicks;
    const peaks = [...detectedPeaks]; // Keep detected peaks
    
    // Add strategic fallback boundaries if needed
    const expectedPhrases = Math.max(2, Math.min(6, Math.ceil(totalTicks / (grid.ticksPerMeasure * 2))));
    const neededBoundaries = Math.max(0, expectedPhrases - 1 - peaks.length);
    
    if (neededBoundaries > 0) {
      // Fill gaps with evenly spaced boundaries
      const segments = expectedPhrases;
      const segmentLength = totalTicks / segments;
      
      for (let i = 1; i < segments; i++) {
        const candidateTime = i * segmentLength;
        
        // Only add if not too close to existing peaks
        const tooClose = peaks.some(peak => Math.abs(peak - candidateTime) < grid.ticksPerBeat);
        if (!tooClose) {
          peaks.push(candidateTime);
        }
      }
    }
    
    // Sort and return
    peaks.sort((a, b) => a - b);
    console.log('Hybrid boundaries created:', peaks);
    return peaks;
  }

  createFallbackBoundaries(grid) {
    const totalTicks = grid.totalTicks;
    const peaks = [];
    
    // For very short pieces (less than 2 measures), create 2-3 phrases
    if (totalTicks < grid.ticksPerMeasure * 2) {
      const numPhrases = Math.max(2, Math.min(3, Math.ceil(totalTicks / (grid.ticksPerBeat * 2))));
      const segmentLength = totalTicks / numPhrases;
      
      for (let i = 1; i < numPhrases; i++) {
        peaks.push(i * segmentLength);
      }
    } else {
      // For longer pieces, use measure-based segmentation
      const numPhrases = Math.min(4, Math.max(2, Math.ceil(totalTicks / grid.ticksPerMeasure)));
      const segmentLength = totalTicks / numPhrases;
      
      for (let i = 1; i < numPhrases; i++) {
        peaks.push(i * segmentLength);
      }
    }
    
    console.log('Created fallback boundaries:', peaks);
    return peaks;
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

  // Intelligent phrase merging for better musical coherence
  mergeFragmentedPhrases(phrases, grid) {
    if (phrases.length <= 1) return phrases;
    
    const mergedPhrases = [];
    let currentPhrase = phrases[0];
    
    for (let i = 1; i < phrases.length; i++) {
      const nextPhrase = phrases[i];
      
      // Calculate characteristics for merge decision
      const shouldMerge = this.shouldMergePhrases(currentPhrase, nextPhrase, grid);
      
      if (shouldMerge) {
        // Merge the phrases
        currentPhrase = {
          start: currentPhrase.start,
          end: nextPhrase.end,
          notes: [...currentPhrase.notes, ...nextPhrase.notes]
        };
      } else {
        // Keep current phrase and move to next
        mergedPhrases.push(currentPhrase);
        currentPhrase = nextPhrase;
      }
    }
    
    // Add the final phrase
    mergedPhrases.push(currentPhrase);
    
    return mergedPhrases;
  }
  
  shouldMergePhrases(phrase1, phrase2, grid) {
    // Calculate phrase durations in beats
    const duration1 = (phrase1.end - phrase1.start) / grid.ticksPerBeat;
    const duration2 = (phrase2.end - phrase2.start) / grid.ticksPerBeat;
    const gap = (phrase2.start - phrase1.end) / grid.ticksPerBeat;
    
    // Only merge very small fragments, let measure-based analysis handle the rest
    
    // Rule 1: Merge single-note phrases with very small gaps
    if (phrase1.notes.length === 1 && phrase2.notes.length === 1 && gap < 0.5) {
      return true;
    }
    
    // Rule 2: Merge if both phrases are extremely short (< 0.5 beats each)
    if (duration1 < 0.5 && duration2 < 0.5) {
      return true;
    }
    
    // Rule 3: Merge if gap is tiny (notes probably belong together)
    if (gap < 0.25) {
      return true;
    }
    
    // Rule 4: Merge if first phrase is a single short note and gap is small
    if (phrase1.notes.length === 1 && duration1 < 1 && gap < 1) {
      return true;
    }
    
    return false;
  }

  createMeasureAlignedPhrases(phrases, grid) {
    // Create phrases based on measure boundaries (1, 2, 4, 8 measures) as suggested by Kanade-dev
    const measureLength = grid.ticksPerMeasure;
    const totalTicks = grid.totalTicks;
    const newPhrases = [];
    
    // Calculate optimal phrase lengths for this piece
    const preferredMeasureCounts = [2, 4, 8, 1]; // Priority order: 2, 4, 8, then 1 measure phrases
    
    let currentTick = 0;
    
    while (currentTick < totalTicks) {
      let bestPhraseLength = measureLength; // Default to 1 measure
      
      // Try different measure counts to find the best fit
      for (const measureCount of preferredMeasureCounts) {
        const candidateLength = measureCount * measureLength;
        const remainingTicks = totalTicks - currentTick;
        
        // If this phrase length fits well and aligns with musical structure
        if (candidateLength <= remainingTicks && 
            (candidateLength <= remainingTicks * 0.8 || candidateLength === remainingTicks)) {
          
          // Check if there are notes in this range
          const notesInRange = this.getNotesInRange(phrases, currentTick, currentTick + candidateLength);
          
          if (notesInRange.length > 0) {
            bestPhraseLength = candidateLength;
            break;
          }
        }
      }
      
      // Create phrase for this measure-based segment
      const phraseEnd = Math.min(currentTick + bestPhraseLength, totalTicks);
      const notesInPhrase = this.getNotesInRange(phrases, currentTick, phraseEnd);
      
      if (notesInPhrase.length > 0) {
        newPhrases.push({
          start: currentTick,
          end: phraseEnd,
          notes: notesInPhrase
        });
      }
      
      currentTick = phraseEnd;
    }
    
    return newPhrases;
  }

  getNotesInRange(phrases, startTick, endTick) {
    const notesInRange = [];
    
    phrases.forEach(phrase => {
      phrase.notes.forEach(note => {
        if (note.time >= startTick && note.time < endTick) {
          notesInRange.push(note);
        }
      });
    });
    
    return notesInRange.sort((a, b) => a.time - b.time);
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

  // Analyze phrase markers from training MIDI files (C6 = 96, A5 = 93, B5 = 95)
  extractPhraseMarkers(track) {
    const markers = {
      phraseBoundaries: [], // C6 notes (pitch 96) - strongest phrase boundaries
      strongNuanceMarkers: [], // A5 notes (pitch 93) - strong groove/rhythm peaks
      nuanceMarkers: []     // B5 notes (pitch 95) - subtle nuance variations
    };
    
    const noteEvents = track.filter(event => this.isNoteOn(event));
    
    noteEvents.forEach(event => {
      if (event.data1 === 96) { // C6 - main phrase boundary
        markers.phraseBoundaries.push({
          time: event.time,
          pitch: event.data1,
          velocity: event.data2,
          type: 'phrase'
        });
      } else if (event.data1 === 93) { // A5 - strong groove/rhythm peak
        markers.strongNuanceMarkers.push({
          time: event.time,
          pitch: event.data1,
          velocity: event.data2,
          type: 'strongNuance'
        });
      } else if (event.data1 === 95) { // B5 - subtle nuance marker
        markers.nuanceMarkers.push({
          time: event.time,
          pitch: event.data1,
          velocity: event.data2,
          type: 'nuance'
        });
      }
    });
    
    console.log('Phrase markers extracted:', {
      phraseBoundaries: markers.phraseBoundaries.length,
      strongNuanceMarkers: markers.strongNuanceMarkers.length,
      nuanceMarkers: markers.nuanceMarkers.length,
      boundaries: markers.phraseBoundaries.map(m => m.time),
      strongNuances: markers.strongNuanceMarkers.map(m => m.time),
      nuances: markers.nuanceMarkers.map(m => m.time)
    });
    
    return markers;
  }

  // Learn phrase patterns from training data
  analyzeTrainingPhrases(track, notes) {
    const markers = this.extractPhraseMarkers(track);
    const analysis = {
      markerCount: markers.phraseBoundaries.length + markers.strongNuanceMarkers.length + markers.nuanceMarkers.length,
      phraseFeatures: [],
      strongNuanceFeatures: [],
      nuanceFeatures: []
    };
    
    if (markers.phraseBoundaries.length === 0) {
      return null; // Not a training file
    }
    
    // Analyze musical features around each phrase boundary
    markers.phraseBoundaries.forEach(boundary => {
      const features = this.analyzeBoundaryContext(boundary.time, notes);
      analysis.phraseFeatures.push({
        time: boundary.time,
        ...features,
        type: 'phrase'
      });
    });
    
    // Analyze musical features around each strong nuance marker (A5)
    markers.strongNuanceMarkers.forEach(strongNuance => {
      const features = this.analyzeBoundaryContext(strongNuance.time, notes);
      analysis.strongNuanceFeatures.push({
        time: strongNuance.time,
        ...features,
        type: 'strongNuance'
      });
    });
    
    // Analyze musical features around each nuance marker (B5)
    markers.nuanceMarkers.forEach(nuance => {
      const features = this.analyzeBoundaryContext(nuance.time, notes);
      analysis.nuanceFeatures.push({
        time: nuance.time,
        ...features,
        type: 'nuance'
      });
    });
    
    // **ENHANCED LEARNING**: Extract additional patterns from training data
    // Since marker materials are limited, maximize learning from available data
    this.extractComprehensivePatterns(track, notes, analysis, markers);
    
    console.log('Training phrase analysis:', {
      phraseBoundaries: analysis.phraseFeatures.length,
      strongNuanceMarkers: analysis.strongNuanceFeatures.length,
      nuanceMarkers: analysis.nuanceFeatures.length,
      avgPhraseDuration: this.calculateAveragePhraseDuration(markers.phraseBoundaries),
      features: analysis.phraseFeatures.slice(0, 3), // Show first few features
      comprehensivePatterns: analysis.comprehensivePatterns ? Object.keys(analysis.comprehensivePatterns).length : 0
    });
    
    return analysis;
  }

  // Extract comprehensive patterns from limited training data
  extractComprehensivePatterns(track, notes, analysis, markers) {
    analysis.comprehensivePatterns = {};
    
    // 1. Analyze repetition patterns around markers
    const repetitionBoundaries = this.findRepetitionBoundaries(notes);
    analysis.comprehensivePatterns.repetitionAlignment = this.analyzeMarkerRepetitionAlignment(
      markers, repetitionBoundaries
    );
    
    // 2. Analyze chord progression patterns
    const chordBoundaries = this.findChordChangeBoundaries(track, notes);
    analysis.comprehensivePatterns.chordAlignment = this.analyzeMarkerChordAlignment(
      markers, chordBoundaries
    );
    
    // 3. Analyze rhythmic patterns around markers
    analysis.comprehensivePatterns.rhythmicPatterns = this.analyzeRhythmicPatterns(
      markers, notes
    );
    
    // 4. Analyze interval patterns between phrases
    analysis.comprehensivePatterns.intervalPatterns = this.analyzeIntervalPatterns(
      markers.phraseBoundaries, notes
    );
    
    // 5. Analyze phrase length distribution patterns
    analysis.comprehensivePatterns.lengthPatterns = this.analyzeLengthPatterns(
      markers.phraseBoundaries
    );
    
    console.log('Comprehensive pattern extraction:', {
      repetitionAlignments: analysis.comprehensivePatterns.repetitionAlignment.matches,
      chordAlignments: analysis.comprehensivePatterns.chordAlignment.matches,
      rhythmicPatterns: analysis.comprehensivePatterns.rhythmicPatterns.patterns.length,
      intervalPatterns: analysis.comprehensivePatterns.intervalPatterns.commonIntervals.length,
      lengthPatterns: analysis.comprehensivePatterns.lengthPatterns.categories.length
    });
  }
  
  // Analyze how markers align with detected repetitions
  analyzeMarkerRepetitionAlignment(markers, repetitionBoundaries) {
    const alignment = { matches: 0, patterns: [] };
    const tolerance = 480; // 1 beat tolerance
    
    markers.phraseBoundaries.forEach(marker => {
      const nearbyRepetition = repetitionBoundaries.find(rep => 
        Math.abs(rep - marker.time) < tolerance
      );
      if (nearbyRepetition) {
        alignment.matches++;
        alignment.patterns.push({
          markerTime: marker.time,
          repetitionTime: nearbyRepetition,
          offset: nearbyRepetition - marker.time
        });
      }
    });
    
    return alignment;
  }
  
  // Analyze how markers align with chord changes
  analyzeMarkerChordAlignment(markers, chordBoundaries) {
    const alignment = { matches: 0, patterns: [] };
    const tolerance = 480; // 1 beat tolerance
    
    markers.phraseBoundaries.forEach(marker => {
      const nearbyChordChange = chordBoundaries.find(chord => 
        Math.abs(chord - marker.time) < tolerance
      );
      if (nearbyChordChange) {
        alignment.matches++;
        alignment.patterns.push({
          markerTime: marker.time,
          chordTime: nearbyChordChange,
          offset: nearbyChordChange - marker.time
        });
      }
    });
    
    return alignment;
  }
  
  // Analyze rhythmic patterns around markers
  analyzeRhythmicPatterns(markers, notes) {
    const patterns = { patterns: [], commonRhythms: [] };
    const windowSize = 1920; // 2 beats
    
    markers.phraseBoundaries.forEach(marker => {
      const windowNotes = notes.filter(n => 
        n.startTime >= marker.time - windowSize && 
        n.startTime < marker.time + windowSize
      );
      
      if (windowNotes.length > 0) {
        const rhythmPattern = this.extractRhythmPattern(windowNotes, marker.time);
        patterns.patterns.push(rhythmPattern);
      }
    });
    
    // Find common rhythmic patterns
    patterns.commonRhythms = this.findCommonRhythms(patterns.patterns);
    
    return patterns;
  }
  
  // Extract rhythm pattern around a marker
  extractRhythmPattern(notes, centerTime) {
    const pattern = {
      beforeMarker: [],
      afterMarker: []
    };
    
    notes.forEach(note => {
      const relativeTime = note.startTime - centerTime;
      const rhythmicValue = this.quantizeToRhythmicGrid(relativeTime);
      
      if (relativeTime < 0) {
        pattern.beforeMarker.push(rhythmicValue);
      } else {
        pattern.afterMarker.push(rhythmicValue);
      }
    });
    
    return pattern;
  }
  
  // Quantize timing to rhythmic grid for pattern matching
  quantizeToRhythmicGrid(timeOffset) {
    const grid = 96; // 16th note grid
    return Math.round(timeOffset / grid) * grid;
  }
  
  // Find common rhythmic patterns across multiple markers
  findCommonRhythms(patterns) {
    const commonRhythms = [];
    const threshold = Math.max(2, Math.floor(patterns.length * 0.3)); // 30% threshold
    
    // Simple pattern frequency analysis
    const patternCounts = {};
    patterns.forEach(pattern => {
      const signature = JSON.stringify(pattern);
      patternCounts[signature] = (patternCounts[signature] || 0) + 1;
    });
    
    Object.entries(patternCounts).forEach(([signature, count]) => {
      if (count >= threshold) {
        commonRhythms.push({
          pattern: JSON.parse(signature),
          frequency: count,
          percentage: (count / patterns.length * 100).toFixed(1)
        });
      }
    });
    
    return commonRhythms;
  }
  
  // Analyze interval patterns between phrase boundaries
  analyzeIntervalPatterns(boundaries) {
    const patterns = { intervals: [], commonIntervals: [] };
    
    for (let i = 1; i < boundaries.length; i++) {
      const interval = boundaries[i].time - boundaries[i-1].time;
      patterns.intervals.push(interval);
    }
    
    // Find common interval lengths
    const intervalCounts = {};
    patterns.intervals.forEach(interval => {
      const quantized = Math.round(interval / 480) * 480; // Quantize to beat grid
      intervalCounts[quantized] = (intervalCounts[quantized] || 0) + 1;
    });
    
    // Extract most common intervals
    patterns.commonIntervals = Object.entries(intervalCounts)
      .map(([interval, count]) => ({
        interval: parseInt(interval),
        beats: parseInt(interval) / 480,
        frequency: count,
        percentage: (count / patterns.intervals.length * 100).toFixed(1)
      }))
      .filter(item => item.frequency >= 2)
      .sort((a, b) => b.frequency - a.frequency);
    
    return patterns;
  }
  
  // Analyze phrase length distribution patterns
  analyzeLengthPatterns(boundaries) {
    const patterns = { lengths: [], categories: [] };
    
    // Calculate phrase lengths
    for (let i = 1; i < boundaries.length; i++) {
      const length = boundaries[i].time - boundaries[i-1].time;
      patterns.lengths.push(length);
    }
    
    // Categorize phrase lengths
    const categories = {
      short: patterns.lengths.filter(l => l < 1920).length,    // < 2 beats
      medium: patterns.lengths.filter(l => l >= 1920 && l < 3840).length, // 2-4 beats
      long: patterns.lengths.filter(l => l >= 3840).length     // > 4 beats
    };
    
    patterns.categories = Object.entries(categories).map(([category, count]) => ({
      category,
      count,
      percentage: (count / patterns.lengths.length * 100).toFixed(1)
    }));
    
    return patterns;
  }
  
  // Analyze musical context around a boundary point
  analyzeBoundaryContext(boundaryTime, notes, windowSize = 960) { // 1 beat window
    const beforeNotes = notes.filter(n => 
      n.startTime >= boundaryTime - windowSize && n.startTime < boundaryTime
    );
    const afterNotes = notes.filter(n => 
      n.startTime >= boundaryTime && n.startTime < boundaryTime + windowSize
    );
    
    return {
      restDuration: this.calculateRestBefore(boundaryTime, notes),
      pitchChange: this.calculatePitchChange(beforeNotes, afterNotes),
      velocityChange: this.calculateVelocityChange(beforeNotes, afterNotes),
      densityChange: this.calculateDensityChange(beforeNotes, afterNotes),
      beforeDensity: beforeNotes.length,
      afterDensity: afterNotes.length,
      beforeAvgPitch: beforeNotes.length > 0 ? beforeNotes.reduce((sum, n) => sum + n.pitch, 0) / beforeNotes.length : 60,
      afterAvgPitch: afterNotes.length > 0 ? afterNotes.reduce((sum, n) => sum + n.pitch, 0) / afterNotes.length : 60
    };
  }
  
  calculateRestBefore(boundaryTime, notes) {
    const notesBefore = notes.filter(n => n.endTime <= boundaryTime).sort((a, b) => b.endTime - a.endTime);
    if (notesBefore.length === 0) return 0;
    
    return boundaryTime - notesBefore[0].endTime;
  }
  
  calculatePitchChange(beforeNotes, afterNotes) {
    if (beforeNotes.length === 0 || afterNotes.length === 0) return 0;
    
    const beforeAvg = beforeNotes.reduce((sum, n) => sum + n.pitch, 0) / beforeNotes.length;
    const afterAvg = afterNotes.reduce((sum, n) => sum + n.pitch, 0) / afterNotes.length;
    
    return Math.abs(afterAvg - beforeAvg);
  }
  
  calculateVelocityChange(beforeNotes, afterNotes) {
    if (beforeNotes.length === 0 || afterNotes.length === 0) return 0;
    
    const beforeAvg = beforeNotes.reduce((sum, n) => sum + n.velocity, 0) / beforeNotes.length;
    const afterAvg = afterNotes.reduce((sum, n) => sum + n.velocity, 0) / afterNotes.length;
    
    return Math.abs(afterAvg - beforeAvg);
  }
  
  calculateDensityChange(beforeNotes, afterNotes) {
    return Math.abs(afterNotes.length - beforeNotes.length);
  }
  
  calculateAveragePhraseDuration(boundaries) {
    if (boundaries.length < 2) return 0;
    
    let totalDuration = 0;
    for (let i = 1; i < boundaries.length; i++) {
      totalDuration += boundaries[i].time - boundaries[i-1].time;
    }
    
    return totalDuration / (boundaries.length - 1);
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
    
    // Apply enhanced melodic peak emphasis for dynamic expression
    const melodyNote = analysis.melody.notes.find(m => 
      Math.abs(m.time - eventIndex * 10) < 50 && m.pitch === note
    );
    
    if (melodyNote) {
      const peak = analysis.melody.peaks.find(p => 
        Math.abs(analysis.melody.notes[p.index].time - melodyNote.time) < 96
      );
      
      if (peak) {
        // Create more dramatic emphasis for melodic peaks
        let peakBoost = intensity * peak.intensity * 0.5;
        
        // Style-specific peak emphasis
        switch(style) {
          case 'classical':
            // Classical music: more dramatic peaks with approach and departure
            peakBoost *= 1.6;
            break;
          case 'jazz':
            // Jazz: accent syncopated and off-beat peaks more
            peakBoost *= 1.2;
            break;
          case 'pop':
            // Pop: consistent but moderate peak emphasis
            peakBoost *= 0.9;
            break;
        }
        
        adjustment += peakBoost;
        
        // Add approach and departure to peaks for more natural expression
        const peakNote = analysis.melody.notes[peak.index];
        const approachDistance = Math.abs(melodyNote.time - peakNote.time) / 96; // Distance in beats
        if (approachDistance < 2) {
          const approachFactor = 1 - (approachDistance / 2);
          adjustment += intensity * approachFactor * 0.3; // Buildup to peak
        }
      } else {
        // Non-peak notes: slight reduction for contrast
        adjustment -= intensity * 0.1;
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
    
    // Apply enhanced phrase-based dynamics for human-like expression
    const phrase = analysis.phrasing.find(p => 
      eventIndex * 10 >= p.start && eventIndex * 10 <= p.end
    );
    
    if (phrase) {
      const phrasePosition = (eventIndex * 10 - phrase.start) / (phrase.end - phrase.start);
      const phraseDuration = (phrase.end - phrase.start) / 480; // Convert to seconds
      
      // Create more sophisticated phrase dynamics based on musical expression principles
      let phraseAdjustment = 0;
      
      // Different dynamic curves based on phrase length and style
      if (phraseDuration < 2) {
        // Short phrases: gentle crescendo to 70%, then diminuendo
        if (phrasePosition < 0.7) {
          phraseAdjustment = intensity * Math.sin(phrasePosition * Math.PI * 0.7) * 12;
        } else {
          phraseAdjustment = intensity * Math.sin((1 - phrasePosition) * Math.PI * 2) * 8;
        }
      } else if (phraseDuration < 4) {
        // Medium phrases: build to 60%, sustain, then diminuendo
        if (phrasePosition < 0.4) {
          phraseAdjustment = intensity * (phrasePosition / 0.4) * 15;
        } else if (phrasePosition < 0.7) {
          phraseAdjustment = intensity * 15; // Sustained intensity
        } else {
          phraseAdjustment = intensity * (1 - phrasePosition) * 20;
        }
      } else {
        // Long phrases: complex multi-peak dynamics
        const peaks = Math.floor(phraseDuration / 2); // One peak every 2 seconds
        const peakPosition = phrasePosition * peaks;
        const localPosition = peakPosition - Math.floor(peakPosition);
        phraseAdjustment = intensity * Math.sin(localPosition * Math.PI) * 10;
        
        // Overall phrase arc
        if (phrasePosition < 0.3) {
          phraseAdjustment += intensity * phrasePosition * 8;
        } else if (phrasePosition > 0.8) {
          phraseAdjustment -= intensity * (phrasePosition - 0.8) * 25;
        }
      }
      
      // Style-specific adjustments to phrase dynamics
      switch(style) {
        case 'classical':
          // More dramatic crescendos and diminuendos
          phraseAdjustment *= 1.4;
          break;
        case 'jazz':
          // More irregular, syncopated dynamics
          phraseAdjustment *= (0.8 + Math.sin(phrasePosition * Math.PI * 4) * 0.3);
          break;
        case 'pop':
          // More consistent, less dramatic changes
          phraseAdjustment *= 0.7;
          break;
      }
      
      adjustment += phraseAdjustment;
    }
    
    // Add inter-phrase dynamics for larger musical arc
    if (analysis.phrasing && analysis.phrasing.length > 1) {
      const currentPhraseIndex = analysis.phrasing.findIndex(p => 
        eventIndex * 10 >= p.start && eventIndex * 10 <= p.end
      );
      
      if (currentPhraseIndex !== -1) {
        const totalPhrases = analysis.phrasing.length;
        const phraseProgress = currentPhraseIndex / Math.max(1, totalPhrases - 1);
        
        // Create overall musical arc across all phrases
        let arcAdjustment = 0;
        
        if (totalPhrases <= 3) {
          // Short pieces: gentle overall crescendo then diminuendo
          if (phraseProgress < 0.6) {
            arcAdjustment = intensity * phraseProgress * 8;
          } else {
            arcAdjustment = intensity * (1 - phraseProgress) * 10;
          }
        } else {
          // Longer pieces: more complex multi-wave dynamics
          const wavePosition = phraseProgress * Math.PI;
          arcAdjustment = intensity * Math.sin(wavePosition) * 6;
          
          // Add subtle terraced dynamics (stepwise changes between phrases)
          if (currentPhraseIndex > 0) {
            const isEvenPhrase = currentPhraseIndex % 2 === 0;
            arcAdjustment += intensity * (isEvenPhrase ? 3 : -2);
          }
        }
        
        adjustment += arcAdjustment;
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
    const existingSection = container.querySelector('.result');
    if (existingSection) {
      existingSection.remove();
    }
    
    // Create simplified integrated section
    const integratedSection = document.createElement('div');
    integratedSection.className = 'result';
    
    // Lightweight interface focused on essential features
    const simplifiedHtml = `
      <div class="success-header">
        <h3>ヒューマナイズ完了</h3>
        <p>処理が完了しました。以下で結果をプレビューしてダウンロードできます。</p>
      </div>
      
      <div class="playback-section section">
        <h4>再生とプレビュー</h4>
        <div class="playback-controls">
          <button class="play-button" onclick="midiHumanizer.playOriginal()">オリジナル再生</button>
          <button class="play-button" onclick="midiHumanizer.playHumanized()">ヒューマナイズ後再生</button>
        </div>
        
        <div class="midi-visualizer-container">
          <h5>MIDIビジュアライザー</h5>
          <div id="midiVisualization" class="midi-visualization">
            <div id="visualizationCanvas"></div>
          </div>
          <div class="visualization-controls">
            <button onclick="midiHumanizer.showVisualization('timeline', this)" class="viz-button active">タイムライン表示</button>
            <button onclick="midiHumanizer.showVisualization('phrases', this)" class="viz-button">フレーズ構造</button>
          </div>
        </div>
      </div>
      
      <div class="phrase-analysis-section section">
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
    
    // Initialize with lightweight visualization
    this.showVisualization('timeline');
    
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
      </div>
    `;
  }

  showVisualization(mode, targetButton = null) {
    this.currentVisualizationMode = mode;
    
    // Update button states (lightweight)
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
    
    // Render lightweight visualizations
    switch(mode) {
      case 'timeline':
        this.renderLightweightTimeline();
        break;
      case 'phrases':
        this.renderLightweightPhrases();
        break;
    }
  }

  renderLightweightTimeline() {
    const canvas = document.getElementById('visualizationCanvas');
    if (!canvas) return;
    
    const originalNotes = this.extractNotesFromMIDI(this.originalMidiData);
    const humanizedNotes = this.extractNotesFromMIDI(this.humanizedMidiData);
    const phrases = this.lastAnalysis?.tracks[0]?.phrasing || [];
    
    // Calculate total duration
    const totalDuration = Math.max(
      originalNotes.length > 0 ? Math.max(...originalNotes.map(n => n.endTime)) : 0,
      humanizedNotes.length > 0 ? Math.max(...humanizedNotes.map(n => n.endTime)) : 0
    ) || 1000; // Default 1 second if no notes
    
    // PicoTune-style piano roll interface
    canvas.innerHTML = `
      <div class="picotune-piano-roll">
        <h4>PicoTune風MIDIビジュアライザー</h4>
        <div class="piano-roll-info">
          <div class="bpm-info">
            <span class="bpm-label">BPM 120</span>
            <span class="beat-info">BEAT 4/4</span>
          </div>
          <div class="time-info">
            <span class="current-time">TIME 0:00</span>
            <span class="total-time">/ ${this.formatTime(totalDuration)}</span>
          </div>
        </div>
        <div class="piano-roll-container">
          ${this.renderPianoRoll(originalNotes, humanizedNotes, totalDuration)}
        </div>
        <div class="piano-roll-controls">
          <div class="playback-controls">
            <button class="control-btn" onclick="midiHumanizer.seekBackward()">⏮</button>
            <button class="control-btn play-pause" onclick="midiHumanizer.togglePlayback()">⏸</button>
            <button class="control-btn" onclick="midiHumanizer.seekForward()">⏭</button>
            <button class="control-btn" onclick="midiHumanizer.downloadMIDI()">⬇</button>
            <div class="volume-control">
              <span>🔊</span>
              <input type="range" min="0" max="100" value="80" class="volume-slider">
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  renderPianoRoll(originalNotes, humanizedNotes, totalDuration) {
    // Piano roll inspired by PicoTune interface
    const allNotes = [...originalNotes, ...humanizedNotes];
    if (allNotes.length === 0) return '<div class="no-notes">No notes to display</div>';
    
    // Calculate note range for piano keys
    const minPitch = Math.min(...allNotes.map(n => n.pitch));
    const maxPitch = Math.max(...allNotes.map(n => n.pitch));
    const pitchRange = Math.max(24, maxPitch - minPitch + 12); // Show at least 2 octaves
    
    // Adjust range to include full octaves
    const startPitch = Math.floor((minPitch - 6) / 12) * 12;
    const endPitch = startPitch + Math.ceil(pitchRange / 12) * 12;
    
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteHeight = 25; // Height of each note row in pixels (increased from 20)
    const rollHeight = (endPitch - startPitch) * noteHeight;
    
    // Generate piano keys
    const pianoKeys = [];
    for (let pitch = endPitch - 1; pitch >= startPitch; pitch--) {
      const noteName = noteNames[pitch % 12];
      const octave = Math.floor(pitch / 12) - 1;
      const isBlackKey = noteName.includes('#');
      pianoKeys.push({
        pitch,
        name: noteName,
        octave,
        displayName: noteName + octave,
        isBlackKey
      });
    }
    
    return `
      <div class="piano-roll-viewport">
        <!-- Piano keyboard on the left -->
        <div class="piano-keyboard">
          ${pianoKeys.map(key => `
            <div class="piano-key ${key.isBlackKey ? 'black-key' : 'white-key'}" 
                 style="height: ${noteHeight}px;"
                 data-pitch="${key.pitch}">
              <span class="key-label">${key.displayName}</span>
            </div>
          `).join('')}
        </div>
        
        <!-- Grid and notes area -->
        <div class="piano-roll-grid-container">
          <!-- Background grid -->
          <div class="piano-roll-grid" style="height: ${rollHeight}px;">
            ${this.renderPianoRollGrid(totalDuration, rollHeight, noteHeight)}
          </div>
          
          <!-- Original notes -->
          <div class="notes-layer original-notes">
            ${originalNotes.map(note => this.renderNote(note, startPitch, endPitch, totalDuration, noteHeight, 'original')).join('')}
          </div>
          
          <!-- Humanized notes -->
          <div class="notes-layer humanized-notes">
            ${humanizedNotes.map(note => this.renderNote(note, startPitch, endPitch, totalDuration, noteHeight, 'humanized')).join('')}
          </div>
          
          <!-- Phrase boundaries -->
          <div class="phrase-boundaries-layer">
            ${this.renderPhraseBoundaries(this.lastAnalysis?.tracks[0]?.phrasing || [], totalDuration, rollHeight)}
          </div>
        </div>
      </div>
    `;
  }
  
  renderPianoRollGrid(totalDuration, rollHeight, noteHeight) {
    const seconds = totalDuration / 1000;
    const gridLines = [];
    
    // Vertical time grid lines (every 0.5 seconds)
    for (let time = 0; time <= seconds; time += 0.5) {
      const position = (time / seconds) * 100;
      const isMainGrid = time % 2 === 0;
      gridLines.push(`
        <div class="grid-line vertical ${isMainGrid ? 'main' : 'sub'}" 
             style="left: ${position}%;">
        </div>
      `);
    }
    
    // Horizontal note grid lines
    const numRows = rollHeight / noteHeight;
    for (let i = 0; i <= numRows; i++) {
      const position = (i / numRows) * 100;
      gridLines.push(`
        <div class="grid-line horizontal" style="top: ${position}%;"></div>
      `);
    }
    
    return gridLines.join('');
  }
  
  renderNote(note, startPitch, endPitch, totalDuration, noteHeight, type) {
    const leftPos = (note.startTime / totalDuration) * 100;
    const width = Math.max(0.5, ((note.endTime - note.startTime) / totalDuration) * 100);
    const noteRow = endPitch - 1 - note.pitch;
    const topPos = (noteRow / (endPitch - startPitch)) * 100;
    const velocity = note.velocity / 127;
    
    return `
      <div class="piano-note ${type}" 
           style="
             left: ${leftPos}%; 
             width: ${width}%; 
             top: ${topPos}%; 
             height: ${(1 / (endPitch - startPitch)) * 100}%;
             opacity: ${0.7 + velocity * 0.3};
           "
           title="${this.getNoteDisplayName(note.pitch)} - Velocity: ${note.velocity} - Duration: ${((note.endTime - note.startTime) / 1000).toFixed(2)}s"
           data-pitch="${note.pitch}"
           data-start="${note.startTime}"
           data-end="${note.endTime}">
      </div>
    `;
  }
  
  renderPhraseBoundaries(phrases, totalDuration, rollHeight) {
    if (!phrases || phrases.length === 0) return '';
    
    return phrases.map((phrase, index) => {
      const startPos = (phrase.start / totalDuration) * 100;
      const endPos = (phrase.end / totalDuration) * 100;
      
      return `
        <div class="phrase-boundary-line start" 
             style="left: ${startPos}%; height: 100%;"
             title="フレーズ ${index + 1} 開始">
        </div>
        <div class="phrase-boundary-line end" 
             style="left: ${endPos}%; height: 100%;"
             title="フレーズ ${index + 1} 終了">
        </div>
        <div class="phrase-region-overlay" 
             style="left: ${startPos}%; width: ${endPos - startPos}%; height: 100%;"
             title="フレーズ ${index + 1}">
        </div>
      `;
    }).join('');
  }
  
  getNoteDisplayName(pitch) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteName = noteNames[pitch % 12];
    const octave = Math.floor(pitch / 12) - 1;
    return noteName + octave;
  }
  
  formatTime(timeMs) {
    const seconds = Math.floor(timeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  
  // Placeholder methods for controls
  seekBackward() {
    console.log('Seek backward');
  }
  
  togglePlayback() {
    console.log('Toggle playback');
  }
  
  seekForward() {
    console.log('Seek forward');
  }
  
  downloadMIDI() {
    // Trigger existing download functionality
    const downloadLink = document.querySelector('a[href^="blob:"]');
    if (downloadLink) {
      downloadLink.click();
    }
  }
  
  renderTimeGrid(totalDuration, widthPx) {
    const gridLines = [];
    const seconds = totalDuration / 1000;
    const interval = seconds > 20 ? 5 : (seconds > 10 ? 2 : (seconds > 5 ? 1 : 0.5));
    
    for (let time = 0; time <= seconds; time += interval) {
      const position = (time / seconds) * widthPx;
      const isMainGrid = time % (interval * 2) === 0;
      gridLines.push(`
        <div style="
          position: absolute; 
          left: ${position}px; 
          top: 0; 
          bottom: 0; 
          width: 1px; 
          background: ${isMainGrid ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.08)'}; 
          z-index: 0;
        "></div>
      `);
    }
    
    return gridLines.join('');
  }
  
  renderTimeRuler(totalDuration, widthPx) {
    const marks = [];
    const seconds = totalDuration / 1000;
    const interval = seconds > 20 ? 5 : (seconds > 10 ? 2 : (seconds > 5 ? 1 : 0.5));
    
    for (let time = 0; time <= seconds; time += interval) {
      const position = (time / seconds) * widthPx;
      marks.push(`
        <div style="
          position: absolute; 
          left: ${position}px; 
          top: 0; 
          height: 8px; 
          width: 1px; 
          background: #666;
          z-index: 2;
        "></div>
        <div style="
          position: absolute; 
          left: ${position - 15}px; 
          top: 10px; 
          width: 30px; 
          text-align: center; 
          font-size: 0.7rem; 
          color: #666;
          z-index: 2;
        ">${time.toFixed(1)}s</div>
      `);
    }
    
    return marks.join('');
  }
  
  generateTimeScale(totalDuration, width) {
    const marks = [];
    const seconds = totalDuration / 1000;
    const interval = seconds > 10 ? 2 : (seconds > 5 ? 1 : 0.5);
    
    for (let t = 0; t <= seconds; t += interval) {
      const percent = (t / seconds) * 100;
      marks.push(`
        <div style="position: absolute; left: ${percent}%; top: 0; border-left: 1px solid var(--border); height: 8px;"></div>
        <div style="position: absolute; left: ${percent}%; top: 10px; font-size: 0.7rem; color: var(--text-light); transform: translateX(-50%);">${t.toFixed(1)}s</div>
      `);
    }
    
    return marks.join('');
  }
  
  // Zoom control methods - removed for simplified interface
  adjustTimelineZoom(delta) {
    // Simplified: no zoom controls needed for lightweight visualizer
    return;
  }
  
  resetTimelineZoom() {
    // Simplified: no zoom controls needed for lightweight visualizer  
    return;
  }

  renderLightweightPhrases() {
    const canvas = document.getElementById('visualizationCanvas');
    if (!canvas) return;
    
    const phrases = this.lastAnalysis?.tracks[0]?.phrasing || [];
    
    canvas.innerHTML = `
      <div class="simple-phrases">
        <h4>フレーズ構造分析</h4>
        <div class="phrase-overview">
          <p>検出されたフレーズ数: <strong>${phrases.length}</strong></p>
          <p>平均フレーズ長: <strong>${this.calculateAveragePhraseLength(phrases).toFixed(1)}秒</strong></p>
          <p style="margin-top: 0.5rem; color: var(--text-light); font-size: 0.9rem;">
            <strong>Tip:</strong> タイムライン表示でフレーズの位置と構造を確認できます
          </p>
        </div>
        <div class="phrase-details" style="margin-top: 1.5rem;">
          ${phrases.map((phrase, index) => {
            const duration = ((phrase.end - phrase.start) / 480).toFixed(1);
            const noteCount = phrase.notes?.length || 0;
            const startTime = (phrase.start / 480).toFixed(1);
            const endTime = (phrase.end / 480).toFixed(1);
            return `
              <div class="phrase-detail" style="background: var(--bg-secondary); border-left: 4px solid var(--primary); padding: 1rem; margin-bottom: 0.5rem; border-radius: 0 var(--radius) var(--radius) 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                  <strong style="color: var(--primary);">フレーズ ${index + 1}</strong>
                  <span style="font-size: 0.9rem; color: var(--text-light);">${startTime}s - ${endTime}s</span>
                </div>
                <div style="display: flex; gap: 1rem; font-size: 0.9rem;">
                  <span>長さ: <strong>${duration}秒</strong></span>
                  <span>音数: <strong>${noteCount}音</strong></span>
                  <span>密度: <strong>${(noteCount / parseFloat(duration)).toFixed(1)}音/秒</strong></span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // Legacy heavy visualization functions removed for performance
  // These are replaced by lightweight alternatives above
  
  formatDuration(seconds) {
    if (seconds < 60) return `${seconds.toFixed(1)}秒`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds.toFixed(1)}秒`;
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
          ${this.renderTimeRuler(Math.max(...originalNotes.map(n => n.endTime)), canvas.clientWidth * this.zoomLevel)}
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
    this.zoomLevel = Math.max(0.5, Math.min(50, (this.zoomLevel || 5) + delta)); // Increased max zoom from 20 to 50
    // Re-render the current visualization mode
    if (this.currentVisualizationMode === 'phrases') {
      this.renderPhraseVisualization();
    } else {
      // Use the new lightweight timeline for consistency
      this.renderLightweightTimeline();
    }
  }

  resetZoom() {
    this.zoomLevel = 5;
    // Re-render the current visualization mode
    if (this.currentVisualizationMode === 'phrases') {
      this.renderPhraseVisualization();
    } else {
      // Use the new lightweight timeline for consistency
      this.renderLightweightTimeline();
    }
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