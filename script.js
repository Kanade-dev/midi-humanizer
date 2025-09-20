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
    this.updatePlaybackButtons();
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
      const stopTimeout = setTimeout(() => {
        this.stopPlayback();
      }, maxTime + 1000);
      
      this.currentPlayback.push(stopTimeout);
      
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
      this.hideElements(['result', 'error']);
    }
  }

  async processMIDIFile(file) {
    try {
      this.isProcessing = true;
      this.showProcessing();
      this.hideElements(['result', 'error']);

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
    
    // Perform musical analysis for intelligent humanization
    const musicalAnalysis = this.analyzeMusicStructure(midiData.tracks, style);
    
    const humanizedTracks = midiData.tracks.map((track, trackIndex) => 
      this.humanizeTrack(track, style, intensity, musicalAnalysis.tracks[trackIndex])
    );
    
    return {
      ...midiData,
      tracks: humanizedTracks
    };
  }

  humanizeTrack(track, style, intensity, trackAnalysis = null) {
    const humanizedEvents = [];
    const noteOnEvents = [];
    
    for (let i = 0; i < track.length; i++) {
      const event = { ...track[i] };
      
      if (this.isNoteOn(event)) {
        // Apply intelligent timing humanization based on musical context
        event.time = this.humanizeTimingIntelligent(event.time, event.data1, style, intensity, trackAnalysis, i);
        
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
          
          noteOnEvents.splice(noteOnIndex, 1);
        }
      }
      
      humanizedEvents.push(event);
    }
    
    // Sort events by time
    humanizedEvents.sort((a, b) => a.time - b.time);
    
    return humanizedEvents;
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
    const beatStrength = [1.0, 0.5, 0.75, 0.5]; // 4/4 beat strengths
    
    track.forEach(event => {
      if (this.isNoteOn(event)) {
        const beat = Math.floor((event.time / 96) % 4);
        const subbeat = (event.time / 24) % 4;
        
        if (!beats[beat]) beats[beat] = { count: 0, offbeat: 0 };
        beats[beat].count++;
        
        // Detect syncopation (notes on weak subdivisions)
        if (subbeat % 1 !== 0) beats[beat].offbeat++;
      }
    });

    return {
      beats: beats,
      syncopation: this.calculateSyncopationLevel(beats),
      groove: this.identifyGroovePattern(beats, style)
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
    const phrases = [];
    let currentPhrase = { start: 0, end: 0, notes: [] };
    
    // Detect phrase boundaries based on rests and melodic patterns
    let lastTime = 0;
    
    track.forEach((event, index) => {
      if (this.isNoteOn(event)) {
        const gap = event.time - lastTime;
        
        // Large gap indicates phrase boundary
        if (gap > 192 && currentPhrase.notes.length > 0) { // Half note gap
          currentPhrase.end = lastTime;
          phrases.push({ ...currentPhrase });
          currentPhrase = { start: event.time, end: event.time, notes: [] };
        }
        
        currentPhrase.notes.push(event);
        lastTime = event.time;
      }
    });
    
    if (currentPhrase.notes.length > 0) {
      currentPhrase.end = lastTime;
      phrases.push(currentPhrase);
    }
    
    return phrases;
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
  humanizeTimingIntelligent(time, note, style, intensity, analysis, eventIndex) {
    let adjustment = this.humanizeTiming(time, style, intensity) - time; // Get base adjustment
    
    if (!analysis) return time + adjustment;
    
    // Apply phrase-aware timing
    const phrase = analysis.phrasing.find(p => 
      time >= p.start && time <= p.end
    );
    
    if (phrase) {
      const phrasePosition = (time - phrase.start) / (phrase.end - phrase.start);
      
      // Subtle ritardando at phrase ends
      if (phrasePosition > 0.8) {
        adjustment += intensity * 5 * phrasePosition;
      }
      
      // Accelerando through phrase climax
      if (phrasePosition > 0.3 && phrasePosition < 0.7) {
        adjustment -= intensity * 2;
      }
    }
    
    // Apply chord-based timing adjustments
    const nearbyChord = analysis.chords.find(c => 
      Math.abs(c.time - time / 96) < 2
    );
    
    if (nearbyChord && nearbyChord.tension > 0.5) {
      // Slight hesitation before tense harmonies
      adjustment += intensity * nearbyChord.tension * 3;
    }
    
    // Style-specific timing adjustments
    if (style === 'jazz' && analysis.rhythm.groove.swing) {
      const beat = (time / 48) % 2;
      if (beat >= 1) {
        adjustment += intensity * 8; // Swing eighth notes
      }
    }
    
    return Math.max(0, time + adjustment);
  }

  humanizeVelocityIntelligent(velocity, note, style, intensity, analysis, eventIndex) {
    let adjustment = this.humanizeVelocity(velocity, style, intensity, note) - velocity;
    
    if (!analysis) return Math.max(1, Math.min(127, velocity + adjustment));
    
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
    
    // Add playback section
    this.addPlaybackSection(resultDiv);
    
    resultDiv.classList.remove('hidden');
  }

  addPlaybackSection(container) {
    // Remove existing playback section
    const existingSection = container.querySelector('.playback-section');
    if (existingSection) {
      existingSection.remove();
    }
    
    const playbackSection = document.createElement('div');
    playbackSection.className = 'playback-section';
    playbackSection.innerHTML = `
      <h3>再生比較</h3>
      <div class="playback-controls">
        <button class="play-button" onclick="midiHumanizer.playOriginal()">オリジナル再生</button>
        <button class="play-button" onclick="midiHumanizer.playHumanized()">ヒューマナイズ後再生</button>
      </div>
      <p><small>※ 再生機能は基本的な実装です。より詳細な比較には専用のMIDIプレイヤーをご使用ください。</small></p>
    `;
    
    container.insertBefore(playbackSection, container.firstChild);
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
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.midiHumanizer = new MIDIHumanizer();
});