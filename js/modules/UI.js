/**
 * UI Module
 * Handles user interface management and interactions
 */

export class UI {
  constructor() {
    this.onFileUpload = null;
    this.onHumanize = null;
    this.onPlayOriginal = null;
    this.onPlayHumanized = null;
    this.onStopPlayback = null;
    this.originalMidiData = null;
    this.humanizedMidiData = null;
    this.isProcessing = false;
  }

  /**
   * Initialize UI event listeners
   */
  init() {
    this.setupEventListeners();
    this.setupIntensitySlider();
    this.setupAdvancedSettings();
  }

  /**
   * Setup main event listeners
   */
  setupEventListeners() {
    const form = document.getElementById('form');
    const fileInput = document.getElementById('file');
    
    if (form) {
      form.addEventListener('submit', (e) => this.handleFormSubmit(e));
    }
    
    if (fileInput) {
      fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    }
  }

  /**
   * Setup intensity slider
   */
  setupIntensitySlider() {
    const intensitySlider = document.getElementById('intensity');
    const intensityValue = document.getElementById('intensityValue');
    
    if (intensitySlider && intensityValue) {
      intensitySlider.addEventListener('input', (e) => {
        intensityValue.textContent = e.target.value;
      });
    }
  }

  /**
   * Setup advanced settings UI
   */
  setupAdvancedSettings() {
    // Add advanced settings toggle
    const form = document.getElementById('form');
    if (!form) return;

    const advancedToggle = document.createElement('div');
    advancedToggle.className = 'field';
    advancedToggle.innerHTML = `
      <button type="button" id="advancedToggle" class="advanced-toggle">
        詳細設定 ▼
      </button>
    `;

    const advancedSection = document.createElement('div');
    advancedSection.id = 'advancedSettings';
    advancedSection.className = 'advanced-settings hidden';
    advancedSection.innerHTML = `
      <div class="field">
        <label for="phraseDetectionMode">フレーズ検知方式</label>
        <select id="phraseDetectionMode" name="phraseDetectionMode">
          <option value="auto">自動検知</option>
          <option value="musical">音楽的構造重視</option>
          <option value="rest">休符重視</option>
          <option value="harmonic">和声変化重視</option>
        </select>
      </div>
      
      <div class="field">
        <label for="velocityVariation">ベロシティ変化強度: <span id="velocityVariationValue">1.0</span></label>
        <input type="range" id="velocityVariation" name="velocityVariation" min="0" max="2" step="0.1" value="1.0" />
      </div>
      
      <div class="field">
        <label for="timingVariation">タイミング変化強度: <span id="timingVariationValue">1.0</span></label>
        <input type="range" id="timingVariation" name="timingVariation" min="0" max="2" step="0.1" value="1.0" />
      </div>
      
      <div class="field">
        <label for="dynamicRange">ダイナミクス範囲: <span id="dynamicRangeValue">1.0</span></label>
        <input type="range" id="dynamicRange" name="dynamicRange" min="0.5" max="2" step="0.1" value="1.0" />
      </div>
    `;

    // Insert advanced settings after seed field
    const seedField = form.querySelector('input[name="seed"]').closest('.field');
    seedField.insertAdjacentElement('afterend', advancedToggle);
    advancedToggle.insertAdjacentElement('afterend', advancedSection);

    // Setup toggle functionality
    const toggle = document.getElementById('advancedToggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const settings = document.getElementById('advancedSettings');
        const isHidden = settings.classList.contains('hidden');
        
        settings.classList.toggle('hidden');
        toggle.textContent = isHidden ? '詳細設定 ▲' : '詳細設定 ▼';
      });
    }

    // Setup advanced setting sliders
    this.setupAdvancedSliders();
  }

  /**
   * Setup advanced setting sliders
   */
  setupAdvancedSliders() {
    const sliders = [
      { slider: 'velocityVariation', value: 'velocityVariationValue' },
      { slider: 'timingVariation', value: 'timingVariationValue' },
      { slider: 'dynamicRange', value: 'dynamicRangeValue' }
    ];

    sliders.forEach(({ slider, value }) => {
      const sliderEl = document.getElementById(slider);
      const valueEl = document.getElementById(value);
      
      if (sliderEl && valueEl) {
        sliderEl.addEventListener('input', (e) => {
          valueEl.textContent = e.target.value;
        });
      }
    });
  }

  /**
   * Handle file selection
   */
  handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
      this.showStatus(`ファイル選択: ${file.name}`, 'info');
      
      if (this.onFileUpload) {
        this.onFileUpload(file);
      }
    }
  }

  /**
   * Handle form submission
   */
  async handleFormSubmit(event) {
    event.preventDefault();
    
    if (this.isProcessing) {
      this.showStatus('処理中です。しばらくお待ちください。', 'warning');
      return;
    }

    const formData = new FormData(event.target);
    const file = formData.get('file');
    
    if (!file || file.size === 0) {
      this.showStatus('MIDIファイルを選択してください。', 'error');
      return;
    }

    const settings = {
      style: formData.get('style') || 'classical',
      intensity: parseFloat(formData.get('intensity')) || 0.5,
      seed: formData.get('seed') || null,
      phraseDetectionMode: formData.get('phraseDetectionMode') || 'auto',
      velocityVariation: parseFloat(formData.get('velocityVariation')) || 1.0,
      timingVariation: parseFloat(formData.get('timingVariation')) || 1.0,
      dynamicRange: parseFloat(formData.get('dynamicRange')) || 1.0
    };

    this.setProcessing(true);
    this.showStatus('MIDIファイルを処理中...', 'info');

    try {
      if (this.onHumanize) {
        await this.onHumanize(file, settings);
      }
    } catch (error) {
      console.error('Humanization error:', error);
      this.showStatus(`処理エラー: ${error.message}`, 'error');
    } finally {
      this.setProcessing(false);
    }
  }

  /**
   * Show processing status
   */
  setProcessing(isProcessing) {
    this.isProcessing = isProcessing;
    
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
      submitBtn.disabled = isProcessing;
      submitBtn.textContent = isProcessing ? '処理中...' : 'Humanize';
    }
  }

  /**
   * Show status message
   */
  showStatus(message, type = 'info') {
    let statusContainer = document.getElementById('statusContainer');
    
    if (!statusContainer) {
      statusContainer = document.createElement('div');
      statusContainer.id = 'statusContainer';
      statusContainer.className = 'status-container';
      
      const form = document.getElementById('form');
      if (form) {
        form.insertAdjacentElement('afterend', statusContainer);
      }
    }

    statusContainer.innerHTML = `
      <div class="status-message status-${type}">
        ${message}
      </div>
    `;

    // Auto-hide info messages after 5 seconds
    if (type === 'info') {
      setTimeout(() => {
        if (statusContainer.textContent.includes(message)) {
          statusContainer.innerHTML = '';
        }
      }, 5000);
    }
  }

  /**
   * Show results section
   */
  showResults(originalData, humanizedData, analysis) {
    this.originalMidiData = originalData;
    this.humanizedMidiData = humanizedData;
    
    // Clear any existing results
    const existingResult = document.getElementById('result');
    if (existingResult) {
      existingResult.remove();
    }

    // Create results container
    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'result';
    resultsContainer.className = 'result';

    // Build results HTML
    resultsContainer.innerHTML = this.buildResultsHTML(analysis);

    // Insert after status container or form
    const statusContainer = document.getElementById('statusContainer');
    const form = document.getElementById('form');
    const insertAfter = statusContainer || form;
    
    if (insertAfter) {
      insertAfter.insertAdjacentElement('afterend', resultsContainer);
    }

    // Setup result event listeners
    this.setupResultListeners();

    // Create download link
    this.createDownloadLink(humanizedData);

    this.showStatus('ヒューマナイズが完了しました！', 'info');
  }

  /**
   * Build results HTML
   */
  buildResultsHTML(analysis) {
    const phraseCount = analysis?.tracks?.[0]?.phrasing?.length || 0;
    const avgPhraseDuration = phraseCount > 0 ? 
      analysis.tracks[0].phrasing.reduce((sum, p) => sum + (p.end - p.start), 0) / phraseCount / 1000 : 0;

    return `
      <div class="result-header">
        <h3>ヒューマナイズ完了</h3>
        <p>処理が完了しました。以下で結果をプレビューしてダウンロードできます。</p>
      </div>

      <div class="playback-section">
        <h4>再生とプレビュー</h4>
        <div class="playback-controls">
          <button id="playOriginal" class="play-button">オリジナル再生</button>
          <button id="playHumanized" class="play-button">ヒューマナイズ後再生</button>
        </div>
      </div>

      <div class="visualization-section">
        <h4>MIDIビジュアライザー</h4>
        <div id="visualizationContainer" class="visualization-container">
          <!-- Visualizer will be inserted here -->
        </div>
      </div>

      <div class="analysis-section">
        <h4>分析結果</h4>
        <div class="analysis-summary">
          <div class="stat-item">
            <span class="stat-label">検出フレーズ数:</span>
            <span class="stat-value">${phraseCount}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">平均フレーズ長:</span>
            <span class="stat-value">${avgPhraseDuration.toFixed(1)}秒</span>
          </div>
        </div>
        
        <button id="toggleDetailedAnalysis" class="toggle-button">
          詳細分析データ 表示/非表示
        </button>
        
        <div id="detailedAnalysis" class="detailed-analysis hidden">
          <pre id="analysisData">${JSON.stringify(analysis, null, 2)}</pre>
        </div>
      </div>

      <div class="download-section">
        <h4>ダウンロード</h4>
        <a id="downloadLink" href="#" download class="download-button">
          ヒューマナイズされたMIDIをダウンロード
        </a>
      </div>
    `;
  }

  /**
   * Setup result section event listeners
   */
  setupResultListeners() {
    // Playback controls
    const playOriginalBtn = document.getElementById('playOriginal');
    const playHumanizedBtn = document.getElementById('playHumanized');
    // Note: Removed stopPlaybackBtn as it will be removed from UI
    
    if (playOriginalBtn) {
      playOriginalBtn.addEventListener('click', () => {
        // Check current button state to determine action
        const isCurrentlyPlaying = playOriginalBtn.textContent.includes('停止');
        
        if (isCurrentlyPlaying) {
          // Currently playing, so stop
          if (this.onStopPlayback) {
            this.onStopPlayback();
            this.updatePlaybackButtons('stopped');
          }
        } else {
          // Currently stopped, so play
          if (this.onPlayOriginal && this.originalMidiData) {
            this.onPlayOriginal(this.originalMidiData);
            this.updatePlaybackButtons('original');
          }
        }
      });
    }
    
    if (playHumanizedBtn) {
      playHumanizedBtn.addEventListener('click', () => {
        // Check current button state to determine action
        const isCurrentlyPlaying = playHumanizedBtn.textContent.includes('停止');
        
        if (isCurrentlyPlaying) {
          // Currently playing, so stop
          if (this.onStopPlayback) {
            this.onStopPlayback();
            this.updatePlaybackButtons('stopped');
          }
        } else {
          // Currently stopped, so play
          if (this.onPlayHumanized && this.humanizedMidiData) {
            this.onPlayHumanized(this.humanizedMidiData);
            this.updatePlaybackButtons('humanized');
          }
        }
      });
    }

    // Analysis toggle
    const toggleAnalysisBtn = document.getElementById('toggleDetailedAnalysis');
    const detailedAnalysis = document.getElementById('detailedAnalysis');
    
    if (toggleAnalysisBtn && detailedAnalysis) {
      toggleAnalysisBtn.addEventListener('click', () => {
        detailedAnalysis.classList.toggle('hidden');
        const isHidden = detailedAnalysis.classList.contains('hidden');
        toggleAnalysisBtn.textContent = isHidden ? 
          '詳細分析データ 表示/非表示' : 
          '詳細分析データ 非表示';
      });
    }
  }

  /**
   * Update playback button states
   */
  updatePlaybackButtons(state) {
    const playOriginalBtn = document.getElementById('playOriginal');
    const playHumanizedBtn = document.getElementById('playHumanized');
    
    if (playOriginalBtn) {
      playOriginalBtn.textContent = state === 'original' ? 'オリジナル停止' : 'オリジナル再生';
      playOriginalBtn.className = state === 'original' ? 'play-button active' : 'play-button';
    }
    
    if (playHumanizedBtn) {
      playHumanizedBtn.textContent = state === 'humanized' ? 'ヒューマナイズ後停止' : 'ヒューマナイズ後再生';
      playHumanizedBtn.className = state === 'humanized' ? 'play-button active' : 'play-button';
    }
  }

  /**
   * Create download link for processed MIDI
   */
  createDownloadLink(midiData) {
    const downloadLink = document.getElementById('downloadLink');
    if (!downloadLink) return;

    try {
      // Use the parent app's method to create proper MIDI file
      if (window.midiHumanizerApp && window.midiHumanizerApp.createDownloadBlob) {
        const midiBlob = window.midiHumanizerApp.createDownloadBlob();
        const url = URL.createObjectURL(midiBlob);
        
        downloadLink.href = url;
        downloadLink.download = `humanized_${Date.now()}.mid`;
        
        // Cleanup old URLs
        downloadLink.addEventListener('click', () => {
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
      } else {
        // Fallback: hide download link if MIDI creation is not available
        console.warn('MIDI creation not available');
        downloadLink.style.display = 'none';
      }
    } catch (error) {
      console.error('Error creating download link:', error);
      downloadLink.style.display = 'none';
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    this.showStatus(message, 'error');
    
    const errorContainer = document.getElementById('error');
    if (errorContainer) {
      errorContainer.textContent = message;
      errorContainer.classList.remove('hidden');
    }
  }

  /**
   * Hide error message
   */
  hideError() {
    const errorContainer = document.getElementById('error');
    if (errorContainer) {
      errorContainer.classList.add('hidden');
    }
  }

  /**
   * Set callback functions
   */
  setCallbacks(callbacks) {
    this.onFileUpload = callbacks.onFileUpload;
    this.onHumanize = callbacks.onHumanize;
    this.onPlayOriginal = callbacks.onPlayOriginal;
    this.onPlayHumanized = callbacks.onPlayHumanized;
    this.onStopPlayback = callbacks.onStopPlayback;
  }

  /**
   * Update mobile responsiveness
   */
  updateMobileLayout() {
    const isMobile = window.innerWidth <= 768;
    
    // Add mobile class to body
    document.body.classList.toggle('mobile', isMobile);
    
    // Adjust visualizer size for mobile
    const visualizationContainer = document.getElementById('visualizationContainer');
    if (visualizationContainer && isMobile) {
      visualizationContainer.style.maxWidth = '100%';
      visualizationContainer.style.overflowX = 'auto';
    }
  }

  /**
   * Initialize responsive design
   */
  initResponsive() {
    this.updateMobileLayout();
    
    window.addEventListener('resize', () => {
      this.updateMobileLayout();
    });
  }
}