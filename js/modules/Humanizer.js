/**
 * Humanizer Module
 * Core humanization algorithms with intelligent musical analysis
 */

export class Humanizer {
  constructor() {
    this.rng = null; // Will be set by seedRandom
  }

  /**
   * Set random seed for reproducible results
   */
  seedRandom(seed) {
    let m_w = seed;
    let m_z = 987654321;
    const mask = 0xffffffff;
    
    this.rng = function() {
      m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
      m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
      let result = ((m_z << 16) + m_w) & mask;
      result /= 4294967296;
      return result + 0.5;
    };
  }

  /**
   * Main humanization function
   */
  humanizeMIDI(midiData, style, intensity, seed, isUserUpload = false) {
    // Set random seed for reproducible results
    if (seed !== null && seed !== undefined && seed !== '') {
      this.seedRandom(parseInt(seed));
    } else {
      this.seedRandom(Date.now() % 10000);
    }

    // Deep clone to avoid modifying original data
    const humanizedData = JSON.parse(JSON.stringify(midiData));
    
    // Analyze musical structure for intelligent humanization
    const analysis = this.analyzeMusicStructure(humanizedData.tracks, style, isUserUpload);
    
    // Humanize each track
    humanizedData.tracks = humanizedData.tracks.map((track, index) => {
      const trackAnalysis = analysis.tracks[index] || null;
      return this.humanizeTrack(track, style, intensity, trackAnalysis);
    });
    
    return humanizedData;
  }

  /**
   * Humanize individual track
   */
  humanizeTrack(track, style, intensity, trackAnalysis = null) {
    const humanizedTrack = [];
    let cumulativeDrift = 0;
    const beatTicks = 480; // Standard MIDI ticks per beat
    
    track.forEach((event, index) => {
      const newEvent = { ...event };
      
      // Humanize note events
      if (event.type === 0x90 && event.velocity > 0) {
        // Note on - humanize timing, velocity, and prepare for duration
        newEvent.time = this.humanizeTimingIntelligent(
          event.time, event, style, intensity, trackAnalysis, index, cumulativeDrift, beatTicks
        );
        newEvent.velocity = this.humanizeVelocityIntelligent(
          event.velocity, event, style, intensity, trackAnalysis, index
        );
        
        // Update cumulative drift for groove consistency
        cumulativeDrift += (newEvent.time - event.time) * 0.1; // Small influence
        cumulativeDrift = Math.max(-50, Math.min(50, cumulativeDrift)); // Constrain drift
      } else if (event.type === 0x80 || (event.type === 0x90 && event.velocity === 0)) {
        // Note off - humanize timing for duration effects
        newEvent.time = this.humanizeTimingIntelligent(
          event.time, event, style, intensity, trackAnalysis, index, cumulativeDrift, beatTicks
        );
      } else {
        // Non-note events - minimal humanization
        if (event.time > 0) {
          const timingVariation = this.getTimingVariation(style) * intensity * (this.rng() - 0.5) * 0.5;
          newEvent.time = Math.max(0, event.time + Math.round(timingVariation));
        }
      }
      
      humanizedTrack.push(newEvent);
    });
    
    // Ensure events remain in chronological order
    humanizedTrack.sort((a, b) => a.time - b.time);
    
    // Enforce minimum spacing between events
    this.enforceMinimumSpacing(humanizedTrack);
    
    return humanizedTrack;
  }

  /**
   * Intelligent timing humanization based on musical context
   */
  humanizeTimingIntelligent(time, note, style, intensity, analysis, eventIndex, cumulativeDrift = 0, beatTicks = 480) {
    if (!this.rng) {
      this.seedRandom(42); // Fallback seed
    }
    
    let adjustment = 0;
    const maxAdjustment = Math.min(40, beatTicks * 0.08); // Max 8% of a beat
    
    // Base timing variation for the style
    const baseVariation = this.getTimingVariation(style) * intensity;
    adjustment += baseVariation * (this.rng() - 0.5) * 2;
    
    // Add cumulative drift for groove consistency
    adjustment += cumulativeDrift * intensity * 0.3;
    
    // Musical context adjustments
    if (analysis && analysis.rhythm) {
      // Groove adjustments
      if (analysis.rhythm.groove) {
        const beat = (time / beatTicks) % 4;
        if (style === 'jazz' && beat % 2 === 1) {
          // Jazz swing - delay off-beats
          adjustment += intensity * 8;
        } else if (style === 'pop' && Math.floor(beat) % 2 === 0) {
          // Pop - slightly early on strong beats
          adjustment -= intensity * 3;
        }
      }
    }
    
    // Phrase-based timing adjustments
    if (analysis && analysis.phrasing) {
      const currentPhrase = analysis.phrasing.find(p => 
        time >= p.start && time <= p.end
      );
      
      if (currentPhrase) {
        const phrasePosition = (time - currentPhrase.start) / (currentPhrase.end - currentPhrase.start);
        
        // Phrase beginning - slightly more relaxed timing
        if (phrasePosition < 0.2) {
          adjustment += intensity * (0.2 - phrasePosition) * 10;
        }
        // Phrase ending - slight ritardando
        else if (phrasePosition > 0.8) {
          adjustment += intensity * (phrasePosition - 0.8) * 15;
        }
      }
    }
    
    // Style-specific swing and groove patterns
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

  /**
   * Intelligent velocity humanization with chord and phrase awareness
   */
  humanizeVelocityIntelligent(velocity, note, style, intensity, analysis, eventIndex) {
    if (!this.rng) {
      this.seedRandom(42); // Fallback seed
    }
    
    let adjustment = 0;
    
    // Base velocity variation
    const baseVariation = this.getVelocityVariation(style) * intensity;
    adjustment += baseVariation * (this.rng() - 0.5) * 2;
    
    // Chord-based adjustments (2-2: コードなどを検知し軽微なベロシティの揺らぎを加える)
    if (analysis && analysis.chords) {
      const eventTime = eventIndex * 10; // Approximate time for chord lookup
      const currentChord = analysis.chords.find(c => 
        eventTime >= c.time && eventTime < c.time + c.duration
      );
      
      if (currentChord) {
        // Adjust velocity based on chord type and note role
        const chordRoot = currentChord.notes[0] % 12;
        const noteInChord = note.note % 12;
        
        // Root notes slightly stronger
        if (noteInChord === chordRoot) {
          adjustment += intensity * 5;
        }
        // Third and fifth notes slightly varied
        else if (currentChord.notes.includes(noteInChord)) {
          adjustment += intensity * (this.rng() - 0.5) * 8;
        }
        
        // Chord quality affects expression
        if (currentChord.quality === 'minor') {
          adjustment -= intensity * 3; // Slightly softer for minor chords
        } else if (currentChord.quality === 'diminished') {
          adjustment += intensity * (this.rng() - 0.5) * 10; // More variation for tension
        }
      }
    }
    
    // Phrase-based dynamics (2-3: フレーズのピークなどを検知しダイナミクスを付ける)
    if (analysis && analysis.phrasing) {
      const eventTime = eventIndex * 10;
      const currentPhrase = analysis.phrasing.find(p => 
        eventTime >= p.start && eventTime <= p.end
      );
      
      if (currentPhrase) {
        const phrasePosition = (eventTime - currentPhrase.start) / (currentPhrase.end - currentPhrase.start);
        const phraseDuration = (currentPhrase.end - currentPhrase.start) / 1000; // Convert to seconds
        
        // Create phrase arc with peaks
        let phraseAdjustment = 0;
        
        if (phraseDuration > 2) {
          // For longer phrases, create multiple peaks
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
    }
    
    // Add inter-phrase dynamics for larger musical arc
    if (analysis && analysis.phrasing && analysis.phrasing.length > 1) {
      const currentPhraseIndex = analysis.phrasing.findIndex(p => 
        eventIndex * 10 >= p.start && eventIndex * 10 <= p.end
      );
      
      if (currentPhraseIndex !== -1) {
        const totalPhrases = analysis.phrasing.length;
        const phraseProgress = currentPhraseIndex / Math.max(1, totalPhrases - 1);
        
        // Musical form dynamics (stronger towards middle/climax)
        if (totalPhrases >= 3) {
          const formPosition = phraseProgress;
          if (formPosition > 0.3 && formPosition < 0.7) {
            adjustment += intensity * 8; // Peak section
          } else if (formPosition < 0.2 || formPosition > 0.8) {
            adjustment -= intensity * 5; // Softer beginning/ending
          }
        }
      }
    }
    
    // Style-specific velocity characteristics
    switch(style) {
      case 'classical':
        // More dynamic range, expressive
        adjustment *= 1.2;
        break;
      case 'jazz':
        // Syncopated accents
        if (this.rng() < 0.3) {
          adjustment += intensity * 8;
        }
        break;
      case 'pop':
        // More consistent dynamics
        adjustment *= 0.8;
        break;
    }
    
    // Ensure velocity stays within valid MIDI range
    return Math.max(1, Math.min(127, velocity + adjustment));
  }

  /**
   * Get timing variation amount for style
   */
  getTimingVariation(style) {
    switch(style) {
      case 'classical': return 15;
      case 'pop': return 8;
      case 'jazz': return 20;
      default: return 10;
    }
  }

  /**
   * Get velocity variation amount for style
   */
  getVelocityVariation(style) {
    switch(style) {
      case 'classical': return 12;
      case 'pop': return 6;
      case 'jazz': return 15;
      default: return 8;
    }
  }

  /**
   * Enforce minimum spacing between events
   */
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

  /**
   * Analyze musical structure for intelligent humanization
   */
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

  /**
   * Analyze chord progression in track
   */
  analyzeChordProgression(track) {
    const chords = [];
    const chordDuration = 480 * 2; // 2 beats per chord analysis
    const notes = this.extractNotesFromEvents(track);
    
    if (notes.length === 0) return chords;
    
    const startTime = Math.min(...notes.map(n => n.startTime));
    const endTime = Math.max(...notes.map(n => n.endTime));
    
    for (let time = startTime; time < endTime; time += chordDuration) {
      const chordNotes = notes.filter(note => 
        note.startTime < time + chordDuration && note.endTime > time
      );
      
      if (chordNotes.length >= 2) {
        const chord = this.identifyChord(chordNotes);
        if (chord) {
          chords.push({
            time: time,
            duration: chordDuration,
            notes: chord.notes,
            quality: chord.quality,
            root: chord.root
          });
        }
      }
    }
    
    return chords;
  }

  /**
   * Extract notes from MIDI events
   */
  extractNotesFromEvents(track) {
    const notes = [];
    const noteOnEvents = {};
    
    track.forEach(event => {
      if (event.type === 0x90 && event.velocity > 0) {
        noteOnEvents[event.note] = {
          startTime: event.time,
          velocity: event.velocity,
          pitch: event.note
        };
      } else if ((event.type === 0x80) || (event.type === 0x90 && event.velocity === 0)) {
        if (noteOnEvents[event.note]) {
          const noteOn = noteOnEvents[event.note];
          notes.push({
            startTime: noteOn.startTime,
            endTime: event.time,
            duration: event.time - noteOn.startTime,
            pitch: event.note,
            velocity: noteOn.velocity
          });
          delete noteOnEvents[event.note];
        }
      }
    });
    
    return notes.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Identify chord from notes
   */
  identifyChord(notes) {
    const pitches = [...new Set(notes.map(n => n.pitch % 12))].sort((a, b) => a - b);
    
    if (pitches.length < 2) return null;
    
    // Simple chord identification
    const intervals = [];
    for (let i = 1; i < pitches.length; i++) {
      intervals.push((pitches[i] - pitches[0] + 12) % 12);
    }
    
    let quality = 'unknown';
    if (intervals.includes(4) && intervals.includes(7)) {
      quality = 'major';
    } else if (intervals.includes(3) && intervals.includes(7)) {
      quality = 'minor';
    } else if (intervals.includes(3) && intervals.includes(6)) {
      quality = 'diminished';
    }
    
    return {
      root: pitches[0],
      notes: pitches,
      quality: quality
    };
  }

  /**
   * Analyze melody characteristics
   */
  analyzeMelody(track) {
    const notes = this.extractNotesFromEvents(track);
    if (notes.length === 0) return null;
    
    // Find melodic line (highest notes generally)
    const melody = notes.filter(note => {
      const simultaneousNotes = notes.filter(n => 
        Math.abs(n.startTime - note.startTime) < 50
      );
      return note.pitch === Math.max(...simultaneousNotes.map(n => n.pitch));
    });
    
    return {
      range: Math.max(...melody.map(n => n.pitch)) - Math.min(...melody.map(n => n.pitch)),
      averagePitch: melody.reduce((sum, n) => sum + n.pitch, 0) / melody.length,
      contour: this.analyzeMelodicContour(melody)
    };
  }

  /**
   * Analyze melodic contour
   */
  analyzeMelodicContour(notes) {
    if (notes.length < 2) return [];
    
    const contour = [];
    for (let i = 1; i < notes.length; i++) {
      const interval = notes[i].pitch - notes[i-1].pitch;
      if (interval > 2) contour.push('up');
      else if (interval < -2) contour.push('down');
      else contour.push('same');
    }
    
    return contour;
  }

  /**
   * Analyze rhythmic context
   */
  analyzeRhythmicContext(track, style) {
    const notes = this.extractNotesFromEvents(track);
    if (notes.length === 0) return null;
    
    // Simple rhythm analysis
    const durations = notes.map(n => n.duration);
    const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    
    return {
      averageDuration: averageDuration,
      groove: {
        swing: style === 'jazz',
        syncopation: style === 'jazz' || style === 'pop'
      }
    };
  }

  /**
   * Identify phrase boundaries (simplified version for humanizer)
   */
  identifyPhraseBoundaries(track, isUserUpload = false) {
    // This is a simplified version - the full implementation would be in PhraseDetector
    const notes = this.extractNotesFromEvents(track);
    if (notes.length === 0) return [];
    
    // Create a single phrase for now
    return [{
      start: Math.min(...notes.map(n => n.startTime)),
      end: Math.max(...notes.map(n => n.endTime)),
      notes: notes
    }];
  }

  /**
   * Analyze dynamic structure
   */
  analyzeDynamicStructure(track) {
    const notes = this.extractNotesFromEvents(track);
    if (notes.length === 0) return null;
    
    const velocities = notes.map(n => n.velocity);
    return {
      averageVelocity: velocities.reduce((sum, v) => sum + v, 0) / velocities.length,
      dynamicRange: Math.max(...velocities) - Math.min(...velocities),
      trend: this.calculateVelocityTrend(velocities)
    };
  }

  /**
   * Calculate velocity trend
   */
  calculateVelocityTrend(velocities) {
    if (velocities.length < 2) return 'stable';
    
    const first = velocities.slice(0, Math.floor(velocities.length / 3));
    const last = velocities.slice(-Math.floor(velocities.length / 3));
    
    const firstAvg = first.reduce((sum, v) => sum + v, 0) / first.length;
    const lastAvg = last.reduce((sum, v) => sum + v, 0) / last.length;
    
    const difference = lastAvg - firstAvg;
    
    if (difference > 5) return 'crescendo';
    else if (difference < -5) return 'diminuendo';
    else return 'stable';
  }
}