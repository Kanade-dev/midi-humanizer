// MIDI Humanizer Script
// Handles MIDI file processing and humanization

class MIDIHumanizer {
  constructor() {
    this.originalMidiData = null;
    this.humanizedMidiData = null;
    this.isProcessing = false;
    
    this.initializeEventListeners();
    this.setupIntensitySlider();
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
    
    const humanizedTracks = midiData.tracks.map(track => 
      this.humanizeTrack(track, style, intensity)
    );
    
    return {
      ...midiData,
      tracks: humanizedTracks
    };
  }

  humanizeTrack(track, style, intensity) {
    const humanizedEvents = [];
    const noteOnEvents = [];
    
    for (let i = 0; i < track.length; i++) {
      const event = { ...track[i] };
      
      if (this.isNoteOn(event)) {
        // Apply timing humanization
        event.time = this.humanizeTiming(event.time, style, intensity);
        
        // Apply velocity humanization
        event.data2 = this.humanizeVelocity(event.data2, style, intensity, event.data1);
        
        noteOnEvents.push(event);
      } else if (this.isNoteOff(event)) {
        // Find corresponding note on event
        const noteOnIndex = noteOnEvents.findIndex(noteOn => 
          noteOn.data1 === event.data1 && noteOn.channel === event.channel
        );
        
        if (noteOnIndex !== -1) {
          const noteOn = noteOnEvents[noteOnIndex];
          const duration = event.time - noteOn.time;
          
          // Apply duration humanization
          const humanizedDuration = this.humanizeDuration(duration, style, intensity);
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

  async playOriginal() {
    console.log('Playing original MIDI...');
    alert('オリジナルMIDIの再生機能は実装中です。ダウンロードしたファイルでご確認ください。');
  }

  async playHumanized() {
    console.log('Playing humanized MIDI...');
    alert('ヒューマナイズされたMIDIの再生機能は実装中です。ダウンロードしたファイルでご確認ください。');
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