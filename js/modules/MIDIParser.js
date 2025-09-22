/**
 * MIDI Parser Module
 * Handles MIDI file parsing and format conversion
 */

export class MIDIParser {
  constructor() {
    // Initialize any parser-specific properties
  }

  /**
   * Parse MIDI file from ArrayBuffer
   * @param {ArrayBuffer} arrayBuffer - MIDI file data
   * @returns {Object} Parsed MIDI data structure
   */
  parseMIDI(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    let offset = 0;
    
    // Parse header chunk
    const header = this.parseHeader(data.slice(offset, offset + 14));
    offset += 14;
    
    // Parse track chunks
    const tracks = [];
    for (let i = 0; i < header.numTracks; i++) {
      const trackData = this.parseTrackData(data.slice(offset));
      const trackEvents = this.parseEvents(trackData.data);
      tracks.push(trackEvents);
      offset += trackData.length;
    }
    
    return {
      header,
      tracks,
      ticksPerQuarter: header.ticksPerQuarter
    };
  }

  /**
   * Parse MIDI header chunk
   * @param {Uint8Array} data - Header data
   * @returns {Object} Header information
   */
  parseHeader(data) {
    // Verify MThd chunk
    const chunkType = String.fromCharCode(...data.slice(0, 4));
    if (chunkType !== 'MThd') {
      throw new Error('Invalid MIDI file: Missing MThd header');
    }
    
    const length = (data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7];
    const format = (data[8] << 8) | data[9];
    const numTracks = (data[10] << 8) | data[11];
    const ticksPerQuarter = (data[12] << 8) | data[13];
    
    return { format, numTracks, ticksPerQuarter };
  }

  /**
   * Parse MIDI track data chunk
   * @param {Uint8Array} data - Track data starting from MTrk
   * @returns {Object} Track data and length
   */
  parseTrackData(data) {
    // Verify MTrk chunk
    const chunkType = String.fromCharCode(...data.slice(0, 4));
    if (chunkType !== 'MTrk') {
      throw new Error('Invalid MIDI file: Missing MTrk header');
    }
    
    const length = (data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7];
    const trackData = data.slice(8, 8 + length);
    
    return {
      data: trackData,
      length: length + 8
    };
  }

  /**
   * Parse MIDI events from track data
   * @param {Uint8Array} trackData - Raw track event data
   * @returns {Array} Array of parsed MIDI events
   */
  parseEvents(trackData) {
    const events = [];
    let offset = 0;
    let runningStatus = 0;
    let currentTime = 0;
    
    while (offset < trackData.length) {
      // Parse variable-length delta time
      const deltaTime = this.parseVariableLength(trackData, offset);
      offset += deltaTime.length;
      currentTime += deltaTime.value;
      
      // Parse event
      let status = trackData[offset];
      
      // Handle running status
      if (status < 0x80) {
        status = runningStatus;
      } else {
        runningStatus = status;
        offset++;
      }
      
      const event = { time: currentTime, status };
      
      // Parse event data based on status
      if (status >= 0x80 && status <= 0xEF) {
        // Channel messages
        const channel = status & 0x0F;
        const type = status & 0xF0;
        
        event.channel = channel;
        event.type = type;
        
        if (type === 0x80 || type === 0x90) {
          // Note On/Off
          event.note = trackData[offset++];
          event.velocity = trackData[offset++];
        } else if (type === 0xB0) {
          // Control Change
          event.controller = trackData[offset++];
          event.value = trackData[offset++];
        } else if (type === 0xC0) {
          // Program Change
          event.program = trackData[offset++];
        } else if (type === 0xE0) {
          // Pitch Bend
          const lsb = trackData[offset++];
          const msb = trackData[offset++];
          event.pitchBend = (msb << 7) | lsb;
        } else {
          // Other channel messages
          event.data1 = trackData[offset++];
          if (type !== 0xC0 && type !== 0xD0) {
            event.data2 = trackData[offset++];
          }
        }
      } else if (status === 0xFF) {
        // Meta events
        const metaType = trackData[offset++];
        const length = this.parseVariableLength(trackData, offset);
        offset += length.length;
        
        event.metaType = metaType;
        event.data = trackData.slice(offset, offset + length.value);
        offset += length.value;
        
        // Parse specific meta events
        if (metaType === 0x51) {
          // Tempo
          const tempo = (event.data[0] << 16) | (event.data[1] << 8) | event.data[2];
          event.tempo = tempo;
        } else if (metaType === 0x58) {
          // Time Signature
          event.timeSignature = {
            numerator: event.data[0],
            denominator: Math.pow(2, event.data[1]),
            clocksPerClick: event.data[2],
            thirtySecondNotesPerQuarter: event.data[3]
          };
        }
      } else if (status === 0xF0 || status === 0xF7) {
        // System exclusive
        const length = this.parseVariableLength(trackData, offset);
        offset += length.length;
        event.data = trackData.slice(offset, offset + length.value);
        offset += length.value;
      }
      
      events.push(event);
    }
    
    return events;
  }

  /**
   * Parse variable-length quantity
   * @param {Uint8Array} data - Data to parse from
   * @param {number} offset - Starting offset
   * @returns {Object} Parsed value and length
   */
  parseVariableLength(data, offset) {
    let value = 0;
    let length = 0;
    
    while (length < 4 && offset + length < data.length) {
      const byte = data[offset + length];
      value = (value << 7) | (byte & 0x7F);
      length++;
      
      if ((byte & 0x80) === 0) {
        break;
      }
    }
    
    return { value, length };
  }

  /**
   * Create MIDI file from processed data
   * @param {Object} midiData - Processed MIDI data
   * @returns {ArrayBuffer} MIDI file as ArrayBuffer
   */
  createMIDI(midiData) {
    const chunks = [];
    
    // Create header chunk
    const headerChunk = this.createHeaderChunk(midiData.header);
    chunks.push(headerChunk);
    
    // Create track chunks
    midiData.tracks.forEach(track => {
      const trackChunk = this.createTrackChunk(track);
      chunks.push(trackChunk);
    });
    
    // Combine all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    chunks.forEach(chunk => {
      result.set(chunk, offset);
      offset += chunk.length;
    });
    
    return result.buffer;
  }

  /**
   * Create MIDI header chunk
   * @param {Object} header - Header data
   * @returns {Uint8Array} Header chunk
   */
  createHeaderChunk(header) {
    const chunk = new Uint8Array(14);
    
    // MThd
    chunk[0] = 0x4D; chunk[1] = 0x54; chunk[2] = 0x68; chunk[3] = 0x64;
    
    // Length (6)
    chunk[4] = 0; chunk[5] = 0; chunk[6] = 0; chunk[7] = 6;
    
    // Format
    chunk[8] = (header.format >> 8) & 0xFF;
    chunk[9] = header.format & 0xFF;
    
    // Number of tracks
    chunk[10] = (header.numTracks >> 8) & 0xFF;
    chunk[11] = header.numTracks & 0xFF;
    
    // Ticks per quarter note
    chunk[12] = (header.ticksPerQuarter >> 8) & 0xFF;
    chunk[13] = header.ticksPerQuarter & 0xFF;
    
    return chunk;
  }

  /**
   * Create MIDI track chunk
   * @param {Array} events - Track events
   * @returns {Uint8Array} Track chunk
   */
  createTrackChunk(events) {
    const eventData = this.createEventData(events);
    const chunk = new Uint8Array(8 + eventData.length);
    
    // MTrk
    chunk[0] = 0x4D; chunk[1] = 0x54; chunk[2] = 0x72; chunk[3] = 0x6B;
    
    // Length
    chunk[4] = (eventData.length >> 24) & 0xFF;
    chunk[5] = (eventData.length >> 16) & 0xFF;
    chunk[6] = (eventData.length >> 8) & 0xFF;
    chunk[7] = eventData.length & 0xFF;
    
    // Event data
    chunk.set(eventData, 8);
    
    return chunk;
  }

  /**
   * Create event data for track
   * @param {Array} events - Track events
   * @returns {Uint8Array} Event data
   */
  createEventData(events) {
    const data = [];
    let lastTime = 0;
    
    events.forEach(event => {
      // Delta time
      const deltaTime = Math.max(0, Math.round(event.time - lastTime));
      data.push(...this.createVariableLength(deltaTime));
      lastTime = event.time;
      
      // Event data
      if (event.type >= 0x80 && event.type <= 0xEF) {
        // Channel messages
        data.push(event.status || (event.type | event.channel));
        
        if (event.type === 0x80 || event.type === 0x90) {
          data.push(event.note, event.velocity);
        } else if (event.type === 0xB0) {
          data.push(event.controller, event.value);
        } else if (event.type === 0xC0) {
          data.push(event.program);
        } else if (event.type === 0xE0) {
          data.push(event.pitchBend & 0x7F, (event.pitchBend >> 7) & 0x7F);
        }
      } else if (event.status === 0xFF) {
        // Meta events
        data.push(0xFF, event.metaType);
        const eventData = event.data || [];
        const eventDataArray = Array.isArray(eventData) ? eventData : [eventData];
        data.push(...this.createVariableLength(eventDataArray.length));
        data.push(...eventDataArray);
      }
    });
    
    return new Uint8Array(data);
  }

  /**
   * Create variable-length quantity
   * @param {number} value - Value to encode
   * @returns {Array} Encoded bytes
   */
  createVariableLength(value) {
    const bytes = [];
    
    if (value === 0) {
      return [0];
    }
    
    while (value > 0) {
      bytes.unshift(value & 0x7F);
      value >>= 7;
    }
    
    // Set continuation bits
    for (let i = 0; i < bytes.length - 1; i++) {
      bytes[i] |= 0x80;
    }
    
    return bytes;
  }
}