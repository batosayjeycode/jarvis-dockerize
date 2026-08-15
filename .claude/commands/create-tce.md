---
description: Create a TCE (Test Case Execution) Excel file for a Jira card, following the standard jarvis format (Status BE + Status FE columns, alternating row colors, dropdowns)
---

Create a TCE Excel file for the given Jira task.

**Input**: $ARGUMENTS — a Jira ticket ID or full URL (e.g. `DE-11339` or `https://new-sociolla.atlassian.net/browse/DE-11339`)

---

## Steps to follow

### 1. Parse the Jira ID
Extract the ticket ID from the input. If a full URL is given, take the last path segment (e.g. `DE-11339`).

### 2. Fetch the Jira card
Use `mcp__atlassian__getJiraIssue` with:
- `cloudId`: `https://new-sociolla.atlassian.net`
- `issueIdOrKey`: the parsed Jira ID
- `fields`: `["summary", "description", "issuelinks", "attachment", "comment"]`
- `responseContentFormat`: `markdown`

### 3. Find and read the requirements
- Check if there is an Excel attachment on the Jira card (`attachment` field). If so, look for the file in `~/Downloads/` by filename.
- Also check `~/Downloads/` for any Excel matching the feature name.
- If an existing TCE file is referenced (e.g. `TCE_*.xlsx`), read it for context.
- Use Python (`openpyxl`) to read all sheets and rows from any requirements Excel found.
- Read linked Jira issues (from `issuelinks`) for additional context if needed.

### 4. Generate test cases
Based on all gathered context, write comprehensive test cases covering:
- Page access & navigation (menu path, tab name, permissions)
- Page load defaults (default filter values, empty state)
- All filter options (each filter individually + general filter box rules)
- Group By behavior
- Buttons (Search, Reset, Export)
- Table columns (all columns, their formats, computed rows)
- Show/Hide column toggles
- Sorting rules
- Pagination (defaults, restrictions, navigation)
- Loading optimizations (if mentioned)
- Any clickable cells that open popups (each popup's columns, sorting, export)
- Export options (each export type: filename, sheet name, header, columns, total row, formatting)
- Validations and restrictions
- Permissions (per permission type)

### 5. Create the Excel file
Run this Python script (fill in `JIRA_ID`, `FEATURE_PATH`, `SHEET_TITLE`, and `test_cases`):

```python
import openpyxl, re
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from datetime import date

# ── Constants ────────────────────────────────────────────────────────────────
JIRA_ID      = "<JIRA_ID>"          # e.g. "DE-11339"
FEATURE_PATH = "<FEATURE_PATH>"     # e.g. "Inventory > Inventory Management > Stock Report"
SHEET_TITLE  = "<SHEET_TITLE>"      # e.g. "TCE - Stock Report"
TODAY        = date.today().strftime("%Y-%m-%d")
OUT_PATH     = f"/Users/sociolla/Downloads/TCE_{SHEET_TITLE.replace('TCE - ', '').replace(' ', '_')}_{JIRA_ID}.xlsx"

# ── Style helpers ─────────────────────────────────────────────────────────────
thin       = Side(border_style="thin", color="000000")
ALL_BORDER = Border(top=thin, bottom=thin, left=thin, right=thin)
C_NAVY     = "1F3864"
C_BLUE     = "2E75B6"
C_LTBLUE   = "D6E4F0"
C_PALE     = "F0F7FF"
C_WHITE    = "FFFFFF"
C_GRAY     = "595959"
C_DEEAF1   = "DEEAF1"

def mk_font(bold=False, size=10, color="000000"):
    return Font(bold=bold, size=size, color=color)

def mk_fill(hex_color):
    return PatternFill("solid", fgColor=hex_color)

def mk_align(h="left", v="top", wrap=True):
    return Alignment(horizontal=h, vertical=v, wrap_text=wrap)

# ── test_cases list ───────────────────────────────────────────────────────────
# Each entry is a tuple: (id_str, test_case, steps, expected_result)
# Section headers: id_str like "1. Section Title", other fields None
# Data rows: id_str like "1.1", rest filled in
test_cases = [
    # REPLACE THIS with the generated test cases
    ("1. Page Access & Navigation", None, None, None),
    ("1.1", "Example test case", "Steps to perform", "Expected result"),
]

# ── Build workbook ────────────────────────────────────────────────────────────
wb = openpyxl.Workbook()
ws = wb.active
ws.title = SHEET_TITLE

ws.column_dimensions['A'].width = 7.0
ws.column_dimensions['B'].width = 50.0
ws.column_dimensions['C'].width = 65.0
ws.column_dimensions['D'].width = 70.0
ws.column_dimensions['E'].width = 16.0
ws.column_dimensions['F'].width = 16.0
ws.column_dimensions['G'].width = 16.0

# Row 1 — Title
r = 1
ws.row_dimensions[r].height = 30.0
c = ws.cell(row=r, column=1, value=f"TCE LIST — {SHEET_TITLE.replace('TCE - ', '').upper()}")
c.font      = mk_font(bold=True, size=14, color=C_WHITE)
c.fill      = mk_fill(C_NAVY)
c.alignment = mk_align("center", "center", wrap=False)
ws.merge_cells(f"A{r}:G{r}")
r += 1

# Row 2 — Subtitle
ws.row_dimensions[r].height = 18.0
c = ws.cell(row=r, column=1, value=f"Feature: {FEATURE_PATH}  |  Jira: {JIRA_ID}  |  Date: {TODAY}")
c.font      = mk_font(bold=False, size=9, color=C_GRAY)
c.fill      = mk_fill(C_DEEAF1)
c.alignment = mk_align("center", "center", wrap=False)
ws.merge_cells(f"A{r}:G{r}")
r += 1

# Row 3 — Column headers
ws.row_dimensions[r].height = 22.0
for col, label in enumerate(["#", "Test Case", "Steps", "Expected Result", "Status BE", "Status FE", "Notes"], 1):
    c = ws.cell(row=r, column=col, value=label)
    c.font      = mk_font(bold=True, size=10, color=C_WHITE)
    c.fill      = mk_fill(C_BLUE)
    c.alignment = mk_align("center", "top", wrap=True)
    c.border    = ALL_BORDER
r += 1

# Data rows
def is_section(id_str):
    if not id_str:
        return False
    parts = id_str.split(". ", 1)
    if len(parts) == 2:
        try:
            int(parts[0]); return True
        except ValueError:
            return False
    return False

data_idx = 0
for entry in test_cases:
    id_str, test_case, steps, expected = entry

    if is_section(id_str):
        ws.row_dimensions[r].height = 18.0
        c = ws.cell(row=r, column=1, value=id_str)
        c.font      = mk_font(bold=True, size=10, color=C_NAVY)
        c.fill      = mk_fill(C_LTBLUE)
        c.alignment = mk_align("left", "top", wrap=True)
        ws.merge_cells(f"A{r}:G{r}")
        r += 1
        data_idx = 0
        continue

    row_fill = C_WHITE if (data_idx % 2 == 0) else C_PALE
    ws.row_dimensions[r].height = 15.0

    specs = [
        (1, id_str,    mk_font(bold=True, size=10), mk_align("center", "center", wrap=False)),
        (2, test_case, mk_font(size=10),             mk_align("left",   "top",    wrap=True)),
        (3, steps,     mk_font(size=10),             mk_align("left",   "top",    wrap=True)),
        (4, expected,  mk_font(size=10),             mk_align("left",   "top",    wrap=True)),
        (5, None,      mk_font(size=10),             mk_align("center", "center", wrap=False)),
        (6, None,      mk_font(size=10),             mk_align("center", "center", wrap=False)),
        (7, None,      mk_font(size=10),             mk_align("left",   "top",    wrap=True)),
    ]
    for col, val, fnt, aln in specs:
        c = ws.cell(row=r, column=col, value=val)
        c.font      = fnt
        c.fill      = mk_fill(row_fill)
        c.alignment = aln
        c.border    = ALL_BORDER

    r += 1
    data_idx += 1

ws.freeze_panes = "A4"

# Status BE (E) and Status FE (F) dropdowns
for col_letter in ['E', 'F']:
    dv = DataValidation(
        type="list",
        formula1='"Pass,Fail,Blocked,Skip,Not Tested"',
        allow_blank=True,
        showDropDown=False,
        showInputMessage=False,
        showErrorMessage=False,
    )
    dv.sqref = f"{col_letter}4:{col_letter}{r - 1}"
    ws.add_data_validation(dv)

wb.save(OUT_PATH)
print(f"Saved: {OUT_PATH}")
print(f"Total rows: {r - 1}")
```

### 6. Report
After saving, tell the user:
- The output file path (`~/Downloads/TCE_<FeatureName>_<JIRA_ID>.xlsx`)
- Total number of test cases written
- A summary of which sections were covered
- Next step: upload the file to the Jira card as an attachment
