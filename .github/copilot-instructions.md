# MIDI Humanizer

MIDI Humanizer is a vanilla JavaScript web application that humanizes piano MIDI files using human-like performance patterns. All processing happens client-side in the browser with no server required.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Running the Application
- **NO BUILD REQUIRED**: This is a static HTML/CSS/JS application with no build system, dependencies, or npm packages.
- Run locally with any HTTP server:
  - `python3 -m http.server 8000 --bind 127.0.0.1` (recommended)
  - `python -m http.server 8000` (Python 3 alternative)
  - `npx serve . --listen 8000` (requires npm package download first time)
  - Any other static file server
- **Response time**: Application loads instantly (< 1 second)
- **Processing time**: MIDI files process in 1-5 seconds depending on complexity
- Access at: `http://localhost:8000` or `http://127.0.0.1:8000`

### Development Workflow
- **NO INSTALLATION NEEDED**: Just serve the files statically
- **NO BUILD STEP**: Edit files directly and refresh browser
- **NO DEPENDENCIES**: Everything needed is included in the three main files
- **NO PACKAGE MANAGEMENT**: No npm, yarn, or other package managers used

### File Structure
```
├── index.html          # Main application UI (2.1KB)
├── script.js           # Core application logic (82.6KB)
├── styles.css          # Application styles (20.7KB)
├── test_simple.mid     # Test MIDI file for validation
├── README.md           # Project documentation
└── .gitignore          # Git ignore rules
```

## Validation

### Complete User Scenario Testing
ALWAYS test the complete user workflow after making ANY changes:

1. **Start the application**: 
   - Run: `python3 -m http.server 8000 --bind 127.0.0.1`
   - Navigate to: `http://127.0.0.1:8000`
   - Verify: Page loads with title "MIDI Humanizer"

2. **Test MIDI processing**:
   - Click "Choose File" button
   - Select `test_simple.mid` from repository root
   - Verify: File name appears in input field
   - Leave style as "Classical" and intensity at 0.5
   - Click "Humanize" button
   - Verify: Processing completes in 1-5 seconds

3. **Verify complete functionality**:
   - Verify: MIDI visualization appears with timeline
   - Test visualization modes:
     - Click "タイムライン表示": Shows MIDI timeline with zoom controls (ズームアウト, ズームイン, リセット)
     - Click "フレーズ構造": Shows phrase analysis with detected phrase count and average length
     - Click "ビフォー・アフター比較": Shows statistical comparison (平均音量, 平均音長, ノート数)
   - Verify: Musical analysis results section shows detailed analysis
   - Verify: Playback controls show "オリジナル再生" and "ヒューマナイズ後再生" buttons
   - Click "オリジナル再生" button
   - Verify: Button changes to "オリジナル停止" indicating playback is active
   - Verify: Download link appears for processed MIDI file
   - Test download link by right-clicking and verifying blob URL is generated
   - Click "詳細分析データ 表示/非表示" button to verify detailed analysis can be toggled

4. **Test different styles**:
   - Upload another MIDI file or reprocess the same one
   - Try "Pop" style: Verify effects show "グルーヴ感重視", "コード感の強化", "歌いやすい表現"
   - Try "Jazz" style: Verify effects show "スウィング感", "シンコペーション強調", "アーティキュレーション"
   - Try "Classical" style: Verify effects show "表現力豊かな演奏", "和声の響きを重視", "レガート奏法"
   - Verify: Each style produces measurably different statistical changes in the comparison view

### Browser Compatibility Testing
- **Primary**: Chrome/Edge (recommended by README)
- **Secondary**: Firefox, Safari
- **Required**: Modern browsers with ES6+ support
- **Audio**: Web Audio API support required for playback functionality

### Validation Requirements
- **NEVER skip validation** because it takes time or didn't work initially
- **ALWAYS run the complete user scenario** after making changes
- **ALWAYS verify** that all interactive elements work (buttons, sliders, file upload)
- **ALWAYS test** MIDI file processing from upload to download
- **NEVER assume** changes work without testing the full workflow

## Code Organization

### Key Components in script.js
- `MIDIHumanizer` class: Main application logic
- MIDI parsing: Custom MIDI file parser implementation
- Humanization algorithms: Style-specific timing and velocity adjustments
- Audio playback: Web Audio API implementation for MIDI playback
- Visualization: Canvas-based MIDI timeline and analysis displays
- Musical analysis: Chord detection, phrase analysis, rhythm analysis

### Important Functions to Know
- `handleFormSubmit()`: Processes MIDI upload and triggers humanization
- `humanizeMIDI()`: Core humanization logic with style-based algorithms
- `playOriginal()`/`playHumanized()`: Audio playback controls
- `showVisualization()`: Handles different visualization modes
- `analyzeMIDI()`: Musical analysis for chord progressions and phrasing

### CSS Architecture in styles.css
- Modern CSS with CSS Grid and Flexbox
- CSS custom properties (variables) for theming
- Responsive design with mobile breakpoints
- Gradient backgrounds and modern visual effects
- Separate sections for forms, results, visualizations, and responsive design

## Common Tasks

### Making UI Changes
- Edit `index.html` for structural changes
- Edit `styles.css` for visual styling changes
- **Always test** responsive design on different screen sizes
- **Always verify** that forms and interactive elements remain functional

### Modifying MIDI Processing
- All logic is in `script.js` in the `MIDIHumanizer` class
- Style-specific algorithms in `humanizeTiming()`, `humanizeVelocity()`, etc.
- **Critical**: Always test with `test_simple.mid` after changes
- **Always verify** that processed MIDI files are valid and downloadable

### Adding New Features
- Follow the existing class-based architecture
- Add new methods to the `MIDIHumanizer` class
- Update the UI in `addIntegratedSection()` method for results display
- **Always test** the complete workflow from upload to download

### Debugging Issues
- Use browser developer tools console for JavaScript errors
- Check Network tab for any failed resource loads (shouldn't be any for static files)
- Test MIDI processing with different file sizes and complexity levels
- **Common issue**: Audio playback may not work in all browsers - this is expected

## Performance and Limitations

### Expected Performance
- **Load time**: < 1 second for initial page load
- **Processing time**: 1-5 seconds for typical MIDI files
- **File size limits**: No hard limits, but very large MIDI files (>1MB) may be slow
- **Memory usage**: Processes entirely in browser memory

### Browser Limitations
- **Audio playback**: Basic implementation, may not work perfectly in all browsers
- **File access**: Uses File API, requires modern browser support
- **MIDI complexity**: Very complex MIDI files with multiple tracks may take longer

### Known Working Scenarios
- **File types**: .mid and .midi files
- **MIDI content**: Piano music works best (as designed)
- **Styles**: Classical, Pop, and Jazz styles all tested and working
- **Features**: File upload, processing, visualization, basic playback, and download all functional

## Troubleshooting

### If the application doesn't load:
- Verify HTTP server is running on the correct port
- Check browser console for JavaScript errors
- Ensure all three main files (index.html, script.js, styles.css) are present

### If MIDI processing fails:
- Try with the included `test_simple.mid` file first
- Check browser console for errors
- Verify the uploaded file is a valid MIDI file (.mid or .midi extension)

### If audio playback doesn't work:
- This is expected in some browsers due to Web Audio API limitations
- Functionality is marked as "basic implementation" in the UI
- Focus on ensuring the download functionality works for testing

### If downloads don't work:
- Verify the blob URL is generated (visible in download link href)
- Test with different browsers
- Check browser console for any errors in MIDI generation

## Critical Reminders

- **NO BUILD SYSTEM**: Never try to run npm install, webpack, or other build tools
- **STATIC FILES ONLY**: This application is designed for GitHub Pages hosting
- **CLIENT-SIDE ONLY**: All processing happens in the browser, no server-side code
- **VALIDATION IS MANDATORY**: Always test the complete user workflow after changes
- **BROWSER TESTING**: Always test in Chrome/Edge as primary browsers
- **FILE VALIDATION**: Always use `test_simple.mid` for validating changes work correctly