# CLAUDE.md - Cortex DeepMind AI Study Plan Generator

## Project Overview

**Name:** Cortex DeepMind - Gerador de Plano de Estudo IA
**Purpose:** AI-powered web application that generates personalized, structured study plans for certification exams and self-directed learning
**Language:** Portuguese (UI) with multilingual learning support
**Version:** 0.0.0 (Early development)

### Core Functionality
- Upload study materials (PDF, DOCX, MD, HTML) or provide documentation URLs
- AI generates comprehensive study plans using Google Gemini API
- Interactive chapter navigation with hierarchical structure
- Text-to-speech audio playback for chapters
- AI-generated summaries for chapters
- Full-text search with highlighting
- Export to Markdown, HTML, and PDF

---

## Technology Stack

### Frontend
- **React 19.2.0** - UI framework (functional components with hooks only)
- **TypeScript 5.8.2** - Strict mode enabled
- **Vite 6.2.0** - Build tool and dev server

### Styling
- **Tailwind CSS** - Via CDN (imported in index.html)
- **Custom CSS** - Embedded in index.html for scrollbars, code blocks, and highlights
- **Theme:** Dark theme with purple/indigo gradients

### AI & APIs
- **@google/genai 1.29.0** - Google Generative AI SDK
  - `gemini-2.5-pro` - Study plan generation with web search
  - `gemini-2.5-flash` - Chapter summaries
  - `gemini-2.5-flash-preview-tts` - Text-to-speech synthesis

### Browser APIs
- **Web Audio API** - Audio playback management
- **IndexedDB** - Audio caching (via utils/db.ts)
- **FileReader API** - File upload handling

### External Dependencies (CDN)
- **Showdown** - Markdown to HTML conversion
- **Google Fonts** - Inter font family

---

## Project Structure

```
/home/user/cortex-4/
├── App.tsx                      # Main application (1041 lines)
├── index.tsx                    # React entry point
├── index.html                   # HTML template with CDN imports
├── types.ts                     # TypeScript interfaces
├── metadata.json                # App metadata
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript config (strict mode)
├── vite.config.ts               # Vite config (port 3000)
├── .gitignore                   # Git ignore rules
├── README.md                    # Basic setup instructions
│
├── components/
│   ├── AudioPlayer.tsx          # Audio player UI with controls
│   └── icons.tsx                # SVG icon library (20+ icons)
│
├── services/
│   └── geminiService.ts         # Gemini API integration (194 lines)
│
├── hooks/
│   └── useAudioPlayer.ts        # Custom audio player hook (276 lines)
│
└── utils/
    ├── fileUtils.ts             # Export/download functions (184 lines)
    ├── db.ts                    # IndexedDB cache wrapper
    └── audioUtils.ts            # Audio decoding utilities
```

---

## Key Files & Responsibilities

### App.tsx (Main Component)
- **Lines:** 1041
- **State Management:** 10+ useState hooks
- **Key States:**
  - `doc: Documentation | null` - Current study plan
  - `selectedChapterIndex: number` - Active chapter
  - `isFocusMode: boolean` - Full-screen reading mode
  - `searchQuery: string` - Search input
  - `summaryState: object` - Summary modal state
  - `audioState` - Managed by useAudioPlayer hook
  - `expandedParentIndex: number | null` - Chapter expansion state

- **Key Computed Values (useMemo):**
  - `flattenedChapters` - Recursive flattening with level tracking
  - `detailedSearchResults` - Regex search with snippets
  - `visibleChapters` - Filtered based on search/expansion

- **Nested Components:**
  - `Header()` - Branding and intro
  - `StudyPlanForm()` - Input form (Files/URL tabs)
  - `Footer()` - Copyright

- **DOM Manipulation:**
  - TreeWalker for search highlighting
  - Code block wrapper injection
  - Copy button attachment to `<pre>` tags

### services/geminiService.ts
- **Lines:** 194
- **Functions:**
  1. `generateStudyPlan(source, studyTopic, additionalTopics)` → Documentation
     - Model: gemini-2.5-pro with web search
     - Thinking budget: 16384 tokens
     - Max output: 8192 tokens
     - Returns JSON structure

  2. `generateSpeech(text, voice)` → base64 audio
     - Model: gemini-2.5-flash-preview-tts
     - 24kHz mono PCM audio
     - 5 voices: Kore, Puck, Charon, Fenrir, Zephyr

  3. `generateChapterSummary(chapterTitle, chapterContent)` → Markdown
     - Model: gemini-2.5-flash
     - Max output: 1024 tokens
     - Thinking budget: 512 tokens

### hooks/useAudioPlayer.ts
- **Lines:** 276
- **Custom Hook:** Returns audio state and control functions
- **Features:**
  - AudioContext-based playback
  - Base64 audio decoding
  - Progress tracking with requestAnimationFrame
  - Speed control (0.75x - 1.5x)
  - Volume and mute management
  - Audio caching via IndexedDB
  - Auto-cleanup on unmount

### components/AudioPlayer.tsx
- **Lines:** 300+
- **Props:** audioState, event handlers, navigation controls
- **Features:**
  - Progress bar with seek
  - Time display (MM:SS)
  - Play/pause/previous/next buttons
  - Volume slider with mute
  - Speed selector dropdown
  - Keyboard shortcuts menu
  - Global keyboard event listeners

### utils/fileUtils.ts
- **Lines:** 184
- **Functions:**
  - `generateAndDownloadMarkdown()` - Export as .md
  - `generateAndDownloadHtml()` - Export as standalone HTML
  - `generateAndPrint()` - Trigger browser print dialog
  - `downloadAsFile()` - Generic file download

### utils/db.ts
- **IndexedDB Cache:**
  - Database: `cortex-audio-cache`
  - Object Store: `audioClips`
  - Key format: `{voice}::{text}`
  - Value: Base64 audio data

---

## Data Structures (types.ts)

```typescript
interface Chapter {
  title: string
  content: string        // Markdown format
  subChapters?: Chapter[]
}

interface Documentation {
  title: string
  chapters: Chapter[]
}

interface AudioConfig {
  voice: string          // One of AVAILABLE_VOICES
  speed: number          // Playback multiplier
}
```

### Internal Types (App.tsx)

```typescript
interface FlattenedChapter {
  chapter: Chapter
  level: number           // Depth in hierarchy
  parentIndex: number | null
  originalIndex: number
  isParent: boolean
}

interface DetailedSearchResult {
  chapterIndex: number
  snippet: string         // HTML with <mark> tags
  chapterTitle: string
  globalIndex: number
}

type CopyStatus = 'idle' | 'copied'
```

---

## Development Workflows

### Initial Setup
```bash
npm install
# Create .env.local and add GEMINI_API_KEY
npm run dev
# App runs on http://localhost:3000
```

### Environment Variables
```bash
# Required in .env.local
GEMINI_API_KEY=your_gemini_api_key_here
```

### Build & Preview
```bash
npm run build      # Builds to dist/
npm run preview    # Preview production build
```

---

## Code Patterns & Conventions

### React Patterns
✅ **DO:**
- Use functional components exclusively
- Use hooks (useState, useEffect, useMemo, useCallback, useRef)
- Memoize expensive computations
- Create custom hooks for complex logic
- Use TypeScript for all components

❌ **DON'T:**
- Use class components
- Use any type (strict typing required)
- Skip dependency arrays in hooks
- Mutate state directly

### TypeScript
- **Strict mode enabled** in tsconfig.json
- All functions must have return types
- All component props must be typed
- Use interfaces over types (convention in this codebase)
- No implicit any

### State Management
- **Local state:** useState for component-level state
- **Complex state:** Custom hooks (see useAudioPlayer)
- **Global state:** None (no Redux/Context API currently)
- **Persistence:**
  - localStorage: Audio config (`cortexAudioConfig`)
  - IndexedDB: Audio cache (`cortex-audio-cache`)

### Error Handling
```typescript
try {
  // Async operation
} catch (error) {
  console.error("Descriptive error:", error);
  throw new Error("User-friendly message in Portuguese");
}
```

### Naming Conventions
- **Components:** PascalCase (e.g., `AudioPlayer`)
- **Functions:** camelCase (e.g., `handleGeneratePlan`)
- **Hooks:** `use` prefix (e.g., `useAudioPlayer`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `AVAILABLE_VOICES`)
- **Interfaces:** PascalCase (e.g., `Documentation`)
- **Files:** camelCase.tsx/ts (e.g., `geminiService.ts`)

---

## Key Features Implementation

### 1. Study Plan Generation

**Flow:**
1. User uploads files OR provides URL
2. User enters exam code or topic
3. User optionally adds extra topics
4. Click "Gerar Plano de Estudo"
5. `handleGeneratePlan()` called
6. Files read via FileReader API
7. `generateStudyPlan()` called with Gemini
8. JSON response parsed
9. `setDoc()` updates state
10. UI renders chapter tree

**Code Location:** App.tsx:handleGeneratePlan, geminiService.ts:generateStudyPlan

### 2. Chapter Navigation

**Implementation:**
- Recursive flattening in `flattenedChapters` useMemo
- Click handler: `handleChapterSelect(index)`
- Keyboard navigation: Arrow keys with focus tracking
- Expansion state: `expandedParentIndex` controls collapsed/expanded
- Auto-scrolling: Active chapter scrolls into view

**Code Location:** App.tsx:300-600

### 3. Search Functionality

**Implementation:**
- Regex-based pattern matching
- `detailedSearchResults` useMemo computes matches
- Snippet extraction: 40 chars before/after match
- Highlighting: TreeWalker + `<mark>` injection
- Navigation: Previous/next result buttons
- Active result tracking: `activeSearchResultIndex`

**Code Location:** App.tsx:search-related useMemo, useEffect

### 4. Audio Playback

**Flow:**
1. User clicks "Ouvir" button
2. `loadAndPlay()` called from useAudioPlayer hook
3. Check IndexedDB cache via `getAudio()`
4. If miss: Call `generateSpeech()` → store in cache
5. Base64 audio decoded to AudioBuffer
6. AudioContext plays buffer
7. Progress tracked via requestAnimationFrame
8. UI updates via AudioPlayer component

**Code Location:**
- hooks/useAudioPlayer.ts
- components/AudioPlayer.tsx
- services/geminiService.ts:generateSpeech

### 5. Summary Generation

**Flow:**
1. User clicks "Resumir" button
2. `handleGenerateSummary()` called
3. `generateChapterSummary()` API call
4. Modal opens with summary content
5. User can copy, export, or listen to summary

**Code Location:** App.tsx:handleGenerateSummary, geminiService.ts:generateChapterSummary

### 6. Code Block Enhancement

**Implementation:**
- Detect `<pre>` tags after Markdown rendering
- Inject custom header with copy button
- Copy handler uses Clipboard API
- Visual feedback: "Copiado!" with green background
- Auto-reset after 2 seconds

**Code Location:** App.tsx:useEffect (code block injection)

---

## Browser Storage

### localStorage
```typescript
// Key: 'cortexAudioConfig'
interface StoredAudioConfig {
  voice: string;  // Default: 'Kore'
  speed: number;  // Default: 1
}
```

### IndexedDB
```typescript
// Database: 'cortex-audio-cache'
// ObjectStore: 'audioClips'
// Key: `${voice}::${text}`
// Value: string (base64 audio)
```

---

## API Integration

### Gemini API Configuration

**Authentication:**
```typescript
const API_KEY = process.env.API_KEY;
const ai = new GoogleGenAI({ apiKey: API_KEY });
```

**Models:**
1. **gemini-2.5-pro** (Study Plans)
   - Tools: googleSearch enabled
   - maxOutputTokens: 8192
   - thinkingBudget: 16384

2. **gemini-2.5-flash** (Summaries)
   - maxOutputTokens: 1024
   - thinkingBudget: 512

3. **gemini-2.5-flash-preview-tts** (Audio)
   - responseModalities: [Modality.AUDIO]
   - speechConfig.voiceConfig.prebuiltVoiceConfig

**Error Handling:**
- Try-catch blocks
- JSON parsing with regex fallback
- Portuguese error messages for users
- Console logging for debugging

---

## UI/UX Patterns

### Theme
- **Colors:** Dark background with purple/indigo gradients
- **Accent:** Indigo-500/600 for links and highlights
- **Typography:** Inter font family, responsive sizing
- **Scrollbars:** Custom styled (thin, rounded)

### Keyboard Shortcuts

**Chapter Navigation:**
- Arrow Up/Down: Navigate chapters
- Enter: Select focused chapter
- Arrow Left/Right: Collapse/expand parent chapters

**Audio Player:**
- Space: Play/Pause
- Arrow Right: +5 seconds
- Arrow Left: -5 seconds
- Arrow Up: Volume +10%
- Arrow Down: Volume -10%
- M: Mute toggle

### Responsive Design
- Mobile-first approach
- Grid layout adapts to screen size
- Sidebar collapses on small screens
- Touch-friendly tap targets

---

## Performance Optimizations

1. **useMemo** for expensive computations:
   - Chapter flattening
   - Search result calculation
   - Visible chapters filtering

2. **useCallback** for event handlers:
   - Prevents unnecessary re-renders
   - Stable function references

3. **Audio caching:**
   - IndexedDB prevents redundant API calls
   - Cache key: voice + text hash

4. **Code splitting:**
   - Dynamic imports for large components (potential)
   - CDN-loaded libraries (Showdown, Tailwind)

5. **Lazy DOM updates:**
   - requestAnimationFrame for audio progress
   - Debounced search input (potential improvement)

---

## Common Development Tasks

### Adding a New Icon
1. Create SVG component in `components/icons.tsx`
2. Follow naming convention: `{Name}Icon`
3. Accept `className` prop for styling
4. Export from icons.tsx

### Adding a New Export Format
1. Add function to `utils/fileUtils.ts`
2. Follow pattern: `generateAndDownload{Format}()`
3. Add button to UI in App.tsx
4. Import icon if needed

### Adding a New Voice
1. Add to `AVAILABLE_VOICES` array in App.tsx
2. Voice must be supported by Gemini TTS API
3. No other changes needed (dynamic rendering)

### Modifying Gemini Prompts
- **Study Plans:** services/geminiService.ts:28-75
- **Summaries:** services/geminiService.ts:158-174
- All prompts in Portuguese
- Include clear instructions and output format

### Adding New State
1. Define interface in types.ts or component
2. Use useState with proper typing
3. Consider useMemo for derived state
4. Add to relevant useEffect dependencies

---

## Testing & Debugging

### Console Logging
- Errors logged with `console.error()`
- JSON parsing failures show problematic text
- API responses logged on failure

### Browser DevTools
- **Application tab:** Check localStorage and IndexedDB
- **Network tab:** Monitor Gemini API calls
- **Console:** View error messages and logs
- **Sources:** Set breakpoints in TypeScript files

### Common Issues

**"API_KEY environment variable not set"**
- Solution: Add GEMINI_API_KEY to .env.local

**Audio not playing:**
- Check IndexedDB cache (might be corrupted)
- Clear cache: DevTools → Application → IndexedDB
- Verify API key has TTS permissions

**Study plan generation fails:**
- Check API quota/limits
- Verify input files are readable
- Check console for JSON parsing errors

**Search not highlighting:**
- Regex pattern might be invalid
- Check for special characters that need escaping
- Verify content has been rendered to DOM

---

## Git Workflow

### Current Branch
```bash
# Development branch
claude/claude-md-miajgyycexbc14jr-014oviZRxNTMK8UMmVfLVVWR
```

### Commit Guidelines
- Write clear, descriptive messages
- Use imperative mood (e.g., "Add feature" not "Added feature")
- Reference issue numbers if applicable
- Format: `type: description`
  - `feat:` New feature
  - `fix:` Bug fix
  - `refactor:` Code restructuring
  - `docs:` Documentation changes
  - `style:` Formatting changes

### Recent Commits
```
b2d6260 feat: Refactor audio configuration and code block styling
9f03eec feat: Enhance study plan generation and UI
11165e6 refactor: Rename project and update branding
76912b4 feat: Update app name and functionality to generate study plans
9d4afc1 feat: Add audio playback controls and icons
```

---

## Future Enhancement Areas

### Potential Features (Based on Code Comments)
- ⭐ Favorites feature (UI button exists but disabled)
- 📚 Learning progress tracking
- 🔖 Chapter bookmarking
- 📱 Mobile app version
- 🌐 Internationalization (i18n)
- 📊 Study analytics dashboard
- 🔄 Spaced repetition scheduling
- 📤 Cloud sync for study plans
- 🎨 Custom themes
- 📝 Inline note-taking

### Known TODOs
- Additional export formats (EPUB)
- Offline mode improvements
- Authentication/user accounts
- Better error recovery
- Loading progress indicators
- Undo/redo for edits

---

## Important Notes for AI Assistants

### When Making Changes

1. **Always read files before editing**
   - Don't assume structure
   - Check current implementation
   - Verify types and interfaces

2. **Maintain consistency**
   - Follow existing patterns
   - Match naming conventions
   - Keep Portuguese for UI text
   - Maintain dark theme aesthetic

3. **Type safety is critical**
   - Add proper types for all new code
   - Don't use `any`
   - Validate API responses
   - Handle null/undefined cases

4. **Test thoroughly**
   - Verify API calls work
   - Check audio playback
   - Test search functionality
   - Validate exports

5. **Consider performance**
   - Use useMemo for expensive ops
   - Cache API responses
   - Minimize re-renders
   - Optimize DOM manipulations

### Common Pitfalls to Avoid

❌ **Don't:**
- Modify API key handling (security risk)
- Break existing TypeScript types
- Change core data structures without updating consumers
- Add dependencies without necessity
- Ignore error handling
- Remove console.error debugging
- Change Portuguese UI text to English
- Modify Gemini model parameters without understanding impact

✅ **Do:**
- Add comments for complex logic
- Handle edge cases (empty content, API failures)
- Maintain backward compatibility
- Clean up unused code
- Test with various input types
- Preserve user data (study plans, audio cache)
- Follow React best practices
- Use semantic HTML

---

## External Resources

### Documentation Links
- React 19: https://react.dev
- TypeScript: https://www.typescriptlang.org
- Vite: https://vitejs.dev
- Google Generative AI: https://ai.google.dev
- Tailwind CSS: https://tailwindcss.com
- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- IndexedDB: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API

### API References
- Gemini API: https://ai.google.dev/gemini-api/docs
- @google/genai SDK: https://www.npmjs.com/package/@google/genai

---

## Contact & Support

**Repository:** https://github.com/Vaz-Cortex/cortex-4
**AI Studio App:** https://ai.studio/apps/drive/1eLqqJc0nHbPilE5KPWgGH1jDLa-xCpeg

---

## Version History

- **0.0.0** (Current) - Initial development version
  - Core features implemented
  - Audio playback system
  - Search functionality
  - Export capabilities
  - Summary generation

---

*Last Updated: 2025-11-22*
*This document should be updated whenever significant architectural changes are made to the codebase.*
