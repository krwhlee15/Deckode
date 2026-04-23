<!-- guide-meta: {"label":"Text & Code","desc":"`text` (Markdown) and `code` (syntax-highlighted) elements"} -->
# Text & Code Elements

## `"text"`

Renders Markdown text content.

```json
{
  "id": "e1",
  "type": "text",
  "content": "# Title\n\nThis is **bold** and *italic*.\n\nInline math: $E = mc^2$",
  "position": { "x": 60, "y": 40 },
  "size": { "w": 840, "h": 200 },
  "style": {
    "fontFamily": "Inter",
    "fontSize": 24,
    "color": "#ffffff",
    "textAlign": "left",
    "lineHeight": 1.5,
    "verticalAlign": "top"
  }
}
```

**Content format**: Markdown string. Supports:
- Headings (`#`, `##`, `###`)
- Bold (`**text**`), italic (`*text*`) — **do NOT use `**` inside `$...$` math; use `\bm{}` or `\mathbf{}`**
- Inline code (`` `code` ``)
- Links (`[text](url)`)
- Unordered lists (`- item`)
- Inline math (`$E = mc^2$`)
- Block math (`$$\int_0^1 f(x) dx$$`)

### Slide title convention

The `Slide` schema does not have a dedicated `title` field. Instead, the **slide title is conveyed by starting a text element's `content` with a Markdown `#` heading**. Downstream tooling (deck summarizers, the Planner agent, future title-detection heuristics) treats the first `#`-prefixed text element on a slide as that slide's title.

**Rules for AI agents**:
1. Every content slide should contain exactly one text element whose `content` begins with `# ` (level-1 heading) representing the slide title. Title slides may also use `#` for the main title.
2. The title element should be the visually largest text on the slide (`fontSize` ≥ body text fontSize).
3. The title element should be positioned near the top of the slide (`y` smaller than body content).
4. Do not put `#` inside body text elements. Use `##` or `###` for sub-sections within body text instead.
5. If a slide is intentionally title-less (e.g., a full-bleed image slide), it is acceptable to omit the `#` element, but prefer adding a small caption text with `#` so the deck summary can identify the slide.

This convention lets the deck summarizer extract slide titles without ambiguity and lets the Planner agent reason about deck structure using only titles instead of full element dumps.

**LaTeX math bold**: Do NOT use Markdown `**` inside math expressions — it renders as plain text. Use `\bm{}` (bold-italic, recommended for symbols) or `\mathbf{}` (bold-upright) instead. Example: `$\bm{\kappa}$` → **κ**, `$\mathbf{A}$` → **A**.

**Style fields**:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `fontFamily` | string | `"Inter"` | Font family |
| `fontSize` | number | `24` | Base font size in px (headings scale relative to this) |
| `color` | string | `"#ffffff"` | Text color |
| `textAlign` | `"left"` \| `"center"` \| `"right"` | `"left"` | Horizontal alignment |
| `lineHeight` | number | `1.5` | Line height multiplier |
| `verticalAlign` | `"top"` \| `"middle"` \| `"bottom"` | `"top"` | Vertical alignment within the box |

### Sizing and alignment for math-bearing text

KaTeX renders with a fixed pixel height — it does NOT participate in the flex-fit
shrinking that plain text does. Getting math to look right depends on picking
the right `size.h` and `verticalAlign` up front.

**Vertical alignment.** Text elements default to `verticalAlign: "top"`, which
shoves display math (`$$...$$`) against the upper edge of the box and leaves
dead space below. **For any text element whose primary content is a display
formula, set `verticalAlign: "middle"` so the formula is centered vertically.**
Mixed prose + inline math is usually fine at `"top"`.

```jsonc
// Good: display formula gets vertical centering
{
  "type": "text",
  "content": "$$ Y = C + I + G + (X - M) $$",
  "size": { "w": 840, "h": 80 },
  "style": { "fontSize": 28, "verticalAlign": "middle", "textAlign": "center" }
}
```

**Height budget.** Rough rule of thumb for `size.h` of a single display
formula element (`$$...$$`):

| Math complexity                         | Minimum `size.h` (relative to `fontSize`) |
|-----------------------------------------|-------------------------------------------|
| Plain `E = mc^2`, `a + b`, `\pi`        | ~1.5 × fontSize                            |
| With super/subscripts (`x^2`, `a_n`)    | ~1.8 × fontSize                            |
| With fractions (`\frac{a}{b}`), integrals (`\int`), sums (`\sum`), derivatives (`\partial`), hats (`\hat{H}`) | **~2.2–2.5 × fontSize** |
| Stacked structures (`\frac{\frac{.}{.}}{.}`, `\begin{pmatrix}...`) | ~3.0 × fontSize or more |

Under-sizing clips the fraction bar or the matrix bracket; over-sizing just
wastes vertical space. When in doubt, round up.

```jsonc
// fontSize 28 · formula contains \frac{\partial}{\partial t}
// → h should be at least 28 × 2.2 ≈ 62; set 80+ for safety
{
  "type": "text",
  "content": "$$ i\\hbar \\frac{\\partial}{\\partial t} \\Psi = \\hat{H}\\Psi $$",
  "size": { "w": 840, "h": 90 },
  "style": { "fontSize": 28, "verticalAlign": "middle", "textAlign": "center" }
}
```

**Do not rely on flex-fit for math.** Math elements force `textSizing: "fixed"`
automatically (the renderer detects `$` in content). If the formula doesn't fit,
the renderer will NOT shrink the font — it will clip. Pick the right `size.h`
instead.


## `"code"`

Renders a syntax-highlighted code block.

```json
{
  "id": "e3",
  "type": "code",
  "language": "typescript",
  "content": "const greeting = (name: string) => {\n  return `Hello, ${name}!`;\n};",
  "position": { "x": 60, "y": 300 },
  "size": { "w": 840, "h": 180 },
  "style": {
    "theme": "github-dark",
    "fontSize": 16,
    "lineNumbers": false,
    "highlightLines": [2]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `language` | string | yes | Language identifier (e.g., `"typescript"`, `"python"`, `"rust"`) |
| `content` | string | yes | Raw code string |

**Style fields**:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `theme` | string | `"github-dark"` | Shiki theme name |
| `fontSize` | number | `16` | Font size in px |
| `lineNumbers` | boolean | `false` | Show line numbers |
| `highlightLines` | number[] | `[]` | 1-indexed line numbers to highlight |
| `borderRadius` | number | `8` | Corner radius |

