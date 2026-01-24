# DOCX Redliner

An offline browser-based tool for comparing two DOCX documents side-by-side, highlighting differences for easy legal document review.

## Features

- **Offline Operation**: Completely client-side - your documents never leave your browser
- **Smart Diffing**: Git-style intelligent text comparison with block-level alignment
- **Side-by-Side View**: Original document on left, current version on right
- **Formatting Preservation**: Maintains bold, italic, fonts, colors, and headings
- **Change Highlighting**:
  - 🟢 Green: Insertions (new text)
  - 🔴 Red with strikethrough: Deletions (removed text)
  - 🔵 Blue border: Formatting changes (with tooltips)
- **Navigation**: Jump between changes with Previous/Next buttons (keyboard shortcuts: `p`/`n`)
- **Synchronized Scrolling**: Both panes scroll together for context
- **HTML Export**: Export comparison as standalone HTML file

## Technology Stack

- **Build**: Vite + TypeScript
- **DOCX Parser**: officeparser v6.0.1 (browser bundle)
  - Uses browser-optimized bundle loaded via `importScripts` in Web Worker
  - Provides rich AST with complete formatting metadata
  - Bundle located at `public/officeparser.browser.js`
- **Diff Engine**:
  - diff-match-patch (Google's algorithm for block alignment)
  - jsdiff (word-level granular diffing)
- **Architecture**: Vanilla JavaScript with Web Workers for performance

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Development Server

The dev server runs at `http://localhost:5173/`

## Usage

1. **Open the application** in your browser
2. **Upload Original Document**: Drag & drop or click to browse for the first .docx file
3. **Upload Current Document**: Drag & drop or click to browse for the modified .docx file
4. **View Comparison**: The app will automatically parse, compare, and display the differences
5. **Navigate Changes**: Use Previous/Next buttons or keyboard shortcuts (`p` for previous, `n` for next)
6. **Export** (optional): Click "Export HTML" to save the comparison

## Testing

### Creating Test Documents

To test the application, create two Word documents:

#### Test Document 1: `contract_v1.docx` (Original)
Create a 2-page Word document with the following content:

**Page 1:**
```
SERVICES AGREEMENT

This Agreement is entered into on January 15, 2025 between Company A and Company B.

1. Services
Company B will provide consulting services to Company A for a period of 12 months.

2. Payment Terms
Payment will be made on Net30 terms. The total contract value is $50,000.

3. Deliverables
Company B will deliver monthly reports and quarterly presentations.
```

**Page 2:**
```
4. Termination
Either party may terminate this agreement with 30 days written notice.

5. Confidentiality
Both parties agree to maintain confidentiality of proprietary information.

6. Governing Law
This agreement shall be governed by the laws of California.

Signed: _________________
Date: _________________
```

**Formatting to include:**
- Make "SERVICES AGREEMENT" bold and 24pt
- Make section headings (1., 2., etc.) bold
- Make "Net30" italic
- Make "$50,000" bold

#### Test Document 2: `contract_v2.docx` (Modified)
Copy `contract_v1.docx` and make these changes:

**Changes to make:**
1. Change "Company B" to "Company C" in first paragraph (insertion/deletion)
2. Change "12 months" to "18 months" (modification)
3. Change "Net30" to "Net45" (modification)
4. Delete the entire "3. Deliverables" section (deletion)
5. Add a new section at the end:
   ```
   7. Dispute Resolution
   Any disputes will be resolved through binding arbitration.
   ```
   (insertion of new block)
6. Change "$50,000" from bold to bold + red color (formatting change)
7. Add Page 3 with new content:
   ```
   APPENDIX A

   Additional terms and conditions apply as specified in the master agreement.
   ```

### Expected Results

When you upload both documents, you should see:

- **Original pane (left)**: Shows "Company B", "12 months", "Net30", Deliverables section
- **Current pane (right)**: Shows "Company C", "18 months", "Net45", no Deliverables section, new Dispute Resolution section
- **Highlighting**:
  - "Company C" highlighted in green (insertion)
  - "Company B" highlighted in red with strikethrough (deletion)
  - "18 months" vs "12 months" shown as deletion + insertion
  - "Net45" vs "Net30" shown as deletion + insertion
  - Entire Deliverables section shown as placeholder on right, deleted block on left
  - New Dispute Resolution section shown as placeholder on left, inserted block on right
  - "$50,000" with blue border indicating formatting change (hover for tooltip: "color: none → red")
- **Navigation**: "7 of 7 changes" counter, clicking Next cycles through each change
- **Scrolling**: Scrolling left pane scrolls right pane, and vice versa

### Quick Manual Test

If you don't want to create documents from scratch:

1. Create any simple .docx file with 2-3 paragraphs
2. Copy it and make small edits (add text, delete text, change formatting)
3. Upload both to test the basic functionality

### Generate HTML Preview

To generate a standalone HTML comparison of the test documents:

```bash
npm test generate-output
```

This will:
- Parse both test documents
- Generate side-by-side comparison
- Save output to `test-documents/comparison-output.html`
- Automatically open in your browser
- Show direct link to the file

The generated HTML is a self-contained file you can share or archive.

## Project Structure

```
docRedliner/
├── public/
│   └── (none - single HTML file)
├── src/
│   ├── main.ts                 # Application entry point
│   ├── parsers/
│   │   ├── parsing.worker.ts   # Web Worker for DOCX parsing
│   │   └── docx-parser.ts      # Parser wrapper
│   ├── diff/
│   │   └── diff-engine.ts      # Two-level diffing logic
│   ├── renderer/
│   │   ├── diff-renderer.ts    # Side-by-side rendering
│   │   ├── scroll-sync.ts      # Synchronized scrolling
│   │   └── change-navigator.ts # Change navigation
│   ├── ui/
│   │   ├── file-upload.ts      # File upload handling
│   │   └── html-export.ts      # HTML export
│   ├── types/
│   │   ├── ast.types.ts        # AST type definitions
│   │   └── diff.types.ts       # Diff type definitions
│   └── styles/
│       ├── main.css            # Main styles
│       └── diff-highlights.css # Diff highlighting styles
├── index.html                  # Entry HTML
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript configuration
└── package.json                # Dependencies
```

## How It Works

### 1. Parsing Phase
- User uploads two .docx files
- Files are sent to Web Worker
- officeparser extracts text, formatting, and structure into AST
- AST normalized for diffing

### 2. Diffing Phase
- **Block-level alignment**: diff-match-patch aligns paragraphs/sections
- **Word-level comparison**: jsdiff performs granular text diffing within blocks
- **Formatting comparison**: Separate pass to detect bold, italic, font, color changes
- Result: Array of block diffs with change metadata

### 3. Rendering Phase
- Diff renderer creates side-by-side HTML
- Applies CSS classes for highlighting
- Sets up synchronized scrolling
- Initializes change navigation
- Displays result to user

## Limitations (MVP)

- **Tables**: Extracted as text, not cell-by-cell comparison (planned for future)
- **Images**: Not displayed in comparison (mentioned in placeholder)
- **Complex formatting**: Focuses on visible formatting (bold, italic, color, font) rather than perfect Word fidelity
- **Performance**: Large documents (100+ pages) may have slower rendering (virtual scrolling planned for optimization phase)

## Future Enhancements

- Virtual scrolling for large documents
- Cell-by-cell table comparison
- Image comparison
- Diff statistics summary
- Customizable highlight colors
- Dark mode
- Progress indicators for large files

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

Modern browsers with ES2020+ support required.

## License

MIT

## Contributing

This is an MVP implementation. Contributions welcome for:
- Performance optimization
- Enhanced table diffing
- Better formatting detection
- UI/UX improvements

## Troubleshooting

### "Error parsing documents"
- Ensure files are valid .docx format (not .doc)
- Check browser console for detailed error messages
- Try with a simpler document to isolate the issue

### "No changes detected" when there are changes
- Verify both documents are actually different
- Check if changes are in supported areas (tables may not diff properly in MVP)

### Slow performance
- Use smaller documents for MVP testing
- Performance optimization is planned for post-MVP phase
- Consider breaking large documents into sections

## Development Notes

- Web Workers are used to keep UI responsive during parsing/diffing
- Synchronized scrolling uses scroll percentage, not absolute position
- Change navigation uses CSS classes and scroll-into-view
- HTML export includes all styles inline for portability

### officeparser Browser Bundle

The project uses officeparser's browser bundle instead of the npm ES module:

- **Bundle location**: `public/officeparser.browser.js` (1.64 MB)
- **Source**: Downloaded from jsDelivr CDN (`https://cdn.jsdelivr.net/npm/officeparser@6.0.1/dist/officeparser.browser.js`)
- **Loading**: Web Worker uses `importScripts('/officeparser.browser.js')` to load the bundle
- **Access**: Global `officeParser.parseOffice()` function

**Why browser bundle?**
- The npm ES module includes Node.js dependencies (`fs`, `zlib`, `stream`) that don't work in browsers
- Browser bundle is pre-built for browser environment
- Provides rich AST with complete formatting metadata (critical for high-quality diffs)

**To update officeparser:**
```bash
curl -L "https://cdn.jsdelivr.net/npm/officeparser@VERSION/dist/officeparser.browser.js" -o "public/officeparser.browser.js"
```

---

**Status**: MVP Complete ✓

Built with Claude Code
