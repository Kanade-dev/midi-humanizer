/**
 * Phrase Detector Module
 * Advanced phrase detection and musical structure analysis
 */

export class PhraseDetector {
  constructor() {
    this.learnedPatterns = {
      phraseBoundaryFeatures: [],
      strongNuanceFeatures: [],
      nuanceFeatures: []
    };
  }

  /**
   * Identify phrase boundaries in MIDI track
   * Enhanced with multiple detection strategies
   */
  identifyPhraseBoundaries(track, isUserUpload = false) {
    const notes = this.extractNotesFromTrack(track);
    const noteEvents = this.extractNoteEvents(track);
    
    if (notes.length === 0) {
      return [];
    }

    // Check for training data markers first
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
    
    // Use reinforcement learning approach instead of grid-based analysis
    console.log('🧠 Using reinforcement learning patterns for phrase detection (bypassing grid-based analysis)');
    return this.detectPhrasesUsingReinforcementLearning(track, notes, noteEvents);
  }

  /**
   * Extract notes from MIDI track
   */
  extractNotesFromTrack(track) {
    const notes = [];
    const noteOnEvents = {};
    
    track.forEach(event => {
      if (event.type === 0x90 && event.velocity > 0) {
        // Note on
        noteOnEvents[event.note] = {
          startTime: event.time,
          velocity: event.velocity,
          pitch: event.note
        };
      } else if ((event.type === 0x80) || (event.type === 0x90 && event.velocity === 0)) {
        // Note off
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
   * Extract note events from MIDI track
   */
  extractNoteEvents(track) {
    return track.filter(event => 
      (event.type === 0x90 && event.velocity > 0) || 
      (event.type === 0x80) || 
      (event.type === 0x90 && event.velocity === 0)
    );
  }

  /**
   * Reinforcement learning-based phrase detection
   * Prioritizes musical content over rigid grid analysis
   */
  detectPhrasesUsingReinforcementLearning(track, notes, noteEvents) {
    if (notes.length === 0) {
      return [];
    }

    const totalNotes = notes.length;
    const totalDuration = Math.max(...notes.map(n => n.endTime)) - Math.min(...notes.map(n => n.startTime));
    
    // 1. Musical boundary detection (melodic peaks, harmonic changes)
    const musicalBoundaries = this.detectMusicalBoundaries(notes);
    
    // 2. Rest-based boundary detection
    const restBoundaries = this.detectRestBoundaries(notes, totalDuration / totalNotes * 2);
    
    // 3. Harmonic boundary detection
    const harmonicBoundaries = this.detectHarmonicBoundaries(notes);
    
    // Combine and prioritize boundaries
    const combinedBoundaries = this.combineBoundaries(
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

  /**
   * Detect musical boundaries based on melodic and rhythmic patterns
   */
  detectMusicalBoundaries(notes) {
    if (notes.length < 4) return [];
    
    const boundaries = [];
    const windowSize = Math.max(3, Math.min(8, Math.floor(notes.length / 4)));
    
    for (let i = windowSize; i < notes.length - windowSize; i++) {
      const before = notes.slice(i - windowSize, i);
      const after = notes.slice(i, i + windowSize);
      
      // Check for significant pitch changes
      const beforeAvgPitch = before.reduce((sum, n) => sum + n.pitch, 0) / before.length;
      const afterAvgPitch = after.reduce((sum, n) => sum + n.pitch, 0) / after.length;
      const pitchChange = Math.abs(afterAvgPitch - beforeAvgPitch);
      
      // Check for rhythmic changes
      const beforeAvgDuration = before.reduce((sum, n) => sum + n.duration, 0) / before.length;
      const afterAvgDuration = after.reduce((sum, n) => sum + n.duration, 0) / after.length;
      const durationChange = Math.abs(afterAvgDuration - beforeAvgDuration) / Math.max(beforeAvgDuration, afterAvgDuration);
      
      // Boundary score
      let score = 0;
      if (pitchChange > 3) score += pitchChange / 12; // Pitch change significance
      if (durationChange > 0.3) score += durationChange; // Rhythmic change significance
      
      // Check for melodic direction changes
      if (before.length >= 2 && after.length >= 2) {
        const beforeTrend = before[before.length - 1].pitch - before[0].pitch;
        const afterTrend = after[after.length - 1].pitch - after[0].pitch;
        
        if (Math.sign(beforeTrend) !== Math.sign(afterTrend) && Math.abs(beforeTrend) > 2 && Math.abs(afterTrend) > 2) {
          score += 0.5; // Direction change bonus
        }
      }
      
      if (score > 0.6) {
        boundaries.push(notes[i].startTime);
      }
    }
    
    return boundaries;
  }

  /**
   * Detect boundaries based on rest periods
   */
  detectRestBoundaries(notes, minRestDuration) {
    const boundaries = [];
    
    for (let i = 0; i < notes.length - 1; i++) {
      const currentNote = notes[i];
      const nextNote = notes[i + 1];
      const rest = nextNote.startTime - currentNote.endTime;
      
      if (rest >= minRestDuration) {
        boundaries.push(nextNote.startTime);
      }
    }
    
    return boundaries;
  }

  /**
   * Detect boundaries based on harmonic changes
   */
  detectHarmonicBoundaries(notes) {
    if (notes.length < 6) return [];
    
    const boundaries = [];
    const chordWindow = 480; // Analyze chords in windows
    const currentTime = Math.min(...notes.map(n => n.startTime));
    const endTime = Math.max(...notes.map(n => n.endTime));
    
    let previousChord = null;
    
    for (let time = currentTime; time < endTime; time += chordWindow) {
      const windowNotes = notes.filter(n => 
        n.startTime < time + chordWindow && n.endTime > time
      );
      
      if (windowNotes.length >= 2) {
        const chord = this.analyzeChordAtTime(windowNotes);
        
        if (previousChord && this.calculateChordDistance(previousChord, chord) > 0.5) {
          boundaries.push(time);
        }
        
        previousChord = chord;
      }
    }
    
    return boundaries;
  }

  /**
   * Analyze chord at specific time
   */
  analyzeChordAtTime(notes) {
    const pitches = notes.map(n => n.pitch % 12);
    const uniquePitches = [...new Set(pitches)];
    return uniquePitches.sort((a, b) => a - b);
  }

  /**
   * Calculate distance between two chords
   */
  calculateChordDistance(chord1, chord2) {
    const allPitches = new Set([...chord1, ...chord2]);
    const union = allPitches.size;
    const intersection = chord1.filter(p => chord2.includes(p)).length;
    return 1 - (intersection / union);
  }

  /**
   * Combine multiple boundary detection results
   */
  combineBoundaries(musicalBoundaries, restBoundaries, harmonicBoundaries, notes) {
    const allBoundaries = new Map();
    
    // Add musical boundaries with high weight
    musicalBoundaries.forEach(boundary => {
      allBoundaries.set(boundary, (allBoundaries.get(boundary) || 0) + 3);
    });
    
    // Add rest boundaries with medium weight
    restBoundaries.forEach(boundary => {
      allBoundaries.set(boundary, (allBoundaries.get(boundary) || 0) + 2);
    });
    
    // Add harmonic boundaries with lower weight
    harmonicBoundaries.forEach(boundary => {
      allBoundaries.set(boundary, (allBoundaries.get(boundary) || 0) + 1);
    });
    
    // Filter boundaries by score threshold
    const threshold = 2;
    const selectedBoundaries = Array.from(allBoundaries.entries())
      .filter(([time, score]) => score >= threshold)
      .map(([time, score]) => time)
      .sort((a, b) => a - b);
    
    return selectedBoundaries;
  }

  /**
   * Create phrases from detected boundaries
   */
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

  /**
   * Apply minimal cleaning to avoid over-processing
   */
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

  /**
   * Analyze training phrases (placeholder for existing functionality)
   */
  analyzeTrainingPhrases(track, notes) {
    // Implementation would check for C6 phrase markers and other training indicators
    // For now, return null to use reinforcement learning approach
    return null;
  }

  /**
   * Detect phrases from training data (placeholder)
   */
  detectPhrasesFromTrainingData(track, notes, noteEvents, trainingAnalysis) {
    // Implementation would use training markers
    // Fallback to reinforcement learning for now
    return this.detectPhrasesUsingReinforcementLearning(track, notes, noteEvents);
  }

  /**
   * Analyze musical context around a boundary point
   */
  analyzeBoundaryContext(boundaryTime, notes, windowSize = 960) {
    const beforeNotes = notes.filter(n => 
      n.startTime >= boundaryTime - windowSize && n.startTime < boundaryTime
    );
    const afterNotes = notes.filter(n => 
      n.startTime >= boundaryTime && n.startTime < boundaryTime + windowSize
    );
    
    return {
      restBefore: this.calculateRestBefore(boundaryTime, notes),
      restAfter: this.calculateRestAfter(boundaryTime, notes),
      pitchChangeBefore: this.calculatePitchChange(beforeNotes.slice(-3), beforeNotes),
      pitchChangeAfter: this.calculatePitchChange(afterNotes, afterNotes.slice(3)),
      densityBefore: beforeNotes.length,
      densityAfter: afterNotes.length,
      beforeAvgPitch: beforeNotes.length > 0 ? beforeNotes.reduce((sum, n) => sum + n.pitch, 0) / beforeNotes.length : 60,
      afterAvgPitch: afterNotes.length > 0 ? afterNotes.reduce((sum, n) => sum + n.pitch, 0) / afterNotes.length : 60
    };
  }

  /**
   * Calculate rest before boundary
   */
  calculateRestBefore(boundaryTime, notes) {
    const notesBefore = notes.filter(n => n.endTime <= boundaryTime).sort((a, b) => b.endTime - a.endTime);
    if (notesBefore.length === 0) return 0;
    
    return boundaryTime - notesBefore[0].endTime;
  }

  /**
   * Calculate rest after boundary
   */
  calculateRestAfter(boundaryTime, notes) {
    const notesAfter = notes.filter(n => n.startTime >= boundaryTime).sort((a, b) => a.startTime - b.startTime);
    if (notesAfter.length === 0) return 0;
    
    return notesAfter[0].startTime - boundaryTime;
  }

  /**
   * Calculate pitch change between note groups
   */
  calculatePitchChange(beforeNotes, afterNotes) {
    if (beforeNotes.length === 0 || afterNotes.length === 0) return 0;
    
    const beforeAvg = beforeNotes.reduce((sum, n) => sum + n.pitch, 0) / beforeNotes.length;
    const afterAvg = afterNotes.reduce((sum, n) => sum + n.pitch, 0) / afterNotes.length;
    
    return Math.abs(afterAvg - beforeAvg);
  }
}