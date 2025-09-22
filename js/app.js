/**
 * Main Application Module
 * Coordinates all components for the MIDI Humanizer
 */

import { MIDIParser } from './modules/MIDIParser.js';
import { PhraseDetector } from './modules/PhraseDetector.js';
import { Humanizer } from './modules/Humanizer.js';
import { AudioPlayer } from './modules/AudioPlayer.js';
import { Visualizer } from './modules/Visualizer.js';
import { UI } from './modules/UI.js';

class MIDIHumanizerApp {
  constructor() {
    // Initialize modules
    this.midiParser = new MIDIParser();
    this.phraseDetector = new PhraseDetector();
    this.humanizer = new Humanizer();
    this.audioPlayer = new AudioPlayer();
    this.visualizer = new Visualizer();
    this.ui = new UI();
    
    // Application state
    this.originalMidiData = null;
    this.humanizedMidiData = null;
    this.currentAnalysis = null;
    this.lastUsedSettings = null;
    
    this.init();
  }

  /**
   * Initialize the application
   */
  init() {
    // Setup UI callbacks
    this.ui.setCallbacks({
      onFileUpload: (file) => this.handleFileUpload(file),
      onHumanize: (file, settings) => this.handleHumanize(file, settings),
      onPlayOriginal: (data) => this.handlePlayOriginal(data),
      onPlayHumanized: (data) => this.handlePlayHumanized(data),
      onStopPlayback: () => this.handleStopPlayback()
    });

    // Initialize UI
    this.ui.init();
    this.ui.initResponsive();

    // Setup audio player progress callback
    this.audioPlayer.setProgressCallback((progress) => {
      this.visualizer.updatePlaybackProgress(progress);
    });

    console.log('🎹 MIDI Humanizer initialized successfully');
  }

  /**
   * Handle file upload
   */
  async handleFileUpload(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      this.originalMidiData = this.midiParser.parseMIDI(arrayBuffer);
      
      console.log('📁 File loaded:', {
        tracks: this.originalMidiData.tracks.length,
        ticksPerQuarter: this.originalMidiData.ticksPerQuarter
      });
      
      this.ui.showStatus('MIDIファイルが読み込まれました', 'info');
    } catch (error) {
      console.error('File upload error:', error);
      this.ui.showError(`ファイル読み込みエラー: ${error.message}`);
    }
  }

  /**
   * Handle humanization process
   */
  async handleHumanize(file, settings) {
    try {
      // Ensure file is loaded
      if (!this.originalMidiData) {
        await this.handleFileUpload(file);
      }

      if (!this.originalMidiData) {
        throw new Error('MIDIファイルの読み込みに失敗しました');
      }

      this.lastUsedSettings = settings;
      
      // Analyze musical structure with enhanced phrase detection
      console.log('🧠 Analyzing musical structure...');
      this.currentAnalysis = await this.analyzeMusicalStructure(
        this.originalMidiData, 
        settings
      );

      // Perform humanization
      console.log('🎭 Applying humanization...');
      this.humanizedMidiData = this.humanizer.humanizeMIDI(
        this.originalMidiData,
        settings.style,
        settings.intensity,
        settings.seed,
        true // isUserUpload
      );

      // Initialize visualizer with results
      this.initializeVisualization();

      // Show results in UI
      this.ui.showResults(
        this.originalMidiData,
        this.humanizedMidiData,
        this.currentAnalysis
      );

      console.log('✅ Humanization completed successfully');

    } catch (error) {
      console.error('Humanization error:', error);
      this.ui.showError(`処理エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * Analyze musical structure with enhanced phrase detection
   */
  async analyzeMusicalStructure(midiData, settings) {
    const analysis = {
      tracks: [],
      globalTempo: 120,
      timeSignature: [4, 4],
      phrases: [],
      enhancedFeatures: {}
    };

    // Analyze each track
    for (let i = 0; i < midiData.tracks.length; i++) {
      const track = midiData.tracks[i];
      
      // Enhanced phrase detection (2-1: フレーズ検知機能)
      const phrases = this.phraseDetector.identifyPhraseBoundaries(track, true);
      
      // Analyze chords for velocity variations (2-2: コードなどを検知し軽微なベロシティの揺らぎを加える)
      const chords = this.humanizer.analyzeChordProgression(track);
      
      // Detect dynamic peaks (2-3: フレーズのピークなどを検知しダイナミクスを付ける)
      const dynamics = this.analyzeDynamicPeaks(track, phrases);
      
      // Other musical analysis
      const melody = this.humanizer.analyzeMelody(track);
      const rhythm = this.humanizer.analyzeRhythmicContext(track, settings.style);

      const trackAnalysis = {
        phrasing: phrases,
        chords: chords,
        melody: melody,
        rhythm: rhythm,
        dynamics: dynamics,
        enhancedFeatures: {
          phraseDetectionMode: settings.phraseDetectionMode,
          dynamicPeaks: dynamics.peaks || [],
          chordProgression: chords,
          velocityVariation: settings.velocityVariation,
          timingVariation: settings.timingVariation,
          dynamicRange: settings.dynamicRange
        }
      };

      analysis.tracks.push(trackAnalysis);
      
      // Store phrases for visualization
      analysis.phrases = analysis.phrases.concat(phrases);
    }

    // Enhanced analysis features
    analysis.enhancedFeatures = {
      totalPhrases: analysis.phrases.length,
      averagePhraseDuration: analysis.phrases.length > 0 ? 
        analysis.phrases.reduce((sum, p) => sum + (p.end - p.start), 0) / analysis.phrases.length / 1000 : 0,
      styleCharacteristics: this.getStyleCharacteristics(settings.style),
      processingSettings: settings
    };

    return analysis;
  }

  /**
   * Analyze dynamic peaks for phrase expression (2-3)
   */
  analyzeDynamicPeaks(track, phrases) {
    const notes = this.humanizer.extractNotesFromEvents(track);
    const peaks = [];
    
    phrases.forEach((phrase, phraseIndex) => {
      const phraseNotes = notes.filter(n => 
        n.startTime >= phrase.start && n.startTime <= phrase.end
      );
      
      if (phraseNotes.length > 0) {
        // Find velocity peaks within phrase
        const velocities = phraseNotes.map(n => n.velocity);
        const maxVelocity = Math.max(...velocities);
        const peakNote = phraseNotes.find(n => n.velocity === maxVelocity);
        
        if (peakNote) {
          const phrasePosition = (peakNote.startTime - phrase.start) / (phrase.end - phrase.start);
          
          peaks.push({
            phraseIndex: phraseIndex,
            time: peakNote.startTime,
            velocity: maxVelocity,
            position: phrasePosition,
            type: phrasePosition < 0.3 ? 'early' : phrasePosition > 0.7 ? 'late' : 'middle'
          });
        }
      }
    });

    return {
      peaks: peaks,
      averageVelocity: notes.length > 0 ? notes.reduce((sum, n) => sum + n.velocity, 0) / notes.length : 64,
      dynamicRange: notes.length > 0 ? Math.max(...notes.map(n => n.velocity)) - Math.min(...notes.map(n => n.velocity)) : 0
    };
  }

  /**
   * Get style characteristics for display (2-4)
   */
  getStyleCharacteristics(style) {
    const characteristics = {
      classical: {
        name: 'Classical',
        description: 'クラシック音楽スタイル',
        effects: ['表現力豊かな演奏', '和声の響きを重視', 'レガート奏法', 'ダイナミクスの変化'],
        timing: { base: 15, variation: 1.2 },
        velocity: { base: 12, variation: 1.4 },
        characteristics: ['フレーズの自然な起伏', '和音の美しい響き', '歌うような表現']
      },
      pop: {
        name: 'Pop',
        description: 'ポップスタイル',
        effects: ['グルーヴ感重視', 'コード感の強化', '歌いやすい表現', 'リズムの安定性'],
        timing: { base: 8, variation: 0.8 },
        velocity: { base: 6, variation: 0.7 },
        characteristics: ['ビートの強調', 'メロディの親しみやすさ', 'コード進行の明確さ']
      },
      jazz: {
        name: 'Jazz',
        description: 'ジャズスタイル',
        effects: ['スウィング感', 'シンコペーション強調', 'アーティキュレーション', '即興的表現'],
        timing: { base: 20, variation: 1.0 },
        velocity: { base: 15, variation: 1.1 },
        characteristics: ['スウィングリズム', 'コード変化の強調', 'アドリブ的なニュアンス']
      }
    };

    return characteristics[style] || characteristics.classical;
  }

  /**
   * Initialize visualization
   */
  initializeVisualization() {
    // Wait for DOM to be updated before initializing visualizer
    setTimeout(() => {
      if (!this.visualizer.init('visualizationContainer')) {
        console.warn('Visualizer initialization failed - container may not exist yet');
        return;
      }

      // Extract notes for visualization
      const originalNotes = this.extractNotesForVisualization(this.originalMidiData);
      const humanizedNotes = this.extractNotesForVisualization(this.humanizedMidiData);
      const phrases = this.currentAnalysis?.phrases || [];

      // Set visualization data
      this.visualizer.setData(originalNotes, humanizedNotes, phrases);

      console.log('🎨 Visualization initialized', {
        originalNotes: originalNotes.length,
        humanizedNotes: humanizedNotes.length,
        phrases: phrases.length
      });
    }, 100); // Small delay to ensure DOM is updated
  }

  /**
   * Extract notes for visualization
   */
  extractNotesForVisualization(midiData) {
    if (!midiData || !midiData.tracks) return [];
    
    const allNotes = [];
    
    midiData.tracks.forEach(track => {
      const notes = this.humanizer.extractNotesFromEvents(track);
      allNotes.push(...notes);
    });
    
    return allNotes.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Handle play original
   */
  async handlePlayOriginal(data) {
    try {
      this.handleStopPlayback(); // Stop any current playback
      await this.audioPlayer.playOriginal(data || this.originalMidiData);
      this.visualizer.setPlaying(true);
      this.ui.updatePlaybackButtons('original');
    } catch (error) {
      console.error('Play original error:', error);
      this.ui.showError('オリジナル再生中にエラーが発生しました');
    }
  }

  /**
   * Handle play humanized
   */
  async handlePlayHumanized(data) {
    try {
      this.handleStopPlayback(); // Stop any current playback
      await this.audioPlayer.playHumanized(data || this.humanizedMidiData);
      this.visualizer.setPlaying(true);
      this.ui.updatePlaybackButtons('humanized');
    } catch (error) {
      console.error('Play humanized error:', error);
      this.ui.showError('ヒューマナイズ後再生中にエラーが発生しました');
    }
  }

  /**
   * Handle stop playback
   */
  handleStopPlayback() {
    this.audioPlayer.stopPlayback();
    this.visualizer.setPlaying(false);
    this.ui.updatePlaybackButtons('stopped');
  }

  /**
   * Create download for humanized MIDI
   */
  createDownloadBlob() {
    if (!this.humanizedMidiData) {
      throw new Error('ヒューマナイズデータがありません');
    }

    try {
      const midiArrayBuffer = this.midiParser.createMIDI(this.humanizedMidiData);
      return new Blob([midiArrayBuffer], { type: 'audio/midi' });
    } catch (error) {
      console.error('Download creation error:', error);
      throw new Error('ダウンロードファイルの作成に失敗しました');
    }
  }

  /**
   * Get application state for debugging
   */
  getState() {
    return {
      hasOriginalData: !!this.originalMidiData,
      hasHumanizedData: !!this.humanizedMidiData,
      hasAnalysis: !!this.currentAnalysis,
      isPlaying: this.audioPlayer.getPlaybackState().isPlaying,
      lastSettings: this.lastUsedSettings,
      moduleStatus: {
        midiParser: !!this.midiParser,
        phraseDetector: !!this.phraseDetector,
        humanizer: !!this.humanizer,
        audioPlayer: !!this.audioPlayer,
        visualizer: !!this.visualizer,
        ui: !!this.ui
      }
    };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.handleStopPlayback();
    this.audioPlayer.cleanup();
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.midiHumanizerApp = new MIDIHumanizerApp();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.midiHumanizerApp) {
    window.midiHumanizerApp.cleanup();
  }
});

export default MIDIHumanizerApp;