/**
 * Visualizer Module
 * PicoTune-inspired MIDI visualizer with phrase boundaries
 */

export class Visualizer {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.width = 608;
    this.height = 384;
    this.zoom = 1;
    this.scrollPosition = 0;
    this.playbackPosition = 0.5; // Center position for playback indicator
    this.timelineWidthPx = 0;
    this.timelineTotalDuration = 0;
    this.currentMode = 'timeline';
    this.phrases = [];
    this.originalNotes = [];
    this.humanizedNotes = [];
    this.isPlaying = false;
  }

  /**
   * Initialize visualizer canvas
   */
  init(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error('Visualizer container not found');
      return false;
    }

    // Create canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = '100%';
    this.canvas.style.height = 'auto';
    this.canvas.style.maxWidth = '608px';
    this.canvas.style.border = '1px solid #ddd';
    this.canvas.style.borderRadius = '8px';
    this.canvas.style.backgroundColor = '#000';
    
    this.ctx = this.canvas.getContext('2d');
    
    // Clear container and add canvas
    container.innerHTML = '';
    container.appendChild(this.canvas);
    
    // Add controls
    this.addControls(container);
    
    return true;
  }

  /**
   * Add visualizer controls
   */
  addControls(container) {
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'visualizer-controls';
    controlsDiv.style.cssText = `
      margin-top: 10px;
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    `;

    // Zoom controls
    const zoomControls = document.createElement('div');
    zoomControls.innerHTML = `
      <button id="zoomOut" style="padding: 5px 10px; margin-right: 5px;">ズームアウト</button>
      <button id="zoomIn" style="padding: 5px 10px; margin-right: 5px;">ズームイン</button>
      <button id="resetZoom" style="padding: 5px 10px;">リセット</button>
    `;

    // Mode controls
    const modeControls = document.createElement('div');
    modeControls.innerHTML = `
      <button id="timelineMode" style="padding: 5px 10px; margin-right: 5px;">タイムライン表示</button>
      <button id="phraseMode" style="padding: 5px 10px; margin-right: 5px;">フレーズ構造</button>
      <button id="comparisonMode" style="padding: 5px 10px;">ビフォー・アフター比較</button>
    `;

    controlsDiv.appendChild(zoomControls);
    controlsDiv.appendChild(modeControls);
    container.appendChild(controlsDiv);

    // Add event listeners
    this.setupControlListeners();
  }

  /**
   * Setup control event listeners
   */
  setupControlListeners() {
    const zoomOutBtn = document.getElementById('zoomOut');
    const zoomInBtn = document.getElementById('zoomIn');
    const resetZoomBtn = document.getElementById('resetZoom');
    const timelineModeBtn = document.getElementById('timelineMode');
    const phraseModeBtn = document.getElementById('phraseMode');
    const comparisonModeBtn = document.getElementById('comparisonMode');

    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => this.adjustZoom(-0.5));
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => this.adjustZoom(0.5));
    if (resetZoomBtn) resetZoomBtn.addEventListener('click', () => this.resetZoom());
    
    if (timelineModeBtn) timelineModeBtn.addEventListener('click', () => this.setMode('timeline'));
    if (phraseModeBtn) phraseModeBtn.addEventListener('click', () => this.setMode('phrase'));
    if (comparisonModeBtn) comparisonModeBtn.addEventListener('click', () => this.setMode('comparison'));
  }

  /**
   * Set data for visualization
   */
  setData(originalNotes, humanizedNotes = null, phrases = []) {
    this.originalNotes = originalNotes || [];
    this.humanizedNotes = humanizedNotes || [];
    this.phrases = phrases || [];
    
    // Calculate timeline dimensions
    if (this.originalNotes.length > 0) {
      const maxTime = Math.max(...this.originalNotes.map(n => n.endTime || n.startTime));
      this.timelineTotalDuration = maxTime;
      this.timelineWidthPx = this.width * 2; // Initial width, will be adjusted by zoom
    }
    
    this.render();
  }

  /**
   * Set visualization mode
   */
  setMode(mode) {
    this.currentMode = mode;
    this.updateModeButtons();
    this.render();
  }

  /**
   * Update mode button states
   */
  updateModeButtons() {
    const buttons = {
      'timeline': document.getElementById('timelineMode'),
      'phrase': document.getElementById('phraseMode'),
      'comparison': document.getElementById('comparisonMode')
    };

    Object.keys(buttons).forEach(mode => {
      const btn = buttons[mode];
      if (btn) {
        btn.style.backgroundColor = mode === this.currentMode ? '#007bff' : '';
        btn.style.color = mode === this.currentMode ? 'white' : '';
      }
    });
  }

  /**
   * Adjust zoom level
   */
  adjustZoom(delta) {
    this.zoom = Math.max(0.5, Math.min(5, this.zoom + delta));
    this.timelineWidthPx = this.width * 2 * this.zoom;
    this.render();
  }

  /**
   * Reset zoom to default
   */
  resetZoom() {
    this.zoom = 1;
    this.scrollPosition = 0;
    this.timelineWidthPx = this.width * 2;
    this.render();
  }

  /**
   * Main render function
   */
  render() {
    if (!this.ctx) return;

    // Clear canvas
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.width, this.height);

    switch (this.currentMode) {
      case 'timeline':
        this.renderTimeline();
        break;
      case 'phrase':
        this.renderPhraseStructure();
        break;
      case 'comparison':
        this.renderComparison();
        break;
    }

    // Render playback indicator if playing
    if (this.isPlaying) {
      this.renderPlaybackIndicator();
    }
  }

  /**
   * Render timeline view (PicoTune style)
   */
  renderTimeline() {
    const rollHeight = this.height - 60; // Leave space for info
    const noteHeight = rollHeight / 24; // 24 visible notes (2 octaves)
    const baseNote = 60; // C4 as base
    
    // Draw piano roll background
    this.drawPianoRollBackground(noteHeight, baseNote);
    
    // Draw notes (prioritize humanized if available)
    const notesToDraw = this.humanizedNotes.length > 0 ? this.humanizedNotes : this.originalNotes;
    this.drawNotes(notesToDraw, noteHeight, baseNote, '#4CAF50');
    
    // Draw original notes in different color if comparing
    if (this.humanizedNotes.length > 0 && this.currentMode === 'timeline') {
      this.drawNotes(this.originalNotes, noteHeight, baseNote, '#FF9800', 0.3);
    }
    
    // Draw phrase boundaries
    this.drawPhraseBoundaries(rollHeight);
    
    // Draw info panel
    this.drawInfoPanel();
  }

  /**
   * Draw piano roll background
   */
  drawPianoRollBackground(noteHeight, baseNote) {
    const whiteKeys = [0, 2, 4, 5, 7, 9, 11]; // C, D, E, F, G, A, B
    
    for (let i = 0; i < 24; i++) {
      const note = (baseNote + i) % 12;
      const y = this.height - 60 - (i + 1) * noteHeight;
      
      // Alternate row colors
      const isWhiteKey = whiteKeys.includes(note);
      this.ctx.fillStyle = isWhiteKey ? '#1a1a1a' : '#2a2a2a';
      this.ctx.fillRect(0, y, this.width, noteHeight);
      
      // Draw note labels
      this.ctx.fillStyle = '#666';
      this.ctx.font = '10px monospace';
      this.ctx.textAlign = 'left';
      const noteName = this.getNoteNameFromMIDI(baseNote + i);
      this.ctx.fillText(noteName, 5, y + noteHeight / 2 + 3);
    }
    
    // Draw grid lines
    this.ctx.strokeStyle = '#333';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    
    // Horizontal lines
    for (let i = 0; i <= 24; i++) {
      const y = this.height - 60 - i * noteHeight;
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
    }
    
    // Vertical lines (measures)
    const beatsPerMeasure = 4;
    const ticksPerBeat = 480;
    const ticksPerMeasure = beatsPerMeasure * ticksPerBeat;
    
    if (this.timelineTotalDuration > 0) {
      const pixelsPerTick = this.timelineWidthPx / this.timelineTotalDuration;
      
      for (let tick = 0; tick < this.timelineTotalDuration; tick += ticksPerMeasure) {
        const x = (tick * pixelsPerTick - this.scrollPosition) % this.width;
        if (x >= 0 && x <= this.width) {
          this.ctx.moveTo(x, 0);
          this.ctx.lineTo(x, this.height - 60);
        }
      }
    }
    
    this.ctx.stroke();
  }

  /**
   * Draw MIDI notes
   */
  drawNotes(notes, noteHeight, baseNote, color, alpha = 1) {
    if (notes.length === 0 || this.timelineTotalDuration === 0) return;
    
    const pixelsPerTick = this.timelineWidthPx / this.timelineTotalDuration;
    
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = color;
    
    notes.forEach(note => {
      const noteIndex = note.pitch - baseNote;
      if (noteIndex >= 0 && noteIndex < 24) {
        // Fix: Remove modulo operation that causes note wrapping/duplication
        const x = note.startTime * pixelsPerTick - this.scrollPosition;
        const width = ((note.endTime || note.startTime + 480) - note.startTime) * pixelsPerTick;
        const y = this.height - 60 - (noteIndex + 1) * noteHeight;
        
        // Only draw if visible in viewport
        if (x + width >= 0 && x <= this.width) {
          this.ctx.fillRect(x, y + 1, Math.max(2, width), noteHeight - 2);
          
          // Add velocity indicator
          const velocityAlpha = (note.velocity || 64) / 127;
          this.ctx.globalAlpha = alpha * velocityAlpha;
          this.ctx.fillRect(x, y + 1, Math.max(1, width * 0.1), noteHeight - 2);
          this.ctx.globalAlpha = alpha; // Reset alpha for next note
        }
      }
    });
    
    this.ctx.globalAlpha = 1;
  }

  /**
   * Draw phrase boundaries
   */
  drawPhraseBoundaries(rollHeight) {
    if (this.phrases.length === 0 || this.timelineTotalDuration === 0) return;
    
    const pixelsPerTick = this.timelineWidthPx / this.timelineTotalDuration;
    
    this.ctx.strokeStyle = '#FF6B6B';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([5, 5]);
    
    this.phrases.forEach((phrase, index) => {
      // Fix: Remove modulo operation that causes phrase boundary wrapping
      const x = phrase.start * pixelsPerTick - this.scrollPosition;
      
      if (x >= 0 && x <= this.width) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, rollHeight);
        this.ctx.stroke();
        
        // Phrase label
        this.ctx.fillStyle = '#FF6B6B';
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`P${index + 1}`, x + 5, 15);
      }
    });
    
    this.ctx.setLineDash([]);
  }

  /**
   * Draw info panel
   */
  drawInfoPanel() {
    const panelHeight = 50;
    const y = this.height - panelHeight;
    
    // Background
    this.ctx.fillStyle = '#333';
    this.ctx.fillRect(0, y, this.width, panelHeight);
    
    // Info text
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '14px sans-serif';
    this.ctx.textAlign = 'left';
    
    const bpm = 120; // Default BPM
    const timeSignature = '4/4';
    const currentTime = this.formatTime(this.scrollPosition / (this.timelineWidthPx / this.timelineTotalDuration) * 1000 / 480);
    const totalTime = this.formatTime(this.timelineTotalDuration * 1000 / 480);
    
    this.ctx.fillText(`BPM ${bpm}`, 10, y + 20);
    this.ctx.fillText(`BEAT ${timeSignature}`, 80, y + 20);
    this.ctx.fillText(`TIME ${currentTime} / ${totalTime}`, 10, y + 40);
    this.ctx.fillText(`ZOOM ${(this.zoom * 100).toFixed(0)}%`, 200, y + 40);
  }

  /**
   * Render phrase structure view
   */
  renderPhraseStructure() {
    // Background
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    if (this.phrases.length === 0) {
      this.ctx.fillStyle = '#666';
      this.ctx.font = '16px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('フレーズ分析中...', this.width / 2, this.height / 2);
      return;
    }
    
    // Draw phrase blocks
    const blockHeight = (this.height - 100) / this.phrases.length;
    
    this.phrases.forEach((phrase, index) => {
      const y = index * blockHeight + 20;
      const duration = (phrase.end - phrase.start) / 1000; // Convert to seconds
      const noteCount = phrase.notes ? phrase.notes.length : 0;
      
      // Phrase block
      this.ctx.fillStyle = `hsl(${(index * 137.5) % 360}, 70%, 50%)`;
      this.ctx.fillRect(20, y, this.width - 40, blockHeight - 10);
      
      // Phrase info
      this.ctx.fillStyle = '#fff';
      this.ctx.font = '14px sans-serif';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(`フレーズ ${index + 1}`, 30, y + 20);
      this.ctx.fillText(`${duration.toFixed(1)}秒 (${noteCount}音)`, 30, y + 40);
      
      // Note density visualization
      if (noteCount > 0) {
        const densityWidth = (noteCount / 20) * (this.width - 80); // Normalize to max 20 notes
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.fillRect(30, y + 50, Math.min(densityWidth, this.width - 80), 5);
      }
    });
    
    // Summary
    const avgDuration = this.phrases.reduce((sum, p) => sum + (p.end - p.start), 0) / this.phrases.length / 1000;
    const totalNotes = this.phrases.reduce((sum, p) => sum + (p.notes ? p.notes.length : 0), 0);
    
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '16px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`フレーズ数: ${this.phrases.length}`, this.width / 2, this.height - 40);
    this.ctx.fillText(`平均長: ${avgDuration.toFixed(1)}秒, 総音数: ${totalNotes}`, this.width / 2, this.height - 20);
  }

  /**
   * Render before/after comparison view
   */
  renderComparison() {
    // Background
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    if (this.originalNotes.length === 0) {
      this.ctx.fillStyle = '#666';
      this.ctx.font = '16px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('比較データなし', this.width / 2, this.height / 2);
      return;
    }
    
    // Calculate statistics
    const originalStats = this.calculateNoteStats(this.originalNotes);
    const humanizedStats = this.humanizedNotes.length > 0 ? this.calculateNoteStats(this.humanizedNotes) : null;
    
    // Draw comparison charts
    const chartHeight = 80;
    const chartY = 50;
    
    // Average velocity comparison
    this.drawComparisonBar('平均音量', originalStats.avgVelocity, humanizedStats?.avgVelocity, 127, chartY);
    
    // Average duration comparison
    this.drawComparisonBar('平均音長', originalStats.avgDuration / 480, humanizedStats?.avgDuration / 480, 4, chartY + 100);
    
    // Note count
    this.drawComparisonBar('ノート数', originalStats.noteCount, humanizedStats?.noteCount, Math.max(originalStats.noteCount, humanizedStats?.noteCount || 0), chartY + 200);
    
    // Title
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '18px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('ビフォー・アフター比較', this.width / 2, 30);
  }

  /**
   * Draw comparison bar chart
   */
  drawComparisonBar(label, originalValue, humanizedValue, maxValue, y) {
    const barWidth = 200;
    const barHeight = 20;
    const x = this.width / 2 - barWidth / 2;
    
    // Label
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '14px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(label, this.width / 2, y - 10);
    
    // Original bar
    const originalWidth = (originalValue / maxValue) * barWidth;
    this.ctx.fillStyle = '#FF9800';
    this.ctx.fillRect(x, y, originalWidth, barHeight);
    
    // Humanized bar (if available)
    if (humanizedValue !== null && humanizedValue !== undefined) {
      const humanizedWidth = (humanizedValue / maxValue) * barWidth;
      this.ctx.fillStyle = '#4CAF50';
      this.ctx.fillRect(x, y + barHeight + 5, humanizedWidth, barHeight);
    }
    
    // Values
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '12px sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`オリジナル: ${originalValue.toFixed(1)}`, x, y + 35);
    
    if (humanizedValue !== null && humanizedValue !== undefined) {
      this.ctx.fillText(`ヒューマナイズ後: ${humanizedValue.toFixed(1)}`, x, y + 50);
    }
  }

  /**
   * Calculate note statistics
   */
  calculateNoteStats(notes) {
    if (notes.length === 0) {
      return { avgVelocity: 0, avgDuration: 0, noteCount: 0 };
    }
    
    const velocities = notes.map(n => n.velocity || 64);
    const durations = notes.map(n => (n.endTime || n.startTime + 480) - n.startTime);
    
    return {
      avgVelocity: velocities.reduce((sum, v) => sum + v, 0) / velocities.length,
      avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      noteCount: notes.length
    };
  }

  /**
   * Render playback indicator
   */
  renderPlaybackIndicator() {
    const x = this.width * this.playbackPosition;
    
    this.ctx.strokeStyle = '#FF0000';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x, 0);
    this.ctx.lineTo(x, this.height - 60);
    this.ctx.stroke();
  }

  /**
   * Update playback progress
   */
  updatePlaybackProgress(progress) {
    // Fix: Proper scrolling behavior - start from beginning, center playback indicator only during playback
    if (progress === 0) {
      // At start, show beginning of timeline
      this.scrollPosition = 0;
    } else {
      // During playback, keep indicator centered and scroll content
      this.scrollPosition = progress * this.timelineWidthPx - this.width * this.playbackPosition;
    }
    this.render();
  }

  /**
   * Set playing state
   */
  setPlaying(isPlaying) {
    this.isPlaying = isPlaying;
    if (isPlaying) {
      // When starting playback, reset to beginning
      this.scrollPosition = 0;
    }
    this.render();
  }

  /**
   * Utility functions
   */
  getNoteNameFromMIDI(midiNote) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midiNote / 12) - 1;
    const noteName = noteNames[midiNote % 12];
    return `${noteName}${octave}`;
  }

  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}