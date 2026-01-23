# Test Documents

This directory should contain test DOCX files for testing the document redliner.

## Required Test Files

Create the following test documents using Microsoft Word or a compatible editor:

### 1. `contract_v1.docx` - Original Version (2 pages)

**Page 1 Content:**
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

**Page 2 Content:**
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

**Formatting:**
- Title "SERVICES AGREEMENT": Bold, 24pt
- Section numbers and titles (1. Services, 2. Payment Terms, etc.): Bold
- "Net30": Italic
- "$50,000": Bold

### 2. `contract_v2.docx` - Modified Version (3 pages)

**Instructions:** Copy `contract_v1.docx` and make the following changes:

**Text Changes:**
1. Replace "Company B" with "Company C" in the first paragraph
2. Change "12 months" to "18 months"
3. Change "Net30" to "Net45"
4. **Delete** the entire "3. Deliverables" section
5. **Add** a new section before Termination:
   ```
   3. Scope of Work
   The consulting services will include strategic planning, market analysis, and implementation support.
   ```
6. **Add** a new section at the end of page 2:
   ```
   7. Dispute Resolution
   Any disputes arising from this agreement will be resolved through binding arbitration in Los Angeles, California.
   ```

**Add Page 3:**
```
APPENDIX A - ADDITIONAL TERMS

1. Insurance Requirements
Company C shall maintain professional liability insurance of at least $1,000,000.

2. Independent Contractor Status
Company C is an independent contractor and not an employee of Company A.

3. Intellectual Property
All work product created under this agreement shall be owned by Company A.
```

**Formatting Changes:**
- Change "$50,000" from bold to **bold + red color**
- Make "APPENDIX A - ADDITIONAL TERMS" bold and 20pt
- Make the IP clause (3. Intellectual Property) italic

## Expected Differences

When comparing these documents, the redliner should detect:

### Text Changes (Green/Red Highlighting):
1. "Company B" → "Company C" (deletion + insertion)
2. "12 months" → "18 months" (modification)
3. "Net30" → "Net45" (modification)
4. Entire Deliverables section deleted
5. New "Scope of Work" section added
6. New "Dispute Resolution" section added
7. Entire Appendix A added (new page)

### Formatting Changes (Blue Border):
1. "$50,000" color changed from default to red

### Navigation:
- Should show "X of Y changes" where Y is the total number of differences
- Previous/Next buttons should jump between each changed block

## Quick Test Alternative

If you don't have time to create these specific documents:

1. **Quick Test Method:**
   - Create any .docx file with 3-4 paragraphs of text
   - Add some bold and italic formatting
   - Save as `test_v1.docx`
   - Make a copy and edit it:
     - Add a paragraph
     - Delete a paragraph
     - Change some words
     - Change formatting on some text
   - Save as `test_v2.docx`
   - Upload both to the redliner

2. **Minimal Test:**
   - `simple_v1.docx`: "Hello world. This is a test."
   - `simple_v2.docx`: "Hello everyone. This is a test document."
   - Should highlight "world" → "everyone" and "." → " document."

## Double-Column Test Document

To test double-column layout support:

Create `columns_test.docx`:
- Use Word's "Page Layout" → "Columns" → "Two"
- Add several paragraphs that flow between columns
- Make edits in a copy to test column handling

## Testing Procedure

1. Place your test .docx files in this directory
2. Open the redliner at `http://localhost:5173/`
3. Upload `contract_v1.docx` as Original
4. Upload `contract_v2.docx` as Current
5. Verify:
   - ✅ Side-by-side view appears
   - ✅ Deletions highlighted in red with strikethrough (left pane)
   - ✅ Insertions highlighted in green (right pane)
   - ✅ Formatting changes shown with blue border
   - ✅ Navigation buttons work
   - ✅ Synchronized scrolling works
   - ✅ Export HTML button creates downloadable file

## Notes

- This directory is included in `.gitignore` by default (commented out)
- You may want to commit test documents for regression testing
- Larger documents (50+ pages) are useful for performance testing
